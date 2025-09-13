#!/bin/bash

# Glass-Pip-Chat Remote Setup Script
# This script helps configure the local Ally system for remote control

set -e

echo "🔧 Setting up Glass-Pip-Chat for remote control..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the glass-pip-chat directory."
    exit 1
fi

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    echo "📝 Creating .env.local from template..."
    cp .env.example .env.local
    echo "✅ Created .env.local - please update it with your Supabase credentials"
else
    echo "📝 .env.local already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run type check
echo "🔍 Running type check..."
npm run type-check || echo "⚠️  Type check failed - please fix any TypeScript errors"

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update .env.local with your Supabase credentials:"
echo "   - VITE_SUPABASE_URL"
echo "   - VITE_SUPABASE_ANON_KEY"
echo "   - VITE_SUPABASE_SERVICE_KEY"
echo "   - VITE_REMOTE_SERVICE_URL (your Vercel deployment URL)"
echo ""
echo "2. Start the development server:"
echo "   npm run dev"
echo ""
echo "3. Enable remote mode in the Ally interface:"
echo "   - Go to Settings"
echo "   - Enable 'Remote Mode'"
echo "   - Sign in with your Supabase account"
echo "   - Start the remote service"
echo ""
echo "📖 See REMOTE_INTEGRATION_GUIDE.md for detailed instructions."