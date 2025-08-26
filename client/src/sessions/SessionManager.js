/**
 * Manages multiple Q CLI sessions
 */
class SessionManager {
    constructor(mqttManager, uiManager, clientId) {
        this.mqttManager = mqttManager;
        this.uiManager = uiManager;
        this.clientId = clientId;
        this.sessions = new Map();
        this.activeSessionId = null;
        this.sessionCounter = 0;
        this.projectName = window.AWS_CONFIG.projectName;
        
        this.setupEventHandlers();
        this.subscribeToServerResponses();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Listen for MQTT messages
        this.mqttManager.on('messageReceived', ({ topic, payload }) => {
            this.handleMessage(topic, payload);
        });
    }

    /**
     * Subscribe to server responses using original working topic pattern
     */
    async subscribeToServerResponses() {
        try {
            const outputTopic = `${this.projectName}/client/${this.clientId}/output`;
            const statusTopic = `${this.projectName}/client/${this.clientId}/status`;
            
            console.log('📡 Subscribing to topics:');
            console.log(`   - ${outputTopic}`);
            console.log(`   - ${statusTopic}`);
            
            const topics = [
                { topicFilter: outputTopic, qos: 1 },
                { topicFilter: statusTopic, qos: 1 }
            ];

            await this.mqttManager.subscribe(topics);
            console.log('✅ Subscribed to server response topics');
            this.uiManager.addToTerminal(`📡 Subscribed to: ${outputTopic}`, 'system');
            this.uiManager.addToTerminal(`📡 Subscribed to: ${statusTopic}`, 'system');
        } catch (error) {
            console.error('❌ Failed to subscribe to server topics:', error);
            this.uiManager.showError(`Failed to subscribe to topics: ${error.message}`);
        }
    }

    /**
     * Create a new Q CLI session
     * @param {string} name - Optional session name
     * @returns {Object} Session object
     */
    createSession(name = null) {
        const sessionId = `session-${++this.sessionCounter}`;
        const sessionName = name || `Q Chat ${this.sessionCounter}`;
        
        const session = {
            id: sessionId,
            name: sessionName,
            isActive: false,
            isRunning: false,
            terminal: this.createSessionTerminal(sessionId),
            inputSection: this.createSessionInput(sessionId)
        };

        this.sessions.set(sessionId, session);
        
        console.log(`✅ Created session: ${sessionName} (${sessionId})`);
        return session;
    }

    /**
     * Create terminal element for session
     * @param {string} sessionId - Session ID
     * @returns {HTMLElement} Terminal element
     */
    createSessionTerminal(sessionId) {
        const terminal = this.uiManager.createElement('div', {
            id: `terminal-${sessionId}`,
            className: 'terminal session-terminal',
            style: 'display: none;'
        });
        
        const mainTerminal = this.uiManager.getElement('terminal');
        mainTerminal.parentNode.appendChild(terminal);
        
        return terminal;
    }

