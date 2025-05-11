// generateHashes.js
const bcrypt = require('bcrypt');
const saltRounds = 10; // A good default, can be 10-12

async function createAndLogHash(username, plaintextPassword, role) {
  try {
    const hash = await bcrypt.hash(plaintextPassword, saltRounds);
    console.log(`--- User: ${username} ---`);
    console.log(`Plaintext Password: ${plaintextPassword}`);
    console.log(`Role: ${role}`);
    console.log(`BCrypt Hash (Copy this to Supabase password_hash column): ${hash}`);
    console.log('SQL Insert (Example - adjust if your ID is not auto-gen or if you have full_name):');
    console.log(`-- INSERT INTO public.users (username, password_hash, role) VALUES ('${username}', '${hash}', '${role}');`);
    console.log('---------------------------\n');
  } catch (err) {
    console.error(`Error hashing password for ${username}:`, err);
  }
}

// Define users you want to create
async function generateAllHashes() {
  await createAndLogHash('admin', 'admin123', 'admin');
  await createAndLogHash('employee1', 'employee123', 'employee');
  // Add more users as needed
}

generateAllHashes();