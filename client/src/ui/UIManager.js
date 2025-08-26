/**
 * Handles all UI interactions and DOM manipulation
 */
class UIManager {
    constructor() {
        this.elements = {};
        this.eventHandlers = new Map();
        this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Status elements
        this.elements.status = document.getElementById('status');
        
        // Control buttons
        this.elements.loginBtn = document.getElementById('loginBtn');
        this.elements.startBtn = document.getElementById('startBtn');
        this.elements.stopBtn = document.getElementById('stopBtn');
        this.elements.clearBtn = document.getElementById('clearBtn');
        
        // Terminal and input
        this.elements.terminal = document.getElementById('terminal');
        this.elements.inputSection = document.getElementById('inputSection');
        this.elements.userInput = document.getElementById('userInput');
        this.elements.sendBtn = document.getElementById('sendBtn');
        this.elements.clearInputBtn = document.getElementById('clearInputBtn');
        this.elements.promptIndicator = document.getElementById('promptIndicator');
        
        // Login modal
        this.elements.loginModal = document.getElementById('loginModal');
        this.elements.loginForm = document.getElementById('loginForm');
        this.elements.usernameInput = document.getElementById('username');
        this.elements.passwordInput = document.getElementById('password');
        this.elements.cancelLoginBtn = document.getElementById('cancelLogin');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Control buttons
        this.elements.loginBtn?.addEventListener('click', () => this.emit('showLogin'));
        this.elements.startBtn?.addEventListener('click', () => this.emit('startSession'));
        this.elements.stopBtn?.addEventListener('click', () => this.emit('stopSession'));
        this.elements.clearBtn?.addEventListener('click', () => this.emit('clearTerminal'));
        
        // Input controls
        this.elements.sendBtn?.addEventListener('click', () => this.emit('sendInput'));
        this.elements.clearInputBtn?.addEventListener('click', () => this.emit('clearInput'));
        
        // Login form
        this.elements.loginForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = this.elements.usernameInput.value.trim();
            const password = this.elements.passwordInput.value;
            this.emit('login', { username, password });
        });
        
        this.elements.cancelLoginBtn?.addEventListener('click', () => this.emit('cancelLogin'));
        
        // Keyboard shortcuts
        this.elements.userInput?.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.emit('sendInput');
            }
        });
        
        // Close modal when clicking outside (only if authenticated)
        this.elements.loginModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.loginModal) {
                this.emit('cancelLogin');
            }
        });
    }

    /**
     * Update status display
     * @param {string} message - Status message
     * @param {string} type - Status type (connected, connecting, error, etc.)
     */
    updateStatus(message, type = 'info') {
        if (this.elements.status) {
            this.elements.status.textContent = message;
            this.elements.status.className = `status ${type}`;
        }
    }

    /**
     * Show login modal
     */
    showLoginModal() {
        if (this.elements.loginModal) {
            this.elements.loginModal.style.display = 'flex';
            this.elements.usernameInput?.focus();
        }
    }

    /**
     * Hide login modal
     */
    hideLoginModal() {
        if (this.elements.loginModal) {
            this.elements.loginModal.style.display = 'none';
            this.clearLoginForm();
        }
    }

    /**
     * Clear login form
     */
    clearLoginForm() {
        if (this.elements.usernameInput) this.elements.usernameInput.value = '';
        if (this.elements.passwordInput) this.elements.passwordInput.value = '';
    }

    /**
     * Add message to terminal
     * @param {string} content - Message content
     * @param {string} type - Message type (system, user, bot, error)
     */
    addToTerminal(content, type = 'system') {
        if (!this.elements.terminal) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `terminal-message ${type}`;
        
        // Handle different content types
        if (typeof content === 'string') {
            messageDiv.textContent = content;
        } else if (content instanceof HTMLElement) {
            messageDiv.appendChild(content);
        } else {
            messageDiv.textContent = String(content);
        }
        
        this.elements.terminal.appendChild(messageDiv);
        this.elements.terminal.scrollTop = this.elements.terminal.scrollHeight;
    }

    /**
     * Clear terminal
     */
    clearTerminal() {
        if (this.elements.terminal) {
            this.elements.terminal.innerHTML = '';
        }
    }

    /**
     * Get user input value
     */
    getUserInput() {
        return this.elements.userInput?.value.trim() || '';
    }

    /**
     * Clear user input
     */
    clearUserInput() {
        if (this.elements.userInput) {
            this.elements.userInput.value = '';
        }
    }

    /**
     * Set user input value
     * @param {string} value - Input value
     */
    setUserInput(value) {
        if (this.elements.userInput) {
            this.elements.userInput.value = value;
        }
    }

    /**
     * Enable/disable controls
     * @param {Object} controls - Object with control states
     */
    setControlsState(controls) {
        Object.entries(controls).forEach(([control, enabled]) => {
            const element = this.elements[control];
            if (element && typeof element.disabled !== 'undefined') {
                element.disabled = !enabled;
            }
        });
    }

    /**
     * Show/hide elements
     * @param {Object} visibility - Object with element visibility states
     */
    setElementsVisibility(visibility) {
        Object.entries(visibility).forEach(([element, visible]) => {
            const el = this.elements[element];
            if (el) {
                el.style.display = visible ? 'block' : 'none';
            }
        });
    }

    /**
     * Update prompt indicator
     * @param {string} prompt - Prompt text
     */
    updatePromptIndicator(prompt) {
        if (this.elements.promptIndicator) {
            this.elements.promptIndicator.textContent = prompt;
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        this.addToTerminal(`❌ ${message}`, 'error');
        this.updateStatus(`Error: ${message}`, 'error');
    }

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        this.addToTerminal(`✅ ${message}`, 'system');
    }

    /**
     * Show info message
     * @param {string} message - Info message
     */
    showInfo(message) {
        this.addToTerminal(`ℹ️ ${message}`, 'system');
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in UI event handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get element by name
     * @param {string} name - Element name
     */
    getElement(name) {
        return this.elements[name];
    }

    /**
     * Create and return a new DOM element
     * @param {string} tag - HTML tag
     * @param {Object} attributes - Element attributes
     * @param {string} content - Element content
     */
    createElement(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        
        if (content) {
            element.textContent = content;
        }
        
        return element;
    }
}

export default UIManager;
