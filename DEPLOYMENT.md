# Deployment Guide

This guide walks you through deploying the Q CLI WebUI with MQTT support using Terraform automation.

## Quick Start

```bash
# 1. Clone and setup
git clone <repository>
cd amazon-q-cli-webui

# 2. Configure Terraform
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your preferences

# 3. Deploy everything with Terraform
terraform init
terraform apply  # Builds and deploys automatically

# 4. Get access URL and credentials
terraform output client_ui_url
terraform output cognito_username
terraform output cognito_password
```

## Detailed Steps

### 1. Prerequisites

Ensure you have:
- AWS CLI configured with admin permissions
- Terraform installed
- Node.js 18+ and npm installed
- Docker installed (for server builds)

### 2. Infrastructure and Application Deployment

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

# Optional: Custom domain (requires ACM certificate)
# domain_name = "qcli.yourdomain.com"
# certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
```

#### Deploy Everything with Terraform

```bash
terraform init
terraform plan  # Review changes
terraform apply  # Type 'yes' to confirm
```

**Terraform automatically handles:**
- ✅ **Infrastructure Creation**: IoT Core, Cognito, S3, CloudFront, IAM
- ✅ **Server Build**: Compiles Node.js server with dependencies
- ✅ **Client Build**: Webpack build with AWS configuration injection
- ✅ **S3 Upload**: Deploys client files to S3 bucket
- ✅ **CloudFront Invalidation**: Clears CDN cache for updates
- ✅ **Certificate Generation**: Creates IoT certificates and downloads to server
- ✅ **User Creation**: Sets up Cognito user with generated password

### 3. Access the Application

#### Get Deployment Information

```bash
# Client URL
terraform output client_ui_url

# Login credentials
terraform output cognito_username
terraform output cognito_password  # Sensitive output

# Server endpoint (for debugging)
terraform output iot_endpoint
```

#### Login and Use

1. Open the client URL in your browser
2. Click "Login" 
3. Enter the Cognito username and password
4. Start chatting with Q CLI through the web interface


## Development Workflow

### Local Development

```bash
# Client development
cd client
npm install
npm run dev  # Webpack dev server

# Server development  
cd server
npm install
npm run dev  # Auto-restart on changes
```

### Deploy Changes

```bash
# Deploy client and server changes
terraform apply

# Deploy only client changes
terraform apply -target=null_resource.build_client -target=aws_s3_object.client_files

# Deploy only server changes  
terraform apply -target=null_resource.build_server
```

## Production Considerations

### Custom Domain

To use a custom domain:

1. Create ACM certificate in `us-east-1` (for CloudFront)
2. Add domain and certificate ARN to `terraform.tfvars`:
```hcl
domain_name = "qcli.yourdomain.com"
certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
```
3. Run `terraform apply`
4. Update DNS CNAME to point to CloudFront distribution

### Security

#### Disable Self-Registration

The Cognito User Pool is configured with `allow_admin_create_user_only = true` to prevent anonymous signups.

#### Certificate Management

- Server certificates are automatically generated and managed by Terraform
- Certificates are stored securely in the server environment
- Consider certificate rotation policies for production

#### Network Security

- Consider VPC endpoints for IoT Core
- Implement IP whitelisting if needed
- Use WAF with CloudFront for additional protection

### Monitoring

#### CloudWatch Metrics

Monitor:
- IoT Core connection count and message rates
- Cognito authentication metrics
- CloudFront cache hit ratio and error rates
- Lambda function metrics (if using custom authorizers)

#### Logging

Terraform enables logging for:
- IoT Core message logging to CloudWatch
- CloudFront access logs to S3
- Server application logs

### Scaling

#### Auto-Scaling Server

For production, consider:
- ECS/Fargate deployment with auto-scaling
- Application Load Balancer for multiple instances
- Session persistence with Redis/ElastiCache

#### Multi-Region Deployment

- Deploy Terraform in multiple regions
- Use Route 53 for DNS failover
- Replicate user data across regions

## Troubleshooting

### Build Issues

```bash
# Check Terraform build logs
terraform apply -target=null_resource.build_client
terraform apply -target=null_resource.build_server

# Manual client build
cd client && npm install && npm run build

# Manual server build  
cd server && npm install
```

### Connection Issues

```bash
# Check IoT endpoint
terraform output iot_endpoint

# Verify certificates exist
ls -la server/certs/

# Test MQTT connection
aws iot test-invoke-authorizer --authorizer-name <name>
```

### Authentication Issues

```bash
# Check Cognito configuration
terraform output cognito_user_pool_id
terraform output cognito_user_pool_client_id

# Reset user password
aws cognito-idp admin-set-user-password \
  --user-pool-id $(terraform output -raw cognito_user_pool_id) \
  --username $(terraform output -raw cognito_username) \
  --password "NewPassword123!" \
  --permanent
```

### Debug Mode

Enable detailed logging:

```bash
# Terraform debug
TF_LOG=DEBUG terraform apply

# Client debug (browser console)
localStorage.setItem('debug', 'true')
```

## Updates and Maintenance

### Update Application

```bash
# Pull latest code
git pull origin main

# Deploy updates
terraform apply
```

### Update Dependencies

```bash
# Update client dependencies
cd client && npm update

# Update server dependencies  
cd server && npm update

# Redeploy with updated dependencies
terraform apply
```

### Backup and Recovery

#### Backup Terraform State

```bash
# Backup state file
cp terraform.tfstate terraform.tfstate.backup

# Use remote state for production
terraform {
  backend "s3" {
    bucket = "your-terraform-state-bucket"
    key    = "q-cli-webui/terraform.tfstate"
    region = "us-east-1"
  }
}
```

#### Disaster Recovery

```bash
# Recreate from backup
terraform import aws_s3_bucket.client_ui <bucket-name>
terraform import aws_cognito_user_pool.q_cli_pool <pool-id>
# ... import other critical resources
```

## Cleanup

To remove all resources:

```bash
cd terraform
terraform destroy  # Type 'yes' to confirm
```

This removes:
- All AWS infrastructure
- S3 bucket contents  
- CloudFront distribution
- IoT certificates and policies
- Cognito users and pools
- Built application files

Note: CloudFront distributions may take 15+ minutes to fully delete.

## Support

For issues:
1. Check the troubleshooting section above
2. Review Terraform and AWS service logs
3. Check browser developer console for client errors
4. Verify AWS CLI permissions and configuration
5. Create GitHub issue with logs and configuration details
