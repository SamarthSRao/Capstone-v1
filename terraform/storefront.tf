# HT-505 (Vindhya) — NexusGear storefront static hosting on S3 + CloudFront.
# Dashboard hosting is Arya's scope and is intentionally omitted here.

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "storefront_bucket_name" {
  type        = string
  description = "Globally unique S3 bucket name for the NexusGear storefront"
}

variable "storefront_price_class" {
  type    = string
  default = "PriceClass_100"
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "storefront" {
  bucket = var.storefront_bucket_name

  tags = {
    Name    = "nexusgear-storefront"
    Project = "HybridTimeNet"
    Owner   = "Vindhya"
  }
}

resource "aws_s3_bucket_public_access_block" "storefront" {
  bucket = aws_s3_bucket.storefront.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "storefront" {
  bucket = aws_s3_bucket.storefront.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudfront_origin_access_control" "storefront" {
  name                              = "nexusgear-storefront-oac"
  description                       = "OAC for NexusGear storefront bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "storefront" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "NexusGear e-commerce storefront"
  default_root_object = "index.html"
  price_class         = var.storefront_price_class

  origin {
    domain_name              = aws_s3_bucket.storefront.bucket_regional_domain_name
    origin_id                = "s3-storefront"
    origin_access_control_id = aws_cloudfront_origin_access_control.storefront.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-storefront"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # SPA fallback — React Router / client routes resolve to index.html
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name    = "nexusgear-storefront-cdn"
    Project = "HybridTimeNet"
    Owner   = "Vindhya"
  }
}

data "aws_iam_policy_document" "storefront_oac" {
  statement {
    sid    = "AllowCloudFrontRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.storefront.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.storefront.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "storefront" {
  bucket = aws_s3_bucket.storefront.id
  policy = data.aws_iam_policy_document.storefront_oac.json
}

output "storefront_bucket" {
  value = aws_s3_bucket.storefront.bucket
}

output "storefront_cloudfront_domain" {
  value = aws_cloudfront_distribution.storefront.domain_name
}

output "storefront_cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.storefront.domain_name}"
}
