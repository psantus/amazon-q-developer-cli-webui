# Multi-Session Testing Guide

## Overview
This document outlines how to test the new multi-session functionality for the Amazon Q CLI WebUI.

## Key Changes Made

### Server-side Changes (`server/server-mqtt.js`)
1. **Session Management**: 
   - `sessions` Map now uses `sessionId` as key instead of `clientId`
   - `clientSessions` Map tracks which sessions belong to which client
   - Each session has its own working directory, process, and buffer

2. **Topic Structure**: 
   - Input: `projectName/server/clientId/sessionId/input`
   - Control: `projectName/server/clientId/sessionId/control`
   - Output: `projectName/client/clientId/sessionId/output`
   - Status: `projectName/client/clientId/sessionId/status`

3. **New Control Actions**:
   - `start-q-chat`: Now accepts `workingDir` parameter
   - `stop-q-chat`: Stops specific session by sessionId
   - `list-sessions`: Lists all sessions for a client

4. **Session Lifecycle**:
   - Sessions are created with unique IDs
   - Each session tracks its own Q CLI process
   - Proper cleanup when sessions end

### Client-side Changes (`client/src/`)
1. **Multi-Session UI**:
   - Session tabs for switching between sessions
   - New session modal for creating sessions with custom working directories
   - Individual terminals and input areas per session

2. **Session Management**:
   - Create, switch, and close sessions
   - Track session status (active/inactive/error)
   - Session-specific message handling

3. **Enhanced MQTT Communication**:
   - Updated topic structure to include sessionId
   - Session-specific message routing
   - Proper subscription to wildcard topics

## Testing Steps

### 1. Start the Server
```bash
cd server
npm start
```

### 2. Open the Client
Open the client in a web browser and login with your Cognito credentials.

### 3. Create Multiple Sessions
1. Click "New Session" button
2. Enter session name (e.g., "Project A")
3. Optionally enter working directory
4. Click "Create Session"
5. Repeat to create multiple sessions

### 4. Test Session Switching
1. Create 2-3 sessions
2. Switch between tabs
3. Send messages in different sessions
4. Verify messages appear in correct session terminals

### 5. Test Working Directories
1. Create session with specific working directory
2. Ask Q about files in that directory
3. Verify Q has context of the correct directory

### 6. Test Session Management
1. Click "List Sessions" to see all active sessions
2. Close sessions using the × button on tabs
3. Verify sessions are properly cleaned up on server

## Expected Behavior

### Session Creation
- New tab appears with session name
- Terminal shows "Starting Q Chat session" message
- Input area becomes available when session is ready
- Session status indicator shows green dot

### Session Communication
- Messages sent in one session don't appear in others
- Each session maintains its own conversation history
- Working directory context is preserved per session

### Session Cleanup
- Closing a tab stops the Q CLI process on server
- Server properly cleans up resources
- Other sessions remain unaffected

## Troubleshooting

### Common Issues
1. **Sessions not starting**: Check server logs for Q CLI process errors
2. **Messages in wrong session**: Verify topic structure in browser dev tools
3. **UI not updating**: Check for JavaScript errors in browser console

### Debug Information
- Server logs show detailed session management
- Browser dev tools show MQTT message flow
- Session IDs are logged for tracking

## Architecture Benefits

### Scalability
- Multiple users can have multiple sessions simultaneously
- Each session is isolated with its own process and context
- Server efficiently manages resources per session

### User Experience
- Users can work on multiple projects simultaneously
- Context switching between different working directories
- Session persistence during browser refresh (future enhancement)

### Maintainability
- Clear separation between session management and MQTT communication
- Modular code structure for easy extension
- Comprehensive error handling and logging
