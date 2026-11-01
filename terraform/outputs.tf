output "instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.app_server.id
}

output "public_ip" {
  description = "Public IP address of the deployed server"
  value       = aws_instance.app_server.public_ip
}

output "website_url" {
  description = "Direct URL to open the AI Lecture Notes web app"
  value       = "http://${aws_instance.app_server.public_ip}"
}

output "ssh_command" {
  description = "Command to SSH into your EC2 server"
  value       = "ssh -i \"C:/Users/harsh/terraform-keys/ec2-key.pem\" ubuntu@${aws_instance.app_server.public_ip}"
}

output "code_sync_hint" {
  description = "Command to sync local application code to the server"
  value       = "Windows PowerShell: .\\deploy.ps1  |  Linux/macOS: ./deploy.sh"
}

output "dynamodb_lecture_notes_table" {
  description = "DynamoDB table for complete lecture notes"
  value       = aws_dynamodb_table.lecture_notes.name
}

output "dynamodb_note_chunks_table" {
  description = "DynamoDB table for topic-level note chunks with timestamps"
  value       = aws_dynamodb_table.note_chunks.name
}

output "pdf_s3_bucket" {
  description = "Private S3 bucket storing generated PDF files"
  value       = aws_s3_bucket.pdf_store.bucket
}

output "aws_region" {
  description = "AWS region used by the deployment"
  value       = var.aws_region
}
