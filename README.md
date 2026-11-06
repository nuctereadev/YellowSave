# YELLOWREEL

A lightweight, secure, multi-user movie and TV series tracker.

## Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Database: PostgreSQL (Neon-compatible)
- Auth: bcrypt + server-side sessions (PostgreSQL-backed, HttpOnly cookies)

## Setup (local)

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

Set `DATABASE_URL` (Neon pooled connection string), optionally `DATABASE_URL_UNPOOLED` (direct), and a strong `SESSION_SECRET`.

3. Run migrations:

```bash
npm run migrate
```

4. Start the server:

```bash
npm start
```

Open http://localhost:3000.

## Deploy to Vercel

- Push this repository to GitHub and import into Vercel.
- Set environment variables in Vercel:
  - `DATABASE_URL` (Neon pooled)
  - `DATABASE_URL_UNPOOLED` (Neon direct, for migrations)
  - `SESSION_SECRET` (strong random)
  - `NODE_ENV=production`
- Run migrations against the production database:
  ```bash
  DATABASE_URL_UNPOOLED=... npm run migrate
  ```
- Vercel serves `public/` as static assets and routes `/api/*` to the serverless function `api/index.js`.

## Database backup and restore

Use Neon's backup/branching features, or standard PostgreSQL tools:

Backup:

```bash
pg_dump "$DATABASE_URL_UNPOOLED" > yellowreel-backup.sql
```

Restore:

```bash
psql "$DATABASE_URL_UNPOOLED" < yellowreel-backup.sql
```

## Security notes

- Passwords are hashed with bcrypt (cost 12).
- SQL queries are parameterized.
- Sessions are server-side in PostgreSQL, HttpOnly, SameSite=Lax, Secure in production.
- CSRF tokens required for state-changing requests.
- Login/register are rate-limited.
- All data access is scoped to the authenticated user derived from the session.
- No SQLite or local JSON files are used as the production database.
