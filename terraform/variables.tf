variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "q-cli-webui"
}

variable "cognito_username" {
  description = "Username for the Cognito user"
  type        = string
  default     = "paul"
}

variable "cognito_user_email" {
  description = "Email for the Cognito user"
  type        = string
  default     = "paul@example.com"
}

variable "cognito_user_password" {
  description = "Custom password for Cognito user (optional - random password generated if not provided)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "domain_name" {
  description = "Root domain name (e.g., 'example.com') - must have Route53 hosted zone"
  type        = string
  default     = ""
}

variable "subdomain" {
  description = "Subdomain for the application (e.g., 'qcli' for qcli.example.com)"
  type        = string
  default     = "qcli"
}
