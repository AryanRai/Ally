#!/bin/bash

# Ally Remote Service Deployment Script
# This script helps deploy the Ally Remote Service to Vercel

set -e

echo "🚀 Deploying Ally Remote Service to Vercel..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the ally-remote-service directory."
    exit 1
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run type check
echo "🔍 Running type check..."
npm run type-check

# Run build to check for errors
echo "🏗️  Building project..."
npm run build

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Set up environment variables in Vercel dashboard:"
echo "   - NEXT_PUBLIC_SUPABASE_URL"
echo "   - NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo "   - LOCAL_SYSTEM_ID"
echo "   - LOCAL_SYSTEM_NAME"
echo ""
echo "2. Update your local glass-pip-chat .env.local with the deployment URL"
echo "3. Configure Supabase authentication settings with your domain"
echo ""
echo "🔗 Your deployment URL will be shown above."
echo "📖 See REMOTE_INTEGRATION_GUIDE.md for detailed setup instructions."