# Deployment Guide

This guide walks you through deploying the Q CLI WebUI with MQTT support.

## Quick Start

```bash
# 1. Clone and setup
git clone <repository>
cd amazon-q-cli-webui

# 2. Configure Terraform
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your email and preferences

# 3. Deploy infrastructure
terraform init
terraform apply
terraform output -json > terraform-outputs.json

# 4. Setup server
cd ..
npm install
node scripts/setup-server.js

# 5. Build and deploy client
npm run build-client
npm run deploy-client

# 6. Start server
node server-mqtt.js
```

## Detailed Steps

### 1. Prerequisites

Ensure you have:
- AWS CLI configured with admin permissions
- Terraform installed
- Node.js 14+ installed
- Amazon Q CLI installed and authenticated on your server

### 2. Infrastructure Deployment

#### Configure Terraform Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
aws_region = "us-east-1"  # Your preferred region
project_name = "q-cli-webui"  # Unique project name
cognito_username = "qcli-user"  # Username for login
cognito_user_email = "your-email@example.com"  # Your email

# Optional: Custom domain (requires ACM certificate)
# domain_name = "qcli.yourdomain.com"
# certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
```

#### Deploy Infrastructure

```bash
terraform init
terraform plan  # Review changes
terraform apply  # Type 'yes' to confirm
```

This creates:
- IoT Core Thing and certificates for server
- Cognito User Pool and Identity Pool
- S3 bucket and CloudFront distribution for client
- IAM roles and policies
- A Cognito user with generated password

#### Export Configuration

```bash
terraform output -json > terraform-outputs.json
```

### 3. Server Setup

#### Install Dependencies

```bash
cd ..  # Back to project root
npm install
```

#### Setup Server Configuration

```bash
node scripts/setup-server.js
```

This script:
- Creates `certs/` directory with IoT certificates
- Downloads Amazon Root CA certificate
- Creates `.env` file with configuration
- Displays login credentials

#### Start Server

```bash
node server-mqtt.js
```

You should see:
```
Connected to AWS IoT Core
Subscribed to topics: q-cli-webui/server/+/input, q-cli-webui/server/+/control
Q CLI MQTT Server started
```

### 4. Client Deployment

#### Build Client

```bash
npm run build-client
```

This creates a `dist/` directory with:
- `index.html` - Main client application
- `script-mqtt.js` - Client JavaScript
- `style.css` - Styling
- `error.html` - Error page

#### Deploy to S3/CloudFront

```bash
npm run deploy-client
```

This uploads files to S3 and sets proper content types.

### 5. Access the Application

#### Get Client URL

From Terraform outputs:
```bash
terraform output client_ui_url
```

#### Get Login Credentials

```bash
terraform output cognito_username
terraform output cognito_password  # This is sensitive, use carefully
```

#### Login and Use

1. Open the client URL in your browser
2. Click "Login"
3. Enter the Cognito username and password
4. Click "Start Q Chat"
5. Interact with Q CLI through the web interface

## Production Considerations

### Custom Domain

To use a custom domain:

1. Create ACM certificate in `us-east-1` (for CloudFront)
2. Add domain and certificate ARN to `terraform.tfvars`
3. Run `terraform apply`
4. Update DNS to point to CloudFront distribution

### Security

#### Certificate Management

- Server certificates are stored in `certs/` directory
- Keep private keys secure and rotate regularly
- Consider using AWS Secrets Manager for production

#### User Management

- The setup creates one user automatically
- For production, consider:
  - Self-service registration
  - Multiple users
  - User groups and permissions
  - Password policies

#### Network Security

- Consider VPC endpoints for IoT Core
- Implement IP whitelisting if needed
- Use WAF with CloudFront for additional protection

### Monitoring

#### CloudWatch

Monitor these metrics:
- IoT Core connection count
- Message publish/subscribe rates
- Authentication failures
- CloudFront cache hit ratio

#### Logging

Enable logging for:
- IoT Core (CloudWatch Logs)
- CloudFront access logs
- Server application logs

### Scaling

#### Multiple Servers

To run multiple servers:
1. Each server needs unique client ID
2. Modify server code to include hostname/instance ID
3. Consider load balancing strategies

#### High Availability

- Run servers in multiple AZs
- Use Auto Scaling Groups
- Implement health checks
- Consider ECS/EKS for container deployment

## Troubleshooting

### Common Issues

#### Server Connection Issues

```bash
# Check certificates
ls -la certs/
cat certs/certificate.pem  # Should show certificate

# Check environment
cat .env

# Test IoT endpoint
aws iot describe-endpoint --endpoint-type iot:Data-ATS
```

#### Client Authentication Issues

1. Check browser console for errors
2. Verify Cognito configuration in built HTML
3. Test with AWS CLI:
```bash
aws cognito-idp admin-get-user \
  --user-pool-id <pool-id> \
  --username <username>
```

#### MQTT Message Issues

Use IoT Core Test client:
1. Go to AWS Console → IoT Core → Test
2. Subscribe to `q-cli-webui/+/+/+`
3. Publish test messages
4. Verify message flow

### Debug Mode

Enable debug logging:

```bash
# Server debug
DEBUG=* node server-mqtt.js

# Client debug (browser console)
localStorage.setItem('debug', 'true')
```

### Recovery Procedures

#### Lost Certificates

```bash
# Regenerate certificates
terraform taint aws_iot_certificate.server_cert
terraform apply
node scripts/setup-server.js
```

#### Corrupted Client Build

```bash
# Clean and rebuild
rm -rf dist/
npm run build-client
npm run deploy-client
```

#### Reset User Password

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id <pool-id> \
  --username <username> \
  --password <new-password> \
  --permanent
```

## Cleanup

To remove all resources:

```bash
cd terraform
terraform destroy  # Type 'yes' to confirm
```

This removes:
- All AWS resources
- S3 bucket contents
- CloudFront distribution
- IoT certificates and policies
- Cognito users and pools

Note: Some resources like CloudFront distributions may take time to fully delete.

## Support

For issues:
1. Check the troubleshooting section
2. Review AWS service logs
3. Check GitHub issues
4. Create new issue with logs and configuration
