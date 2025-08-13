# Deployment Guide

## Digital Ocean Droplet Setup

### 1. Create Droplet
- **Size**: 2GB RAM minimum
- **OS**: Ubuntu 20.04 LTS
- **Region**: Choose closest to your users

### 2. Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Setup firewall
sudo ufw allow ssh
sudo ufw allow 3001
sudo ufw --force enable
```

### 3. Deploy Application

```bash
# Create directory
sudo mkdir -p /opt/ally-middleware
sudo chown $USER:$USER /opt/ally-middleware

# Upload files (from local machine)
scp -r middleware-server/* user@YOUR_DROPLET_IP:/opt/ally-middleware/

# Install and start
cd /opt/ally-middleware
npm install
pm2 start server.js --name ally-middleware
pm2 save
pm2 startup
```

## Vercel Deployment

### 1. Prepare Repository
```bash
cd web-dashboard
npm install
npm run build  # Test build locally
```

### 2. Deploy to Vercel
1. Push to GitHub repository
2. Connect repository to Vercel
3. Set environment variables:
   - `NEXT_PUBLIC_SOCKET_URL=http://YOUR_DROPLET_IP:3001`
4. Deploy

### 3. Custom Domain (Optional)
1. Add domain in Vercel dashboard
2. Update DNS records
3. Update `ALLOWED_ORIGINS` in server config

## Production Considerations

### Security
- Use HTTPS/WSS in production
- Implement API authentication
- Set up proper CORS origins
- Regular security updates

### Monitoring
```bash
# PM2 monitoring
pm2 monit
pm2 logs ally-middleware

# System monitoring
htop
df -h
free -m
```

### Backup Strategy
- Regular database backups (if using)
- Code repository backups
- Server configuration backups

### SSL/TLS Setup (Recommended)

#### Using Let's Encrypt with Nginx:
```bash
# Install Nginx
sudo apt install nginx

# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Configure Nginx proxy
sudo nano /etc/nginx/sites-available/ally-middleware
```

#### Nginx Configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Scaling Considerations

### Horizontal Scaling
- Use PM2 cluster mode
- Load balancer for multiple droplets
- Redis for session storage

### Vertical Scaling
- Monitor resource usage
- Upgrade droplet size as needed
- Optimize application performance

## Maintenance

### Regular Tasks
- Update dependencies: `npm audit fix`
- System updates: `sudo apt update && sudo apt upgrade`
- PM2 updates: `pm2 update`
- SSL certificate renewal: `sudo certbot renew`

### Monitoring Commands
```bash
# Check server status
pm2 status
pm2 logs --lines 50

# System resources
htop
iostat
netstat -tulpn | grep :3001
```