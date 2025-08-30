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
  }
}

provider "aws" {
  region = var.aws_region
}

# Random password for Cognito user
resource "random_password" "cognito_user_password" {
  length  = 16
  special = true
}

# S3 bucket for hosting the client UI (private)
resource "aws_s3_bucket" "client_ui" {
  bucket = "${var.project_name}-client-ui-${random_id.bucket_suffix.hex}"
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Keep S3 bucket private
resource "aws_s3_bucket_public_access_block" "client_ui" {
  bucket = aws_s3_bucket.client_ui.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 bucket versioning (optional but recommended)
resource "aws_s3_bucket_versioning" "client_ui" {
  bucket = aws_s3_bucket.client_ui.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 bucket server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "client_ui" {
  bucket = aws_s3_bucket.client_ui.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "client_ui" {
  name                              = "${var.project_name}-client-ui-oac"
  description                       = "OAC for Q CLI WebUI client"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution
resource "aws_cloudfront_distribution" "client_ui" {
  origin {
    domain_name              = aws_s3_bucket.client_ui.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.client_ui.id
    origin_id                = "S3-${aws_s3_bucket.client_ui.id}"
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "Q CLI WebUI Distribution"

  aliases = var.domain_name != "" ? [var.domain_name] : []

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.client_ui.id}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400   # 1 day
    max_ttl     = 31536000 # 1 year
  }

  # Cache behavior for HTML files (shorter cache)
  ordered_cache_behavior {
    path_pattern           = "*.html"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.client_ui.id}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 300     # 5 minutes
    max_ttl     = 86400   # 1 day
  }

  # Cache behavior for API-like paths (no cache)
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.client_ui.id}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # Custom error response for SPA routing
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
    error_caching_min_ttl = 300
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
    error_caching_min_ttl = 300
  }

  price_class = "PriceClass_100"

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.domain_name == ""
    acm_certificate_arn           = var.certificate_arn != "" ? var.certificate_arn : null
    ssl_support_method            = var.certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version      = var.certificate_arn != "" ? "TLSv1.2_2021" : null
  }

  tags = {
    Name        = "${var.project_name}-client-ui"
    Environment = "production"
  }
}

# S3 bucket policy - only allow CloudFront OAC access
resource "aws_s3_bucket_policy" "client_ui" {
  bucket = aws_s3_bucket.client_ui.id
  depends_on = [
    aws_s3_bucket_public_access_block.client_ui,
    aws_cloudfront_distribution.client_ui
  ]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.client_ui.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.client_ui.arn
          }
        }
      }
    ]
  })
}

# IoT Core Thing for the server
resource "aws_iot_thing" "q_cli_server" {
  name = "${var.project_name}-server"
  
  attributes = {
    description = "Q_CLI_WebUI_Server_Thing"
    environment = "production"
    project     = var.project_name
  }
}

# IoT Core Thing Type (commented out due to AWS deletion restrictions)
# Uncomment after 5 minutes if you need to recreate it
# resource "aws_iot_thing_type" "q_cli_server_type" {
#   name = "${var.project_name}-server-type"
#   
#   properties {
#     description = "Thing_type_for_Q_CLI_WebUI_servers"
#   }
# }

# Server certificate for IoT Core authentication
resource "aws_iot_certificate" "server_cert" {
  active = true
}

# Associate thing with certificate
resource "aws_iot_thing_principal_attachment" "server_cert_attachment" {
  thing     = aws_iot_thing.q_cli_server.name
  principal = aws_iot_certificate.server_cert.arn
}

# IoT Policy for server
resource "aws_iot_policy" "server_policy" {
  name = "${var.project_name}-server-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iot:Connect"
        ]
        Resource = "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:client/${var.project_name}-server-*"
      },
      {
        Effect = "Allow"
        Action = [
          "iot:Subscribe"
        ]
        Resource = [
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topicfilter/${var.project_name}/server/*/control",
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topicfilter/${var.project_name}/server/*/*/input"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iot:Publish"
        ]
        Resource = [
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/client/*/*/output",
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/client/*/*/status"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iot:Receive"
        ]
        Resource = [
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/server/*/control",
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/server/*/*/input"
        ]
      }
    ]
  })
}

