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
  value       = "ssh -i \"${var.project_name}-key.pem\" ubuntu@${aws_instance.app_server.public_ip}"
}

output "code_sync_hint" {
  description = "Command to sync local application code to the server"
  value       = "Windows PowerShell: .\\deploy.ps1  |  Linux/macOS: ./deploy.sh"
}
