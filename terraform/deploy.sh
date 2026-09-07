#!/usr/bin/env bash
set -e

KEY_FILE="${1:-ai-lecture-notes-key.pem}"

echo -e "\n\033[36m🚀 [RecallAI / LectureNotes] Deployment Sync Script\033[0m\n"

if [ ! -f "terraform.tfstate" ]; then
    echo -e "\033[31mError: terraform.tfstate not found! Please run 'terraform apply' first.\033[0m"
    exit 1
fi

PUBLIC_IP=$(terraform output -raw public_ip)
if [ -z "$PUBLIC_IP" ]; then
    echo -e "\033[31mError: Could not retrieve public IP from terraform output.\033[0m"
    exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
    KEY_FILE=$(ls *.pem 2>/dev/null | head -n 1)
    if [ -z "$KEY_FILE" ]; then
        echo -e "\033[31mError: Private key not found!\033[0m"
        exit 1
    fi
fi

chmod 600 "$KEY_FILE"
echo -e "\033[32mTarget EC2 Instance: ubuntu@${PUBLIC_IP}\033[0m"
echo -e "\033[32mUsing Key: ${KEY_FILE}\033[0m"

ARCHIVE_PATH="/tmp/lecture_notes_project.tar.gz"
rm -f "$ARCHIVE_PATH"

echo -e "\n\033[33m📦 Compressing project files...\033[0m"
tar -czf "$ARCHIVE_PATH" \
    --exclude="terraform" \
    --exclude=".git" \
    --exclude="venv" \
    --exclude=".venv" \
    --exclude="videos" \
    --exclude="frames" \
    --exclude="*.pem" \
    --exclude="__pycache__" \
    -C ".." .

echo -e "\n\033[33m📤 Uploading project to EC2...\033[0m"
scp -o StrictHostKeyChecking=no -i "$KEY_FILE" "$ARCHIVE_PATH" "ubuntu@${PUBLIC_IP}:/tmp/project.tar.gz"

echo -e "\n\033[33m⚙️ Extracting and restarting service on EC2...\033[0m"
ssh -o StrictHostKeyChecking=no -i "$KEY_FILE" "ubuntu@${PUBLIC_IP}" 'bash -s' << 'EOF'
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
EOF

echo -e "\n\033[32m🎉 Deployment Successful!\033[0m"
echo -e "\033[36m🌐 Visit your platform at: http://${PUBLIC_IP}\033[0m\n"
