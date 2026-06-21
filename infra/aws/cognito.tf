# Amazon Cognito — login email (§11). User Pool tier Essentials, Hosted UI,
# Authorization Code + PKCE utk SPA Next.js (Auth.js).

resource "aws_cognito_user_pool" "main" {
  name = "${var.project}-users"

  # Sign-in via email + verifikasi email bawaan.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_uppercase = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # MFA opsional (TOTP gratis). Set "ON" utk wajib.
  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Tier Essentials (default) — free tier 10k MAU.
  user_pool_tier = "ESSENTIALS"
}

# Hosted UI domain (login/logout di-host AWS).
resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

# App client utk web SPA. Pakai client secret (Auth.js Cognito mendukung).
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = true

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = [
    "https://${var.domain}/api/auth/callback/cognito",
  ]
  logout_urls = [
    "https://${var.domain}",
  ]

  # Code + PKCE; refresh token 30 hari.
  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
  refresh_token_validity = 30
  access_token_validity  = 60
  id_token_validity      = 60
  token_validity_units {
    refresh_token = "days"
    access_token  = "minutes"
    id_token      = "minutes"
  }

  prevent_user_existence_errors = "ENABLED"
}
