variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS profile to use"
  type        = string
  default     = "terracloud"
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

variable "domain_name" {
  description = "Custom domain name for CloudFront (optional)"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for custom domain (required if domain_name is set)"
  type        = string
  default     = ""
}
