# Generated secrets, stored encrypted in the parameter store (M7 AC-9). They also sit in Terraform's
# local state file, which is why that file is ignored by Git.
locals {
  secrets = {
    DB_OWNER_PASSWORD  = 32
    APP_DB_PASSWORD    = 32
    DEMO_PASSWORD      = 20
    DEMO_COOKIE_SECRET = 48
    ORIGIN_SECRET      = 40
  }
}

resource "random_password" "secret" {
  for_each = local.secrets
  length   = each.value
  # Letters and digits only: safe inside URLs, headers, and .env files.
  special = false
}

resource "aws_ssm_parameter" "secret" {
  for_each = local.secrets
  name     = "/reconcile/${each.key}"
  type     = "SecureString"
  value    = random_password.secret[each.key].result
}
