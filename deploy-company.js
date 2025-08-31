import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';

// --- Config ---
const [,, branchName] = process.argv;

if (!branchName) {
  console.error("❌ Usage: node deploy-company.js <branchName>");
  process.exit(1);
}

// Use your existing Neon project
const PROJECT_ID = "twilight-violet-59675860"; // replace with your project ID
const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_API_URL = "https://console.neon.tech/api/v2";

if (!NEON_API_KEY) {
  console.error("❌ Missing NEON_API_KEY in .env file");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${NEON_API_KEY}`,
  "Content-Type": "application/json"
};

// --- Helper functions ---
function generatePassword(length = 16) {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

// --- Main function ---
async function deployToExistingBranch() {
  try {
    console.log(`[start] Provisioning DB user for branch "${branchName}"`);

    // 1️⃣ Get branch info
    const branchesRes = await axios.get(`${NEON_API_URL}/projects/${PROJECT_ID}/branches`, { headers });
    const branch = branchesRes.data.branches.find(b => b.name === branchName);

    if (!branch) {
      throw new Error(`❌ Branch "${branchName}" not found in project ${PROJECT_ID}`);
    }

    if (!branch.connection_info?.host) {
      throw new Error(`❌ Branch "${branchName}" has no primary compute endpoint. Wait for Neon to finish provisioning.`);
    }

    const connectionInfo = branch.connection_info;

    // 2️⃣ Create dedicated DB user
    const dbUser = `${branchName}_user`;
    const dbPassword = generatePassword();
    console.log(`➡️ Creating DB user "${dbUser}"...`);

    const userPayload = { user: { name: dbUser, password: dbPassword } };
    await axios.post(`${NEON_API_URL}/projects/${PROJECT_ID}/branches/${branch.id}/users`, userPayload, { headers });
    console.log(`[✅] DB user created: ${dbUser}`);

    // 3️⃣ Construct connection string
    const connectionString = `postgresql://${dbUser}:${dbPassword}@${connectionInfo.host}:${connectionInfo.port}/${connectionInfo.database}?sslmode=require`;

    // 4️⃣ Output .env snippet
    console.log("\n[🎉 Provisioning Completed!]");
    console.log(`Copy this into your backend .env file:\n`);
    console.log(`DATABASE_URL="${connectionString}"`);
    console.log(`DB_USER="${dbUser}"`);
    console.log(`DB_PASSWORD="${dbPassword}"`);
    console.log(`PROJECT_ID="${PROJECT_ID}"`);
    console.log(`BRANCH_ID="${branch.id}"\n`);

  } catch (err) {
    console.error("❌ Provisioning failed:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
    process.exit(1);
  }
}

// --- Run ---
deployToExistingBranch();
