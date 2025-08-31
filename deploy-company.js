#!/usr/bin/env node
/* deploy-company.js
   Usage: node deploy-company.js <companyShortName>
*/

const axios = require('axios');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const [, , COMPANY] = process.argv;
if (!COMPANY) {
  console.error('Usage: node deploy-company.js <companyShortName>');
  process.exit(1);
}

// -------- CONFIG --------
const DOMAIN = `${COMPANY}.propaicrm.com`;
const ADMIN_EMAIL = `admin@${COMPANY}.com`;
const ADMIN_PASSWORD = 'Admin@123'; // ❌ غيّرها قبل الإنتاج
const SALT_ROUNDS = 10;

const env = process.env;
const NEON_API_KEY = env.NEON_API_KEY;
const RAILWAY_API_KEY = env.RAILWAY_API_KEY;
const VERCEL_TOKEN = env.VERCEL_TOKEN;
const NAMECHEAP_USER = env.NAMECHEAP_API_USER;
const NAMECHEAP_KEY = env.NAMECHEAP_API_KEY;

const BACKEND_REPO = "https://github.com/RockaiDev/Propai-CRM-back-End";
const FRONTEND_REPO = "https://github.com/RockaiDev/Propai-CRM-Front-End";

// -------- HELPERS --------
async function logStep(step, message) {
  console.log(`[${step}] ${message}`);
}

// -------- Neon --------
async function createNeonDatabase(company) {
  await logStep('neon-create', `creating Neon DB for ${company}`);
  const resp = await axios.post('https://console.neon.tech/api/v2/projects', {
    name: `project-${company}`,
    region_id: "aws-us-east-1", // اختار الريجن المناسب
  }, { headers: { Authorization: `Bearer ${NEON_API_KEY}` }});

  // خد الـ connection string
  const connection = resp.data?.connection_uris?.[0]?.connection_uri;
  return connection;
}

// -------- Railway --------
async function createRailwayProject(company, dbUrl) {
  await logStep('railway', 'creating backend project on Railway');
  const resp = await axios.post(
    "https://backboard.railway.app/graphql",
    {
      query: `
        mutation {
          projectCreate(input: { name: "backend-${company}" }) {
            id
          }
        }
      `
    },
    { headers: { Authorization: `Bearer ${RAILWAY_API_KEY}` } }
  );

  const projectId = resp.data?.data?.projectCreate?.id;
  if (!projectId) throw new Error("Railway project create failed");

  // set DATABASE_URL
  await axios.post(
    `https://backboard.railway.app/project/${projectId}/env`,
    { key: "DATABASE_URL", value: dbUrl, isSecret: true },
    { headers: { Authorization: `Bearer ${RAILWAY_API_KEY}` } }
  );

  return projectId;
}

// -------- Vercel --------
async function createVercelProject(company, backendUrl) {
  await logStep('vercel', 'creating frontend project on Vercel');
  const resp = await axios.post(
    "https://api.vercel.com/v9/projects",
    { name: `frontend-${company}`, gitRepository: { repo: FRONTEND_REPO } },
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
  );

  const projectId = resp.data?.id;
  if (!projectId) throw new Error("Vercel project create failed");

  // set env
  await axios.post(
    `https://api.vercel.com/v9/projects/${projectId}/env`,
    { key: "NEXT_PUBLIC_API_URL", value: backendUrl, target: ["production"] },
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
  );

  return projectId;
}

// -------- Namecheap --------
async function createNamecheapRecord(subdomain, value) {
  await logStep('dns', `creating dns record ${subdomain}`);
  const params = {
    ApiUser: NAMECHEAP_USER,
    ApiKey: NAMECHEAP_KEY,
    UserName: NAMECHEAP_USER,
    Command: 'namecheap.domains.dns.setHosts',
    ClientIp: 'YOUR_SERVER_IP', // ❌ غيّرها
    SLD: 'propaicrm',
    TLD: 'com',
    HostName1: subdomain,
    RecordType1: 'CNAME',
    Address1: value,
    TTL1: 60,
  };
  return axios.get('https://api.namecheap.com/xml.response', { params });
}

// -------- Main Runner --------
async function run() {
  try {
    await logStep('start', `start provisioning for ${COMPANY}`);

    // 1) Neon DB
    const neonDbUrl = await createNeonDatabase(COMPANY);
    await logStep('neon-done', `neon db url: ${neonDbUrl}`);

    // 2) Seed DB
    const pg = new Client({ connectionString: neonDbUrl });
    await pg.connect();
    await pg.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        password text NOT NULL,
        role text NOT NULL DEFAULT 'admin',
        created_at timestamptz DEFAULT now()
      );
    `);
    const hash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    await pg.query(
      'INSERT INTO users (email, password, role) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING',
      [ADMIN_EMAIL, hash, 'admin']
    );
    await pg.end();

    // 3) Railway
    const railwayProjectId = await createRailwayProject(COMPANY, neonDbUrl);
    const backendUrl = `https://${railwayProjectId}.up.railway.app`;

    // 4) Vercel
    await createVercelProject(COMPANY, backendUrl);

    // 5) DNS
    await createNamecheapRecord(COMPANY, "cname.vercel-dns.com");

    await logStep('done', `Provisioning finished for ${COMPANY} → https://${DOMAIN}`);
  } catch (err) {
    console.error('Provisioning failed:', err.response?.data || err.message || err);
    process.exit(1);
  }
}

run();
