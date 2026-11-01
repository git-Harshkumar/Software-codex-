terraform {
  required_version = ">= 1.2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  pdf_bucket_name = var.pdf_bucket_name != "" ? var.pdf_bucket_name : "${var.project_name}-pdf-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "pdf_store" {
  bucket = local.pdf_bucket_name

  tags = {
    Name        = local.pdf_bucket_name
    Environment = "FreeTier"
    Project     = var.project_name
  }
}

resource "aws_s3_bucket_public_access_block" "pdf_store" {
  bucket                  = aws_s3_bucket.pdf_store.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pdf_store" {
  bucket = aws_s3_bucket.pdf_store.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "pdf_store" {
  bucket = aws_s3_bucket.pdf_store.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ─────────────────────────────────────────────────────────────
# Network: Utilize AWS Default VPC & Subnet (Completely Free)
# ─────────────────────────────────────────────────────────────
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ─────────────────────────────────────────────────────────────
# OS Image: Canonical Ubuntu 22.04 LTS (Jammy) Free Tier Eligible
# ─────────────────────────────────────────────────────────────
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical official owner ID

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─────────────────────────────────────────────────────────────
# SSH Key Pair: Auto-generated 4096-bit RSA key for secure login
# ─────────────────────────────────────────────────────────────
resource "tls_private_key" "ssh_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "deployer" {
  key_name   = "${var.project_name}-key"
  public_key = tls_private_key.ssh_key.public_key_openssh

  tags = {
    Name = "${var.project_name}-key"
  }
}

# Save the private key locally for SSH/SCP access
# Written outside OneDrive to avoid Windows "access denied" sync conflicts
resource "local_file" "private_key" {
  content         = tls_private_key.ssh_key.private_key_pem
  filename        = "C:/Users/harsh/terraform-keys/ec2-key.pem"
  file_permission = "0600"
}

# ─────────────────────────────────────────────────────────────
# Security Group: HTTP (80), HTTPS (443), and SSH (22)
# ─────────────────────────────────────────────────────────────
resource "aws_security_group" "app_sg" {
  name        = "${var.project_name}-sg"
  description = "Security Group for AI Lecture Notes web server"
  vpc_id      = data.aws_vpc.default.id

  # Inbound HTTP (port 80)
  ingress {
    description = "HTTP web traffic"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Inbound HTTPS (port 443)
  ingress {
    description = "HTTPS web traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Inbound SSH (port 22)
  ingress {
    description = "SSH administrative access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # Outbound: allow all traffic (updates, packages, Gemini API)
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-sg"
  }
}

# ─────────────────────────────────────────────────────────────
# AWS Database: DynamoDB Tables for Stored Notes & Topic Chunks
# (Serverless, PAY_PER_REQUEST, 100% Free Tier Permanent)
# ─────────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "lecture_notes" {
  name         = "${var.project_name}-lecture-notes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "note_id"

  attribute {
    name = "note_id"
    type = "S"
  }

  attribute {
    name = "video_id"
    type = "S"
  }

  global_secondary_index {
    name            = "VideoIndex"
    hash_key        = "video_id"
    projection_type = "ALL"
  }

  tags = {
    Name        = "${var.project_name}-lecture-notes"
    Environment = "FreeTier"
    Project     = var.project_name
  }
}

resource "aws_dynamodb_table" "note_chunks" {
  name         = "${var.project_name}-note-chunks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "chunk_id"

  attribute {
    name = "chunk_id"
    type = "S"
  }

  attribute {
    name = "video_id"
    type = "S"
  }

  global_secondary_index {
    name            = "VideoChunkIndex"
    hash_key        = "video_id"
    projection_type = "ALL"
  }

  tags = {
    Name        = "${var.project_name}-note-chunks"
    Environment = "FreeTier"
    Project     = var.project_name
  }
}

# ─────────────────────────────────────────────────────────────
# IAM Role & Instance Profile for Secure DynamoDB Access
# ─────────────────────────────────────────────────────────────
resource "aws_iam_role" "app_server_role" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ec2-role"
  }
}

resource "aws_iam_role_policy" "dynamodb_policy" {
  name = "${var.project_name}-dynamodb-policy"
  role = aws_iam_role.app_server_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:BatchGetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:DescribeTable"
        ]
        Resource = [
          aws_dynamodb_table.lecture_notes.arn,
          "${aws_dynamodb_table.lecture_notes.arn}/index/*",
          aws_dynamodb_table.note_chunks.arn,
          "${aws_dynamodb_table.note_chunks.arn}/index/*"
        ]
      }

      resource "aws_iam_role_policy" "pdf_s3_policy" {
        name = "${var.project_name}-pdf-s3-policy"
        role = aws_iam_role.app_server_role.id

        policy = jsonencode({
          Version = "2012-10-17"
          Statement = [
            {
              Effect = "Allow"
              Action = [
                "s3:PutObject",
                "s3:GetObject",
                "s3:HeadObject"
              ]
              Resource = "${aws_s3_bucket.pdf_store.arn}/pdf/*"
            },
            {
              Effect   = "Allow"
              Action   = "s3:ListBucket"
              Resource = aws_s3_bucket.pdf_store.arn
              Condition = {
                StringLike = {
                  "s3:prefix" = ["pdf/*"]
                }
              }
            }
          ]
        })
      }
    ]
  })
}

resource "aws_iam_instance_profile" "app_server_profile" {
  name = "${var.project_name}-instance-profile"
  role = aws_iam_role.app_server_role.name
}

# ─────────────────────────────────────────────────────────────
# EC2 Free Tier Instance: t3.micro + 20GB gp3 EBS + IAM Role
# ─────────────────────────────────────────────────────────────
resource "aws_instance" "app_server" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  key_name                    = aws_key_pair.deployer.key_name
  vpc_security_group_ids      = [aws_security_group.app_sg.id]
  subnet_id                   = data.aws_subnets.default.ids[0]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.app_server_profile.name

  # 20 GB gp3 volume (30 GB is AWS Free Tier limit)
  root_block_device {
    volume_size           = var.disk_size_gb
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
    tags = {
      Name = "${var.project_name}-disk"
    }
  }

  user_data = templatefile("${path.module}/userdata.sh", {
    gemini_api_key = var.gemini_api_key
    pdf_bucket_name = aws_s3_bucket.pdf_store.bucket
    aws_region      = var.aws_region
  })

  tags = {
    Name        = "${var.project_name}-server"
    Environment = "FreeTier"
    Project     = var.project_name
  }
}
