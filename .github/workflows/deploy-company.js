// deploy-company.js
import 'dotenv/config';
import fetch from 'node-fetch';

const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_ORG_ID = process.env.NEON_ORG_ID; // لازم تكون جايبها من حسابك
const NEON_API_URL = "https://console.neon.tech/api/v2";

if (!NEON_API_KEY || !NEON_ORG_ID) {
  console.error("❌ لازم تحط NEON_API_KEY و NEON_ORG_ID في .env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${NEON_API_KEY}`,
  "Content-Type": "application/json",
};

async function main() {
  const [companyName, domain] = process.argv.slice(2);
  if (!companyName || !domain) {
    console.error("❌ Usage: node deploy-company.js <companyName> <domain>");
    process.exit(1);
  }

  console.log(`[start] provisioning for ${companyName}`);

  // 1. Create Project
  console.log("[neon-create] creating Neon Project...");
  const projectRes = await fetch(`${NEON_API_URL}/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      project: {
        name: companyName,
        org_id: NEON_ORG_ID,
        region_id: "aws-us-east-1", // تقدر تغيره حسب اختيارك
      },
    }),
  });

  const projectData = await projectRes.json();
  if (!projectRes.ok) {
    console.error("❌ Project creation failed:", projectData);
    process.exit(1);
  }

  const project = projectData.project;
  console.log("✅ Project created:", project.id);

  // 2. Create Database
  console.log("[neon-db] creating database...");
  const dbRes = await fetch(`${NEON_API_URL}/projects/${project.id}/databases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      database: {
        name: `${companyName}_db`,
      },
    }),
  });

  const dbData = await dbRes.json();
  if (!dbRes.ok) {
    console.error("❌ Database creation failed:", dbData);
    process.exit(1);
  }
  console.log("✅ Database created:", dbData.database.name);

  // 3. Create User
  console.log("[neon-user] creating db user...");
  const password = Math.random().toString(36).slice(-12); // generate random password
  const userRes = await fetch(`${NEON_API_URL}/projects/${project.id}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user: {
        name: `${companyName}_user`,
        password,
      },
    }),
  });

  const userData = await userRes.json();
  if (!userRes.ok) {
    console.error("❌ User creation failed:", userData);
    process.exit(1);
  }
  console.log("✅ User created:", userData.user.name);

  // 4. Build connection string
  const connectionString = `postgresql://${userData.user.name}:${password}@${project.connection_uri.split('@')[1]}/${dbData.database.name}`;

  console.log("\n🎉 Provisioning Completed!");
  console.log("Connection String:\n", connectionString);
  console.log("\nAdd this to your .env file as:");
  console.log(`DATABASE_URL="${connectionString}"`);
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
