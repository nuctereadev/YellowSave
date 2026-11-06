const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

module.exports = pool;
module.exports.getDirectPool = function getDirectPool() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
};
