const fs = require('fs').promises;
const path = require('path');

class FilesystemHandler {
    constructor(server) {
        this.server = server;
    }

    /**
     * Get session working directory
     */
    getSessionWorkingDir(sessionId, clientId) {
        const sessionKey = `${clientId}:${sessionId}`;
        const session = this.server.sessions.get(sessionKey);
        return session ? session.workingDir : process.cwd();
    }

    /**
     * Check if path is allowed (within session working directory)
     */
    isPathAllowed(requestedPath, sessionWorkingDir) {
        const resolvedPath = path.resolve(requestedPath);
        const resolvedWorkingDir = path.resolve(sessionWorkingDir);
        return resolvedPath.startsWith(resolvedWorkingDir);
    }

    /**
     * Browse directory
     */
    async browse(requestedPath, sessionId, clientId) {
        try {
            const sessionWorkingDir = this.getSessionWorkingDir(sessionId, clientId);
            console.log(`🔍 Browsing path: ${requestedPath}, session working dir: ${sessionWorkingDir}`);
            
            // Use session working directory as default if no path specified
            const targetPath = requestedPath || sessionWorkingDir;
            
            // Security check
            if (!this.isPathAllowed(targetPath, sessionWorkingDir)) {
                throw new Error('Access denied: Path outside session working directory');
            }

            const resolvedPath = path.resolve(targetPath);
            console.log(`🔍 Resolved path: ${resolvedPath}`);
            
            const stats = await fs.stat(resolvedPath);

            if (!stats.isDirectory()) {
                throw new Error('Path is not a directory');
            }

            const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
            const files = [];

            for (const entry of entries) {
                // Skip hidden files starting with .
                if (entry.name.startsWith('.')) continue;

                const fullPath = path.join(resolvedPath, entry.name);
                
                try {
                    const entryStats = await fs.stat(fullPath);
                    files.push({
                        name: entry.name,
                        path: fullPath,
                        type: entry.isDirectory() ? 'directory' : 'file',
                        size: entryStats.size || 0,
                        modified: entryStats.mtime.toISOString()
                    });
                } catch (statError) {
                    console.warn(`⚠️ Could not stat ${fullPath}:`, statError.message);
                    // Skip files we can't stat
                    continue;
                }
            }

            // Sort: directories first, then files, both alphabetically
            files.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            console.log(`✅ Found ${files.length} files/directories`);
            
            return {
                type: 'browse',
                path: resolvedPath,
                workingDir: sessionWorkingDir,
                files: files
            };

        } catch (error) {
            console.error(`❌ Browse error:`, error);
            return {
                type: 'error',
                message: error.message
            };
        }
    }

    /**
     * Read file content
     */
    async readFile(filePath, sessionId, clientId) {
        try {
            const sessionWorkingDir = this.getSessionWorkingDir(sessionId, clientId);
            
            // Security check
            if (!this.isPathAllowed(filePath, sessionWorkingDir)) {
                throw new Error('Access denied: Path outside session working directory');
            }

            const resolvedPath = path.resolve(filePath);
            const stats = await fs.stat(resolvedPath);

            if (!stats.isFile()) {
                throw new Error('Path is not a file');
            }

            // Limit file size (10MB max)
            if (stats.size > 10 * 1024 * 1024) {
                throw new Error('File too large (max 10MB)');
            }

            const content = await fs.readFile(resolvedPath, 'utf8');

            return {
                type: 'file',
                path: resolvedPath,
                content: content,
                size: stats.size,
                modified: stats.mtime.toISOString()
            };

        } catch (error) {
            return {
                type: 'error',
                message: error.message
            };
        }
    }

    /**
     * Handle filesystem control message
     */
    async handleControlMessage(message, sessionId, clientId) {
        switch (message.type) {
            case 'browse':
                return await this.browse(message.path, sessionId, clientId);
            
            case 'read':
                return await this.readFile(message.path, sessionId, clientId);
            
            case 'read':
                return await this.readFile(message.path, sessionId, clientId);
            default:
                return {
                    type: 'error',
                    message: `Unknown filesystem command: ${message.type}`
                };
        }
    }

    /**
     * Read file content
     */
    async readFile(requestedPath, sessionId, clientId) {
        const sessionWorkingDir = this.getSessionWorkingDir(sessionId, clientId);
        console.log(`🔍 Reading file: ${requestedPath}, session working dir: ${sessionWorkingDir}`);
        
        // Resolve the path
        const resolvedPath = requestedPath ? path.resolve(sessionWorkingDir, requestedPath) : sessionWorkingDir;
        console.log(`🔍 Resolved path: ${resolvedPath}`);
        
        // Security check
        if (!this.isPathAllowed(resolvedPath, sessionWorkingDir)) {
            throw new Error('Access denied: Path outside working directory');
        }
        
        // Check if file exists and is readable
        const stats = await fs.stat(resolvedPath);
        if (!stats.isFile()) {
            throw new Error('Path is not a file');
        }
        
        // Check file size (limit to 1MB for text files)
        if (stats.size > 1024 * 1024) {
            throw new Error('File too large (max 1MB)');
        }
        
        // Read file content
        const content = await fs.readFile(resolvedPath, 'utf8');
        
        console.log(`✅ Read file successfully, size: ${content.length} characters`);
        
        return {
            type: 'file',
            path: resolvedPath,
            content: content,
            size: stats.size,
            modified: stats.mtime.toISOString()
        };
    }
}

module.exports = FilesystemHandler;
