const axios = require('axios');
const { execSync } = require('child_process');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const [
  , , COMPANY
] = process.argv;

if (!COMPANY) {
  console.error('Usage: node deploy-company.js <companyShortName>');
  process.exit(1);
}

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

async function logStep(step, message) {
  console.log(`[${step}] ${message}`);
}

async function createNeonDatabase(company) {
  await logStep('neon-create', `creating neon db for ${company}`);
  const resp = await axios.post('https://api.neon.tech/v1/projects', {
    name: `project-${company}`
  }, { headers: { Authorization: `Bearer ${NEON_API_KEY}` }});
  return resp.data;
}

async function setRailwayEnv(projectId, key, value) {
  await axios.post(`https://backboard.railway.app/project/${projectId}/env`, {
    key, value, isSecret: true
  }, { headers: { Authorization: `Bearer ${RAILWAY_API_KEY}` }});
}

async function setVercelEnv(projectId, key, value) {
  await axios.post(`https://api.vercel.com/v9/projects/${projectId}/env`, {
    key, value, target: ['production','preview','development']
  }, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }});
}

async function createNamecheapRecord(subdomain, value) {
  const params = {
    ApiUser: NAMECHEAP_USER,
    ApiKey: NAMECHEAP_KEY,
    UserName: NAMECHEAP_USER,
    Command: 'namecheap.domains.dns.setHosts',
    ClientIp: 'YOUR_SERVER_IP', // لازم تستبدلها
    SLD: 'propaicrm',
    TLD: 'com',
    HostName1: subdomain,
    RecordType1: 'CNAME',
    Address1: value,
    TTL1: 60,
  };
  return axios.get('https://api.namecheap.com/xml.response', { params });
}

async function run() {
  try {
    await logStep('start', `start provisioning for ${COMPANY}`);

    // 1) إنشاء Neon DB
    const neonProject = await createNeonDatabase(COMPANY);
    const neonDbUrl = neonProject?.database_url || 'postgres://...';
    await logStep('neon-done', `neon db url: ${neonDbUrl}`);

    // 2) Seed DB & Admin user
    const pg = new Client({ connectionString: neonDbUrl });
    await pg.connect();
    await pg.query(`
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

    // 3) Backend → Railway
    await logStep('backend', 'deploying backend on Railway');
    // TODO: create Railway project from BACKEND_REPO & set env DATABASE_URL
    // await setRailwayEnv(projectId, 'DATABASE_URL', neonDbUrl);

    // 4) Frontend → Vercel
    await logStep('frontend', 'deploying frontend on Vercel');
    // TODO: create Vercel project from FRONTEND_REPO & set env NEXT_PUBLIC_API_URL=backendURL

    // 5) Namecheap DNS
    await logStep('dns', `creating dns record ${DOMAIN}`);
    await createNamecheapRecord(COMPANY, 'cname.vercel-dns.com'); // placeholder

    await logStep('done', `provisioning finished for ${COMPANY} → https://${DOMAIN}`);
  } catch (err) {
    console.error('Provisioning failed:', err.message || err);
    process.exit(1);
  }
}

run();
