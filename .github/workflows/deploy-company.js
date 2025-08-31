#!/usr/bin/env node

import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: node deploy-company.js <companyName> <domain>");
  process.exit(1);
}

const [companyName, domain] = args;

const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_API_URL = "https://console.neon.tech/api/v2";

if (!NEON_API_KEY) {
  console.error("❌ Missing NEON_API_KEY in .env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${NEON_API_KEY}`,
  "Content-Type": "application/json",
};

async function main() {
  try {
    console.log(`[start] start provisioning for ${companyName}`);

    // 1️⃣ إنشاء Project
    console.log("[neon-create] creating Neon project...");
    const projectRes = await axios.post(
      `${NEON_API_URL}/projects`,
      {
        project: {
          name: `${companyName}-db`,
          region_id: "aws-us-east-1", // غيرها حسب الريجن اللي يناسبك
        },
      },
      { headers }
    );

    const project = projectRes.data.project;
    console.log(`✅ Project created: ${project.id}`);

    // 2️⃣ إنشاء Database
    console.log("[neon-db] creating database...");
    const dbRes = await axios.post(
      `${NEON_API_URL}/projects/${project.id}/databases`,
      {
        database: { name: `${companyName}_db` },
      },
      { headers }
    );

    const database = dbRes.data.database;
    console.log(`✅ Database created: ${database.name}`);

    // 3️⃣ إنشاء User
    console.log("[neon-user] creating user...");
    const password = Math.random().toString(36).slice(-12);
    const userRes = await axios.post(
      `${NEON_API_URL}/projects/${project.id}/roles`,
      {
        role: {
          name: `${companyName}_user`,
          password,
        },
      },
      { headers }
    );

    const user = userRes.data.role;
    console.log(`✅ User created: ${user.name}`);

    // 4️⃣ جلب Connection string
    console.log("[neon-conn] fetching connection string...");
    const connRes = await axios.get(
      `${NEON_API_URL}/projects/${project.id}/connection_uri`,
      { headers }
    );

    const connection = connRes.data.connection_uri;
    console.log(`🎉 Connection string for ${companyName}:`);
    console.log(connection);

  } catch (err) {
    console.error("❌ Provisioning failed:", err.response?.data || err.message);
    process.exit(1);
  }
}

main();
