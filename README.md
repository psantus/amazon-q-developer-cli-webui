# Amazon Q Developer CLI WebUI

A web-based interface for Amazon Q CLI that provides MQTT-based communication between a web client and server.

## Architecture

```
├── client/          # Web client (HTML, CSS, JS)
├── server/          # MQTT server (Node.js)
├── terraform/       # AWS infrastructure
└── README.md        # This file
```

## Quick Start

### 1. Deploy Infrastructure
```bash
cd terraform
terraform init
terraform apply
```

### 2. Start Server
```bash
cd server
npm install
npm start
```

### 3. Access Client
The client is deployed to CloudFront and accessible via the URL provided by Terraform output.

## Development

### Server Development
```bash
cd server
npm install
npm run dev  # Auto-restart on changes
```

### Client Development
```bash
cd client
npm run serve  # Local development server
```

## Components

- **Client**: Web interface with Cognito authentication and MQTT communication
- **Server**: Node.js MQTT server that manages Q CLI sessions
- **Infrastructure**: AWS resources (IoT Core, Cognito, S3, CloudFront)

## Features

- 🔐 AWS Cognito authentication
- 📡 MQTT over WebSocket communication
- 🖥️ Multiple concurrent Q CLI sessions
- 🌐 CloudFront-hosted web client
- 🔧 Infrastructure as Code with Terraform