# Attach policy to server certificate
resource "aws_iot_policy_attachment" "server_policy_attachment" {
  policy = aws_iot_policy.server_policy.name
  target = aws_iot_certificate.server_cert.arn
}

# Cognito Identity Pool
resource "aws_cognito_identity_pool" "q_cli_pool" {
  identity_pool_name               = "${var.project_name}-identity-pool"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.q_cli_client.id
    provider_name           = aws_cognito_user_pool.q_cli_pool.endpoint
    server_side_token_check = false
  }
}

# Cognito User Pool
resource "aws_cognito_user_pool" "q_cli_pool" {
  name = "${var.project_name}-user-pool"

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  auto_verified_attributes = ["email"]
  
  # Disable self-registration - only admins can create users
  admin_create_user_config {
    allow_admin_create_user_only = true
  }
  
  schema {
    attribute_data_type = "String"
    name               = "email"
    required           = true
    mutable            = true
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "q_cli_client" {
  name         = "${var.project_name}-client"
  user_pool_id = aws_cognito_user_pool.q_cli_pool.id

  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  explicit_auth_flows                  = ["ADMIN_NO_SRP_AUTH", "USER_PASSWORD_AUTH"]
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = [
    var.domain_name != "" ? "https://${var.domain_name}/callback" : "https://${aws_cloudfront_distribution.client_ui.domain_name}/callback"
  ]
}

# Cognito User
resource "aws_cognito_user" "q_cli_user" {
  user_pool_id = aws_cognito_user_pool.q_cli_pool.id
  username     = var.cognito_username
  password     = random_password.cognito_user_password.result

  attributes = {
    email          = var.cognito_user_email
    email_verified = "true"
  }

  message_action = "SUPPRESS"
}

# IAM Role for authenticated Cognito users
resource "aws_iam_role" "cognito_authenticated_role" {
  name = "${var.project_name}-cognito-authenticated-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.q_cli_pool.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })
}

# IoT Policy for Cognito authenticated users
resource "aws_iot_policy" "cognito_iot_policy" {
  name = "${var.project_name}-cognito-iot-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iot:Connect"
        ]
        Resource = "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:client/*"
      },
      {
        Effect = "Allow"
        Action = [
          "iot:Subscribe"
        ]
        Resource = [
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topicfilter/${var.project_name}/client/*/*/output",
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topicfilter/${var.project_name}/client/*/*/status"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iot:Publish"
        ]
        Resource = [
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/server/*/control",
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/server/*/*/input"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iot:Receive"
        ]
        Resource = [
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/client/*/*/output",
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/client/*/*/status"
        ]
      }
    ]
  })
}

# IAM Policy for IoT access
resource "aws_iam_policy" "cognito_iot_access" {
  name        = "${var.project_name}-cognito-iot-access"
  description = "Policy for Cognito users to access IoT Core"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iot:AttachPrincipalPolicy",
          "iot:DetachPrincipalPolicy"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "iot:Connect",
          "iot:Publish",
          "iot:Receive",
          "iot:Subscribe"
        ]
        Resource = [
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}/*",
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topicfilter/${var.project_name}/*",
          "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:client/*"
        ]
      }
    ]
  })
}

# Attach IoT policy to Cognito role
resource "aws_iam_role_policy_attachment" "cognito_iot_access" {
  role       = aws_iam_role.cognito_authenticated_role.name
  policy_arn = aws_iam_policy.cognito_iot_access.arn
}

# Cognito Identity Pool Role Attachment
resource "aws_cognito_identity_pool_roles_attachment" "q_cli_roles" {
  identity_pool_id = aws_cognito_identity_pool.q_cli_pool.id

  roles = {
    "authenticated" = aws_iam_role.cognito_authenticated_role.arn
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_iot_endpoint" "iot_endpoint" {
  endpoint_type = "iot:Data-ATS"
}
