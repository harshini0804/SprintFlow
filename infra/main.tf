terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.6"
}

provider "aws" {
  region = var.aws_region
}

# ACM certificate for CloudFront must be in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  name = var.project_name
  tags = { Project = var.project_name, ManagedBy = "terraform" }
}

# ── VPC & Networking ───────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = merge(local.tags, { Name = "${local.name}-vpc" })
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags   = merge(local.tags, { Name = "${local.name}-igw" })
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
  tags                    = merge(local.tags, { Name = "${local.name}-public-a" })
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true
  tags                    = merge(local.tags, { Name = "${local.name}-public-b" })
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "${var.aws_region}a"
  tags              = merge(local.tags, { Name = "${local.name}-private-a" })
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "${var.aws_region}b"
  tags              = merge(local.tags, { Name = "${local.name}-private-b" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
  tags = merge(local.tags, { Name = "${local.name}-public-rt" })
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# ── Security Groups ────────────────────────────────────────────────────────

resource "aws_security_group" "ec2" {
  name        = "${local.name}-ec2-sg"
  description = "SprintFlow EC2 security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
    description = "SSH from admin IP"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP from anywhere"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.name}-ec2-sg" })
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds-sg"
  description = "SprintFlow RDS security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
    description     = "PostgreSQL from EC2 only"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.name}-rds-sg" })
}

# ── IAM Instance Role ──────────────────────────────────────────────────────

