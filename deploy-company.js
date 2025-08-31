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
    console.log(`[start] start provisioning for ${companyName}`);

    // payload
    const payload = {
      project: {
        name: `${companyName}-db`,
        region_id: "aws-us-east-1"
      }
    };

    console.log("➡️ Sending payload:", JSON.stringify(payload, null, 2));

    // Create Neon Project
    const projectRes = await axios.post(
      `${NEON_API_URL}/projects`,
      payload,
      { headers }
    );

    console.log("[neon-create] Response status:", projectRes.status);
    console.log("[neon-create] Response data:", JSON.stringify(projectRes.data, null, 2));

    const projectId = projectRes.data.project.id;
    console.log(`[✅] Neon Project created with id: ${projectId}`);

    // هنا ممكن نكمل باقي خطوات الربط (DB, migrations, user, إلخ...)

  } catch (err) {
    console.error("❌ Provisioning failed:");

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Headers:", err.response.headers);
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }

    process.exit(1);
  }
}

provisionCompany();
