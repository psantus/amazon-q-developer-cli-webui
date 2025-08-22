# Q CLI MQTT Server

A simple MQTT server that connects to AWS IoT Core and handles Q CLI sessions for web clients.

## Prerequisites

1. **Amazon Q CLI** installed and accessible via `q chat` command
2. **AWS IoT certificates** in the `certs/` directory:
   - `certificate.pem` - IoT device certificate
   - `private.key` - Private key for the certificate
   - `AmazonRootCA1.pem` - Amazon Root CA certificate
3. **Environment variables** configured in `.env` file

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```bash
IOT_ENDPOINT=your-iot-endpoint.iot.region.amazonaws.com
AWS_REGION=us-east-1
PROJECT_NAME=q-cli-webui
```

3. Ensure certificates are in the `certs/` directory (managed by Terraform)

## Running the Server

```bash
npm run start-mqtt
```

## How it Works

1. **Connects** to AWS IoT Core using device certificates
2. **Subscribes** to client control and input topics:
   - `q-cli-webui/server/+/control` - Start/stop Q chat sessions
   - `q-cli-webui/server/+/input` - User input to Q chat
3. **Publishes** responses to client topics:
   - `q-cli-webui/client/{clientId}/output` - Q chat output
   - `q-cli-webui/client/{clientId}/status` - Session status updates
4. **Manages** Q CLI processes for each connected client

## Client Communication

The server handles messages from web clients and manages individual Q CLI sessions for each client. Each client gets its own isolated Q chat process.

## Graceful Shutdown

The server handles SIGINT and SIGTERM signals gracefully, cleaning up all Q CLI processes before exiting.
