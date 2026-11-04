const { Pool, types } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl || !dbUrl.trim()) {
    throw new Error('DATABASE_URL is required. Configure the database connection before starting TMS.');
}

// DATE and TIMESTAMP WITHOUT TIME ZONE carry calendar/wall-clock values.
// Preserve them when sending JSON instead of converting through the host timezone.
types.setTypeParser(1082, value => value);
types.setTypeParser(1114, value => value.replace(' ', 'T'));

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', () => {
    console.error('Database connection error. Check database availability and DATABASE_URL configuration.');
});

module.exports = pool;
