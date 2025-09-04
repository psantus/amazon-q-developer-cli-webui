# Build the server dependencies
resource "null_resource" "build_server" {
  triggers = {
    # Always rebuild
    timestamp = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../server
      
      # Ensure Node.js dependencies are installed
      echo "📦 Installing/updating server npm dependencies..."
      npm install
      
      echo "✅ Server dependencies installed successfully"
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = "echo '🧹 Server build cleanup complete'"
  }
}

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
    # Always rebuild
    timestamp = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../client
      
      # Ensure Node.js dependencies are installed
      echo "📦 Installing/updating npm dependencies..."
      npm install
      
      # Build the client using webpack
      echo "🔨 Building client with webpack..."
      npm run build
      
      # Verify build output
      if [ ! -f "dist/index.html" ] || [ ! -f "dist/bundle.js" ] || [ ! -f "dist/style.css" ]; then
        echo "❌ Build failed - missing required files"
        exit 1
      fi
      
      # Inject configuration into HTML
      echo "⚙️ Injecting AWS configuration..."
      sed -i '' "s/region: 'us-east-1'/region: '${var.aws_region}'/g" dist/index.html
      sed -i '' "s/userPoolId: 'us-east-1_XXXXXXXXX'/userPoolId: '${aws_cognito_user_pool.q_cli_pool.id}'/g" dist/index.html
      sed -i '' "s/userPoolWebClientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX'/userPoolWebClientId: '${aws_cognito_user_pool_client.q_cli_client.id}'/g" dist/index.html
      sed -i '' "s/identityPoolId: 'us-east-1:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'/identityPoolId: '${aws_cognito_identity_pool.q_cli_pool.id}'/g" dist/index.html
      sed -i '' "s/iotEndpoint: 'XXXXXXXXXXXXXX-ats.iot.us-east-1.amazonaws.com'/iotEndpoint: '${data.aws_iot_endpoint.iot_endpoint.endpoint_address}'/g" dist/index.html
      sed -i '' "s/iotPolicyName: 'q-cli-webui-cognito-iot-policy'/iotPolicyName: '${aws_iot_policy.cognito_iot_policy.name}'/g" dist/index.html
      sed -i '' "s/projectName: 'q-cli-webui'/projectName: '${var.project_name}'/g" dist/index.html
      
      echo "<!-- Error page -->" > dist/error.html
      
      echo "✅ Client built successfully with modular architecture:"
      echo "  Region: ${var.aws_region}"
      echo "  User Pool: ${aws_cognito_user_pool.q_cli_pool.id}"
      echo "  Client ID: ${aws_cognito_user_pool_client.q_cli_client.id}"
      echo "  Identity Pool: ${aws_cognito_identity_pool.q_cli_pool.id}"
      echo "  Architecture: Modular (Auth, MQTT, UI, Sessions)"
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = "echo '🧹 Cleaning up build artifacts...'"
  }
}

# Define client files to upload with their content types
locals {
  client_files = {
    "index.html" = {
      source       = "${path.module}/../client/dist/index.html"
      content_type = "text/html"
    }
    "error.html" = {
      source       = "${path.module}/../client/dist/error.html"
      content_type = "text/html"
    }
    "bundle.js" = {
      source       = "${path.module}/../client/dist/bundle.js"
      content_type = "application/javascript"
    }
    "style.css" = {
      source       = "${path.module}/../client/dist/style.css"
      content_type = "text/css"
    }
    "session-styles.css" = {
      source       = "${path.module}/../client/dist/session-styles.css"
      content_type = "text/css"
    }
  }
}

# Upload all client files to S3 using for_each
resource "aws_s3_object" "client_files" {
  depends_on = [null_resource.build_client]
  
  for_each = local.client_files
  
  bucket        = aws_s3_bucket.client_ui.id
  key           = each.key
  source        = each.value.source
  content_type  = each.value.content_type
  cache_control = "no-cache, no-store, must-revalidate"

  # Always update by using timestamp
  source_hash = null_resource.build_client.triggers.timestamp
}

# Invalidate CloudFront cache when files change
resource "null_resource" "client_invalidation" {
  depends_on = [aws_s3_object.client_files]
  
  triggers = {
    # Always invalidate using timestamp
    timestamp = null_resource.build_client.triggers.timestamp
  }
  
  provisioner "local-exec" {
    command = <<-EOT
      echo "🔄 Invalidating CloudFront cache..."
      aws cloudfront create-invalidation \
        --distribution-id ${aws_cloudfront_distribution.client_ui.id} \
        --paths "/*" \
        --profile $AWS_PROFILE \
        --region ${var.aws_region}
      echo "✅ CloudFront cache invalidated"
    EOT
  }
}
