/**
 * File Browser for Q CLI WebUI
 */
export default class FileBrowser {
    constructor(sessionManager) {
        this.sessionManager = sessionManager;
        this.currentPath = '/';
        this.files = [];
        this.setupUI();
        this.setupEventListeners();
    }

    setupUI() {
        // Create file browser modal
        const modal = document.createElement('div');
        modal.id = 'fileBrowserModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>File Browser</h3>
                    <button id="closeBrowser" class="btn secondary">×</button>
                </div>
                <div class="file-browser-toolbar">
                    <span id="currentPath">/</span>
                    <button id="refreshFiles" class="btn secondary">Refresh</button>
                </div>
                <div id="fileList" class="file-list"></div>
                <div class="modal-footer">
                    <button id="selectFile" class="btn primary" disabled>Select File</button>
                    <button id="cancelBrowser" class="btn secondary">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        this.modal = modal;
        this.fileList = modal.querySelector('#fileList');
        this.currentPathEl = modal.querySelector('#currentPath');
        this.selectBtn = modal.querySelector('#selectFile');
    }

    setupEventListeners() {
        // Close modal
        this.modal.querySelector('#closeBrowser').addEventListener('click', () => this.hide());
        this.modal.querySelector('#cancelBrowser').addEventListener('click', () => this.hide());
        
        // Refresh files
        this.modal.querySelector('#refreshFiles').addEventListener('click', () => this.browse(this.currentPath));
        
        // Select file
        this.selectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.selectCurrentFile();
        });
        
        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });
    }

    show(sessionId, callback) {
        this.sessionId = sessionId;
        this.callback = callback;
        this.modal.style.display = 'flex';
        this.browse(''); // Empty path = use session working directory
    }

    hide() {
        this.modal.style.display = 'none';
        this.selectedFile = null;
        this.selectBtn.disabled = true;
    }

    browse(path) {
        this.currentPath = path || '';
        this.currentPathEl.textContent = path || '(session directory)';
        
        // Send browse request via MQTT
        const message = {
            type: 'browse',
            path: path, // Empty path will use session working directory
            timestamp: new Date().toISOString()
        };
        
        this.sessionManager.sendControlMessage(this.sessionId, message);
        
        // Show loading
        this.fileList.innerHTML = '<div class="loading">Loading...</div>';
    }

    updateFileList(files, currentPath, workingDir) {
        this.files = files;
        this.currentPath = currentPath;
        this.workingDir = workingDir;
        
        // Update path display
        this.currentPathEl.textContent = currentPath || workingDir || '(session directory)';
        
        this.fileList.innerHTML = '';
        
        // Add parent directory if not at working directory root
        if (currentPath && currentPath !== workingDir) {
            const parentItem = this.createFileItem('..', 'directory', true);
            this.fileList.appendChild(parentItem);
        }
        
        // Add files and directories
        files.forEach(file => {
            const item = this.createFileItem(file.name, file.type, false, file);
            this.fileList.appendChild(item);
        });
    }

    createFileItem(name, type, isParent, fileData = null) {
        const item = document.createElement('div');
        item.className = `file-item ${type}`;
        item.innerHTML = `
            <span class="file-icon">${type === 'directory' ? '📁' : '📄'}</span>
            <span class="file-name">${name}</span>
            <span class="file-type">${type}</span>
        `;
        
        item.addEventListener('click', () => {
            console.log('🔍 File item clicked:', name, type, fileData);
            // Clear previous selection
            this.fileList.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            
            if (isParent) {
                // Navigate to parent directory
                const parentPath = this.currentPath.split('/').slice(0, -1).join('/') || '/';
                this.browse(parentPath);
            } else if (type === 'directory') {
                // Navigate to subdirectory using fileData.path
                this.browse(fileData.path);
            } else {
                console.log('🔍 Selecting file:', fileData);
                // Select file
                this.selectedFile = fileData;
                this.selectBtn.disabled = false;
                console.log('🔍 Select button enabled, selectedFile:', this.selectedFile);
            }
        });
        
        return item;
    }

    selectCurrentFile() {
        if (this.selectedFile && this.callback) {
            this.callback(this.selectedFile);
            this.hide();
        }
    }
}
