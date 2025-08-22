// MQTT-based Q Chat Interface using AWS IoT Data API (HTTP)
class QChatMqttInterface {
    constructor() {
        this.terminal = document.getElementById('terminal');
        this.userInput = document.getElementById('userInput');
        this.inputSection = document.getElementById('inputSection');
        this.promptIndicator = document.getElementById('promptIndicator');
        this.status = document.getElementById('status');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.clearInputBtn = document.getElementById('clearInputBtn');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.loginBtn = document.getElementById('loginBtn');
        this.loginModal = document.getElementById('loginModal');
        this.loginForm = document.getElementById('loginForm');
        this.cancelLogin = document.getElementById('cancelLogin');

        this.isWaitingForInput = false;
        this.isSelectPrompt = false;
        this.rawBuffer = '';
        this.bufferTimeout = null;
        this.lastSentInput = '';
        this.thinkingElement = null;
        this.thinkingInterval = null;
        this.currentLine = '';
        this.streamingQueue = [];
        this.isStreaming = false;

        // AWS IoT Data API related properties
        this.iotData = null;
        this.cognitoUser = null;
        this.identityId = null;
        this.isAuthenticated = false;
        this.isConnectedToMqtt = false;

        // Block-based rendering system
        this.currentBlock = null;
        this.currentBlockContent = '';
        this.blockType = 'system';
        this.blockBuffer = '';

        // Initialize simple ANSI to HTML converter
        this.ansiConverter = {
            toHtml: (text) => this.convertAnsiToHtml(text)
        };

        this.initializeEventListeners();
        this.checkAuthenticationStatus();
    }

