import 'dotenv/config';
import axios from 'axios';

const [,, companyName, companyDomain] = process.argv;

if (!companyName || !companyDomain) {
  console.error("❌ Usage: node deploy-company.js <companyName> <companyDomain>");
  process.exit(1);
}

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

    if (!connectionString) {
      throw new Error("❌ Failed to get database connection string");
    }

    console.log(`[🔗] Database connection string: ${connectionString}`);
    console.log(`[✅] Provisioning completed successfully for ${companyName}`);

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

provisionCompany();