    /**
     * Create input section for session
     * @param {string} sessionId - Session ID
     * @returns {HTMLElement} Input section element
     */
    createSessionInput(sessionId) {
        const inputSection = this.uiManager.createElement('div', {
            id: `inputSection-${sessionId}`,
            className: 'input-section session-input',
            style: 'display: none;'
        });
        
        inputSection.innerHTML = `
            <div class="prompt-indicator" id="promptIndicator-${sessionId}"></div>
            <textarea class="user-input" id="userInput-${sessionId}" placeholder="Type your response here..." rows="3"></textarea>
            <div class="input-controls">
                <button class="btn primary" id="sendBtn-${sessionId}">Send</button>
                <button class="btn secondary" id="clearInputBtn-${sessionId}">Clear Input</button>
            </div>
        `;

        const mainInputSection = this.uiManager.getElement('inputSection');
        mainInputSection.parentNode.appendChild(inputSection);

        // Add event listeners
        const sendBtn = inputSection.querySelector(`#sendBtn-${sessionId}`);
        const clearInputBtn = inputSection.querySelector(`#clearInputBtn-${sessionId}`);
        const userInput = inputSection.querySelector(`#userInput-${sessionId}`);

        sendBtn.addEventListener('click', () => this.sendSessionInput(sessionId));
        clearInputBtn.addEventListener('click', () => this.clearSessionInput(sessionId));
        
        userInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.sendSessionInput(sessionId);
            }
        });

        return inputSection;
    }

    /**
     * Switch to a session
     * @param {string} sessionId - Session ID
     */
    switchToSession(sessionId) {
        // Hide all sessions
        this.sessions.forEach((session, id) => {
            session.terminal.style.display = 'none';
            session.inputSection.style.display = 'none';
            session.isActive = false;
        });

        // Hide original terminal and input
        this.uiManager.setElementsVisibility({
            terminal: false,
            inputSection: false
        });

        // Show active session
        const session = this.sessions.get(sessionId);
        if (session) {
            session.terminal.style.display = 'block';
            session.inputSection.style.display = session.isRunning ? 'block' : 'none';
            session.isActive = true;
            this.activeSessionId = sessionId;
            
            console.log(`Switched to session: ${session.name} (${sessionId})`);
        }
    }

    /**
     * Start Q Chat for a session - using original working topic pattern
     * @param {string} sessionId - Session ID
     */
    async startSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`Session ${sessionId} not found`);
            return;
        }

        if (session.isRunning) {
            console.log(`Session ${sessionId} is already running`);
            return;
        }

        try {
            // Use original working topic pattern: projectName/server/clientId/control
            const topic = `${this.projectName}/server/${this.clientId}/control`;
            const message = { action: 'start-q-chat' };

            await this.mqttManager.publish(topic, message);
            this.addToSessionTerminal(sessionId, '🚀 Starting Q Chat session...', 'system');
        } catch (error) {
            console.error(`Failed to start session ${sessionId}:`, error);
            this.addToSessionTerminal(sessionId, `❌ Failed to start session: ${error.message}`, 'error');
        }
    }

    /**
     * Stop Q Chat for a session - using original working topic pattern
     * @param {string} sessionId - Session ID
     */
    async stopSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`Session ${sessionId} not found`);
            return;
        }

        try {
            // Use original working topic pattern: projectName/server/clientId/control
            const topic = `${this.projectName}/server/${this.clientId}/control`;
            const message = { action: 'stop-q-chat' };

            await this.mqttManager.publish(topic, message);
            this.addToSessionTerminal(sessionId, '🛑 Stopping Q Chat session...', 'system');
        } catch (error) {
            console.error(`Failed to stop session ${sessionId}:`, error);
            this.addToSessionTerminal(sessionId, `❌ Failed to stop session: ${error.message}`, 'error');
        }
    }

    /**
     * Send input to a session - using original working topic pattern
     * @param {string} sessionId - Session ID
     */
    async sendSessionInput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const userInput = document.getElementById(`userInput-${sessionId}`);
        const input = userInput.value.trim();
        
        if (!input) return;

        try {
            // Use original working topic pattern: projectName/server/clientId/input
            const topic = `${this.projectName}/server/${this.clientId}/input`;
            const message = { data: input };

            await this.mqttManager.publish(topic, message);
            this.addToSessionTerminal(sessionId, `> ${input}`, 'user');
            
            userInput.value = '';
        } catch (error) {
            console.error(`Failed to send input for session ${sessionId}:`, error);
            this.addToSessionTerminal(sessionId, `❌ Failed to send input: ${error.message}`, 'error');
        }
    }

    /**
     * Clear input for a session
     * @param {string} sessionId - Session ID
     */
    clearSessionInput(sessionId) {
        const userInput = document.getElementById(`userInput-${sessionId}`);
        if (userInput) {
            userInput.value = '';
        }
    }

    /**
     * Switch to a session
     * @param {string} sessionId - Session ID
     */
    switchToSession(sessionId) {
        // Hide all sessions
        this.sessions.forEach((session, id) => {
            session.terminal.style.display = 'none';
            session.inputSection.style.display = 'none';
            session.isActive = false;
        });

        // Hide original terminal and input
        this.uiManager.setElementsVisibility({
            terminal: false,
            inputSection: false
        });

        // Show active session
        const session = this.sessions.get(sessionId);
        if (session) {
            session.terminal.style.display = 'block';
            session.inputSection.style.display = session.isRunning ? 'block' : 'none';
            session.isActive = true;
            this.activeSessionId = sessionId;
            
            console.log(`Switched to session: ${session.name} (${sessionId})`);
        }
    }

    /**
     * Close a session
     * @param {string} sessionId - Session ID
     */
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        // Stop the session first if running
        if (session.isRunning) {
            await this.stopSession(sessionId);
        }

        // Remove UI elements
        session.terminal.remove();
        session.inputSection.remove();

        // Remove from sessions map
        this.sessions.delete(sessionId);

        // Switch to another session if this was active
        if (this.activeSessionId === sessionId) {
            const remainingSessions = Array.from(this.sessions.keys());
            if (remainingSessions.length > 0) {
                this.switchToSession(remainingSessions[0]);
            } else {
                // Show original terminal if no sessions left
                this.uiManager.setElementsVisibility({
                    terminal: true,
                    inputSection: false
                });
                this.activeSessionId = null;
            }
        }

        console.log(`Closed session: ${session.name} (${sessionId})`);
    }

    /**
     * Handle MQTT message - adapted for original topic pattern
     * @param {string} topic - MQTT topic
     * @param {string} payload - Message payload
     */
    handleMessage(topic, payload) {
        console.log(`📨 SessionManager received message on topic: ${topic}`);
        console.log(`📄 Message payload: ${payload}`);
        
        // Original topic patterns:
        // projectName/client/clientId/output
        // projectName/client/clientId/status
        
        const topicParts = topic.split('/');
        if (topicParts.length < 4) {
            console.warn(`Invalid topic format: ${topic}`);
            return;
        }

        const messageType = topicParts[topicParts.length - 1]; // last part (output/status)
        
        try {
            const data = JSON.parse(payload);
            console.log(`📋 Parsed message data:`, data);
            
            // Route to active session if exists, otherwise to main terminal
            const activeSession = this.getActiveSession();
            
            if (messageType === 'output') {
                this.handleSessionOutput(activeSession?.id || null, data);
            } else if (messageType === 'status') {
                this.handleSessionStatus(activeSession?.id || null, data);
            }
        } catch (error) {
            console.error(`Error parsing message:`, error);
            console.error(`Raw payload:`, payload);
        }
    }

    /**
     * Handle session output
     * @param {string|null} sessionId - Session ID (null for main terminal)
     * @param {Object} data - Output data
     */
    handleSessionOutput(sessionId, data) {
        console.log(`🖥️ Handling output for session: ${sessionId || 'main terminal'}`, data);
        
        if (data.type === 'stdout') {
            if (sessionId) {
                this.addToSessionTerminal(sessionId, data.content, 'bot');
            } else {
                // Route to main terminal via UIManager
                this.uiManager.addToTerminal(data.content, 'bot');
            }
        } else if (data.type === 'stderr') {
            if (sessionId) {
                this.addToSessionTerminal(sessionId, data.content, 'error');
            } else {
                // Route to main terminal via UIManager
                this.uiManager.addToTerminal(data.content, 'error');
            }
        } else {
            // Handle other output types
            const content = data.content || data.data || JSON.stringify(data);
            if (sessionId) {
                this.addToSessionTerminal(sessionId, content, 'bot');
            } else {
                this.uiManager.addToTerminal(content, 'bot');
            }
        }
    }

    /**
     * Handle session status
     * @param {string|null} sessionId - Session ID (null for main terminal)
     * @param {Object} data - Status data
     */
    handleSessionStatus(sessionId, data) {
        console.log(`📊 Handling status for session: ${sessionId || 'main terminal'}`, data);
        
        if (sessionId) {
            const session = this.sessions.get(sessionId);
            if (!session) {
                console.warn(`Session ${sessionId} not found for status update`);
                return;
            }

            if (data.type === 'started') {
                session.isRunning = true;
                this.addToSessionTerminal(sessionId, '✅ Q Chat session started', 'system');
                if (session.isActive) {
                    session.inputSection.style.display = 'block';
                }
            } else if (data.type === 'stopped') {
                session.isRunning = false;
                this.addToSessionTerminal(sessionId, '🛑 Q Chat session stopped', 'system');
                if (session.isActive) {
                    session.inputSection.style.display = 'none';
                }
            } else if (data.type === 'error') {
                this.addToSessionTerminal(sessionId, `❌ Error: ${data.message}`, 'error');
            }
        } else {
            // Handle status for main terminal
            if (data.type === 'started') {
                this.uiManager.addToTerminal('✅ Q Chat session started', 'system');
                this.uiManager.setElementsVisibility({ inputSection: true });
                // Enable send button
                this.uiManager.setControlsState({ sendBtn: true });
            } else if (data.type === 'stopped') {
                this.uiManager.addToTerminal('🛑 Q Chat session stopped', 'system');
                this.uiManager.setElementsVisibility({ inputSection: false });
                // Disable send button
                this.uiManager.setControlsState({ sendBtn: false });
            } else if (data.type === 'error') {
                this.uiManager.addToTerminal(`❌ Error: ${data.message}`, 'error');
            } else if (data.type === 'input-request') {
                // Show input section when server requests input
                this.uiManager.setElementsVisibility({ inputSection: true });
                this.uiManager.setControlsState({ sendBtn: true });
                if (data.prompt) {
                    this.uiManager.updatePromptIndicator(data.prompt);
                }
            }
        }
    }

    /**
     * Add message to session terminal
     * @param {string} sessionId - Session ID
     * @param {string} content - Message content
     * @param {string} type - Message type
     */
    addToSessionTerminal(sessionId, content, type = 'system') {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `terminal-message ${type}`;
        messageDiv.textContent = content;
        
        session.terminal.appendChild(messageDiv);
        session.terminal.scrollTop = session.terminal.scrollHeight;
    }

    /**
     * Clear session terminal
     * @param {string} sessionId - Session ID
     */
    clearSessionTerminal(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.terminal.innerHTML = '';
        }
    }

    /**
     * Get all sessions
     * @returns {Map} Sessions map
     */
    getSessions() {
        return this.sessions;
    }

    /**
     * Get active session
     * @returns {Object|null} Active session or null
     */
    getActiveSession() {
        return this.activeSessionId ? this.sessions.get(this.activeSessionId) : null;
    }

    /**
     * Get session by ID
     * @param {string} sessionId - Session ID
     * @returns {Object|null} Session or null
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
}

export default SessionManager;
