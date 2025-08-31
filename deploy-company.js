import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';

// --- Arguments ---
const [,, companyName, companyDomain] = process.argv;

if (!companyName || !companyDomain) {
  console.error("❌ Usage: node deploy-company.js <companyName> <companyDomain>");
  process.exit(1);
}

// --- Neon Config ---
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

// --- Main function ---
async function provisionCompany() {
  try {
    console.log(`[start] Start provisioning for ${companyName}`);

    // 1️⃣ Create Neon Project
    console.log("➡️ Creating Neon project...");
    const projectPayload = {
      project: {
        name: `${companyName}-db`,
        region_id: "aws-us-east-1"
      }
    };

    const projectRes = await axios.post(`${NEON_API_URL}/projects`, projectPayload, { headers });
    const projectId = projectRes.data.project.id;
    console.log(`[✅] Neon Project created: ${projectId}`);

    // 2️⃣ Wait for main branch to be ready
    console.log("➡️ Waiting for main branch to be ready...");
    let mainBranch;
    let connectionInfo;
    let retries = 60; // ~5 minutes
    while (retries > 0) {
      const branchesRes = await axios.get(`${NEON_API_URL}/projects/${projectId}/branches`, { headers });
      mainBranch = branchesRes.data.branches.find(b => b.name === 'main');

      if (mainBranch?.connection_info?.host) {
        connectionInfo = mainBranch.connection_info;
        break;
      }

      console.log(`⏳ Branch not ready yet, retrying in 5s... (${retries} retries left)`);
      await wait(5000);
      retries--;
    }

    if (!connectionInfo) throw new Error("❌ Failed to get connection info after multiple retries");
    console.log(`[🔗] Main branch is ready`);

    // 3️⃣ Create dedicated DB user
    const dbUser = `${companyName}_user`;
    const dbPassword = generatePassword();
    console.log("➡️ Creating DB user...");
    const userPayload = {
      user: {
        name: dbUser,
        password: dbPassword
      }
    };

    await axios.post(`${NEON_API_URL}/projects/${projectId}/branches/${mainBranch.id}/users`, userPayload, { headers });
    console.log(`[✅] DB user created: ${dbUser}`);

    // 4️⃣ Construct connection string using new user
    const connectionString = `postgresql://${dbUser}:${dbPassword}@${connectionInfo.host}:${connectionInfo.port}/${connectionInfo.database}?sslmode=require`;

    // 5️⃣ Output ready-to-use .env snippet
    console.log("\n[🎉 Provisioning Completed!]");
    console.log(`Copy this into your backend .env file:\n`);
    console.log(`DATABASE_URL="${connectionString}"`);
    console.log(`DB_USER="${dbUser}"`);
    console.log(`DB_PASSWORD="${dbPassword}"`);
    console.log(`PROJECT_ID="${projectId}"`);
    console.log(`BRANCH_ID="${mainBranch.id}"\n`);

    console.log("You can now use DATABASE_URL in your backend to connect to Neon.");

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
provisionCompany();
