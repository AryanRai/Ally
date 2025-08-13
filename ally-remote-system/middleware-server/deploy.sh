#!/bin/bash

# Digital Ocean Deployment Script for Ally Middleware Server
# Run this on your Digital Ocean droplet

echo "Setting up Ally Middleware Server on Digital Ocean..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (if not already installed)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install PM2 for process management
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Create app directory
sudo mkdir -p /opt/ally-middleware
sudo chown $USER:$USER /opt/ally-middleware
cd /opt/ally-middleware

# Copy files (you'll need to upload these to your droplet)
# scp -r middleware-server/* user@your-droplet-ip:/opt/ally-middleware/

# Install dependencies
npm install

# Create environment file
cat > .env << EOF
PORT=3001
ALLOWED_ORIGINS=https://aryanrai.me,http://localhost:3000
EOF

# Set up PM2 ecosystem
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'ally-middleware',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Set up firewall
sudo ufw allow 3001
sudo ufw allow ssh
sudo ufw --force enable

# Set up nginx reverse proxy (optional)
if command -v nginx &> /dev/null; then
    echo "Setting up nginx reverse proxy..."
    
    sudo tee /etc/nginx/sites-available/ally-middleware << EOF
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
    
    sudo ln -s /etc/nginx/sites-available/ally-middleware /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
fi

echo "Ally Middleware Server deployed successfully!"
echo "Server running on port 3001"
echo "Use PM2 commands to manage: pm2 status, pm2 logs, pm2 restart ally-middleware"