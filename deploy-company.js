import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';

// --- Arguments ---
const [,, branchName] = process.argv;

if (!branchName) {
  console.error("❌ Usage: node deploy-company.js <branchName>");
  process.exit(1);
}

// --- Neon Config ---
const PROJECT_ID = "twilight-violet-59675860"; // Your existing Neon project
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main Function ---
async function deployBranch() {
  try {
    console.log(`[start] Deploying branch "${branchName}" on project ${PROJECT_ID}`);

    // 1️⃣ Check if branch exists
    const branchesRes = await axios.get(`${NEON_API_URL}/projects/${PROJECT_ID}/branches`, { headers });
    let branch = branchesRes.data.branches.find(b => b.name === branchName);

    // 2️⃣ Create branch if it doesn't exist
    if (!branch) {
      console.log(`➡️ Branch "${branchName}" does not exist. Creating...`);
      const branchPayload = { branch: { name: branchName } };
      const createRes = await axios.post(`${NEON_API_URL}/projects/${PROJECT_ID}/branches`, branchPayload, { headers });
      branch = createRes.data.branch;
      console.log(`[✅] Branch created: ${branch.name} (${branch.id})`);
    } else {
      console.log(`[ℹ️] Branch already exists: ${branch.name} (${branch.id})`);
    }

    // 3️⃣ Poll until connection info is ready
    console.log("➡️ Waiting for branch connection info...");
    let connectionInfo;
    let retries = 60; // ~5 minutes
    while (retries > 0) {
      const pollRes = await axios.get(`${NEON_API_URL}/projects/${PROJECT_ID}/branches/${branch.id}`, { headers });
      branch = pollRes.data.branch;
      if (branch.connection_info?.host) {
        connectionInfo = branch.connection_info;
        break;
      }
      console.log(`⏳ Connection info not ready yet, retrying in 5s... (${retries} retries left)`);
      await wait(5000);
      retries--;
    }

    if (!connectionInfo) throw new Error("❌ Failed to get branch connection info after multiple retries");
    console.log(`[🔗] Branch connection info ready`);

    // 4️⃣ Create dedicated DB user
    const dbUser = `${branchName}_user`;
    const dbPassword = generatePassword();
    console.log(`➡️ Creating DB user "${dbUser}"...`);
    const userPayload = { user: { name: dbUser, password: dbPassword } };
    await axios.post(`${NEON_API_URL}/projects/${PROJECT_ID}/branches/${branch.id}/users`, userPayload, { headers });
    console.log(`[✅] DB user created: ${dbUser}`);

    // 5️⃣ Construct connection string
    const connectionString = `postgresql://${dbUser}:${dbPassword}@${connectionInfo.host}:${connectionInfo.port}/${connectionInfo.database}?sslmode=require`;

    // 6️⃣ Output .env snippet
    console.log("\n[🎉 Deployment Completed!]");
    console.log(`Copy this into your backend .env file:\n`);
    console.log(`DATABASE_URL="${connectionString}"`);
    console.log(`DB_USER="${dbUser}"`);
    console.log(`DB_PASSWORD="${dbPassword}"`);
    console.log(`PROJECT_ID="${PROJECT_ID}"`);
    console.log(`BRANCH_ID="${branch.id}"\n`);

  } catch (err) {
    console.error("❌ Deployment failed:");
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
deployBranch();
