# deploy.ps1 - Automated project sync for Windows to AWS EC2
param (
    [string]$KeyFile = "ai-lecture-notes-key.pem"
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

if (-not (Test-Path $KeyFile)) {
    $foundKey = Get-ChildItem -Filter "*.pem" | Select-Object -First 1
    if ($foundKey) {
        $KeyFile = $foundKey.Name
    } else {
        Write-Error "Private key ($KeyFile) not found! Ensure your key is in this directory."
    }
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
cd /var/www/lecturenotes
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

Write-Host "`n>>> Deployment Successful! <<<" -ForegroundColor Green
Write-Host "Visit your platform at: http://$publicIp`n" -ForegroundColor Cyan
