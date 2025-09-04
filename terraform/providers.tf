terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.1"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.1"
    }
  }
}

# Default provider for main region
provider "aws" {
  region  = var.aws_region
}

# US East 1 provider for CloudFront certificates
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
}
