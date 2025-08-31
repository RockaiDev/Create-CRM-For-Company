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

    // 2️⃣ Create a database inside the project
    const dbPayload = {
      database: {
        name: `${companyName}_main`,
        branch: "main"
      }
    };

    console.log("➡️ Creating database...");
    const dbRes = await axios.post(`${NEON_API_URL}/projects/${projectId}/databases`, dbPayload, { headers });
    const databaseId = dbRes.data.database.id;
    console.log(`[✅] Database created: ${databaseId}`);

    // 3️⃣ Get connection string
    console.log("➡️ Fetching connection string...");
    const connRes = await axios.get(`${NEON_API_URL}/projects/${projectId}/databases/${databaseId}/connection-info`, { headers });
    const connectionString = connRes.data.connection_info?.uri;

    if (!connectionString) throw new Error("❌ Failed to get database connection string");
    console.log(`[🔗] Connection string fetched`);

    // 4️⃣ Create a dedicated DB user
    const dbPassword = generatePassword();
    const userPayload = {
      user: {
        name: `${companyName}_user`,
        password: dbPassword
      }
    };

    console.log("➡️ Creating database user...");
    const userRes = await axios.post(
      `${NEON_API_URL}/projects/${projectId}/databases/${databaseId}/users`,
      userPayload,
      { headers }
    );
    const dbUser = userRes.data.user.name;
    console.log(`[✅] Database user created: ${dbUser}`);

    // 5️⃣ Run initial migrations
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

    // 6️⃣ Output all info
    console.log("\n[🎉 Provisioning Completed]");
    console.log(JSON.stringify({
      projectId,
      databaseId,
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
