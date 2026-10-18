output "url" {
  description = "The live site."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "instance_id" {
  description = "For Session Manager: aws ssm start-session --target <id>"
  value       = aws_instance.server.id
}

output "region" {
  value = var.region
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "demo_password_parameter" {
  description = "Read it with: aws ssm get-parameter --with-decryption --name <this>"
  value       = aws_ssm_parameter.secret["DEMO_PASSWORD"].name
}
