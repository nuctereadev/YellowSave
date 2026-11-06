require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getDirectPool } = require('./db');

async function main() {
  const pool = getDirectPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at BIGINT NOT NULL
      );
    `);

    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const id = file;
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
      if (exists.rowCount > 0) {
        console.log('Already applied:', id);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      console.log('Applying:', id);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [id, Date.now()]);
      await client.query('COMMIT');
      console.log('Applied:', id);
    }
    console.log('Migrations complete.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
