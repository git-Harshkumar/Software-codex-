variable "aws_region" {
  description = "AWS region to deploy resources in"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name prefix for AWS resources"
  type        = string
  default     = "ai-lecture-notes"
}

variable "instance_type" {
  description = "EC2 instance type (t3.micro is the designated Free Tier eligible instance in modern AWS accounts)"
  type        = string
  default     = "t3.micro"
}

variable "disk_size_gb" {
  description = "Root EBS storage in GB (AWS Free Tier provides up to 30 GB)"
  type        = number
  default     = 20
}

variable "allowed_ssh_cidr" {
  description = "CIDR block permitted to connect via SSH (set to your IP, e.g. 203.0.113.50/32 for security)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "gemini_api_key" {
  description = "Google Gemini API Key to pre-configure on the server (leave blank to configure manually later)"
  type        = string
  default     = ""
  sensitive   = true
}
