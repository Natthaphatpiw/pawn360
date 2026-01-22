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
  'NEXT_PUBLIC_LIFF_ID_PAWNER_CONTRACT',
];

console.log('📋 Required Environment Variables:');
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  const status = value ? '✅' : '❌';
  console.log(`${status} ${envVar}: ${value || 'NOT SET'}`);
});

console.log('\n🔗 Expected LIFF URLs:');
const baseUrl = 'https://pawnly.io';
const liffMappings = [
  { path: '/register', env: 'NEXT_PUBLIC_LIFF_ID_REGISTER' },
  { path: '/pawn/new', env: 'NEXT_PUBLIC_LIFF_ID_PAWN' },
  { path: '/contracts', env: 'NEXT_PUBLIC_LIFF_ID_CONTRACTS' },
  { path: '/store/verify-pawn', env: 'NEXT_PUBLIC_LIFF_ID_STORE' },
  { path: '/contract-agreement', env: 'NEXT_PUBLIC_LIFF_ID_CONTRACT_AGREEMENT' },
  { path: '/pawner/contract', env: 'NEXT_PUBLIC_LIFF_ID_PAWNER_CONTRACT' },
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
console.log('   - Endpoint URL: https://pawnly.io/contract-agreement');
console.log('   - Size: Full screen');
console.log('   - Scopes: profile, chat_message.write');
console.log('3. Create new LIFF app for pawner contract details:');
console.log('   - Name: Pawner Contract Details');
console.log('   - Endpoint URL: https://pawnly.io/pawner/contract');
console.log('   - Size: Full screen');
console.log('   - Scopes: profile, chat_message.write');
console.log('4. Copy the LIFF IDs and add to environment variables');
console.log('5. Update NEXT_PUBLIC_LIFF_ID_CONTRACT_AGREEMENT and NEXT_PUBLIC_LIFF_ID_PAWNER_CONTRACT in Vercel');
console.log('6. Redeploy the application');
