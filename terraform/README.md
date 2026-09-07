# 🚀 AWS Free Tier Deployment Guide (Terraform)

Deploy the **AI Lecture Notes & RecallAI Web Platform** on AWS for **100% FREE ($0.00)** using Terraform and EC2 Free Tier resources.

---

## 💰 AWS Free Tier Architecture & Guarantee

This Terraform configuration is designed from the ground up to **strictly stay inside AWS Free Tier limits**:

| Resource | Free Tier Limit | Configured In This Project | Cost |
| :--- | :--- | :--- | :--- |
| **EC2 Compute** | 750 hrs/month | 1x `t2.micro` (1 vCPU, 1 GB RAM) | **$0.00** |
| **EBS Storage** | 30 GB gp2/gp3 | 20 GB gp3 root volume | **$0.00** |
| **Public IPv4** | 750 hrs/month free with EC2 | Standard auto-assigned IPv4 | **$0.00** |
| **Networking** | Default VPC & Subnets | Default AWS VPC & Security Group | **$0.00** |
| **Load Balancers** | None (ALBs cost ~$16-20/mo) | Nginx Reverse Proxy on EC2 (Port 80) | **$0.00** |
| **Swap Space** | Linux OS level | 2 GB swapfile (prevents RAM bottleneck) | **$0.00** |

> [!TIP]
> `t2.micro` has 1GB RAM. The bootstrap script automatically configures **2 GB swap space** on the SSD so that video processing with `ffmpeg`, PDF generation, and Python package installations will never trigger Out-Of-Memory (OOM) errors.

---

## 📋 Prerequisites

1. **AWS Account**: An active AWS account ([Create one here](https://aws.amazon.com/free/)).
2. **AWS CLI**: Installed and configured with your credentials:
   ```bash
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, and default region (e.g. us-east-1)
   ```
3. **Terraform CLI**: Installed ([Download Terraform](https://developer.hashicorp.com/terraform/install)). Verify with:
   ```bash
   terraform -version
   ```

---

## ⚡ Quick Start: 3 Steps to Deploy

### Step 1: Configure Variables

Open PowerShell or your terminal and navigate to the `terraform/` folder:

```powershell
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` (e.g. using Notepad or VS Code) to set your Gemini API key and region:

```hcl
aws_region     = "us-east-1"
project_name   = "ai-lecture-notes"
instance_type  = "t2.micro"
disk_size_gb   = 20
gemini_api_key = "AIzaSy..."   # Optional: your Gemini API key
```

### Step 2: Initialize & Provision with Terraform

Run Terraform commands:

```bash
terraform init
terraform apply
```

Type `yes` when prompted. Terraform will:
1. Generate an RSA 4096-bit SSH key pair and save `ai-lecture-notes-key.pem` in this folder.
2. Create an AWS Security Group allowing HTTP (Port 80) and SSH (Port 22).
3. Launch the `t2.micro` EC2 Ubuntu 22.04 LTS instance with 20 GB gp3 volume.
4. Run the automated bootstrap script (installs Python, ffmpeg, Gunicorn, and Nginx).

At the end of `terraform apply`, you will see outputs like:

```text
public_ip   = "54.226.14.89"
website_url = "http://54.226.14.89"
ssh_command = "ssh -i \"ai-lecture-notes-key.pem\" ubuntu@54.226.14.89"
```

### Step 3: Sync Local Application Code to EC2

The EC2 instance is now ready! Run the automated deployment script to package and push your project code:

- **On Windows (PowerShell)**:
  ```powershell
  .\deploy.ps1
  ```

- **On macOS / Linux**:
  ```bash
  chmod +x deploy.sh
  ./deploy.sh
  ```

This script compresses your code (excluding local `venv`, raw `.git`, and large videos), uploads it to `/var/www/lecturenotes/`, installs Python requirements, and restarts the Gunicorn service.

**Open `http://<YOUR_EC2_PUBLIC_IP>` in your browser to view your live AI Lecture Notes platform!**

---

## 🛠️ Management & Useful Commands

### 1. Connect to EC2 via SSH
```bash
# On Windows PowerShell or Linux
ssh -i ai-lecture-notes-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

> [!NOTE]
> On Windows, if SSH complains about key permissions, run in PowerShell:
> ```powershell
> icacls ai-lecture-notes-key.pem /inheritance:r
> icacls ai-lecture-notes-key.pem /grant:r "$($env:USERNAME):(R)"
> ```

### 2. View Live Application Logs
```bash
# SSH into the server, then:
sudo journalctl -u lecturenotes -f
```

### 3. Restart Application Service
```bash
sudo systemctl restart lecturenotes
```

### 4. Check Nginx Web Server
```bash
sudo systemctl status nginx
```

### 5. Update or Add Gemini API Key Later
If you didn't add your API key in `terraform.tfvars`, edit it directly on the server:
```bash
nano /var/www/lecturenotes/.env
# Add: GEMINI_API_KEY=your_key_here
sudo systemctl restart lecturenotes
```

---

## 🧩 Connecting the Chrome Extension

If you want the RecallAI Chrome Extension to send requests to your cloud AWS server instead of `localhost:5000`:
1. In `extension/background.js` or `extension/sidepanel.js`, replace:
   ```javascript
   const BACKEND_URL = "http://localhost:5000";
   ```
   with:
   ```javascript
   const BACKEND_URL = "http://<YOUR_EC2_PUBLIC_IP>";
   ```
2. Reload the extension in `chrome://extensions`.

---

## 🛑 Teardown: How to Destroy and Prevent Any Charges

When you are done testing or want to shut down the server:

```bash
cd terraform
terraform destroy
```

Type `yes` when prompted. Terraform will cleanly delete the EC2 instance, EBS volume, Security Group, and Key Pair from AWS, ensuring **no lingering resources and zero charges**.
