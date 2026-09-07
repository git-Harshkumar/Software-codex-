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

# Save the private key locally for SSH/SCP access (kept safe in .gitignore)
resource "local_file" "private_key" {
  content         = tls_private_key.ssh_key.private_key_pem
  filename        = "${path.module}/${var.project_name}-key.pem"
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
# EC2 Free Tier Instance: t2.micro + 20GB gp3 EBS
# ─────────────────────────────────────────────────────────────
resource "aws_instance" "app_server" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  key_name                    = aws_key_pair.deployer.key_name
  vpc_security_group_ids      = [aws_security_group.app_sg.id]
  subnet_id                   = data.aws_subnets.default.ids[0]
  associate_public_ip_address = true

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
  })

  tags = {
    Name        = "${var.project_name}-server"
    Environment = "FreeTier"
    Project     = var.project_name
  }
}
