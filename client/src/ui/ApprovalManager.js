/**
 * Manages Q CLI approval prompts with UI and keyboard shortcuts
 */
export default class ApprovalManager {
    constructor() {
        this.elements = {
            approvalSection: document.getElementById('approvalSection'),
            approvalMessage: document.getElementById('approvalMessage'),
            yesBtn: document.getElementById('approvalYes'),
            noBtn: document.getElementById('approvalNo'),
            trustBtn: document.getElementById('approvalTrust')
        };
        
        this.currentApproval = null;
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for buttons and keyboard shortcuts
     */
    setupEventListeners() {
        // Button clicks
        this.elements.yesBtn?.addEventListener('click', () => this.handleApproval('y'));
        this.elements.noBtn?.addEventListener('click', () => this.handleApproval('n'));
        this.elements.trustBtn?.addEventListener('click', () => this.handleApproval('t'));
        
        // Keyboard shortcuts (only when approval is active)
        document.addEventListener('keydown', (e) => {
            if (!this.currentApproval) return;
            
            const key = e.key.toLowerCase();
            if (key === 'y' || key === 'n' || key === 't') {
                e.preventDefault();
                this.handleApproval(key);
            }
        });
    }

    /**
     * Show approval prompt
     * @param {string} message - The approval message
     * @param {Function} callback - Callback function to handle response
     */
    showApproval(message, callback) {
        this.currentApproval = { message, callback };
        
        // Update UI
        this.elements.approvalMessage.textContent = message;
        this.elements.approvalSection.classList.add('active');
        
        // Focus the approval section for better UX
        this.elements.approvalSection.scrollIntoView({ behavior: 'smooth' });
        
        console.log('🔔 Approval prompt shown:', message);
    }

    /**
     * Hide approval prompt
     */
    hideApproval() {
        this.elements.approvalSection.classList.remove('active');
        this.currentApproval = null;
        console.log('✅ Approval prompt hidden');
    }

    /**
     * Handle approval response
     * @param {string} response - 'y', 'n', or 't'
     */
    handleApproval(response) {
        if (!this.currentApproval) return;
        
        const { callback } = this.currentApproval;
        
        // Hide the approval UI
        this.hideApproval();
        
        // Call the callback with the response
        if (callback) {
            callback(response);
        }
        
        console.log(`✅ Approval response: ${response}`);
    }

    /**
     * Check if message contains approval prompt
     * @param {string} message - Terminal message to check
     * @returns {Object|null} - Approval info or null
     */
    detectApprovalPrompt(message) {
        if (!message || typeof message !== 'string') {
            return null;
        }
        
        // Simple detection for [y/n/t] pattern
        if (message.includes('[y/n/t]')) {
            // Extract the question part (everything before [y/n/t])
            const parts = message.split('[y/n/t]');
            const question = parts[0].trim();
            
            return {
                message: question || message,
                fullMessage: message
            };
        }
        
        return null;
    }

    /**
     * Check if approval is currently active
     * @returns {boolean}
     */
    isActive() {
        return this.currentApproval !== null;
    }
}
