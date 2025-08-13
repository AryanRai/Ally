# Ally Remote Control System

A complete system for remotely controlling and monitoring your AI agent (Ally) through a web interface using Digital Ocean as middleware.

## 🏗️ Architecture

```
Web App (Vercel) ←→ Digital Ocean Server ←→ Local Ally (Desktop)
```

## 📁 Project Structure

```
ally-remote-system/
├── web-dashboard/          # Next.js web app (deploy to Vercel)
├── middleware-server/      # Digital Ocean server
├── desktop-client/         # Local Ally integration
└── docs/                  # Documentation
```

## 🚀 Quick Start

### 1. Clone Repository
```bash
git clone <your-repo-url>
cd ally-remote-system
```

### 2. Deploy Digital Ocean Server
```bash
cd middleware-server
# Upload to your droplet and run:
chmod +x deploy.sh && ./deploy.sh
```

### 3. Configure Environment
Update `web-dashboard/.env.local` with your droplet IP:
```
NEXT_PUBLIC_SOCKET_URL=http://YOUR_DROPLET_IP:3001
```

### 4. Deploy Web Dashboard
```bash
cd web-dashboard
npm install
# Deploy to Vercel or run locally:
npm run dev
```

### 5. Run Desktop Client
```bash
cd desktop-client
npm install
# Update SERVER_URL in index.js with your droplet IP
npm start
```

## 🔧 Configuration

- **Server URL**: Update in multiple files with your Digital Ocean droplet IP
- **Domain**: Configure for aryanrai.me deployment
- **AI Model**: Integrate your actual AI model in desktop-client

## 📚 Documentation

See `docs/` folder for detailed setup and deployment guides.

## 🔒 Security

- Unique token system for Ally authentication
- CORS protection
- Firewall configuration included
- Production security recommendations in docs

## 🛠️ Tech Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS, Socket.IO
- **Backend**: Node.js, Express, Socket.IO
- **Deployment**: Digital Ocean, Vercel
- **Process Management**: PM2