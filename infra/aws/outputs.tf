# Nilai utk diisi ke .env produksi (lihat docs/DEPLOY.md).

output "cognito_issuer" {
  description = "COGNITO_ISSUER"
  value       = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "cognito_jwks_url" {
  description = "COGNITO_JWKS_URL"
  value       = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "COGNITO_CLIENT_ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_client_secret" {
  description = "COGNITO_CLIENT_SECRET (rahasia)"
  value       = aws_cognito_user_pool_client.web.client_secret
  sensitive   = true
}

output "cognito_hosted_ui_domain" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

output "aurora_endpoint" {
  description = "Host Aurora (writer). null bila enable_aurora=false."
  value       = var.enable_aurora ? aws_rds_cluster.main[0].endpoint : null
}

output "database_secret_arn" {
  description = "ARN Secrets Manager berisi DATABASE_URL lengkap. null bila enable_aurora=false."
  value       = var.enable_aurora ? aws_secretsmanager_secret.db[0].arn : null
}

output "aurora_security_group_id" {
  value = var.enable_aurora ? aws_security_group.aurora[0].id : null
}
