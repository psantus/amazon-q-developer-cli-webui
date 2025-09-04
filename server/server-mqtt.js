const awsIot = require('aws-iot-device-sdk');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const FilesystemHandler = require('./filesystem-handler');
require('dotenv').config();

class QCliMqttServer {
    constructor() {
        this.sessions = new Map(); // sessionId -> session object
        this.clientSessions = new Map(); // clientId -> Set of sessionIds
        this.device = null;
        this.projectName = process.env.PROJECT_NAME || 'q-cli-webui';
        this.region = process.env.AWS_REGION;
        this.isConnected = false;
        
        // Initialize filesystem handler
        this.filesystemHandler = new FilesystemHandler(this);
        
        this.initializeDevice();
        
        // Add process error handlers
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        });
        
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
        });
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
            
            // Subscribe to control topic (single per server) and session-specific input topics
            const controlTopic = `${this.projectName}/server/+/control`;
            const sessionControlTopic = `${this.projectName}/server/+/+/control`; // clientId/sessionId/control
            const inputTopic = `${this.projectName}/server/+/+/input`; // clientId/sessionId/input
            
            console.log('📡 Subscribing to topics...');
            
            this.device.subscribe(controlTopic, { qos: 0 }, (error) => {
                if (error) {
                    console.error(`❌ Failed to subscribe to ${controlTopic}:`, error);
                } else {
                    console.log(`✅ Subscribed to ${controlTopic}`);
                }
            });
            
            this.device.subscribe(sessionControlTopic, { qos: 0 }, (error) => {
                if (error) {
                    console.error(`❌ Failed to subscribe to ${sessionControlTopic}:`, error);
                } else {
                    console.log(`✅ Subscribed to ${sessionControlTopic}`);
                }
            });
            
            this.device.subscribe(inputTopic, { qos: 0 }, (error) => {
                if (error) {
                    console.error(`❌ Failed to subscribe to ${inputTopic}:`, error);
                } else {
                    console.log(`✅ Subscribed to ${inputTopic}`);
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
                
                if (topicParts[topicParts.length - 1] === 'control') {
                    // Control message: projectName/server/clientId/control OR projectName/server/clientId/sessionId/control
                    if (topicParts.length === 4) {
                        // Global control: projectName/server/clientId/control
                        const clientId = topicParts[2];
                        this.handleControlMessage(clientId, message).catch(error => {
                            console.error('❌ Error handling control message:', error);
                        });
                    } else if (topicParts.length === 5) {
                        // Session control: projectName/server/clientId/sessionId/control
                        const clientId = topicParts[2];
                        const sessionId = topicParts[3];
                        message.sessionId = sessionId; // Add sessionId to message
                        this.handleControlMessage(clientId, message).catch(error => {
                            console.error('❌ Error handling control message:', error);
                        });
                    } else {
                        console.log(`⚠️ Invalid control topic format: ${topic}`);
                        return;
                    }
                } else if (topicParts[topicParts.length - 1] === 'input') {
                    // Input message: projectName/server/clientId/sessionId/input
                    if (topicParts.length !== 5) {
                        console.log(`⚠️ Invalid input topic format: ${topic}`);
                        return;
                    }
                    const clientId = topicParts[2];
                    const sessionId = topicParts[3];
                    this.handleInputMessage(clientId, sessionId, message);
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

    async handleControlMessage(clientId, message) {
        console.log(`🎮 Control: ${message.action || message.type} for client ${clientId}`);
        console.log(`📊 Current sessions: ${this.sessions.size}`);
        console.log(`📊 Active sessions:`, Array.from(this.sessions.keys()));
        
        // Handle filesystem requests
        if (message.type && ['browse', 'read'].includes(message.type)) {
            try {
                console.log(`🔍 Processing filesystem request: ${message.type}`);
                const response = await this.filesystemHandler.handleControlMessage(message, message.sessionId, clientId);
                console.log(`🔍 Filesystem response type: ${response.type}, files: ${response.files ? response.files.length : 'N/A'}`);
                
                this.publishToClient(clientId, message.sessionId || 'default', 'output', {
                    type: 'filesystem',
                    data: response
                });
                console.log(`✅ Filesystem response published successfully`);
                return;
            } catch (error) {
                console.error('❌ Filesystem error:', error);
                this.publishToClient(clientId, message.sessionId || 'default', 'output', {
                    type: 'filesystem',
                    data: {
                        type: 'error',
                        message: error.message
                    }
                });
                return;
            }
        }
        
        // Handle session control
        switch (message.action) {
            case 'start-session':
                this.startQChatSession(clientId, message.sessionId, message.workingDir);
                break;
            case 'stop-session':
                this.stopQChatSession(clientId, message.sessionId);
                break;
            default:
                console.log(`❓ Unknown control action: ${message.action || message.type}`);
        }
    }

    handleInputMessage(clientId, sessionId, message) {
        const sessionKey = `${clientId}:${sessionId}`;
        const session = this.sessions.get(sessionKey);
        
        console.log(`📝 Input for session ${sessionKey}, exists: ${!!session}`);
        console.log(`📊 All sessions:`, Array.from(this.sessions.keys()));
        
        if (session && session.process) {
            try {
                session.process.stdin.write(message.data + '\n');
                console.log(`📝 Sent input to Q chat session ${sessionId} for ${clientId}`);
            } catch (error) {
                console.error('❌ Error writing to Q chat process:', error);
                this.publishToClient(clientId, sessionId, 'status', {
                    type: 'error',
                    message: 'Failed to send input: ' + error.message
                });
            }
        } else {
            console.log(`❌ No active Q chat session ${sessionId} for client ${clientId}`);
            this.publishToClient(clientId, sessionId, 'status', {
                type: 'error',
                message: 'No active Q chat session found'
            });
        }
    }

    startQChatSession(clientId, sessionId, workingDir = null) {
        const sessionKey = `${clientId}:${sessionId}`;
        
        if (this.sessions.has(sessionKey)) {
            console.log(`⚠️ Session already exists: ${sessionKey}`);
            return;
        }

        try {
            // Resolve working directory (handle relative/absolute paths)
            const resolvedDir = workingDir ? path.resolve(workingDir) : process.cwd();
            
            console.log(`🚀 Starting Q chat session ${sessionId} for client ${clientId} in ${resolvedDir}`);
            
            const qProcess = spawn('q', ['chat'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: resolvedDir,
                env: {
                    ...process.env,
                    TERM: 'xterm-256color'
                }
            });

            const session = {
                process: qProcess,
                clientId,
                sessionId,
                workingDir: resolvedDir,
                startTime: new Date(),
                outputBuffer: '',
                bufferTimer: null,
                bufferLines: [],
                maxLines: 10,
                maxWaitMs: 500
            };

            this.sessions.set(sessionKey, session);
            
            // Track client sessions
            if (!this.clientSessions.has(clientId)) {
                this.clientSessions.set(clientId, new Set());
            }
            this.clientSessions.get(clientId).add(sessionId);

            // Handle stdout with buffering
            qProcess.stdout.on('data', (data) => {
                this.bufferOutput(sessionKey, data.toString());
            });

            // Handle stderr with buffering
            qProcess.stderr.on('data', (data) => {
                this.bufferOutput(sessionKey, data.toString());
            });

            // Handle process exit
            qProcess.on('exit', (code, signal) => {
                console.log(`🔚 Q chat process exited for session ${sessionKey}`);
                this.flushBuffer(sessionKey);
                this.sessions.delete(sessionKey);
                
                // Remove from client sessions
                const clientSessionSet = this.clientSessions.get(clientId);
                if (clientSessionSet) {
                    clientSessionSet.delete(sessionId);
                    if (clientSessionSet.size === 0) {
                        this.clientSessions.delete(clientId);
                    }
                }
                
                this.publishToClient(clientId, sessionId, 'status', {
                    type: 'exit',
                    code,
                    signal
                });
            });

            // Handle process error
            qProcess.on('error', (error) => {
                console.error(`❌ Q chat process error for session ${sessionKey}:`, error);
                this.flushBuffer(sessionKey);
                this.sessions.delete(sessionKey);
                
                // Remove from client sessions
                const clientSessionSet = this.clientSessions.get(clientId);
                if (clientSessionSet) {
                    clientSessionSet.delete(sessionId);
                    if (clientSessionSet.size === 0) {
                        this.clientSessions.delete(clientId);
                    }
                }
                
                this.publishToClient(clientId, sessionId, 'status', {
                    type: 'error',
                    message: 'Q chat process error: ' + error.message
                });
            });

            this.publishToClient(clientId, sessionId, 'status', { 
                type: 'started',
                workingDir: resolvedDir
            });
            console.log(`✅ Q chat session ${sessionId} started for client ${clientId} in ${resolvedDir}`);
            
        } catch (error) {
            console.error('❌ Error starting Q chat process:', error);
            this.publishToClient(clientId, sessionId, 'status', {
                type: 'error',
                message: 'Failed to start Q chat: ' + error.message
            });
        }
    }

    bufferOutput(sessionKey, data) {
        const session = this.sessions.get(sessionKey);
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
                this.processBufferLine(sessionKey, line, session);
            }
        }

        // Check if we should flush the buffer
        if (session.bufferLines.length >= session.maxLines) {
            this.flushBuffer(sessionKey);
        } else if (session.bufferLines.length > 0 && !session.bufferTimer) {
            // Start timer for partial buffer
            session.bufferTimer = setTimeout(() => {
                this.flushBuffer(sessionKey);
            }, session.maxWaitMs);
        }
    }

    processBufferLine(sessionKey, line, session) {
        const cleanLine = this.cleanTerminalLine(line);
        
        console.log(`🔍 Processing line for ${sessionKey}: "${cleanLine}"`);
        
        // Skip empty lines
        if (cleanLine.trim().length === 0) {
            console.log(`⏭️ Skipping empty line`);
            return;
        }

        // Extract actual content from spinner lines
        if (this.isSpinnerLine(cleanLine)) {
            const actualContent = this.extractContentFromSpinnerLine(cleanLine);
            if (actualContent && actualContent.trim().length > 0) {
                console.log(`✅ Extracted content from spinner line: "${actualContent}"`);
                session.bufferLines.push(actualContent);
            } else {
                console.log(`🚫 Filtered out pure spinner: ${cleanLine.substring(0, 30)}...`);
            }
            return;
        }

        // Add line to buffer
        console.log(`✅ Adding to buffer: "${cleanLine}"`);
        session.bufferLines.push(cleanLine);
    }

    extractContentFromSpinnerLine(line) {
        // Remove ANSI codes
        let cleaned = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
        
        // Remove spinner characters and "Thinking..." text
        cleaned = cleaned.replace(/[⠋⠙⠹⠸⠼⠦⠴⠇⠧⠏]/g, '');
        cleaned = cleaned.replace(/Thinking\.\.\./g, '');
        
        // Extract content after cursor control sequences
        const match = cleaned.match(/\[?\?25h(.+)$/);
        if (match) {
            return match[1].trim();
        }
        
        // Fallback: just clean up and return if there's meaningful content
        cleaned = cleaned.trim();
        if (cleaned.length > 0 && !cleaned.match(/^[\s\[?\?25[lh]]*$/)) {
            return cleaned;
        }
        
        return null;
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

    flushBuffer(sessionKey) {
        const session = this.sessions.get(sessionKey);
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
        console.log(`📦 Flushing ${session.bufferLines.length} lines to session ${sessionKey}`);
        this.publishToClient(session.clientId, session.sessionId, 'output', {
            content: content,
            lineCount: session.bufferLines.length,
            isMultiline: true
        });

        console.log(`📦 Sent ${session.bufferLines.length} lines to session ${sessionKey}`);

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

    stopQChatSession(clientId, sessionId) {
        const sessionKey = `${clientId}:${sessionId}`;
        const session = this.sessions.get(sessionKey);
        if (session && session.process) {
            console.log(`🛑 Stopping Q chat session ${sessionId} for client ${clientId}`);
            session.process.kill('SIGTERM');
            this.sessions.delete(sessionKey);
            
            // Remove from client sessions
            const clientSessionSet = this.clientSessions.get(clientId);
            if (clientSessionSet) {
                clientSessionSet.delete(sessionId);
                if (clientSessionSet.size === 0) {
                    this.clientSessions.delete(clientId);
                }
            }
        }
    }

    publishToClient(clientId, sessionId, messageType, data) {
        if (!this.isConnected) {
            console.log(`⚠️ Cannot publish - not connected to IoT Core`);
            return;
        }
        
        const topic = `${this.projectName}/client/${clientId}/${sessionId}/${messageType}`;
        const message = JSON.stringify(data);
        
        console.log(`🔍 Publishing to topic: ${topic}`);
        console.log(`🔍 Message size: ${message.length} bytes`);
        
        this.device.publish(topic, message, { qos: 0 }, (error) => {
            if (error) {
                console.error(`❌ Error publishing to ${topic}:`, error);
            } else {
                console.log(`📡 Published ${messageType} to session ${sessionId} for client ${clientId}`);
            }
        });
    }

    cleanup() {
        console.log('🧹 Cleaning up server...');
        this.isConnected = false;
        
        // Clean up all sessions
        for (const [sessionKey, session] of this.sessions) {
            if (session.process) {
                session.process.kill('SIGTERM');
            }
        }
        this.sessions.clear();
        this.clientSessions.clear();

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
