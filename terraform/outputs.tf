output "iot_endpoint" {
  description = "AWS IoT Core endpoint"
  value       = data.aws_iot_endpoint.iot_endpoint.endpoint_address
}

output "server_certificate_pem" {
  description = "Server certificate PEM"
  value       = aws_iot_certificate.server_cert.certificate_pem
  sensitive   = true
}

output "server_private_key" {
  description = "Server private key"
  value       = aws_iot_certificate.server_cert.private_key
  sensitive   = true
}

output "server_public_key" {
  description = "Server public key"
  value       = aws_iot_certificate.server_cert.public_key
  sensitive   = true
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.q_cli_pool.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.q_cli_client.id
}

output "cognito_identity_pool_id" {
  description = "Cognito Identity Pool ID"
  value       = aws_cognito_identity_pool.q_cli_pool.id
}

output "cognito_username" {
  description = "Cognito username"
  value       = aws_cognito_user.q_cli_user.username
}

output "cognito_password" {
  description = "Cognito user password"
  value       = random_password.cognito_user_password.result
  sensitive   = true
}

output "s3_bucket_name" {
  description = "S3 bucket name for client UI"
  value       = aws_s3_bucket.client_ui.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.client_ui.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.client_ui.id
}

output "client_ui_url" {
  description = "Client UI URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.client_ui.domain_name}"
}

output "cognito_iot_policy_name" {
  description = "IoT policy name for Cognito users"
  value       = aws_iot_policy.cognito_iot_policy.name
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}
