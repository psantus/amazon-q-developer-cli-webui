# Build the client files
resource "null_resource" "build_client" {
  depends_on = [
    aws_cognito_user_pool.q_cli_pool,
    aws_cognito_user_pool_client.q_cli_client,
    aws_cognito_identity_pool.q_cli_pool,
    aws_iot_policy.cognito_iot_policy,
    data.aws_iot_endpoint.iot_endpoint
  ]

  triggers = {
    # Rebuild when any of these files change
    html_hash = filemd5("${path.module}/../public/index-mqtt.html")
    js_hash   = filemd5("${path.module}/../public/script-mqtt.js")
    css_hash  = filemd5("${path.module}/../public/style.css")
    config_hash = sha256(jsonencode({
      region                = var.aws_region
      userPoolId           = aws_cognito_user_pool.q_cli_pool.id
      userPoolWebClientId  = aws_cognito_user_pool_client.q_cli_client.id
      identityPoolId       = aws_cognito_identity_pool.q_cli_pool.id
      iotEndpoint          = data.aws_iot_endpoint.iot_endpoint.endpoint_address
      iotPolicyName        = aws_iot_policy.cognito_iot_policy.name
      projectName          = var.project_name
    }))
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/..
      
      # Create dist directory
      mkdir -p dist
      
      # Copy HTML files and inject configuration
      cp public/index-mqtt.html dist/index.html
      sed -i '' "s/region: 'us-east-1'/region: '${var.aws_region}'/g" dist/index.html
      sed -i '' "s/userPoolId: 'us-east-1_XXXXXXXXX'/userPoolId: '${aws_cognito_user_pool.q_cli_pool.id}'/g" dist/index.html
      sed -i '' "s/userPoolWebClientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX'/userPoolWebClientId: '${aws_cognito_user_pool_client.q_cli_client.id}'/g" dist/index.html
      sed -i '' "s/identityPoolId: 'us-east-1:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'/identityPoolId: '${aws_cognito_identity_pool.q_cli_pool.id}'/g" dist/index.html
      sed -i '' "s/iotEndpoint: 'XXXXXXXXXXXXXX-ats.iot.us-east-1.amazonaws.com'/iotEndpoint: '${data.aws_iot_endpoint.iot_endpoint.endpoint_address}'/g" dist/index.html
      sed -i '' "s/iotPolicyName: 'q-cli-webui-cognito-iot-policy'/iotPolicyName: '${aws_iot_policy.cognito_iot_policy.name}'/g" dist/index.html
      sed -i '' "s/projectName: 'q-cli-webui'/projectName: '${var.project_name}'/g" dist/index.html
      
      echo "<!-- Error page -->" > dist/error.html
      
      # Copy CSS
      cp public/style.css dist/style.css
      
      # Copy JavaScript (no changes needed as config comes from HTML)
      cp public/script-mqtt.js dist/script-mqtt.js
      
      echo "Client built successfully with configuration:"
      echo "  Region: ${var.aws_region}"
      echo "  User Pool: ${aws_cognito_user_pool.q_cli_pool.id}"
      echo "  Client ID: ${aws_cognito_user_pool_client.q_cli_client.id}"
      echo "  Identity Pool: ${aws_cognito_identity_pool.q_cli_pool.id}"
    EOT
  }
}

# Upload client files to S3
resource "aws_s3_object" "client_html" {
  depends_on = [null_resource.build_client]
  
  bucket       = aws_s3_bucket.client_ui.id
  key          = "index.html"
  source       = "${path.module}/../dist/index.html"
  content_type = "text/html"
  
  # Use build trigger to force update when build changes
  source_hash = null_resource.build_client.triggers.config_hash
}

resource "aws_s3_object" "client_error_html" {
  depends_on = [null_resource.build_client]
  
  bucket       = aws_s3_bucket.client_ui.id
  key          = "error.html"
  source       = "${path.module}/../dist/error.html"
  content_type = "text/html"
  
  # Use build trigger to force update when build changes
  source_hash = null_resource.build_client.triggers.config_hash
}

resource "aws_s3_object" "client_css" {
  depends_on = [null_resource.build_client]
  
  bucket       = aws_s3_bucket.client_ui.id
  key          = "style.css"
  source       = "${path.module}/../dist/style.css"
  content_type = "text/css"
  
  # Use build trigger to force update when build changes
  source_hash = null_resource.build_client.triggers.css_hash
}

resource "aws_s3_object" "client_js" {
  depends_on = [null_resource.build_client]
  
  bucket       = aws_s3_bucket.client_ui.id
  key          = "script-mqtt.js"
  source       = "${path.module}/../dist/script-mqtt.js"
  content_type = "application/javascript"
  
  # Use build trigger to force update when build changes
  source_hash = null_resource.build_client.triggers.js_hash
}

# Invalidate CloudFront cache when files change
resource "null_resource" "client_invalidation" {
  depends_on = [
    aws_s3_object.client_html,
    aws_s3_object.client_error_html,
    aws_s3_object.client_css,
    aws_s3_object.client_js
  ]
  
  triggers = {
    html_hash = aws_s3_object.client_html.source_hash
    css_hash  = aws_s3_object.client_css.source_hash
    js_hash   = aws_s3_object.client_js.source_hash
  }
  
  provisioner "local-exec" {
    command = <<-EOT
      aws cloudfront create-invalidation \
        --distribution-id ${aws_cloudfront_distribution.client_ui.id} \
        --paths "/*" \
        --profile ${var.aws_profile} \
        --region ${var.aws_region}
    EOT
  }
}
