# 🌐 Amazon Q Developer CLI WebUI

A modern, web-based interface for Amazon Q CLI that provides real-time MQTT communication between a sleek web client and server. Chat with Amazon Q Developer through your browser with full session management and persistence.

![Amazon Q CLI WebUI](https://img.shields.io/badge/AWS-Q%20CLI%20WebUI-orange?style=for-the-badge&logo=amazon-aws)
![Terraform](https://img.shields.io/badge/Infrastructure-Terraform-623CE4?style=for-the-badge&logo=terraform)
![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?style=for-the-badge&logo=node.js)
![WebSocket](https://img.shields.io/badge/Protocol-MQTT%20WebSocket-FF6B6B?style=for-the-badge)

## ✨ Features

- 🔐 **Secure Authentication** - AWS Cognito integration with user management
- 📡 **Real-time Communication** - MQTT over WebSocket for instant responses
- 🖥️ **Multi-Session Support** - Run multiple Q CLI conversations simultaneously
- 💾 **Session Persistence** - Auto-save and restore sessions across browser refreshes
- 🎯 **Smart Approval UI** - Interactive buttons for Q CLI approval prompts (y/n/trust)
- 🌐 **CloudFront CDN** - Fast global content delivery
- 🏗️ **Infrastructure as Code** - Complete Terraform automation
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile
- 🔄 **Auto-Deploy** - Terraform handles builds and deployments automatically

## Screenshot

![Q Developer WebUI screenshot](https://www.terracloud.fr/images/blog/q-web-ui-screenshot.png "Q Developer WebUI screenshot")

## See it in action!

### Login and first session

https://github.com/user-attachments/assets/c1c97ae0-d4f9-4343-8cbf-cc40c09961f8

### Multi-session support

https://github.com/user-attachments/assets/16b91e4b-73cc-4ead-a514-b4ac3e0a9a73

### File browser

https://github.com/user-attachments/assets/5e526827-3f4c-4588-94ac-1ad986abc9b7

## 🚀 Quick Start

Deploy everything with just 3 commands:

```bash
# 1. Clone and configure
git clone <repository>
cd AmazonQCLI-Remote/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your preferences

# 2. Deploy with Terraform (builds everything automatically)
terraform init
terraform apply

# 3. Get your access URL and credentials
terraform output client_ui_url
terraform output cognito_username
terraform output cognito_password
```

That's it! 🎉 Your Q CLI WebUI is now live and ready to use.

## 🏗️ Architecture

```
┌─────────────────┐    HTTPS/WSS     ┌──────────────────┐
│   Web Client    │◄────────────────►│   CloudFront     │
│  (React-like)   │                  │      CDN         │
└─────────────────┘                  └──────────────────┘
         │                                     │
         │ MQTT over WebSocket                 │ S3 Static Hosting
         ▼                                     ▼
┌─────────────────┐    MQTT/WSS      ┌──────────────────┐
│   AWS IoT Core  │                  │   S3 Bucket      │
│   (Message Bus) │                  │  (Static Files)  │
└─────────────────┘                  └──────────────────┘
         │                                     
         │ MQTT                               
         ▼                                     
┌─────────────────┐    Subprocess    ┌──────────────────┐
│   Node.js       │◄────────────────►│   Amazon Q CLI   │
│   MQTT Server   │                  │   (AI Assistant) │
└─────────────────┘                  └──────────────────┘
```

## 🛠️ What Terraform Builds

When you run `terraform apply`, it automatically:

- ✅ **Provisions AWS Infrastructure** (IoT Core, Cognito, S3, CloudFront, IAM)
- ✅ **Builds Node.js Server** with all dependencies
- ✅ **Compiles Web Client** using Webpack with AWS config injection
- ✅ **Uploads to S3** with proper content types and caching
- ✅ **Invalidates CloudFront** cache for instant updates
- ✅ **Generates IoT Certificates** and configures server
- ✅ **Creates Cognito User** with secure password
- ✅ **Outputs Access URLs** and credentials

## 📋 Prerequisites

- **AWS CLI** configured with admin permissions
- **Terraform** v1.0+ installed
- **Node.js** v18+ and npm
- **Amazon Q CLI** installed and authenticated (on server)

## 🔧 Configuration

### Basic Setup

Edit `terraform/terraform.tfvars`:

```hcl
# Required
aws_region = "us-east-1"
project_name = "my-q-cli-webui"
cognito_username = "admin"

# Optional: Custom Domain
domain_name = "qcli.mydomain.com"
certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
```

### Advanced Configuration

```hcl
# Security
allow_admin_create_user_only = true  # Disable self-registration

# Performance  
cloudfront_price_class = "PriceClass_100"  # US/Europe only

# Monitoring
enable_logging = true
log_retention_days = 30
```

## 🎮 Usage

### Web Interface

1. **Login** - Use Cognito credentials from Terraform output
2. **Start Session** - Click "New Session" to begin
3. **Chat with Q** - Type questions and get AI-powered responses
4. **Multiple Sessions** - Open tabs for different conversations
5. **Approval Prompts** - Click Yes/No/Trust buttons or use Y/N/T keys
6. **Session Persistence** - Sessions auto-save and restore on refresh

### Session Management

- **📁 Multiple Tabs** - Each session runs independently
- **🔔 Notifications** - Unread message badges on inactive tabs
- **💾 Auto-Save** - All conversations persist across browser sessions
- **🗑️ Easy Cleanup** - Close sessions individually or clear all
- **⌨️ Keyboard Shortcuts** - Ctrl+Enter to send, Y/N/T for approvals

## 🔒 Security Features

- **🛡️ AWS Cognito Authentication** - Enterprise-grade user management
- **🔐 Admin-Only Registration** - Prevents unauthorized signups
- **📜 IoT Core Certificates** - Mutual TLS authentication for server
- **🌐 HTTPS/WSS Only** - All traffic encrypted in transit
- **🎯 IAM Least Privilege** - Minimal required permissions
- **🔄 Certificate Rotation** - Easy cert management via Terraform

## 📊 Monitoring & Observability

### Built-in Monitoring

- **CloudWatch Metrics** - IoT Core connections, message rates, errors
- **CloudFront Analytics** - Cache hit ratios, geographic distribution
- **Cognito Metrics** - Authentication success/failure rates
- **Application Logs** - Server and client-side error tracking

### Debug Mode

```bash
# Enable detailed Terraform logging
TF_LOG=DEBUG terraform apply

# Client-side debugging (browser console)
localStorage.setItem('debug', 'true')
```

## 🚀 Development

### Local Development

```bash
# Client development with hot reload
cd client
npm install && npm run dev

# Server development with auto-restart
cd server  
npm install && npm run dev
```

### Deploy Changes

```bash
# Deploy everything
terraform apply

# Deploy only client changes
terraform apply -target=null_resource.build_client

# Deploy only server changes
terraform apply -target=null_resource.build_server
```

## 🌍 Production Deployment

### Custom Domain Setup

1. **Create ACM Certificate** in `us-east-1` region
2. **Add to terraform.tfvars**:
   ```hcl
   domain_name = "qcli.yourdomain.com"
   certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
   ```
3. **Deploy**: `terraform apply`
4. **Update DNS** CNAME to CloudFront distribution

### High Availability

- **Multi-AZ Deployment** - Run servers across availability zones
- **Auto Scaling** - Use ECS/Fargate for automatic scaling
- **Health Checks** - Implement application-level health monitoring
- **Backup Strategy** - Regular Terraform state backups

## 🧹 Cleanup

Remove all AWS resources:

```bash
cd terraform
terraform destroy
```

This safely removes all infrastructure while preserving Terraform state.

## 📚 Documentation

- **[Deployment Guide](DEPLOYMENT.md)** - Detailed deployment instructions
- **[Architecture Guide](docs/ARCHITECTURE.md)** - Technical deep dive
- **[API Reference](docs/API.md)** - MQTT message formats
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **📖 Documentation** - Check the docs/ directory
- **🐛 Issues** - Report bugs via GitHub Issues
- **💬 Discussions** - Join GitHub Discussions for questions
- **📧 Contact** - Reach out for enterprise support

---

**Built with ❤️ for the Amazon Q Developer community**

*Transform your Q CLI experience with a modern, web-based interface that scales with your needs.*
