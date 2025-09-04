# Route53 hosted zone lookup
data "aws_route53_zone" "main" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name
}

# Local value for full domain
locals {
  full_domain = var.domain_name != "" ? "${var.subdomain}.${var.domain_name}" : ""
}

# ACM certificate for custom domain (must be in us-east-1 for CloudFront)
resource "aws_acm_certificate" "domain_cert" {
  provider        = aws.us_east_1
  count           = var.domain_name != "" ? 1 : 0
  domain_name     = local.full_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-certificate"
  }
}

# Route53 record for certificate validation
resource "aws_route53_record" "cert_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in aws_acm_certificate.domain_cert[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main[0].zone_id
}

# Certificate validation
resource "aws_acm_certificate_validation" "domain_cert" {
  provider        = aws.us_east_1
  count           = var.domain_name != "" ? 1 : 0
  certificate_arn = aws_acm_certificate.domain_cert[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# Route53 alias record for CloudFront
resource "aws_route53_record" "cloudfront_alias" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = local.full_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.client_ui.domain_name
    zone_id                = aws_cloudfront_distribution.client_ui.hosted_zone_id
    evaluate_target_health = false
  }
}
