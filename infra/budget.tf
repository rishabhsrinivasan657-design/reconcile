# Cost alarms (M7 AC-4). The first two budgets in an account are free.

# 1. Real money: any charge after credits. On a Free-plan account this should never happen.
resource "aws_budgets_budget" "real_charges" {
  name         = "reconcile-real-charges"
  budget_type  = "COST"
  limit_amount = "1.0"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = true
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 1
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

# 2. Credit burn: usage before credits, so you know how fast the Free plan credits are going.
resource "aws_budgets_budget" "credit_burn" {
  name         = "reconcile-credit-burn"
  budget_type  = "COST"
  limit_amount = tostring(var.credit_burn_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
