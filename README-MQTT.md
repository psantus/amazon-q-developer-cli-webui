# Amazon Q Developer CLI WebUI (MQTT Version)

A web-based interface for Amazon Q CLI that uses AWS IoT Core MQTT for communication, enabling mobile access without direct server connectivity.

## Architecture

```
[Mobile Client] <--MQTT--> [AWS IoT Core] <--MQTT--> [Server with Q CLI]
```

- **Client**: Web application hosted on S3/CloudFront, authenticates via Cognito
- **Server**: Runs Q CLI and connects to IoT Core with client certificates
- **AWS IoT Core**: MQTT broker for real-time communication
- **Cognito**: Authentication and authorization for mobile clients

## Features

- **Mobile Access**: Client runs in any web browser, no direct server connection needed
- **Secure Authentication**: Cognito-based authentication with IoT policies
- **Real-time Communication**: MQTT for low-latency bidirectional communication
- **Cloud Hosting**: Client hosted on S3 with CloudFront CDN
- **Certificate-based Server Auth**: Server uses IoT client certificates
- **Streaming Display**: Preserves Q CLI's streaming output and formatting

## Prerequisites

- AWS CLI configured with appropriate permissions
- Terraform >= 1.0
- Node.js >= 14
- Amazon Q CLI installed and configured on the server

## Setup Instructions

### 1. Deploy Infrastructure

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init
terraform plan
terraform apply
```

### 2. Export Terraform Outputs

```bash
terraform output -json > terraform-outputs.json
```

### 3. Setup Server

```bash
# Install dependencies
npm install

# Setup server certificates and configuration
node scripts/setup-server.js

# Start the MQTT server
node server-mqtt.js
```

### 4. Build and Deploy Client

```bash
# Build client with configuration
npm run build-client

# Deploy to S3/CloudFront
npm run deploy-client
```

## Configuration

### Terraform Variables

Create `terraform/terraform.tfvars`:

```hcl
aws_region = "us-east-1"
project_name = "q-cli-webui"
cognito_username = "qcli-user"
cognito_user_email = "your-email@example.com"

# Optional: Custom domain
# domain_name = "qcli.yourdomain.com"
# certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
```

### Server Environment

The setup script creates `.env` with:

```env
IOT_ENDPOINT=your-endpoint.iot.us-east-1.amazonaws.com
AWS_REGION=us-east-1
PROJECT_NAME=q-cli-webui
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
COGNITO_IDENTITY_POOL_ID=us-east-1:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
COGNITO_USERNAME=qcli-user
```

## Usage

### Server Side

1. Ensure Q CLI is installed and authenticated
2. Start the MQTT server: `node server-mqtt.js`
3. Server will connect to IoT Core and wait for client connections

### Client Side

1. Open the client URL (from Terraform outputs)
2. Login with Cognito credentials:
   - Username: (from Terraform outputs)
   - Password: (from Terraform outputs, marked as sensitive)
3. Click "Start Q Chat" to begin a session
4. Interact with Q CLI through the web interface

## MQTT Topics

### Server Topics (Server subscribes to these)

- `{project_name}/server/{client_id}/input` - User input to Q CLI
- `{project_name}/server/{client_id}/control` - Control commands (start/stop)

### Client Topics (Client subscribes to these)

- `{project_name}/client/{client_id}/output` - Q CLI output
- `{project_name}/client/{client_id}/status` - Status updates

## Security

### Authentication Flow

1. Client authenticates with Cognito User Pool
2. Receives JWT tokens and exchanges for temporary AWS credentials
3. IoT policy is attached to the Cognito identity
4. Client connects to IoT Core using temporary credentials
5. Server uses client certificates for authentication

### IAM Policies

- **Server**: Can publish to client topics, subscribe to server topics
- **Client**: Can publish to server topics, subscribe to client topics
- **Cognito Role**: Can attach/detach IoT policies

## Troubleshooting

### Server Issues

```bash
# Check server logs
node server-mqtt.js

# Verify certificates
ls -la certs/

# Test IoT connectivity
aws iot describe-endpoint --endpoint-type iot:Data-ATS
```

### Client Issues

1. Check browser console for errors
2. Verify Cognito configuration in the built HTML
3. Test authentication separately
4. Check IoT policy attachment

### Common Problems

**Server can't connect to IoT Core:**
- Verify certificates are in `certs/` directory
- Check IoT endpoint in `.env`
- Ensure IoT policy is attached to certificate

**Client authentication fails:**
- Verify Cognito configuration
- Check user exists and password is correct
- Ensure IoT policy allows the required actions

**MQTT messages not received:**
- Check topic names match exactly
- Verify client ID is consistent
- Check IoT Core logs in CloudWatch

## Development

### Local Development

```bash
# Start server in development mode
npm run dev

# Build client for testing
npm run build-client

# Deploy client changes
npm run deploy-client
```

### Testing MQTT Connectivity

Use AWS IoT Core Test client in the console to:
1. Subscribe to topics
2. Publish test messages
3. Verify message flow

## Architecture Details

### Message Flow

1. **Client Input**: User types → Client publishes to server input topic
2. **Server Processing**: Server receives → Sends to Q CLI → Q CLI responds
3. **Server Output**: Q CLI output → Server publishes to client output topic
4. **Client Display**: Client receives → Processes ANSI → Displays in terminal

### Scaling Considerations

- Multiple clients can connect simultaneously
- Each client gets a unique session identified by Cognito identity ID
- Server maintains separate Q CLI processes per client
- IoT Core handles message routing and scaling

## Cost Optimization

- Use IoT Core's pay-per-message pricing
- CloudFront caches static assets
- Cognito has generous free tier
- Consider IoT Device Management for certificate lifecycle

## Security Best Practices

1. **Rotate Certificates**: Regularly rotate IoT certificates
2. **Least Privilege**: IoT policies grant minimal required permissions
3. **Monitor Access**: Use CloudTrail and IoT logs
4. **Network Security**: Consider VPC endpoints for IoT Core
5. **Client Security**: Implement proper session management

## Monitoring

### CloudWatch Metrics

- IoT Core connection metrics
- Message publish/subscribe rates
- Authentication failures
- Lambda function metrics (if using custom authorizers)

### Logging

- Server logs to stdout/stderr
- IoT Core logs to CloudWatch
- Client errors in browser console
- Cognito authentication logs

## Backup and Recovery

### Critical Components

1. **Terraform State**: Store in S3 with versioning
2. **Certificates**: Backup private keys securely
3. **Configuration**: Version control all config files
4. **User Data**: Cognito user pool data

### Disaster Recovery

1. Terraform can recreate all infrastructure
2. Certificates can be regenerated (will require server restart)
3. Client deployment is stateless and can be redeployed
4. User sessions are ephemeral and will reconnect automatically

## License

MIT License - see LICENSE file for details.
