#!/usr/bin/env node

/**
 * Environment Variables Checker
 * 
 * This script helps verify that all required environment variables are set
 * for the Ally Remote Service deployment.
 */

const requiredEnvVars = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    description: 'Supabase project URL',
    example: 'https://your-project.supabase.co'
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    description: 'Supabase publishable (public) key',
    example: 'sb_publishable_...'
  },
  {
    name: 'SUPABASE_SECRET_KEY',
    description: 'Supabase secret key (server-side only)',
    example: 'sb_secret_...'
  }
];

const optionalEnvVars = [
  {
    name: 'LOCAL_SYSTEM_ID',
    description: 'Local system identifier',
    example: 'ally-web-system',
    default: 'ally-web-system'
  },
  {
    name: 'LOCAL_SYSTEM_NAME',
    description: 'Local system display name',
    example: 'Ally Web System',
    default: 'Ally Web System'
  }
];

console.log('🔍 Checking Ally Remote Service Environment Variables...\n');

let allGood = true;
let warnings = 0;

// Check required environment variables
console.log('📋 Required Environment Variables:');
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar.name];
  if (value) {
    console.log(`✅ ${envVar.name}: Set (${value.substring(0, 20)}...)`);
  } else {
    console.log(`❌ ${envVar.name}: Missing`);
    console.log(`   Description: ${envVar.description}`);
    console.log(`   Example: ${envVar.example}\n`);
    allGood = false;
  }
});

console.log('\n📋 Optional Environment Variables:');
optionalEnvVars.forEach(envVar => {
  const value = process.env[envVar.name];
  if (value) {
    console.log(`✅ ${envVar.name}: ${value}`);
  } else {
    console.log(`⚠️  ${envVar.name}: Using default (${envVar.default})`);
    warnings++;
  }
});

// Validate Supabase URL format
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl && !supabaseUrl.match(/^https:\/\/[a-z0-9]+\.supabase\.co$/)) {
  console.log(`\n⚠️  NEXT_PUBLIC_SUPABASE_URL format looks incorrect`);
  console.log(`   Expected format: https://your-project.supabase.co`);
  console.log(`   Current value: ${supabaseUrl}`);
  warnings++;
}

// Validate key format (new Supabase keys start with sb_)
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (publishableKey && !publishableKey.startsWith('sb_publishable_') && !publishableKey.startsWith('eyJ')) {
  console.log(`\n⚠️  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY format looks unexpected`);
  warnings++;
}

if (secretKey && !secretKey.startsWith('sb_secret_') && !secretKey.startsWith('eyJ')) {
  console.log(`\n⚠️  SUPABASE_SECRET_KEY format looks unexpected`);
  warnings++;
}

// Summary
console.log('\n' + '='.repeat(50));
if (allGood) {
  console.log('✅ All required environment variables are set!');
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} warning(s) - check the messages above`);
  }
  console.log('\n🚀 You can now deploy to Vercel:');
  console.log('   vercel --prod');
} else {
  console.log('❌ Missing required environment variables');
  console.log('\n📋 To fix this:');
  console.log('1. Create a .env.local file with the missing variables');
  console.log('2. Or set them in your Vercel dashboard');
  console.log('3. Get the values from your Supabase project dashboard');
  console.log('\n📖 See DEPLOYMENT_GUIDE.md for detailed instructions');
}

console.log('\n🔗 Useful links:');
console.log('   Supabase Dashboard: https://app.supabase.com');
console.log('   Vercel Dashboard: https://vercel.com/dashboard');
console.log('   Deployment Guide: ./DEPLOYMENT_GUIDE.md');

process.exit(allGood ? 0 : 1);