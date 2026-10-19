# One small server running the Compose stack (ADR-0015, M7 design §2).

# Ubuntu 24.04 LTS for ARM, from Canonical's public parameter (always the current image).
data "aws_ssm_parameter" "ubuntu_arm64" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
}

# The default network AWS creates in every account: public subnets, no NAT gateway to pay for.
data "aws_vpc" "default" {
  default = true
}

# CloudFront's published address range: the only allowed way in.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "server" {
  name        = "reconcile-server"
  description = "Reconcile: HTTP from CloudFront only; no SSH"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "HTTP from CloudFront"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    description = "Updates, GitHub, Docker images, AWS APIs"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# The server's own permissions: Session Manager (no SSH) and reading its generated secrets.
resource "aws_iam_role" "server" {
  name = "reconcile-server"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_caller_identity" "me" {}

resource "aws_iam_role_policy" "read_secrets" {
  name = "read-reconcile-parameters"
  role = aws_iam_role.server.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParametersByPath", "ssm:GetParameter"]
      Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.me.account_id}:parameter/reconcile/*"
    }]
  })
}

resource "aws_iam_instance_profile" "server" {
  name = "reconcile-server"
  role = aws_iam_role.server.name
}

resource "aws_instance" "server" {
  ami                         = data.aws_ssm_parameter.ubuntu_arm64.value
  instance_type               = var.instance_type
  vpc_security_group_ids      = [aws_security_group.server.id]
  iam_instance_profile        = aws_iam_instance_profile.server.name
  associate_public_ip_address = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
    # Default tags don't reach the disk; tag it so the leftovers check can find it.
    tags = { Project = "reconcile", Name = "reconcile" }
  }

  # Instance metadata only with session tokens (IMDSv2).
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    region   = var.region
    repo_url = var.repo_url
  })

  # Keep the server (and its database) when only the setup script changes; redeploys go through
  # update.sh instead.
  lifecycle {
    ignore_changes = [ami, user_data]
  }

  tags = { Name = "reconcile" }

  depends_on = [aws_ssm_parameter.secret]
}
