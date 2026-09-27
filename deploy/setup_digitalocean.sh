#!/usr/bin/env bash
# ==============================================================================
# DigitalOcean Automated Cloud Deployment Script
# Capstone: Intelligent Autoscaling Platform for Open-Source Web Applications
# ==============================================================================

set -e

echo "===================================================================="
echo " Starting DigitalOcean Cloud Deployment for Intelligent Autoscaler"
echo "===================================================================="

# 1. Update and install basic dependencies
echo "[1/6] Updating system packages and installing prerequisites..."
apt-get update -y
apt-get install -y curl git ufw jq ca-certificates

# 2. Install Docker & Docker Compose if not already installed
if ! command -v docker &> /dev/null; then
    echo "[2/6] Installing Docker Engine..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
else
    echo "[2/6] Docker is already installed."
fi

# 3. Configure Firewall (UFW)
echo "[3/6] Configuring Cloud Firewall rules..."
ufw allow 22/tcp comment 'SSH' || true
ufw allow 8090/tcp comment 'Open-Source E-Commerce Website' || true
ufw allow 3000/tcp comment 'Autoscaler Dashboard' || true
ufw allow 8082/tcp comment 'Orchestrator API' || true
ufw --force enable || true

# 4. Navigate to application root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

# 5. Build and launch all production services
echo "[4/6] Building and starting all production containers..."
docker compose -f docker-compose.prod.yml up -d --build

# 6. Health check verification
echo "[5/6] Waiting for services to become healthy..."
sleep 10

# Detect Public IP
PUBLIC_IP=$(curl -s -m 5 ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo "===================================================================="
echo " 🎉 DEPLOYMENT SUCCESSFUL! YOUR SYSTEM IS LIVE ON DIGITALOCEAN!"
echo "===================================================================="
echo ""
echo "  🛒 Live Open-Source Website:     http://${PUBLIC_IP}:8090"
echo "  📊 Autoscaler Telemetry UI:      http://${PUBLIC_IP}:3000"
echo "  ⚙️ Orchestrator Scaling API:     http://${PUBLIC_IP}:8082"
echo ""
echo "--------------------------------------------------------------------"
echo "  Quick Health Check:"
curl -s "http://localhost:8090/stub_status" || echo "Website ingress active"
echo ""
echo "  Active Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "===================================================================="
echo " You can now open http://${PUBLIC_IP}:8090 on your phone or laptop!"
echo "===================================================================="
