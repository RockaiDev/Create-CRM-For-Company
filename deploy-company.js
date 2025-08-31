import 'dotenv/config';
import axios from 'axios';
import { Client } from 'pg';
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

// --- Helper to generate random strong passwords ---
function generatePassword(length = 16) {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

// --- Helper: delay ---
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Provision Function ---
async function provisionCompany() {
  try {
    console.log(`[start] Start provisioning for ${companyName}`);

    // 1️⃣ Create Neon Project
    const projectPayload = {
      project: {
        name: `${companyName}-db`,
        region_id: "aws-us-east-1"
      }
    };

    console.log("➡️ Creating Neon project...");
    const projectRes = await axios.post(`${NEON_API_URL}/projects`, projectPayload, { headers });
    const projectId = projectRes.data.project.id;
    console.log(`[✅] Neon Project created: ${projectId}`);

    // 2️⃣ Wait for main branch and fetch connection string
    console.log("➡️ Fetching main branch connection string...");
    let mainBranch;
    let connectionString;
    let retries = 10;

    while (retries > 0) {
      const branchesRes = await axios.get(`${NEON_API_URL}/projects/${projectId}/branches`, { headers });
      mainBranch = branchesRes.data.branches.find(b => b.name === 'main');

      if (mainBranch?.connection_info?.uri) {
        connectionString = mainBranch.connection_info.uri;
        break;
      }

      console.log("⏳ Branch not ready yet, retrying in 3s...");
      await wait(3000);
      retries--;
    }

    if (!connectionString) throw new Error("❌ Failed to get connection string after multiple retries");
    console.log(`[🔗] Connection string fetched: ${connectionString}`);

    // 3️⃣ Create a dedicated DB user
    const dbPassword = generatePassword();
    const userPayload = {
      user: {
        name: `${companyName}_user`,
        password: dbPassword
      }
    };

    console.log("➡️ Creating database user...");
    const userRes = await axios.post(
      `${NEON_API_URL}/projects/${projectId}/branches/${mainBranch.id}/users`,
      userPayload,
      { headers }
    );
    const dbUser = userRes.data.user.name;
    console.log(`[✅] Database user created: ${dbUser}`);

    // 4️⃣ Run initial migrations
    console.log("➡️ Running initial migrations...");
    const client = new Client({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        password VARCHAR(255)
      );
    `);

    await client.end();
    console.log("[✅] Initial migrations completed");

    // 5️⃣ Output all info
    console.log("\n[🎉 Provisioning Completed]");
    console.log(JSON.stringify({
      projectId,
      branchId: mainBranch.id,
      dbUser,
      dbPassword,
      connectionString
    }, null, 2));

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
