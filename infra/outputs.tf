output "ec2_public_ip" {
  description = "EC2 instance public IP — use this as VITE_API_BASE_URL"
  value       = aws_instance.app.public_ip
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain — this is your app URL"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.postgres.address
  sensitive   = true
}

output "frontend_bucket" {
  description = "S3 frontend bucket name — used by GitHub Actions for deploy"
  value       = aws_s3_bucket.frontend.id
}

output "assets_bucket" {
  description = "S3 assets bucket name"
  value       = aws_s3_bucket.assets.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — used for cache invalidation"
  value       = aws_cloudfront_distribution.frontend.id
}

output "sns_topic_arn" {
  description = "SNS topic ARN for email notifications"
  value       = aws_sns_topic.email_notifications.arn
}

output "sqs_queue_url" {
  description = "SQS queue URL for Celery broker"
  value       = aws_sqs_queue.celery.url
}

output "ssh_command" {
  description = "SSH command to connect to EC2"
  value       = "ssh -i ~/.ssh/${var.ec2_key_name}.pem ubuntu@${aws_instance.app.public_ip}"
}
