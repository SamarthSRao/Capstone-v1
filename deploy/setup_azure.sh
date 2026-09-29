#!/usr/bin/env bash
# ==============================================================================
# Microsoft Azure Automated Cloud Deployment Script
# Capstone: Uncertainty-Aware Cloud Autoscaling Platform (HybridTimeNet)
# ==============================================================================

set -e

echo "===================================================================="
echo " Starting Microsoft Azure Cloud Deployment for Intelligent Autoscaler"
echo "===================================================================="

# 1. Update and install basic dependencies
echo "[1/6] Updating system packages and installing prerequisites..."
sudo apt-get update -y
sudo apt-get install -y curl git ufw jq ca-certificates apt-transport-https gnupg lsb-release

# 2. Install Docker Engine & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
    echo "[2/6] Installing Docker Engine..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker
    sudo usermod -aG docker "$USER" || true
else
    echo "[2/6] Docker is already installed."
fi

# 3. Configure Local Firewall (UFW)
echo "[3/6] Configuring local UFW firewall rules..."
sudo ufw allow 22/tcp comment 'SSH' || true
sudo ufw allow 8090/tcp comment 'Open-Source E-Commerce Website' || true
sudo ufw allow 3000/tcp comment 'Autoscaler Dashboard' || true
sudo ufw allow 8082/tcp comment 'Orchestrator API' || true
sudo ufw allow 8080/tcp comment 'NexusGear API' || true
sudo ufw allow 8083/tcp comment 'Simulator API' || true
sudo ufw --force enable || true

# 4. Navigate to application root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

# 5. Build and launch all production containers
echo "[4/6] Building and starting all production containers..."
if [ -f "docker-compose.prod.yml" ]; then
    sudo docker compose -f docker-compose.prod.yml up -d --build
else
    sudo docker compose up -d --build
fi

# 6. Health check verification
echo "[5/6] Waiting for services to become healthy..."
sleep 15

# Detect Public IP
PUBLIC_IP=$(curl -s -m 5 ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo "===================================================================="
echo " 🎉 DEPLOYMENT SUCCESSFUL! YOUR SYSTEM IS LIVE ON AZURE!"
echo "===================================================================="
echo ""
echo "  🛒 Live Storefront / App:        http://${PUBLIC_IP}:8090"
echo "  📊 Autoscaler Telemetry UI:      http://${PUBLIC_IP}:3000"
echo "  ⚙️ Orchestrator Scaling API:     http://${PUBLIC_IP}:8082"
echo "  📦 Backend API (NexusGear):      http://${PUBLIC_IP}:8080"
echo "  🕹️ Simulator API:                http://${PUBLIC_IP}:8083"
echo ""
echo "--------------------------------------------------------------------"
echo "  Active Containers:"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "===================================================================="
echo " IMPORTANT: Ensure your Azure Network Security Group (NSG) allows inbound"
echo " traffic on ports 8090, 3000, 8082, 8080, and 22."
echo "===================================================================="
