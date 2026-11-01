# deploy.ps1 - Automated project sync for Windows to AWS EC2
param (
    # Key is stored outside OneDrive to avoid Windows sync/permission conflicts
    [string]$KeyFile = "C:\Users\harsh\terraform-keys\ec2-key.pem"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== [RecallAI / LectureNotes] Deployment Sync Script ===`n" -ForegroundColor Cyan

# 1. Read Terraform Output
if (-not (Test-Path "terraform.tfstate")) {
    Write-Error "terraform.tfstate not found! Please run 'terraform apply' first inside the terraform directory."
}

Write-Host "Fetching EC2 Public IP from Terraform..." -ForegroundColor Yellow
$publicIp = (terraform output -raw public_ip).Trim()
if (-not $publicIp) {
    Write-Error "Could not retrieve public IP from terraform output."
}
$pdfBucket = (terraform output -raw pdf_s3_bucket).Trim()
if (-not $pdfBucket) {
    Write-Error "Could not retrieve PDF S3 bucket from Terraform output."
}
$awsRegion = (terraform output -raw aws_region).Trim()
if (-not $awsRegion) {
    Write-Error "Could not retrieve AWS region from Terraform output."
}

if (-not (Test-Path $KeyFile)) {
    Write-Error "Private key not found at: $KeyFile`nRun 'terraform apply' first to generate the key."
}

Write-Host "Target EC2 Instance: ubuntu@$publicIp" -ForegroundColor Green
Write-Host "Using Key: $KeyFile" -ForegroundColor Green

# 2. Fix Windows File Permissions on KeyFile (Strictly restrict to current user)
Write-Host "Securing private key permissions for Windows OpenSSH..." -ForegroundColor Yellow
try {
    # Remove inheritance and strip all other users (BUILTIN\Users, Everyone)
    $keyPath = (Resolve-Path $KeyFile).Path
    $acl = Get-Acl -Path $keyPath
    $acl.SetAccessRuleProtection($true, $false)
    $user = [System.Security.Principal.NTAccount]$env:USERNAME
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule($user, "ReadAndExecute", "Allow")
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $keyPath -AclObject $acl

    # Extra fallback with icacls
    icacls.exe $KeyFile /reset | Out-Null
    icacls.exe $KeyFile /inheritance:r | Out-Null
    icacls.exe $KeyFile /grant:r "${env:USERNAME}:(R)" | Out-Null
    icacls.exe $KeyFile /remove "BUILTIN\Users" | Out-Null
    icacls.exe $KeyFile /remove "Everyone" | Out-Null
} catch {
    Write-Warning "Could not update ACL automatically: $_"
}

# 3. Locate Tools (ssh, scp, tar)
function Find-Tool ($name, $paths) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

$tarCmd = Find-Tool "tar" @(
    "$env:SystemRoot\System32\tar.exe",
    "C:\Program Files\Git\usr\bin\tar.exe"
)

$scpCmd = Find-Tool "scp" @(
    "$env:SystemRoot\System32\OpenSSH\scp.exe",
    "C:\Program Files\OpenSSH\bin\scp.exe",
    "C:\Program Files\Git\usr\bin\scp.exe"
)

$sshCmd = Find-Tool "ssh" @(
    "$env:SystemRoot\System32\OpenSSH\ssh.exe",
    "C:\Program Files\OpenSSH\bin\ssh.exe",
    "C:\Program Files\Git\usr\bin\ssh.exe"
)

if (-not $tarCmd) {
    Write-Error "tar was not found. Please ensure Windows 10/11 native tar or Git is available."
}

if (-not $scpCmd -or -not $sshCmd) {
    Write-Host "`nWARNING: OpenSSH Client (ssh / scp) is not installed." -ForegroundColor Yellow
    Write-Host "Please run: winget install Microsoft.OpenSSH.Beta" -ForegroundColor White
    exit 1
}

# 4. Package Code
$archivePath = "$env:TEMP\lecture_notes_project.tar.gz"
if (Test-Path $archivePath) { Remove-Item -Force $archivePath }

Write-Host "Compressing project files..." -ForegroundColor Yellow
$projectRoot = (Resolve-Path "..").Path

$tarArgs = @(
    "-czf", $archivePath,
    "--exclude=terraform",
    "--exclude=.git",
    "--exclude=venv",
    "--exclude=.venv",
    "--exclude=videos",
    "--exclude=frames",
    "--exclude=*.pem",
    "--exclude=__pycache__",
    "-C", $projectRoot,
    "."
)

& $tarCmd $tarArgs

Write-Host "Archive created at: $archivePath" -ForegroundColor Green

# 5. Upload archive to EC2
Write-Host "Uploading project to EC2..." -ForegroundColor Yellow
& $scpCmd -o StrictHostKeyChecking=no -i $KeyFile $archivePath "ubuntu@${publicIp}:/tmp/project.tar.gz"
if ($LASTEXITCODE -ne 0) {
    Write-Error "SCP upload failed! Check SSH permissions on your key file."
}

# 6. Extract, install dependencies, and restart service
Write-Host "Extracting and restarting service on EC2..." -ForegroundColor Yellow
$remoteScript = @'
set -e
sudo tar -xzf /tmp/project.tar.gz -C /var/www/lecturenotes/
rm -f /tmp/project.tar.gz
sudo chown -R ubuntu:ubuntu /var/www/lecturenotes/
if ! command -v google-chrome >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y wget
    wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/google-chrome.deb
    sudo dpkg -i /tmp/google-chrome.deb || sudo apt-get install -f -y
    rm -f /tmp/google-chrome.deb
fi
cd /var/www/lecturenotes
./venv/bin/pip install boto3
if [ -f requirements.txt ]; then
    ./venv/bin/pip install -r requirements.txt
fi
sudo systemctl restart lecturenotes
sudo systemctl restart nginx
echo "SUCCESS: Lecture Notes Platform is up to date and running!"
'@

& $sshCmd -o StrictHostKeyChecking=no -i $KeyFile "ubuntu@$publicIp" "bash -c '$remoteScript'"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Remote service restart failed!"
}

$envScript = "grep -q '^S3_NOTES_BUCKET=' /var/www/lecturenotes/.env && sudo sed -i 's|^S3_NOTES_BUCKET=.*|S3_NOTES_BUCKET=$pdfBucket|' /var/www/lecturenotes/.env || echo 'S3_NOTES_BUCKET=$pdfBucket' | sudo tee -a /var/www/lecturenotes/.env >/dev/null; grep -q '^AWS_REGION=' /var/www/lecturenotes/.env && sudo sed -i 's|^AWS_REGION=.*|AWS_REGION=$awsRegion|' /var/www/lecturenotes/.env || echo 'AWS_REGION=$awsRegion' | sudo tee -a /var/www/lecturenotes/.env >/dev/null; sudo systemctl restart lecturenotes"
& $sshCmd -o StrictHostKeyChecking=no -i $KeyFile "ubuntu@$publicIp" $envScript
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to configure the PDF S3 bucket on the server."
}

Write-Host "`n>>> Deployment Successful! <<<" -ForegroundColor Green
Write-Host "Visit your platform at: http://$publicIp`n" -ForegroundColor Cyan
