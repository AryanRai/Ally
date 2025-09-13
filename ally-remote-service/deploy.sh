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
echo "📋 IMPORTANT: Set up environment variables in Vercel dashboard:"
echo ""
echo "Go to your Vercel dashboard → Project Settings → Environment Variables"
echo "Add the following variables:"
echo ""
echo "🔑 NEXT_PUBLIC_SUPABASE_URL"
echo "   Value: your_supabase_project_url"
echo ""
echo "🔑 NEXT_PUBLIC_SUPABASE_ANON_KEY" 
echo "   Value: your_supabase_anon_key"
echo ""
echo "🔑 SUPABASE_SERVICE_ROLE_KEY"
echo "   Value: your_supabase_service_role_key"
echo ""
echo "🔑 LOCAL_SYSTEM_ID (optional)"
echo "   Value: ally-web-system"
echo ""
echo "🔑 LOCAL_SYSTEM_NAME (optional)"
echo "   Value: Ally Web System"
echo ""
echo "After adding environment variables, redeploy:"
echo "vercel --prod"
echo ""
echo "📋 Next steps:"
echo "1. Set up the environment variables above ☝️"
echo "2. Redeploy after setting environment variables"
echo "3. Update your local glass-pip-chat .env.local with the deployment URL"
echo "4. Configure Supabase authentication settings with your domain"
echo ""
echo "🔗 Your deployment URL will be shown above."
echo "📖 See REMOTE_INTEGRATION_GUIDE.md for detailed setup instructions."