    initializeEventListeners() {
        // Button events
        this.sendBtn.addEventListener('click', () => this.sendInput());
        this.clearBtn.addEventListener('click', () => this.clearTerminal());
        this.clearInputBtn.addEventListener('click', () => this.clearInput());
        this.startBtn.addEventListener('click', () => this.startQChat());
        this.stopBtn.addEventListener('click', () => this.stopQChat());
        this.loginBtn.addEventListener('click', () => this.showLoginModal());
        this.cancelLogin.addEventListener('click', () => this.hideLoginModal());

        // Form events
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Input events
        this.userInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.sendInput();
            }
        });

        this.userInput.addEventListener('input', () => {
            this.sendBtn.disabled = !this.userInput.value.trim();
        });
    }

    checkAuthenticationStatus() {
        // Force fresh login for debugging - comment this out later
        localStorage.removeItem('qcli_credentials');
        
        const savedCredentials = localStorage.getItem('qcli_credentials');
        if (savedCredentials) {
            try {
                const credentials = JSON.parse(savedCredentials);
                this.authenticateWithSavedCredentials(credentials);
            } catch (error) {
                console.error('Error parsing saved credentials:', error);
                localStorage.removeItem('qcli_credentials');
            }
        }
    }

    showLoginModal() {
        this.loginModal.style.display = 'flex';
        document.getElementById('username').focus();
    }

    hideLoginModal() {
        this.loginModal.style.display = 'none';
        this.loginForm.reset();
    }

    async handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            this.updateStatus('Authenticating...', 'connecting');
            
            // Configure AWS SDK
            AWS.config.region = window.AWS_CONFIG.region;
            
            const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();
            
            // Authenticate with Cognito User Pool
            const authParams = {
                AuthFlow: 'USER_PASSWORD_AUTH',
                ClientId: window.AWS_CONFIG.userPoolWebClientId,
                AuthParameters: {
                    USERNAME: username,
                    PASSWORD: password
                }
            };

            const authResult = await cognitoIdentityServiceProvider.initiateAuth(authParams).promise();
            const idToken = authResult.AuthenticationResult.IdToken;

            // Get credentials from Cognito Identity Pool
            const cognitoIdentity = new AWS.CognitoIdentity();
            
            const identityParams = {
                IdentityPoolId: window.AWS_CONFIG.identityPoolId,
                Logins: {
                    [`cognito-idp.${window.AWS_CONFIG.region}.amazonaws.com/${window.AWS_CONFIG.userPoolId}`]: idToken
                }
            };

            const identityResult = await cognitoIdentity.getId(identityParams).promise();
            this.identityId = identityResult.IdentityId;

            const credentialsParams = {
                IdentityId: this.identityId,
                Logins: {
                    [`cognito-idp.${window.AWS_CONFIG.region}.amazonaws.com/${window.AWS_CONFIG.userPoolId}`]: idToken
                }
            };

            const credentialsResult = await cognitoIdentity.getCredentialsForIdentity(credentialsParams).promise();

            // Save credentials
            const credentials = {
                accessKeyId: credentialsResult.Credentials.AccessKeyId,
                secretAccessKey: credentialsResult.Credentials.SecretKey,
                sessionToken: credentialsResult.Credentials.SessionToken,
                identityId: this.identityId,
                expiration: credentialsResult.Credentials.Expiration
            };

            localStorage.setItem('qcli_credentials', JSON.stringify(credentials));

            this.isAuthenticated = true;
            this.hideLoginModal();
            this.setupIoTDataConnection(credentials);

        } catch (error) {
            console.error('Authentication error:', error);
            this.updateStatus('Authentication failed', 'error');
            alert('Login failed: ' + error.message);
        }
    }

    async authenticateWithSavedCredentials(credentials) {
        // Check if credentials are still valid
        if (new Date() > new Date(credentials.expiration)) {
            localStorage.removeItem('qcli_credentials');
            return;
        }

        this.identityId = credentials.identityId;
        this.isAuthenticated = true;
        this.setupIoTDataConnection(credentials);
    }

    setupIoTDataConnection(credentials) {
        try {
            this.updateStatus('Connecting to IoT...', 'connecting');

            // Use AWS IoT Data API for publish via HTTP
            AWS.config.update({
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken,
                region: window.AWS_CONFIG.region
            });

            this.iotData = new AWS.IotData({
                endpoint: window.AWS_CONFIG.iotEndpoint,
                region: window.AWS_CONFIG.region
            });

            this.isConnectedToMqtt = true;
            this.updateStatus('Connected (HTTP)', 'connected');
            this.enableControls();

        } catch (error) {
            console.error('Error setting up IoT Data connection:', error);
            this.updateStatus('Connection error: ' + error.message, 'error');
        }
    }

    publishMessage(messageType, data) {
        if (!this.iotData || !this.isConnectedToMqtt) {
            console.error('IoT Data client not connected');
            this.addToTerminal('Error: IoT Data client not connected', 'error');
            return;
        }

        // Sanitize identity ID for MQTT topic compatibility (replace colons with hyphens)
        const sanitizedIdentityId = this.identityId.replace(/:/g, '-');
        const topic = `${window.AWS_CONFIG.projectName}/server/${sanitizedIdentityId}/${messageType}`;
        const params = {
            topic: topic,
            payload: JSON.stringify(data)
        };

        this.iotData.publish(params, (error, result) => {
            if (error) {
                console.error('Error publishing message:', error);
                this.addToTerminal(`Error: ${error.message}`, 'error');
            } else {
                console.log('Message published successfully to:', topic);
            }
        });
    }

    enableControls() {
        this.loginBtn.textContent = 'Logout';
        this.loginBtn.onclick = () => this.logout();
        this.startBtn.disabled = false;
    }

    logout() {
        localStorage.removeItem('qcli_credentials');
        this.isAuthenticated = false;
        this.isConnectedToMqtt = false;
        
        this.loginBtn.textContent = 'Login';
        this.loginBtn.onclick = () => this.showLoginModal();
        this.startBtn.disabled = true;
        this.stopBtn.disabled = true;
        
        this.updateStatus('Disconnected', 'disconnected');
        this.clearTerminal();
    }

    startQChat() {
        this.publishMessage('control', { action: 'start-q-chat' });
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.updateStatus('Starting Q Chat...', 'connecting');
    }

    stopQChat() {
        this.publishMessage('control', { action: 'stop-q-chat' });
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.hideInput();
    }

    sendInput() {
        const input = this.userInput.value;
        if (!input.trim()) return;

        this.publishMessage('input', { data: input });
        this.lastSentInput = input;
        this.clearInput();
        this.hideInput();
        
        this.addToTerminal(`> ${input}`, 'user-input');
    }

    // Simplified message handling for demo (since we're using HTTP publish only)
    handleQOutput(data) {
        if (data.raw) {
            this.processRawOutput(data.raw);
        }
        if (data.error) {
            this.addToTerminal(`Error: ${data.error}`, 'error');
        }
    }

    handleStatusMessage(data) {
        switch (data.type) {
            case 'started':
                this.updateStatus('Q Chat Active', 'connected');
                this.addToTerminal('Q Chat session started', 'system');
                break;
            case 'exit':
                this.updateStatus('Q Chat Exited', 'disconnected');
                this.startBtn.disabled = false;
                this.stopBtn.disabled = true;
                this.hideInput();
                this.addToTerminal('Q Chat session ended', 'system');
                break;
            case 'error':
                this.updateStatus('Error', 'error');
                this.addToTerminal(`Error: ${data.message}`, 'error');
                break;
        }
    }

    processRawOutput(data) {
        this.rawBuffer += data;
        
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }
        
        this.bufferTimeout = setTimeout(() => {
            this.processBufferedOutput();
        }, 50);
    }

    processBufferedOutput() {
        if (!this.rawBuffer) return;
        
        const lines = this.rawBuffer.split('\n');
        this.rawBuffer = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (i === lines.length - 1 && line !== '') {
                this.rawBuffer = line;
                continue;
            }
            
            this.processLine(line);
        }
    }

    processLine(line) {
        const cleanLine = this.stripAnsiCodes(line);
        
        if (cleanLine.trim().startsWith('> ')) {
            this.showInput(cleanLine.trim());
            return;
        }
        
        this.addToTerminal(line);
    }

    stripAnsiCodes(text) {
        return text.replace(/\x1b\[[0-9;]*m/g, '');
    }

    convertAnsiToHtml(text) {
        // Simple ANSI to HTML conversion
        return text
            .replace(/\x1b\[0m/g, '</span>')
            .replace(/\x1b\[1m/g, '<span class="ansi-bold">')
            .replace(/\x1b\[31m/g, '<span class="ansi-red">')
            .replace(/\x1b\[32m/g, '<span class="ansi-green">')
            .replace(/\x1b\[33m/g, '<span class="ansi-yellow">')
            .replace(/\x1b\[34m/g, '<span class="ansi-blue">')
            .replace(/\x1b\[35m/g, '<span class="ansi-magenta">')
            .replace(/\x1b\[36m/g, '<span class="ansi-cyan">')
            .replace(/\x1b\[37m/g, '<span class="ansi-white">')
            .replace(/\x1b\[[0-9;]*m/g, '');
    }

    addToTerminal(content, className = '') {
        const div = document.createElement('div');
        if (className) {
            div.className = className;
        }
        
        const htmlContent = this.ansiConverter.toHtml(content);
        div.innerHTML = htmlContent;
        
        this.terminal.appendChild(div);
        this.terminal.scrollTop = this.terminal.scrollHeight;
    }

    showInput(prompt) {
        this.promptIndicator.textContent = prompt;
        this.inputSection.style.display = 'block';
        this.userInput.focus();
        this.isWaitingForInput = true;
        this.sendBtn.disabled = false;
    }

    hideInput() {
        this.inputSection.style.display = 'none';
        this.isWaitingForInput = false;
        this.sendBtn.disabled = true;
    }

    clearInput() {
        this.userInput.value = '';
        this.sendBtn.disabled = true;
    }

    clearTerminal() {
        this.terminal.innerHTML = '';
    }

    updateStatus(message, className) {
        this.status.textContent = message;
        this.status.className = `status ${className}`;
    }
}

// Initialize the interface when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new QChatMqttInterface();
});
