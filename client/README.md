# Q CLI WebUI Client

Web client for Amazon Q CLI with MQTT over WebSocket communication.

## Features

- 🔐 **AWS Cognito Authentication** - Secure login with username/password
- 📡 **MQTT over WebSocket** - Full bidirectional communication with server
- 🖥️ **Real-time Terminal** - Live Q CLI output with ANSI color support
- ⌨️ **Interactive Input** - Send commands to Q CLI sessions
- 🎨 **Modern UI** - Clean, responsive web interface

## Architecture

The client uses:
- **AWS Cognito** for user authentication
- **AWS IoT Device SDK** for MQTT over WebSocket connections
- **Vanilla JavaScript** for simplicity and performance
- **CSS Grid/Flexbox** for responsive layout

## Communication Flow

1. **Authentication**: User logs in via Cognito
2. **MQTT Connection**: Client connects to AWS IoT Core via WebSocket
3. **Subscriptions**: Client subscribes to response topics:
   - `q-cli-webui/client/{clientId}/output` - Q CLI output
   - `q-cli-webui/client/{clientId}/status` - Session status
4. **Publishing**: Client publishes to server topics:
   - `q-cli-webui/server/{clientId}/control` - Start/stop commands
   - `q-cli-webui/server/{clientId}/input` - User input

## Development

### Local Development
```bash
npm run dev
# Opens local server at http://localhost:3000
```

### Production Build
The client is built and deployed automatically by Terraform to S3/CloudFront.

## Files

- `index-mqtt.html` - Main HTML file with AWS SDK imports
- `script-mqtt.js` - MQTT client implementation
- `style.css` - Styling and responsive layout
- `package.json` - Dependencies and scripts

## Configuration

Configuration is injected by Terraform during build:
- AWS region and endpoints
- Cognito User Pool and Identity Pool IDs
- IoT endpoint and policy names
- Project name for topic prefixes
