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
            // Authenticate user
            const authResult = await new Promise((resolve, reject) => {
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
            await this.getAwsCredentials(authResult);

        } catch (error) {
            console.error('Login error:', error);
            this.updateStatus('Login failed: ' + error.message, 'error');
            this.addToTerminal('Login failed: ' + error.message, 'error');
        }
    }

    async getAwsCredentials(authResult) {
        try {
            // Get the ID token from the auth result
            const idToken = authResult.getIdToken().getJwtToken();
            console.log('ID Token obtained from auth result');
            
            // Configure AWS Cognito Identity credentials
            AWS.config.region = window.AWS_CONFIG.region;
            const credentials = new AWS.CognitoIdentityCredentials({
                IdentityPoolId: window.AWS_CONFIG.identityPoolId,
                Logins: {
                    [`cognito-idp.${window.AWS_CONFIG.region}.amazonaws.com/${window.AWS_CONFIG.userPoolId}`]: idToken
                }
            });
            
            // Get AWS credentials
            console.log('Getting AWS credentials...');
            await new Promise((resolve, reject) => {
                credentials.get((err) => {
                    if (err) {
                        console.error('Error getting credentials:', err);
                        reject(err);
                    } else {
                        console.log('AWS credentials obtained successfully');
                        console.log('Access Key ID:', credentials.accessKeyId);
                        console.log('Identity ID:', credentials.identityId);
                        resolve();
                    }
                });
            });
            
            // Store identity ID and set up MQTT
            this.identityId = credentials.identityId;
            this.isAuthenticated = true;
            this.hideLoginModal();
            
            // Create credentials object for MQTT
            const mqttCredentials = {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken
            };

            console.log('Credentials for MQTT:', {
                accessKeyId: mqttCredentials.accessKeyId,
                secretAccessKey: mqttCredentials.secretAccessKey ? '***' : 'undefined',
                sessionToken: mqttCredentials.sessionToken ? '***' : 'undefined'
            });

            await this.setupMqttConnection(mqttCredentials);

        } catch (error) {
            console.error('Error getting AWS credentials:', error);
            this.updateStatus('Credential error: ' + error.message, 'error');
            this.addToTerminal('❌ Credential error: ' + error.message, 'error');
        }
    }

    async setupMqttConnection(credentials) {
        try {
            this.updateStatus('Connecting to MQTT...', 'connecting');

            // Create client ID from identity ID (sanitized for MQTT)
            this.clientId = this.identityId.replace(/:/g, '-');
            
            console.log('Setting up MQTT connection...');
            console.log('Client ID:', this.clientId);
            console.log('IoT Endpoint:', window.AWS_CONFIG.iotEndpoint);

            // Connect using AWS IoT Device SDK v2 with WebSocket and SigV4
            await this.connectWebSocket(credentials);

        } catch (error) {
            console.error('Error setting up MQTT connection:', error);
            this.updateStatus('MQTT connection error: ' + error.message, 'error');
            this.addToTerminal('❌ MQTT connection error: ' + error.message, 'error');
        }
    }

    async connectWebSocket(credentials) {
        try {
            console.log('🔗 Connecting to AWS IoT via WebSocket with SigV4...');
            console.log('Available AWSIoTv2 modules:', Object.keys(window.AWSIoTv2));
            
            const endpoint = window.AWS_CONFIG.iotEndpoint;
            const region = window.AWS_CONFIG.region;
            
            // Check if we have the required modules
            if (!window.AWSIoTv2.auth || !window.AWSIoTv2.iot || !window.AWSIoTv2.mqtt5) {
                throw new Error('Required AWS IoT SDK v2 modules not available. Available: ' + Object.keys(window.AWSIoTv2).join(', '));
            }

            console.log('Input credentials:', {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey ? '***' : 'undefined',
                sessionToken: credentials.sessionToken ? '***' : 'undefined'
            });

            // Create custom credentials provider following AWS sample pattern
            console.log('Creating custom credentials provider following AWS sample...');
            
            class CustomCognitoCredentialsProvider extends window.AWSIoTv2.auth.CredentialsProvider {
                constructor(credentials) {
                    super();
                    this.credentials = credentials;
                }

                getCredentials() {
                    // Use the exact property names from AWS sample
                    return {
                        aws_access_id: this.credentials.accessKeyId,
                        aws_secret_key: this.credentials.secretAccessKey,
                        aws_sts_token: this.credentials.sessionToken,
                        aws_region: region
                    };
                }

                async refreshCredentials() {
                    // For now, we don't need to refresh since we get fresh credentials from Cognito
                    console.log('refreshCredentials called (no-op for now)');
                }
            }

            const credentialsProvider = new CustomCognitoCredentialsProvider(credentials);
            
            // Test the credentials provider
            const testCreds = credentialsProvider.getCredentials();
            console.log('✅ Custom credentials provider test successful:', {
                aws_access_id: testCreds.aws_access_id,
                aws_secret_key: testCreds.aws_secret_key ? '***' : 'undefined',
                aws_sts_token: testCreds.aws_sts_token ? '***' : 'undefined',
                aws_region: testCreds.aws_region
            });

            // Create WebSocket SigV4 config following AWS sample pattern
            console.log('Creating WebSocket SigV4 config...');
            const wsConfig = {
                credentialsProvider: credentialsProvider,
                region: region
            };

            console.log('WebSocket config created:', {
                hasCredentialsProvider: !!wsConfig.credentialsProvider,
                region: wsConfig.region
            });

            // Create MQTT5 client configuration using the builder pattern (AWS sample style)
            console.log('Creating MQTT5 client config builder...');
            const builder = window.AWSIoTv2.iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
                endpoint,
                wsConfig
            );

            console.log('Config builder created:', builder);

            // Set client ID using withConnectProperties method (AWS sample style)
            const clientId = `q-cli-webui-client-${Date.now()}`;
            console.log('Setting client ID using withConnectProperties:', clientId);
            
            builder.withConnectProperties({
                clientId: clientId
            });

            console.log('✅ Set client ID using withConnectProperties method');

            // Build the final configuration (AWS sample style)
            console.log('Building final config using build() method...');
            const clientConfig = builder.build();

            console.log('Final client config keys:', Object.keys(clientConfig || {}));

            // Debug the websocket options to see if credentials are properly set
            if (clientConfig.websocketOptions) {
                console.log('WebSocket options structure:', {
                    hasUrlFactory: !!clientConfig.websocketOptions.urlFactory,
                    hasUrlFactoryOptions: !!clientConfig.websocketOptions.urlFactoryOptions,
                    hasCredentialsProvider: !!clientConfig.websocketOptions.credentialsProvider
                });
                
                // Try to inspect the URL factory options
                if (clientConfig.websocketOptions.urlFactoryOptions) {
                    console.log('URL factory options keys:', Object.keys(clientConfig.websocketOptions.urlFactoryOptions));
                    if (clientConfig.websocketOptions.urlFactoryOptions.credentialsProvider) {
                        console.log('URL factory has credentials provider:', !!clientConfig.websocketOptions.urlFactoryOptions.credentialsProvider);
                        
                        // Test the credentials provider in the URL factory
                        try {
                            const urlFactoryCreds = clientConfig.websocketOptions.urlFactoryOptions.credentialsProvider.getCredentials();
                            console.log('URL factory credentials test:', {
                                aws_access_id: urlFactoryCreds.aws_access_id,
                                aws_secret_key: urlFactoryCreds.aws_secret_key ? '***' : 'undefined',
                                aws_sts_token: urlFactoryCreds.aws_sts_token ? '***' : 'undefined',
                                aws_region: urlFactoryCreds.aws_region
                            });
                        } catch (error) {
                            console.log('URL factory credentials test failed:', error);
                        }
                    }
                }
            }

            // Create MQTT5 client
            console.log('Creating MQTT5 client...');
            this.mqttClient = new window.AWSIoTv2.mqtt5.Mqtt5Client(clientConfig);

            console.log('MQTT5 client created:', this.mqttClient);

            // Set up event handlers (following AWS sample pattern)
            this.mqttClient.on('error', (error) => {
                console.error('MQTT5 error:', error);
                this.updateStatus('MQTT error: ' + error.message, 'error');
                this.addToTerminal('❌ MQTT error: ' + error.message, 'error');
            });

            this.mqttClient.on('attemptingConnect', (eventData) => {
                console.log('Attempting Connect event');
                this.addToTerminal('🔄 Attempting to connect...', 'system');
            });

            this.mqttClient.on('connectionSuccess', (eventData) => {
                console.log('✅ Connected to AWS IoT via WebSocket with SigV4');
                console.log('Connack:', JSON.stringify(eventData.connack));
                console.log('Settings:', JSON.stringify(eventData.settings));
                this.isConnectedToMqtt = true;
                this.updateStatus('Connected (MQTT5 WebSocket)', 'connected');
                this.enableControls();
                this.subscribeToServerResponses();
                this.addToTerminal('🔗 Connected to AWS IoT Core via WebSocket', 'system');
                this.addToTerminal('📡 Ready to send and receive messages', 'system');
            });

            this.mqttClient.on('connectionFailure', (eventData) => {
                console.error('MQTT5 connection failed:', eventData);
                console.error('Connection failure error:', eventData.error.toString());
                this.updateStatus('Connection failed: ' + eventData.error.toString(), 'error');
                this.addToTerminal('❌ Connection failed: ' + eventData.error.toString(), 'error');
            });

            this.mqttClient.on('disconnection', (eventData) => {
                console.log('📴 MQTT5 disconnected:', eventData.error.toString());
                if (eventData.disconnect !== undefined) {
                    console.log('Disconnect packet:', JSON.stringify(eventData.disconnect));
                }
                this.isConnectedToMqtt = false;
                this.updateStatus('MQTT disconnected', 'error');
                this.addToTerminal('📴 MQTT connection lost', 'error');
            });

            this.mqttClient.on('stopped', (eventData) => {
                console.log('MQTT5 stopped event');
                this.addToTerminal('🛑 MQTT client stopped', 'system');
            });

            this.mqttClient.on('messageReceived', (eventData) => {
                const topic = eventData.message.topicName;
                const payload = new TextDecoder().decode(eventData.message.payload);
                console.log('Message Received event:', JSON.stringify(eventData.message));
                if (eventData.message.payload) {
                    console.log('  with payload:', payload);
                }
                this.handleServerMessage(topic, payload);
            });

            // Start the connection (AWS sample style)
            console.log('Starting MQTT5 client...');
            this.mqttClient.start();

        } catch (error) {
            console.error('Error setting up MQTT connection:', error);
            this.updateStatus('MQTT connection error: ' + error.message, 'error');
            this.addToTerminal('❌ MQTT connection error: ' + error.message, 'error');
        }
    }

    checkForMessages() {
        // Check for messages on subscribed topics using AWS IoT Data service
        if (!this.subscribedTopics || this.subscribedTopics.length === 0) {
            return;
        }

        this.subscribedTopics.forEach(topic => {
            // Use AWS IoT Data service to get messages (this is a simplified approach)
            // In production, you'd want to use WebSocket with SigV4 for real-time messaging
            
            // For now, we'll simulate message checking by making periodic calls
            // This is not the most efficient but works for demonstration
            console.log(`🔍 Checking for messages on topic: ${topic}`);
        });
    }

    // Add a method to handle incoming messages (called by server via different mechanism)
    handleServerMessage(topic, message) {
        console.log(`📨 Received message on topic: ${topic}`);
        console.log(`📄 Message: ${message}`);

        try {
            const data = JSON.parse(message);
            
            if (topic.includes('/output')) {
                this.handleOutputMessage(data);
            } else if (topic.includes('/status')) {
                this.handleStatusMessage(data);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            this.addToTerminal(`❌ Error parsing message: ${error.message}`, 'error');
        }
    }

    handleOutputMessage(data) {
        if (data.type === 'output') {
            this.addToTerminal(data.content, 'output');
        } else if (data.type === 'prompt') {
            this.showInputSection(data.content);
        } else if (data.type === 'error') {
            this.addToTerminal(data.content, 'error');
        }
    }

    handleStatusMessage(data) {
        if (data.status === 'session-started') {
            this.addToTerminal('🚀 Q Chat session started successfully', 'system');
            this.showInputSection('Q> ');
        } else if (data.status === 'session-ended') {
            this.addToTerminal('🛑 Q Chat session ended', 'system');
            this.hideInputSection();
        } else if (data.status === 'waiting-for-input') {
            this.showInputSection(data.prompt || 'Q> ');
        }
    }

    setupMqttEventHandlers() {
        // Paho MQTT uses different event handling
        this.mqttDevice.onMessageArrived = (message) => {
            this.handleServerMessage(message.destinationName, message.payloadString);
        };

        this.mqttDevice.onConnectionLost = (responseObject) => {
            if (responseObject.errorCode !== 0) {
                console.log('📴 MQTT disconnected:', responseObject.errorMessage);
                this.isConnectedToMqtt = false;
                this.updateStatus('MQTT disconnected', 'error');
                this.addToTerminal('📴 MQTT connection lost: ' + responseObject.errorMessage, 'error');
            }
        };
    }

    subscribeToServerResponses() {
        const outputTopic = `${window.AWS_CONFIG.projectName}/client/${this.clientId}/output`;
        const statusTopic = `${window.AWS_CONFIG.projectName}/client/${this.clientId}/status`;
        
        console.log('📡 Subscribing to topics:');
        console.log(`   - ${outputTopic}`);
        console.log(`   - ${statusTopic}`);
        
        // Subscribe to topics using MQTT5 client
        const subscribePacket = {
            subscriptions: [
                {
                    topicFilter: outputTopic,
                    qos: 1 // QoS 1 (At Least Once)
                },
                {
                    topicFilter: statusTopic,
                    qos: 1 // QoS 1 (At Least Once)
                }
            ]
        };

        this.mqttClient.subscribe(subscribePacket).then(() => {
            console.log(`✅ Subscribed to topics successfully`);
            this.addToTerminal(`📡 Subscribed to: ${outputTopic}`, 'system');
            this.addToTerminal(`📡 Subscribed to: ${statusTopic}`, 'system');
        }).catch((error) => {
            console.error('❌ Failed to subscribe to topics:', error);
            this.addToTerminal(`❌ Failed to subscribe to topics: ${error.message}`, 'error');
        });
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
        if (!this.mqttClient || !this.isConnectedToMqtt) {
            console.error('MQTT client not connected');
            this.addToTerminal('❌ MQTT not connected', 'error');
            return;
        }

        const topic = `${window.AWS_CONFIG.projectName}/server/${this.clientId}/${messageType}`;
        const messagePayload = JSON.stringify(data);
        
        console.log(`📤 Publishing to topic: ${topic}`);
        console.log(`📄 Message: ${messagePayload}`);
        
        // Publish message using MQTT5 client
        const publishPacket = {
            topicName: topic,
            payload: new TextEncoder().encode(messagePayload),
            qos: 1 // QoS 1 (At Least Once)
        };

        this.mqttClient.publish(publishPacket).then(() => {
            console.log('✅ Message published successfully');
        }).catch((error) => {
            console.error('❌ Failed to publish message:', error);
            this.addToTerminal(`❌ Failed to publish message: ${error.message}`, 'error');
        });
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
