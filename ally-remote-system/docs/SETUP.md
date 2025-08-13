# Ally Remote Control System - Setup Guide

## Prerequisites

- Digital Ocean droplet (2GB RAM minimum)
- Node.js 18+ installed locally
- Git for cloning the repository

## Step-by-Step Setup

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd ally-remote-system
```

### 2. Digital Ocean Server Setup

#### Upload files to your droplet:
```bash
scp -r middleware-server/* user@YOUR_DROPLET_IP:/opt/ally-middleware/
```

#### SSH into your droplet and run:
```bash
ssh user@YOUR_DROPLET_IP
cd /opt/ally-middleware
chmod +x deploy.sh
./deploy.sh
```

#### Note your droplet IP for the next steps.

### 3. Configure Environment Variables

#### Update web dashboard:
Edit `web-dashboard/.env.local`:
```
NEXT_PUBLIC_SOCKET_URL=http://YOUR_DROPLET_IP:3001
```

#### Update desktop client:
Edit `desktop-client/index.js`:
```javascript
const SERVER_URL = 'http://YOUR_DROPLET_IP:3001';
```

### 4. Deploy Web Dashboard to Vercel

```bash
cd web-dashboard
npm install
```

#### Deploy to Vercel:
1. Push to GitHub
2. Connect to Vercel
3. Set environment variable: `NEXT_PUBLIC_SOCKET_URL=http://YOUR_DROPLET_IP:3001`
4. Deploy

### 5. Run Desktop Client

```bash
cd desktop-client
npm install
npm start
```

## Verification

1. **Server Status**: Check PM2 on your droplet: `pm2 status`
2. **Web Dashboard**: Visit your Vercel deployment
3. **Desktop Client**: Should show connection and token in console
4. **Integration**: Send a message from web dashboard to desktop client

## Troubleshooting

### Connection Issues
- Verify firewall allows port 3001
- Check Digital Ocean droplet IP is correct
- Ensure PM2 service is running

### CORS Errors
- Update `ALLOWED_ORIGINS` in server `.env` file
- Restart PM2: `pm2 restart ally-middleware`

### Desktop Client Not Connecting
- Verify server URL in `index.js`
- Check network connectivity to droplet
- Review console logs for errors

## Next Steps

1. **Integrate Your AI Model**: Replace `ExampleAIModel` in desktop client
2. **Add Authentication**: Implement API keys for production
3. **SSL Setup**: Configure HTTPS for production deployment
4. **Custom Commands**: Extend command handling in ally-client.js