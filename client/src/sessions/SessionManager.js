/**
 * Manages multiple Q CLI sessions with tab-based UI
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
        this.setupTabInterface();
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
     * Setup tab interface
     */
    setupTabInterface() {
        const sessionTabs = document.getElementById('sessionTabs');
        const newSessionBtn = document.getElementById('newSessionBtn');
        
        // Always show session tabs bar
        if (sessionTabs) {
            sessionTabs.style.display = 'flex';
        }
        
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => {
                this.showNewSessionDialog();
            });
        }
        
        // Setup keyboard navigation
        this.setupKeyboardNavigation();
        
        // Setup mobile navigation
        this.setupMobileNavigation();
        
        // Hide default terminal and input when tabs are active
        this.uiManager.setElementsVisibility({
            terminal: false,
            inputSection: false
        });
    }

    /**
     * Setup keyboard navigation for session switching
     */
    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            // Only handle if not typing in input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // Ctrl/Cmd + Left/Right arrows to switch sessions
            if ((e.ctrlKey || e.metaKey) && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
                e.preventDefault();
                e.stopPropagation();
                this.switchToAdjacentSession(e.code === 'ArrowLeft' ? -1 : 1);
                return false;
            }
        }, true); // Use capture phase for better compatibility
    }

    /**
     * Setup mobile navigation controls
     */
    setupMobileNavigation() {
        const sessionTabs = document.getElementById('sessionTabs');
        if (!sessionTabs) return;

        // Add mobile navigation arrows
        const mobileNav = document.createElement('div');
        mobileNav.className = 'mobile-nav';
        mobileNav.innerHTML = `
            <button class="nav-btn prev-btn" id="prevSessionBtn">‹</button>
            <button class="nav-btn next-btn" id="nextSessionBtn">›</button>
        `;
        
        const tabControls = sessionTabs.querySelector('.tab-controls');
        if (tabControls) {
            tabControls.appendChild(mobileNav);
        }

        // Add event listeners
        document.getElementById('prevSessionBtn')?.addEventListener('click', () => {
            this.switchToAdjacentSession(-1);
        });
        
        document.getElementById('nextSessionBtn')?.addEventListener('click', () => {
            this.switchToAdjacentSession(1);
        });

        // Add swipe support
        this.setupSwipeNavigation();
    }

    /**
     * Setup swipe navigation for mobile
     */
    setupSwipeNavigation() {
        let startX = 0;
        let startY = 0;
        
        document.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        });
        
        document.addEventListener('touchend', (e) => {
            if (!startX || !startY) return;
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            
            const diffX = startX - endX;
            const diffY = startY - endY;
            
            // Only handle horizontal swipes (more horizontal than vertical)
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    // Swipe left - next session
                    this.switchToAdjacentSession(1);
                } else {
                    // Swipe right - previous session
                    this.switchToAdjacentSession(-1);
                }
            }
            
            startX = 0;
            startY = 0;
        });
    }

    /**
     * Switch to adjacent session
     * @param {number} direction - -1 for previous, 1 for next
     */
    switchToAdjacentSession(direction) {
        const sessionIds = Array.from(this.sessions.keys());
        if (sessionIds.length <= 1) return;
        
        const currentIndex = sessionIds.indexOf(this.activeSessionId);
        if (currentIndex === -1) return;
        
        let newIndex = currentIndex + direction;
        
        // Wrap around
        if (newIndex < 0) {
            newIndex = sessionIds.length - 1;
        } else if (newIndex >= sessionIds.length) {
            newIndex = 0;
        }
        
        this.switchToSession(sessionIds[newIndex]);
    }

    /**
     * Show new session dialog with folder selection
     */
    showNewSessionDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-content">
                <h3>New Q Chat Session</h3>
                <div class="form-group">
                    <label for="sessionName">Session Name:</label>
                    <input type="text" id="sessionName" placeholder="Q Chat ${this.sessionCounter + 1}">
                </div>
                <div class="form-group">
                    <label for="workingDir">Working Directory:</label>
                    <input type="text" id="workingDir" placeholder="/absolute/path or ./relative/path">
                </div>
                <div class="form-actions">
                    <button class="btn primary" id="createSession">Create Session</button>
                    <button class="btn secondary" id="cancelSession">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        const createBtn = dialog.querySelector('#createSession');
        const cancelBtn = dialog.querySelector('#cancelSession');
        const nameInput = dialog.querySelector('#sessionName');
        const dirInput = dialog.querySelector('#workingDir');
        
        createBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim() || `Q Chat ${this.sessionCounter + 1}`;
            const workingDir = dirInput.value.trim();
            
            dialog.remove();
            await this.createAndStartSession(name, workingDir);
        });
        
        cancelBtn.addEventListener('click', () => {
            dialog.remove();
        });
        
        nameInput.focus();
    }

    /**
     * Create and start a new session
     */
    async createAndStartSession(name = null, workingDir = null) {
        const session = this.createSession(name, workingDir);
        this.switchToSession(session.id);
        await this.startSession(session.id);
    }

    /**
     * Subscribe to server responses using session-specific topic pattern
     */
    async subscribeToServerResponses() {
        try {
            // Subscribe to all session outputs and status for this client
            const outputTopic = `${this.projectName}/client/${this.clientId}/+/output`;
            const statusTopic = `${this.projectName}/client/${this.clientId}/+/status`;
            
            console.log('📡 Subscribing to session topics:');
            console.log(`   - ${outputTopic}`);
            console.log(`   - ${statusTopic}`);
            
            const topics = [
                { topicFilter: outputTopic, qos: 1 },
                { topicFilter: statusTopic, qos: 1 }
            ];

            await this.mqttManager.subscribe(topics);
            console.log('✅ Subscribed to session response topics');
            this.uiManager.addToTerminal(`📡 Subscribed to session topics`, 'system');
        } catch (error) {
            console.error('❌ Failed to subscribe to session topics:', error);
            this.uiManager.showError(`Failed to subscribe to topics: ${error.message}`);
        }
    }

    /**
     * Create a new Q CLI session
     * @param {string} name - Optional session name
     * @param {string} workingDir - Optional working directory
     * @returns {Object} Session object
     */
    createSession(name = null, workingDir = null) {
        const sessionId = `session-${++this.sessionCounter}`;
        const sessionName = name || `Q Chat ${this.sessionCounter}`;
        
        const session = {
            id: sessionId,
            name: sessionName,
            workingDir: workingDir || '',
            isActive: false,
            isRunning: false,
            tab: this.createSessionTab(sessionId, sessionName),
            terminal: this.createSessionTerminal(sessionId),
            inputSection: this.createSessionInput(sessionId)
        };

        this.sessions.set(sessionId, session);
        
        console.log(`✅ Created session: ${sessionName} (${sessionId})`);
        console.log(`📊 Total client sessions: ${this.sessions.size}`);
        console.log(`📊 All sessions:`, Array.from(this.sessions.keys()));
        return session;
    }

    /**
     * Create tab for session
     * @param {string} sessionId - Session ID
     * @param {string} sessionName - Session name
     * @returns {HTMLElement} Tab element
     */
    createSessionTab(sessionId, sessionName) {
        const tabList = document.getElementById('tabList');
        
        const tab = document.createElement('button');
        tab.className = 'session-tab';
        tab.id = `tab-${sessionId}`;
        tab.innerHTML = `
            <span>${sessionName}</span>
            <button class="close-btn" onclick="event.stopPropagation()">×</button>
        `;
        
        tab.addEventListener('click', () => this.switchToSession(sessionId));
        
        const closeBtn = tab.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => this.closeSession(sessionId));
        
        tabList.appendChild(tab);
        return tab;
    }

    /**
     * Create terminal element for session
     * @param {string} sessionId - Session ID
     * @returns {HTMLElement} Terminal element
     */
    createSessionTerminal(sessionId) {
        const sessionContent = document.getElementById('sessionContent');
        
        const terminal = document.createElement('div');
        terminal.id = `terminal-${sessionId}`;
        terminal.className = 'terminal session-terminal';
        
        sessionContent.appendChild(terminal);
        return terminal;
    }

    /**
     * Create input section for session
     * @param {string} sessionId - Session ID
     * @returns {HTMLElement} Input section element
     */
    createSessionInput(sessionId) {
        const sessionContent = document.getElementById('sessionContent');
        
        const inputSection = document.createElement('div');
        inputSection.id = `inputSection-${sessionId}`;
        inputSection.className = 'input-section session-input';
        
        inputSection.innerHTML = `
            <div class="prompt-indicator" id="promptIndicator-${sessionId}"></div>
            <textarea class="user-input" id="userInput-${sessionId}" placeholder="Type your response here..." rows="3"></textarea>
            <div class="input-controls">
                <button class="btn primary" id="sendBtn-${sessionId}">Send</button>
                <button class="btn secondary" id="clearInputBtn-${sessionId}">Clear Input</button>
            </div>
        `;

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

        sessionContent.appendChild(inputSection);
        return inputSection;
    }

    /**
     * Switch to a session
     * @param {string} sessionId - Session ID
     */
    switchToSession(sessionId) {
        // Hide all sessions and deactivate tabs
        this.sessions.forEach((session, id) => {
            session.terminal.classList.remove('active');
            session.inputSection.classList.remove('active');
            session.tab.classList.remove('active');
            session.isActive = false;
        });

        // Show active session
        const session = this.sessions.get(sessionId);
        if (session) {
            session.terminal.classList.add('active');
            session.tab.classList.add('active');
            session.isActive = true;
            this.activeSessionId = sessionId;
            
            // Show input section only if session is running
            if (session.isRunning) {
                session.inputSection.classList.add('active');
            }
            
            // Update visible tabs
            this.updateVisibleTabs();
            
            console.log(`Switched to session: ${session.name} (${sessionId})`);
        }
    }

    /**
     * Update which tabs are visible (current, previous, next)
     */
    updateVisibleTabs() {
        const sessionIds = Array.from(this.sessions.keys());
        const currentIndex = sessionIds.indexOf(this.activeSessionId);
        
        if (currentIndex === -1 || sessionIds.length <= 3) {
            // Show all tabs if 3 or fewer sessions
            this.sessions.forEach(session => {
                session.tab.style.display = 'flex';
            });
            return;
        }
        
        // Hide all tabs first
        this.sessions.forEach(session => {
            session.tab.style.display = 'none';
        });
        
        // Show current, previous, and next
        const indicesToShow = [];
        
        // Previous session (wrap around)
        const prevIndex = currentIndex === 0 ? sessionIds.length - 1 : currentIndex - 1;
        indicesToShow.push(prevIndex);
        
        // Current session
        indicesToShow.push(currentIndex);
        
        // Next session (wrap around)
        const nextIndex = currentIndex === sessionIds.length - 1 ? 0 : currentIndex + 1;
        indicesToShow.push(nextIndex);
        
        // Show the selected tabs
        indicesToShow.forEach(index => {
            const sessionId = sessionIds[index];
            const session = this.sessions.get(sessionId);
            if (session) {
                session.tab.style.display = 'flex';
            }
        });
    }

    /**
     * Start Q Chat for a session - using new session-specific topic pattern
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
            // Use control topic: projectName/server/clientId/control
            const topic = `${this.projectName}/server/${this.clientId}/control`;
            const message = { 
                action: 'start-session',
                sessionId: sessionId,
                workingDir: session.workingDir
            };

            await this.mqttManager.publish(topic, message);
            const dirMsg = session.workingDir ? ` in ${session.workingDir}` : '';
            this.addToSessionTerminal(sessionId, `🚀 Starting Q Chat session${dirMsg}...`, 'system');
        } catch (error) {
            console.error(`Failed to start session ${sessionId}:`, error);
            this.addToSessionTerminal(sessionId, `❌ Failed to start session: ${error.message}`, 'error');
        }
    }

    /**
     * Stop Q Chat for a session - using new session-specific topic pattern
     * @param {string} sessionId - Session ID
     */
    async stopSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`Session ${sessionId} not found`);
            return;
        }

        try {
            // Use control topic: projectName/server/clientId/control
            const topic = `${this.projectName}/server/${this.clientId}/control`;
            const message = { 
                action: 'stop-session',
                sessionId: sessionId
            };

            await this.mqttManager.publish(topic, message);
            this.addToSessionTerminal(sessionId, '🛑 Stopping Q Chat session...', 'system');
        } catch (error) {
            console.error(`Failed to stop session ${sessionId}:`, error);
            this.addToSessionTerminal(sessionId, `❌ Failed to stop session: ${error.message}`, 'error');
        }
    }

    /**
     * Send input to a session - using new session-specific topic pattern
     * @param {string} sessionId - Session ID
     */
    async sendSessionInput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const userInput = document.getElementById(`userInput-${sessionId}`);
        const input = userInput.value.trim();
        
        if (!input) return;

        try {
            // Use session-specific input topic: projectName/server/clientId/sessionId/input
            const topic = `${this.projectName}/server/${this.clientId}/${sessionId}/input`;
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
        session.tab.remove();

        // Remove from sessions map
        this.sessions.delete(sessionId);

        // Switch to another session if this was active
        if (this.activeSessionId === sessionId) {
            const remainingSessions = Array.from(this.sessions.keys());
            if (remainingSessions.length > 0) {
                this.switchToSession(remainingSessions[0]);
            } else {
                // Show original terminal if no sessions left, but keep tabs bar visible
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
     * Handle MQTT message - adapted for session-specific topic pattern
     * @param {string} topic - MQTT topic
     * @param {string} payload - Message payload
     */
    handleMessage(topic, payload) {
        console.log(`📨 SessionManager received message on topic: ${topic}`);
        console.log(`📄 Message payload: ${payload}`);
        console.log(`📊 Current client sessions: ${this.sessions.size}`);
        console.log(`📊 All client sessions:`, Array.from(this.sessions.keys()));
        
        // New topic patterns:
        // projectName/client/clientId/sessionId/output
        // projectName/client/clientId/sessionId/status
        
        const topicParts = topic.split('/');
        if (topicParts.length < 5) {
            console.warn(`Invalid session topic format: ${topic}`);
            return;
        }

        const sessionId = topicParts[3];
        const messageType = topicParts[4]; // output/status
        
        console.log(`📋 Message for session ${sessionId}, type: ${messageType}`);
        console.log(`📋 Session exists: ${this.sessions.has(sessionId)}`);
        
        try {
            const data = JSON.parse(payload);
            console.log(`📋 Parsed message data for session ${sessionId}:`, data);
            
            if (messageType === 'output') {
                this.handleSessionOutput(sessionId, data);
            } else if (messageType === 'status') {
                this.handleSessionStatus(sessionId, data);
            }
        } catch (error) {
            console.error(`Error parsing message:`, error);
            console.error(`Raw payload:`, payload);
        }
    }

    /**
     * Handle session output
     * @param {string} sessionId - Session ID
     * @param {Object} data - Output data
     */
    handleSessionOutput(sessionId, data) {
        console.log(`🖥️ Handling output for session: ${sessionId}`, data);
        
        const content = data.content || data.data || JSON.stringify(data);
        this.addToSessionTerminal(sessionId, content, 'bot');
    }

    /**
     * Handle session status
     * @param {string} sessionId - Session ID
     * @param {Object} data - Status data
     */
    handleSessionStatus(sessionId, data) {
        console.log(`📊 Handling status for session: ${sessionId}`, data);
        
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`Session ${sessionId} not found for status update`);
            return;
        }

        if (data.type === 'started') {
            session.isRunning = true;
            const dirMsg = data.workingDir ? ` in ${data.workingDir}` : '';
            this.addToSessionTerminal(sessionId, `✅ Q Chat session started${dirMsg}`, 'system');
            if (session.isActive) {
                session.inputSection.classList.add('active');
            }
        } else if (data.type === 'stopped' || data.type === 'exit') {
            session.isRunning = false;
            this.addToSessionTerminal(sessionId, '🛑 Q Chat session stopped', 'system');
            if (session.isActive) {
                session.inputSection.classList.remove('active');
            }
        } else if (data.type === 'error') {
            this.addToSessionTerminal(sessionId, `❌ Error: ${data.message}`, 'error');
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
        if (!session) {
            console.warn(`Session ${sessionId} not found for terminal message`);
            return;
        }

        console.log(`Adding message to session ${sessionId} terminal:`, content);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `terminal-message ${type}`;
        messageDiv.textContent = content;
        
        session.terminal.appendChild(messageDiv);
        session.terminal.scrollTop = session.terminal.scrollHeight;
        
        console.log(`Terminal now has ${session.terminal.children.length} messages`);
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
