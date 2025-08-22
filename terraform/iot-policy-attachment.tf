# Attach IoT policy to the known Cognito identity
# In production, this would be handled dynamically

locals {
  # Known Cognito identity ID
  cognito_identity_id = "us-east-1:ac665b22-a9f7-cc64-3ede-262747a35d07"
}

# Attach IoT policy to the Cognito identity
resource "aws_iot_policy_attachment" "cognito_identity_policy" {
  policy = aws_iot_policy.cognito_iot_policy.name
  target = local.cognito_identity_id
}

# Output the identity ID for reference
output "cognito_identity_id" {
  description = "The Cognito identity ID that has IoT policy attached"
  value       = local.cognito_identity_id
}