resource "aws_iam_role" "ec2_role" {
  name = "${local.name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "ec2_policy" {
  name = "${local.name}-ec2-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Assets"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.assets.arn,
          "${aws_s3_bucket.assets.arn}/*"
        ]
      },
      {
        Sid      = "SESEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      },
      {
        Sid      = "SNSPublish"
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.email_notifications.arn
      },
      {
        Sid    = "SQSBroker"
        Effect = "Allow"
        Action = [
          "sqs:SendMessage", "sqs:ReceiveMessage",
          "sqs:DeleteMessage", "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl", "sqs:ListQueues"
        ]
        Resource = aws_sqs_queue.celery.arn
      },
      {
        Sid    = "SSMParameters"
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/${local.name}/*"
      },
      {
        Sid      = "LambdaInvoke"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${var.aws_region}:*:function:${local.name}-*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# ── EC2 Instance ───────────────────────────────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "app" {
  ami                    = "ami-040e95ba14632401d"
  instance_type          = "t3.micro"
  key_name               = var.ec2_key_name
  subnet_id              = aws_subnet.public_a.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  user_data = <<-EOF
    #!/bin/bash
    set -e
    apt-get update -y
    apt-get install -y python3.11 python3.11-venv python3-pip nginx git

    # Set Python 3.11 as default
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

    # Enable and start Nginx
    systemctl enable nginx
    systemctl start nginx

    # Create app directory
    mkdir -p /home/ubuntu/sprintflow
    chown ubuntu:ubuntu /home/ubuntu/sprintflow

    echo "Bootstrap complete" > /tmp/bootstrap-done.txt
  EOF

  tags = merge(local.tags, { Name = "${local.name}-app-server" })
}

# ── RDS PostgreSQL ─────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  tags       = local.tags
}

resource "aws_db_instance" "postgres" {
  identifier             = "${local.name}-postgres"
  engine                 = "postgres"
  engine_version         = "15.18"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  storage_type           = "gp2"
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  skip_final_snapshot    = true
  deletion_protection    = false

  tags = merge(local.tags, { Name = "${local.name}-postgres" })
}

# ── S3 Buckets ─────────────────────────────────────────────────────────────

# Frontend bucket — private, served only via CloudFront OAC
resource "aws_s3_bucket" "frontend" {
  bucket = "${local.name}-frontend-${data.aws_caller_identity.current.account_id}"
  tags   = merge(local.tags, { Name = "${local.name}-frontend" })
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}

# Assets bucket — private, pre-signed URLs for access
resource "aws_s3_bucket" "assets" {
  bucket = "${local.name}-assets-${data.aws_caller_identity.current.account_id}"
  tags   = merge(local.tags, { Name = "${local.name}-assets" })
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "DELETE"]
    allowed_origins = [
      "https://${aws_cloudfront_distribution.frontend.domain_name}",
      "http://localhost:5173"
    ]
    max_age_seconds = 3000
  }
}

data "aws_caller_identity" "current" {}

# ── CloudFront ─────────────────────────────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name}-oac"
  description                       = "OAC for SprintFlow frontend S3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_All"
  comment             = "${local.name} frontend distribution"

  # Origin 1 — S3 frontend bucket
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Origin 2 — EC2 backend
  origin {
    domain_name ="ec2-13-127-21-113.ap-south-1.compute.amazonaws.com"
    origin_id   = "ec2-backend"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Route /api/* to EC2 — no caching
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "ec2-backend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Content-Type", "Origin", "Accept"]
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
    compress    = false
  }

  # Default — serve frontend from S3
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
    compress    = true
  }

  # SPA routing — return index.html for all 403/404s
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.tags
}

# Bucket policy — allow only CloudFront OAC to read frontend bucket
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}

# ── SNS Topic ──────────────────────────────────────────────────────────────

resource "aws_sns_topic" "email_notifications" {
  name = "${local.name}-email-notifications"
  tags = local.tags
}

# ── SQS Queue ─────────────────────────────────────────────────────────────

resource "aws_sqs_queue" "celery" {
  name                       = "${local.name}-celery-queue"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 86400
  receive_wait_time_seconds  = 20  # Long polling — reduces API calls

  tags = local.tags
}

# Allow SNS to send messages to SQS
resource "aws_sqs_queue_policy" "celery" {
  queue_url = aws_sqs_queue.celery.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.celery.arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_sns_topic.email_notifications.arn }
      }
    }]
  })
}

# Subscribe SQS to SNS
resource "aws_sns_topic_subscription" "sqs" {
  topic_arn = aws_sns_topic.email_notifications.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.celery.arn
}

# ── SSM Parameter Store ────────────────────────────────────────────────────

resource "aws_ssm_parameter" "db_host" {
  name  = "/${local.name}/db_host"
  type  = "String"
  value = aws_db_instance.postgres.address
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${local.name}/db_password"
  type  = "SecureString"
  value = var.db_password
}

resource "aws_ssm_parameter" "db_name" {
  name  = "/${local.name}/db_name"
  type  = "String"
  value = var.db_name
}

resource "aws_ssm_parameter" "db_user" {
  name  = "/${local.name}/db_user"
  type  = "String"
  value = var.db_username
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${local.name}/jwt_secret"
  type  = "SecureString"
  value = var.jwt_secret
}

resource "aws_ssm_parameter" "ses_sender" {
  name  = "/${local.name}/ses_sender_email"
  type  = "String"
  value = var.ses_sender_email
}

resource "aws_ssm_parameter" "sns_topic_arn" {
  name  = "/${local.name}/sns_topic_arn"
  type  = "String"
  value = aws_sns_topic.email_notifications.arn
}

resource "aws_ssm_parameter" "sqs_queue_url" {
  name  = "/${local.name}/sqs_queue_url"
  type  = "String"
  value = aws_sqs_queue.celery.url
}

resource "aws_ssm_parameter" "s3_assets_bucket" {
  name  = "/${local.name}/s3_assets_bucket"
  type  = "String"
  value = aws_s3_bucket.assets.id
}

resource "aws_ssm_parameter" "cloudfront_domain" {
  name  = "/${local.name}/cloudfront_domain"
  type  = "String"
  value = aws_cloudfront_distribution.frontend.domain_name
}

resource "aws_ssm_parameter" "stripe_secret" {
  name  = "/${local.name}/stripe_secret_key"
  type  = "SecureString"
  value = var.stripe_secret_key
}

resource "aws_ssm_parameter" "stripe_webhook" {
  name  = "/${local.name}/stripe_webhook_secret"
  type  = "SecureString"
  value = var.stripe_webhook_secret
}
