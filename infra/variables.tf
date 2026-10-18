variable "region" {
  description = "AWS region for the server (CloudFront and budgets are global)."
  type        = string
  default     = "us-east-1"
}

variable "alert_email" {
  description = "Where the budget alarms are emailed."
  type        = string
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be an email address."
  }
}

variable "instance_type" {
  description = "On the AWS Free plan's eligible list (t4g.small: ARM, 2 vCPU, 2 GB)."
  type        = string
  default     = "t4g.small"
}

variable "repo_url" {
  description = "Public Git repository the server builds from (ADR-0015)."
  type        = string
  default     = "https://github.com/rishabhsrinivasan657-design/reconcile.git"
}

variable "credit_burn_limit_usd" {
  description = "Monthly usage (before credits) that triggers the 'credits are being used fast' alert."
  type        = number
  default     = 25
}
