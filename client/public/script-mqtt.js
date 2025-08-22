class QCliMqttClient {
    constructor() {
        this.cognitoUser = null;
        this.identityId = null;
        this.isAuthenticated = false;
        this.mqttDevice = null;
        this.isConnectedToMqtt = false;
        this.clientId = null;
        this.lastSentInput = '';
        
        this.initializeElements();
        this.setupEventListeners();
        this.showLoginModal();
    }

    initializeElements() {
        // Status elements
        this.statusElement = document.getElementById('status');
        
        // Control buttons
        this.loginBtn = document.getElementById('loginBtn');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.clearBtn = document.getElementById('clearBtn');
        
        // Terminal and input
        this.terminal = document.getElementById('terminal');
        this.inputContainer = document.getElementById('inputSection');
        this.inputTextarea = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearInputBtn = document.getElementById('clearInputBtn');
        
        // Login modal
        this.loginModal = document.getElementById('loginModal');
        this.loginForm = document.getElementById('loginForm');
        this.usernameInput = document.getElementById('username');
        this.passwordInput = document.getElementById('password');
        this.cancelLoginBtn = document.getElementById('cancelLogin');
    }

    setupEventListeners() {
        // Control buttons
        this.loginBtn?.addEventListener('click', () => this.showLoginModal());
        this.startBtn?.addEventListener('click', () => this.startQChat());
        this.stopBtn?.addEventListener('click', () => this.stopQChat());
        this.clearBtn?.addEventListener('click', () => this.clearTerminal());
        
        // Input controls
        this.sendBtn?.addEventListener('click', () => this.sendInput());
        this.clearInputBtn?.addEventListener('click', () => this.clearInput());
        
        // Login form
        this.loginForm?.addEventListener('submit', (e) => this.handleLogin(e));
        this.cancelLoginBtn?.addEventListener('click', () => this.hideLoginModal());
        
        // Keyboard shortcuts
        this.inputTextarea?.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.sendInput();
            }
        });
        
        // Close modal when clicking outside (only if authenticated)
        this.loginModal?.addEventListener('click', (e) => {
            if (e.target === this.loginModal && this.isAuthenticated) {
                this.hideLoginModal();
            }
        });
    }

    showLoginModal() {
        if (this.loginModal) {
            this.loginModal.style.display = 'flex';
        }
        if (this.usernameInput) {
            this.usernameInput.focus();
        }
    }

    hideLoginModal() {
        if (this.loginModal) {
            this.loginModal.style.display = 'none';
        }
    }

    updateStatus(message, type = 'info') {
        this.statusElement.textContent = message;
        this.statusElement.className = `status ${type}`;
    }

    addToTerminal(message, type = 'output') {
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        
        if (type === 'output') {
            // Process ANSI escape codes for colors
            line.innerHTML = this.processAnsiCodes(message);
        } else {
            line.textContent = message;
        }
        
        this.terminal.appendChild(line);
        this.terminal.scrollTop = this.terminal.scrollHeight;
    }

    processAnsiCodes(text) {
        // Basic ANSI color code processing
        return text
            .replace(/\x1b\[0m/g, '</span>')
            .replace(/\x1b\[1m/g, '<span class="ansi-bold">')
            .replace(/\x1b\[31m/g, '<span class="ansi-red">')
            .replace(/\x1b\[32m/g, '<span class="ansi-green">')
            .replace(/\x1b\[33m/g, '<span class="ansi-yellow">')
            .replace(/\x1b\[34m/g, '<span class="ansi-blue">')
            .replace(/\x1b\[35m/g, '<span class="ansi-magenta">')
            .replace(/\x1b\[36m/g, '<span class="ansi-cyan">')
            .replace(/\x1b\[37m/g, '<span class="ansi-white">');
    }

    clearTerminal() {
        this.terminal.innerHTML = '';
        this.addToTerminal('Terminal cleared', 'system');
    }

    async handleLogin(event) {
        event.preventDefault();
        
        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value;
        
        if (!username || !password) {
            this.addToTerminal('Please enter both username and password', 'error');
            return;
        }
        
        try {
            this.updateStatus('Authenticating...', 'connecting');
            
            // Configure AWS Cognito
            AWS.config.region = window.AWS_CONFIG.region;
            
            const poolData = {
                UserPoolId: window.AWS_CONFIG.userPoolId,
                ClientId: window.AWS_CONFIG.userPoolWebClientId
            };
            
            const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
            
            const userData = {
                Username: username,
                Pool: userPool
            };
            
            this.cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
            
            const authenticationData = {
                Username: username,
                Password: password
            };
            
            const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);
            
            // Authenticate user
            await new Promise((resolve, reject) => {
                this.cognitoUser.authenticateUser(authenticationDetails, {
                    onSuccess: (result) => {
                        console.log('Authentication successful');
                        resolve(result);
                    },
                    onFailure: (err) => {
                        console.error('Authentication failed:', err);
                        reject(err);
                    }
                });
            });
            
            // Get AWS credentials and setup MQTT
            await this.getAwsCredentials();

        } catch (error) {
            console.error('Login error:', error);
            this.updateStatus('Login failed: ' + error.message, 'error');
            this.addToTerminal('Login failed: ' + error.message, 'error');
        }
    }

    async getAwsCredentials() {
        const idToken = this.cognitoUser.getSignInUserSession().getIdToken().getJwtToken();
        
        const credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: window.AWS_CONFIG.identityPoolId,
            Logins: {
                [`cognito-idp.${window.AWS_CONFIG.region}.amazonaws.com/${window.AWS_CONFIG.userPoolId}`]: idToken
            }
        });
        
        await new Promise((resolve, reject) => {
            credentials.get((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        this.identityId = credentials.identityId;
        this.isAuthenticated = true;
        this.hideLoginModal();
        this.setupMqttConnection(credentials);
    }

    setupMqttConnection(credentials) {
        try {
            this.updateStatus('Connecting to MQTT...', 'connecting');

            // Create client ID from identity ID (sanitized for MQTT)
            this.clientId = this.identityId.replace(/:/g, '-');
            
            console.log('Setting up MQTT connection...');
            console.log('Client ID:', this.clientId);
            console.log('IoT Endpoint:', window.AWS_CONFIG.iotEndpoint);

            // Create MQTT device using AWS IoT Device SDK
            this.mqttDevice = awsIot.device({
                region: window.AWS_CONFIG.region,
                host: window.AWS_CONFIG.iotEndpoint,
                clientId: `q-cli-webui-client-${Date.now()}`,
                protocol: 'wss',
                maximumReconnectTimeMs: 8000,
                debug: true,
                accessKeyId: credentials.accessKeyId,
                secretKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken
            });

            this.setupMqttEventHandlers();

        } catch (error) {
            console.error('Error setting up MQTT connection:', error);
            this.updateStatus('MQTT connection error: ' + error.message, 'error');
            this.addToTerminal('❌ MQTT connection error: ' + error.message, 'error');
        }
    }

    setupMqttEventHandlers() {
        this.mqttDevice.on('connect', () => {
            console.log('✅ Connected to MQTT over WebSocket');
            this.isConnectedToMqtt = true;
            this.updateStatus('Connected (MQTT)', 'connected');
            this.enableControls();
            
            // Subscribe to server response topics
            this.subscribeToServerResponses();
            
            this.addToTerminal('🔗 Connected to MQTT broker', 'system');
            this.addToTerminal('📡 Ready to send and receive messages', 'system');
        });

        this.mqttDevice.on('message', (topic, payload) => {
            this.handleServerMessage(topic, payload.toString());
        });

        this.mqttDevice.on('error', (error) => {
            console.error('MQTT error:', error);
            this.updateStatus('MQTT error: ' + error.message, 'error');
            this.addToTerminal('❌ MQTT error: ' + error.message, 'error');
        });

        this.mqttDevice.on('offline', () => {
            console.log('📴 MQTT disconnected');
            this.isConnectedToMqtt = false;
            this.updateStatus('MQTT disconnected', 'error');
            this.addToTerminal('📴 MQTT connection lost', 'error');
        });

        this.mqttDevice.on('reconnect', () => {
            console.log('🔄 MQTT reconnecting...');
            this.updateStatus('Reconnecting...', 'connecting');
            this.addToTerminal('🔄 Reconnecting to MQTT...', 'system');
        });
    }

    subscribeToServerResponses() {
        const outputTopic = `${window.AWS_CONFIG.projectName}/client/${this.clientId}/output`;
        const statusTopic = `${window.AWS_CONFIG.projectName}/client/${this.clientId}/status`;
        
        console.log(`📡 Subscribing to response topics:`);
        console.log(`   - ${outputTopic}`);
        console.log(`   - ${statusTopic}`);
        
        this.mqttDevice.subscribe(outputTopic);
        this.mqttDevice.subscribe(statusTopic);
        
        this.addToTerminal(`📡 Subscribed to: ${outputTopic}`, 'system');
        this.addToTerminal(`📡 Subscribed to: ${statusTopic}`, 'system');
    }

    handleServerMessage(topic, message) {
        console.log(`📨 Received message on topic: ${topic}`);
        console.log(`📄 Message: ${message}`);
        
        try {
            const data = JSON.parse(message);
            const topicParts = topic.split('/');
            const messageType = topicParts[topicParts.length - 1]; // last part is message type
            
            if (messageType === 'output') {
                // Handle Q CLI output
                if (data.raw) {
                    this.addToTerminal(data.raw, 'output');
                }
            } else if (messageType === 'status') {
                // Handle status updates
                this.handleStatusMessage(data);
            }
        } catch (error) {
            console.error('Error parsing server message:', error);
            this.addToTerminal('❌ Error parsing server message', 'error');
        }
    }

    handleStatusMessage(data) {
        switch (data.type) {
            case 'started':
                this.addToTerminal('✅ Q Chat session started', 'system');
                this.showInputContainer();
                break;
            case 'exit':
                this.addToTerminal(`🔚 Q Chat session ended (code: ${data.code})`, 'system');
                this.hideInputContainer();
                this.startBtn.disabled = false;
                this.stopBtn.disabled = true;
                break;
            case 'error':
                this.addToTerminal(`❌ Error: ${data.message}`, 'error');
                break;
            default:
                console.log('Unknown status message:', data);
        }
    }

    enableControls() {
        this.startBtn.disabled = false;
        if (this.loginBtn) {
            this.loginBtn.style.display = 'none';
        }
    }

    publishMessage(messageType, data) {
        if (!this.mqttDevice || !this.isConnectedToMqtt) {
            console.error('MQTT device not connected');
            this.addToTerminal('❌ MQTT not connected', 'error');
            return;
        }

        const topic = `${window.AWS_CONFIG.projectName}/server/${this.clientId}/${messageType}`;
        const message = JSON.stringify(data);
        
        console.log(`📤 Publishing to topic: ${topic}`);
        console.log(`📄 Message: ${message}`);
        
        this.mqttDevice.publish(topic, message);
        console.log('✅ Message published successfully');
    }

    startQChat() {
        this.publishMessage('control', { action: 'start-q-chat' });
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.addToTerminal('🚀 Starting Q Chat session...', 'system');
    }

    stopQChat() {
        this.publishMessage('control', { action: 'stop-q-chat' });
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.hideInputContainer();
        this.addToTerminal('🛑 Stopping Q Chat session...', 'system');
    }

    sendInput() {
        if (!this.inputTextarea) return;
        const input = this.inputTextarea.value.trim();
        if (!input.trim()) return;

        this.publishMessage('input', { data: input });
        this.lastSentInput = input;
        this.clearInput();
        this.addToTerminal(`> ${input}`, 'input');
    }

    clearInput() {
        if (!this.inputTextarea) return;
        this.inputTextarea.value = '';
        this.inputTextarea.focus();
    }

    showInputContainer() {
        if (this.inputContainer) {
            this.inputContainer.style.display = 'block';
        }
        if (this.inputTextarea) {
            this.inputTextarea.focus();
        }
    }

    hideInputContainer() {
        this.inputContainer.style.display = 'none';
    }
}

// Initialize the client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Q CLI MQTT Client...');
    window.qCliClient = new QCliMqttClient();
});
