variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "sprintflow"
}

variable "ec2_key_name" {
  description = "Name of the EC2 key pair for SSH access"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "Your IP address for SSH access (e.g. 203.0.113.0/32)"
  type        = string
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "postgres"
}

variable "db_name" {
  description = "RDS database name"
  type        = string
  default     = "sprintflow"
}

variable "jwt_secret" {
  description = "JWT signing secret (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "ses_sender_email" {
  description = "Verified SES sender email address"
  type        = string
}

variable "stripe_secret_key" {
  description = "Stripe secret key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret"
  type        = string
  sensitive   = true
  default     = ""
}
