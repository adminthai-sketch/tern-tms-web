const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_U0xNiHICd9SJ@ep-patient-mode-b4g3dk4w-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle DB client:', err);
});

module.exports = pool;