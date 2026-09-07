#!/bin/bash
set -euxo pipefail

# ─────────────────────────────────────────────────────────────
# 1. Configure 2GB Swap (Essential for t2.micro 1GB RAM)
# ─────────────────────────────────────────────────────────────
if [ ! -f /swapfile ]; then
    echo "Configuring 2GB swap space..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ─────────────────────────────────────────────────────────────
# 2. System update & package installations
# ─────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    git \
    nginx \
    curl \
    rsync \
    unzip

# ─────────────────────────────────────────────────────────────
# 3. Setup Project Directory & Permissions
# ─────────────────────────────────────────────────────────────
APP_DIR="/var/www/lecturenotes"
mkdir -p "$APP_DIR"
chown -R ubuntu:ubuntu "$APP_DIR"

# Setup Python Virtual Environment
sudo -u ubuntu python3 -m venv "$APP_DIR/venv"
sudo -u ubuntu "$APP_DIR/venv/bin/pip" install --upgrade pip setuptools wheel
sudo -u ubuntu "$APP_DIR/venv/bin/pip" install gunicorn flask markdown google-genai reportlab Pillow ffmpeg-python python-dotenv

# ─────────────────────────────────────────────────────────────
# 4. Create .env file
# ─────────────────────────────────────────────────────────────
cat <<EOF > "$APP_DIR/.env"
GEMINI_API_KEY=${gemini_api_key}
EOF
chown ubuntu:ubuntu "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# ─────────────────────────────────────────────────────────────
# 5. Create Standby Application (if code not yet synced)
# ─────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/app.py" ]; then
cat <<'EOF' > "$APP_DIR/app.py"
from flask import Flask
app = Flask(__name__)

@app.route('/')
def index():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>AI Lecture Notes Server</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 550px; text-align: center; border: 1px solid #334155; }
            h1 { color: #38bdf8; margin-top: 0; }
            p { color: #94a3b8; line-height: 1.6; }
            code { background: #0f172a; color: #a78bfa; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.9em; }
            .badge { display: inline-block; background: #166534; color: #4ade80; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem; }
        </style>
    </head>
    <body>
        <div class="card">
            <span class="badge">AWS Free Tier EC2 Active</span>
            <h1>Server Initialized</h1>
            <p>Your EC2 instance with Nginx and Gunicorn is up and running!</p>
            <p>To sync your AI Lecture Notes application code, run the deployment script from your local machine:</p>
            <p><code>./deploy.ps1</code> (Windows) or <code>./deploy.sh</code> (Mac/Linux)</p>
        </div>
    </body>
    </html>
    """

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
EOF
chown ubuntu:ubuntu "$APP_DIR/app.py"
fi

# ─────────────────────────────────────────────────────────────
# 6. Configure Systemd Service for Gunicorn
# ─────────────────────────────────────────────────────────────
cat <<EOF > /etc/systemd/system/lecturenotes.service
[Unit]
Description=AI Lecture Notes Gunicorn Application
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=-$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/gunicorn --bind 127.0.0.1:5000 --workers 2 --timeout 300 app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable lecturenotes
systemctl restart lecturenotes

# ─────────────────────────────────────────────────────────────
# 7. Configure Nginx Reverse Proxy
# ─────────────────────────────────────────────────────────────
cat <<'EOF' > /etc/nginx/sites-available/lecturenotes
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 150M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/lecturenotes /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

echo "Bootstrap complete! Service running on port 80."
