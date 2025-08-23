const awsIot = require('aws-iot-device-sdk');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class QCliMqttServer {
    constructor() {
        this.sessions = new Map();
        this.device = null;
        this.projectName = process.env.PROJECT_NAME || 'q-cli-webui';
        this.region = process.env.AWS_REGION || 'us-east-1';
        this.isConnected = false;
        
        this.initializeDevice();
    }

    initializeDevice() {
        const certDir = path.join(__dirname, 'certs');
        
        // Check certificates
        const certPath = path.join(certDir, 'certificate.pem');
        const keyPath = path.join(certDir, 'private.key');
        const caPath = path.join(certDir, 'AmazonRootCA1.pem');

        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath) || !fs.existsSync(caPath)) {
            console.error('❌ Required certificates not found in certs/ directory');
            process.exit(1);
        }

        const clientId = `${this.projectName}-server-${Date.now()}`;
        console.log(`🆔 Client ID: ${clientId}`);

        this.device = awsIot.device({
            keyPath: keyPath,
            certPath: certPath,
            caPath: caPath,
            clientId: clientId,
            host: process.env.IOT_ENDPOINT,
            keepalive: 60,
            reconnectPeriod: 3000,
            connectTimeout: 30000
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.device.on('connect', () => {
            console.log('✅ Connected to AWS IoT Core');
            this.isConnected = true;
            
            // Subscribe to ONLY the wildcard patterns we have permission for
            const inputTopic = `${this.projectName}/server/+/input`;
            const controlTopic = `${this.projectName}/server/+/control`;
            
            console.log('📡 Subscribing to topics...');
            
            this.device.subscribe(inputTopic, { qos: 0 }, (error) => {
                if (error) {
                    console.error(`❌ Failed to subscribe to ${inputTopic}:`, error);
                } else {
                    console.log(`✅ Subscribed to ${inputTopic}`);
                }
            });
            
            this.device.subscribe(controlTopic, { qos: 0 }, (error) => {
                if (error) {
                    console.error(`❌ Failed to subscribe to ${controlTopic}:`, error);
                } else {
                    console.log(`✅ Subscribed to ${controlTopic}`);
                    console.log('🚀 Server ready! Waiting for client messages...');
                }
            });
        });

        this.device.on('message', (topic, payload) => {
            console.log(`🔍 DEBUG: Received message on topic: "${topic}"`);
            console.log(`🔍 DEBUG: Payload: ${payload.toString()}`);
            
            if (!this.isConnected) return;
            
            try {
                const message = JSON.parse(payload.toString());
                const topicParts = topic.split('/');
                
                console.log(`🔍 DEBUG: Topic parts: [${topicParts.join(', ')}]`);
                
                if (topicParts.length !== 4) {
                    console.log(`⚠️ Invalid topic format: ${topic} (expected 4 parts, got ${topicParts.length})`);
                    return;
                }
                
                const clientId = topicParts[2];
                const messageType = topicParts[3];

                console.log(`📨 Received ${messageType} from client: ${clientId}`);

                if (messageType === 'control') {
                    this.handleControlMessage(clientId, message);
                } else if (messageType === 'input') {
                    this.handleInputMessage(clientId, message);
                }
            } catch (error) {
                console.error('❌ Error processing message:', error);
            }
        });

        this.device.on('error', (error) => {
            console.error('❌ AWS IoT error:', error);
        });

        this.device.on('offline', () => {
            console.log('📴 Disconnected from AWS IoT Core');
            this.isConnected = false;
        });

        this.device.on('reconnect', () => {
            console.log('🔄 Reconnecting to AWS IoT Core...');
        });
    }

    handleControlMessage(clientId, message) {
        console.log(`🎮 Control: ${message.action} for client ${clientId}`);
        
        switch (message.action) {
            case 'start-q-chat':
                this.startQChatSession(clientId);
                break;
            case 'stop-q-chat':
                this.stopQChatSession(clientId);
                break;
            default:
                console.log(`❓ Unknown control action: ${message.action}`);
        }
    }

    handleInputMessage(clientId, message) {
        const session = this.sessions.get(clientId);
        if (session && session.process) {
            try {
                session.process.stdin.write(message.data + '\n');
                console.log(`📝 Sent input to Q chat for ${clientId}`);
            } catch (error) {
                console.error('❌ Error writing to Q chat process:', error);
                this.publishToClient(clientId, 'status', {
                    type: 'error',
                    message: 'Failed to send input: ' + error.message
                });
            }
        } else {
            console.log(`❌ No active Q chat session for client ${clientId}`);
            this.publishToClient(clientId, 'status', {
                type: 'error',
                message: 'No active Q chat session found'
            });
        }
    }

    startQChatSession(clientId) {
        if (this.sessions.has(clientId)) {
            console.log(`⚠️ Session already exists for client ${clientId}`);
            return;
        }

        try {
            console.log(`🚀 Starting Q chat session for client ${clientId}`);
            
            const qProcess = spawn('q', ['chat'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    TERM: 'xterm-256color'
                }
            });

            const session = {
                process: qProcess,
                clientId,
                startTime: new Date(),
                outputBuffer: '',
                bufferTimer: null,
                bufferLines: [],
                maxLines: 10,        // Send after N lines
                maxWaitMs: 500       // Or after M milliseconds
            };

            this.sessions.set(clientId, session);

            // Handle stdout with buffering
            qProcess.stdout.on('data', (data) => {
                this.bufferOutput(clientId, data.toString());
            });

            // Handle stderr with buffering
            qProcess.stderr.on('data', (data) => {
                this.bufferOutput(clientId, data.toString());
            });

            // Handle process exit
            qProcess.on('exit', (code, signal) => {
                console.log(`🔚 Q chat process exited for ${clientId}`);
                // Flush any remaining buffer
                this.flushBuffer(clientId);
                this.sessions.delete(clientId);
                this.publishToClient(clientId, 'status', {
                    type: 'exit',
                    code,
                    signal
                });
            });

            // Handle process error
            qProcess.on('error', (error) => {
                console.error(`❌ Q chat process error for ${clientId}:`, error);
                this.flushBuffer(clientId);
                this.sessions.delete(clientId);
                this.publishToClient(clientId, 'status', {
                    type: 'error',
                    message: 'Q chat process error: ' + error.message
                });
            });

            this.publishToClient(clientId, 'status', { type: 'started' });
            console.log(`✅ Q chat session started for client ${clientId}`);
            
        } catch (error) {
            console.error('❌ Error starting Q chat process:', error);
            this.publishToClient(clientId, 'status', {
                type: 'error',
                message: 'Failed to start Q chat: ' + error.message
            });
        }
    }

    bufferOutput(clientId, data) {
        const session = this.sessions.get(clientId);
        if (!session) return;

        // Add to buffer
        session.outputBuffer += data;

        // Process complete lines
        const lines = session.outputBuffer.split('\n');
        
        // Keep the last incomplete line in buffer
        session.outputBuffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
            if (line.trim().length > 0) {
                this.processBufferLine(clientId, line, session);
            }
        }

        // Check if we should flush the buffer
        if (session.bufferLines.length >= session.maxLines) {
            this.flushBuffer(clientId);
        } else if (session.bufferLines.length > 0 && !session.bufferTimer) {
            // Start timer for partial buffer
            session.bufferTimer = setTimeout(() => {
                this.flushBuffer(clientId);
            }, session.maxWaitMs);
        }
    }

    processBufferLine(clientId, line, session) {
        const cleanLine = this.cleanTerminalLine(line);
        
        // Skip empty lines
        if (cleanLine.trim().length === 0) {
            return;
        }

        // Skip spinner lines entirely - don't show them at all
        if (this.isSpinnerLine(cleanLine)) {
            console.log(`🚫 Filtered out spinner: ${cleanLine.substring(0, 30)}...`);
            return;
        }

        // Add line to buffer
        session.bufferLines.push(cleanLine);
    }

    isSpinnerLine(line) {
        // Remove ANSI codes first, then check for spinner patterns
        const cleanedLine = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
        
        // Detect spinner lines with various patterns
        const spinnerPatterns = [
            /^[⠋⠙⠹⠸⠼⠦⠴⠇⠧⠏]\s+(Thinking|Loading|Initializing|Connecting)/i,
            /^[⠋⠙⠹⠸⠼⠦⠴⠇⠧⠏]\s*$/,  // Just spinner char alone
            /^[⠋⠙⠹⠸⠼⠦⠴⠇⠧⠏].*[⠋⠙⠹⠸⠼⠦⠴⠇⠧⠏]/,  // Multiple spinner chars in one line
            /Thinking\.\.\./i,  // Any line with "Thinking..."
            /^[⠋⠙⠹⠸⠼⠦⠴⠇⠧⠏].*Thinking/i  // Spinner char followed by Thinking
        ];
        
        const isSpinner = spinnerPatterns.some(pattern => pattern.test(cleanedLine));
        
        if (isSpinner) {
            console.log(`🚫 Filtered spinner (raw): "${line.substring(0, 50)}..."`);
            console.log(`🚫 Filtered spinner (clean): "${cleanedLine.substring(0, 50)}..."`);
        }
        
        return isSpinner;
    }

    flushBuffer(clientId) {
        const session = this.sessions.get(clientId);
        if (!session || session.bufferLines.length === 0) return;

        // Clear timer
        if (session.bufferTimer) {
            clearTimeout(session.bufferTimer);
            session.bufferTimer = null;
        }

        // Clean and join lines
        const cleanedLines = session.bufferLines.map(line => this.cleanTerminalLine(line));
        const content = cleanedLines.join('\n');

        // Send multiline content
        this.publishToClient(clientId, 'output', {
            content: content,
            lineCount: session.bufferLines.length,
            isMultiline: true
        });

        console.log(`📦 Sent ${session.bufferLines.length} lines to client ${clientId}`);

        // Clear buffer
        session.bufferLines = [];
    }

    cleanTerminalLine(line) {
        return line
            // Remove ANSI escape sequences
            .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
            // Remove carriage returns
            .replace(/\r/g, '')
            // Remove other control characters except newlines
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            // Clean up whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    stopQChatSession(clientId) {
        const session = this.sessions.get(clientId);
        if (session && session.process) {
            console.log(`🛑 Stopping Q chat session for client ${clientId}`);
            session.process.kill('SIGTERM');
            this.sessions.delete(clientId);
        }
    }

    publishToClient(clientId, messageType, data) {
        if (!this.isConnected) {
            console.log(`⚠️ Cannot publish - not connected to IoT Core`);
            return;
        }
        
        const topic = `${this.projectName}/client/${clientId}/${messageType}`;
        const message = JSON.stringify(data);
        
        this.device.publish(topic, message, { qos: 0 }, (error) => {
            if (error) {
                console.error(`❌ Error publishing to ${topic}:`, error);
            } else {
                console.log(`📡 Published ${messageType} to client ${clientId}`);
            }
        });
    }

    cleanup() {
        console.log('🧹 Cleaning up server...');
        this.isConnected = false;
        
        // Clean up all sessions
        for (const [clientId, session] of this.sessions) {
            if (session.process) {
                session.process.kill('SIGTERM');
            }
        }
        this.sessions.clear();

        // Close IoT connection
        if (this.device) {
            this.device.end();
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (server) {
        server.cleanup();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (server) {
        server.cleanup();
    }
    process.exit(0);
});

// Start the server
console.log('🚀 Starting Q CLI MQTT Server...');
console.log(`📋 Project: ${process.env.PROJECT_NAME || 'q-cli-webui'}`);
console.log(`🌐 IoT Endpoint: ${process.env.IOT_ENDPOINT}`);

const server = new QCliMqttServer();
