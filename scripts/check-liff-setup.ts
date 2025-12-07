#!/usr/bin/env tsx

/**
 * Script to check LIFF configuration and environment variables
 */

console.log('🔍 Checking LIFF Configuration...\n');

const requiredEnvVars = [
  'NEXT_PUBLIC_LIFF_ID_REGISTER',
  'NEXT_PUBLIC_LIFF_ID_PAWN',
  'NEXT_PUBLIC_LIFF_ID_CONTRACTS',
  'NEXT_PUBLIC_LIFF_ID_STORE',
  'NEXT_PUBLIC_LIFF_ID_CONTRACT_AGREEMENT',
];

console.log('📋 Required Environment Variables:');
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  const status = value ? '✅' : '❌';
  console.log(`${status} ${envVar}: ${value || 'NOT SET'}`);
});

console.log('\n🔗 Expected LIFF URLs:');
const baseUrl = 'https://pawn360.vercel.app';
const liffMappings = [
  { path: '/register', env: 'NEXT_PUBLIC_LIFF_ID_REGISTER' },
  { path: '/pawn/new', env: 'NEXT_PUBLIC_LIFF_ID_PAWN' },
  { path: '/contracts', env: 'NEXT_PUBLIC_LIFF_ID_CONTRACTS' },
  { path: '/store/verify-pawn', env: 'NEXT_PUBLIC_LIFF_ID_STORE' },
  { path: '/contract-agreement', env: 'NEXT_PUBLIC_LIFF_ID_CONTRACT_AGREEMENT' },
];

liffMappings.forEach(({ path, env }) => {
  const liffId = process.env[env];
  if (liffId) {
    console.log(`✅ ${baseUrl}${path} → https://liff.line.me/${liffId}${path}`);
  } else {
    console.log(`❌ ${baseUrl}${path} → MISSING LIFF ID (${env})`);
  }
});

console.log('\n📝 Next Steps:');
console.log('1. Go to LINE Developers Console → LIFF tab');
console.log('2. Create new LIFF app for contract-agreement:');
console.log('   - Name: Contract Agreement');
console.log('   - Endpoint URL: https://pawn360.vercel.app/contract-agreement');
console.log('   - Size: Full screen');
console.log('   - Scopes: profile, chat_message.write');
console.log('3. Copy the LIFF ID and add to environment variables');
console.log('4. Update NEXT_PUBLIC_LIFF_ID_CONTRACT_AGREEMENT in Vercel');
console.log('5. Redeploy the application');
