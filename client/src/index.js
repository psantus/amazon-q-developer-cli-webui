// Import AWS SDK and make it globally available
import AWS from 'aws-sdk';
window.AWS = AWS;

// Import Cognito Identity SDK and make it globally available
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
window.AmazonCognitoIdentity = {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails
};

// Import AWS IoT Device SDK v2 for WebSocket MQTT with SigV4
import * as AWSIoTv2 from 'aws-iot-device-sdk-v2';
window.AWSIoTv2 = AWSIoTv2;

console.log('🚀 AWS SDK, Cognito, and AWS IoT Device SDK v2 loaded successfully!');
console.log('Available AWSIoTv2 modules:', Object.keys(AWSIoTv2));

// Import managers
import AuthenticationManager from './auth/AuthenticationManager.js';
import MqttConnectionManager from './mqtt/MqttConnectionManager.js';
import UIManager from './ui/UIManager.js';
import SessionManager from './sessions/SessionManager.js';

/**
 * Main application class that coordinates all managers
 */
class App {
    constructor() {
        this.authManager = new AuthenticationManager();
        this.mqttManager = new MqttConnectionManager();
        this.uiManager = new UIManager();
        this.sessionManager = null;
        
        this.isInitialized = false;
        
        // Initialize immediately like the original
        this.setupEventHandlers();
        this.uiManager.showLoginModal();
        this.uiManager.updateStatus('Ready to login', 'info');
        
        this.isInitialized = true;
        console.log('✅ Application initialized successfully');
    }

    /**
     * Setup event handlers between managers
     */
    setupEventHandlers() {
        // UI Events
        this.uiManager.on('login', ({ username, password }) => this.handleLogin(username, password));
        this.uiManager.on('showLogin', () => this.uiManager.showLoginModal());
        this.uiManager.on('cancelLogin', () => this.handleCancelLogin());
        this.uiManager.on('sendInput', () => this.handleSendInput());
        this.uiManager.on('clearInput', () => this.uiManager.clearUserInput());
        this.uiManager.on('clearTerminal', () => this.handleClearTerminal());

        // MQTT Events
        this.mqttManager.on('connecting', () => {
            this.uiManager.updateStatus('Connecting to MQTT...', 'connecting');
            this.uiManager.addToTerminal('🔄 Attempting to connect...', 'system');
        });

        this.mqttManager.on('connected', () => {
            this.uiManager.updateStatus('Connected (MQTT5 WebSocket)', 'connected');
            this.uiManager.addToTerminal('🔗 Connected to AWS IoT Core via WebSocket', 'system');
            this.uiManager.addToTerminal('📡 Ready to send and receive messages', 'system');
            this.enableControls();
            this.setupSessionManager();
        });

        this.mqttManager.on('connectionFailed', (error) => {
            this.uiManager.updateStatus(`Connection failed: ${error.error}`, 'error');
            this.uiManager.showError(`Connection failed: ${error.error}`);
        });

        this.mqttManager.on('disconnected', (error) => {
            this.uiManager.updateStatus('MQTT disconnected', 'error');
            this.uiManager.addToTerminal('📴 MQTT connection lost', 'error');
            this.disableControls();
        });

        this.mqttManager.on('error', (error) => {
            this.uiManager.showError(`MQTT error: ${error.message}`);
        });
    }

    /**
     * Handle user login
     */
    async handleLogin(username, password) {
        if (!username || !password) {
            this.uiManager.showError('Please enter both username and password');
            return;
        }

        try {
            this.uiManager.updateStatus('Authenticating...', 'connecting');
            
            // Authenticate with Cognito
            const credentials = await this.authManager.authenticate(username, password);
            
            this.uiManager.hideLoginModal();
            this.uiManager.showSuccess('Authentication successful');
            
            // Connect to MQTT
            await this.mqttManager.connect(credentials, credentials.identityId);
            
        } catch (error) {
            console.error('Login failed:', error);
            this.uiManager.showError(`Login failed: ${error.message}`);
            this.uiManager.updateStatus('Authentication failed', 'error');
        }
    }

    /**
     * Handle cancel login
     */
    handleCancelLogin() {
        if (this.authManager.isAuthenticated) {
            this.uiManager.hideLoginModal();
        } else {
            this.uiManager.showError('Authentication is required to use the application');
        }
    }

    /**
     * Setup session manager after MQTT connection
     */
    setupSessionManager() {
        if (!this.sessionManager && this.mqttManager.isConnected) {
            const authStatus = this.authManager.getAuthStatus();
            this.sessionManager = new SessionManager(
                this.mqttManager,
                this.uiManager,
                authStatus.identityId.replace(/:/g, '-')
            );
            
            console.log('✅ Session manager initialized');
        }
    }

    /**
     * Handle send input
     */
    async handleSendInput() {
        if (!this.sessionManager) {
            // Fallback to original behavior if no session manager
            const input = this.uiManager.getUserInput();
            if (!input) return;

            this.uiManager.addToTerminal(`> ${input}`, 'user');
            this.uiManager.clearUserInput();
            return;
        }

        const activeSession = this.sessionManager.getActiveSession();
        if (activeSession) {
            await this.sessionManager.sendSessionInput(activeSession.id);
        } else {
            this.uiManager.showError('No active session');
        }
    }

    /**
     * Handle clear terminal
     */
    handleClearTerminal() {
        if (this.sessionManager) {
            const activeSession = this.sessionManager.getActiveSession();
            if (activeSession) {
                this.sessionManager.clearSessionTerminal(activeSession.id);
            } else {
                this.uiManager.clearTerminal();
            }
        } else {
            this.uiManager.clearTerminal();
        }
    }

    /**
     * Enable controls after successful connection
     */
    enableControls() {
        this.uiManager.setElementsVisibility({
            loginBtn: false
        });
    }

    /**
     * Disable controls on disconnection
     */
    disableControls() {
        // No controls to disable since we removed start/stop buttons
    }

    /**
     * Cleanup and disconnect
     */
    async cleanup() {
        try {
            if (this.mqttManager) {
                await this.mqttManager.disconnect();
            }
            
            if (this.authManager) {
                this.authManager.signOut();
            }
            
            console.log('✅ Application cleanup completed');
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    /**
     * Get application status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isAuthenticated: this.authManager.isAuthenticated,
            isMqttConnected: this.mqttManager.isConnected,
            hasSessionManager: !!this.sessionManager,
            activeSessions: this.sessionManager ? this.sessionManager.getSessions().size : 0
        };
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Q CLI Application...');
    window.qCliApp = new App();
    
    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (window.qCliApp) {
            window.qCliApp.cleanup();
        }
    });
});

// Export for debugging
window.App = App;
