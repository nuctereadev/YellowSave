require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');

const db = require('./database/db');

const { requireAuth, ensureCsrfToken } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const mediaRoutes = require('./routes/media');
const profileRoutes = require('./routes/profile');
const importExportRoutes = require('./routes/importexport');

const app = express();

const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: new pgSession({ pool: db, createTableIfMissing: true }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}));

app.use((req, res, next) => {
  if (req.session) ensureCsrfToken(req);
  next();
});

app.use('/api', apiLimiter);

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  csrfProtection(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api', importExportRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`YellowSave server running on http://localhost:${PORT}`);
  });
  module.exports.server = server;
}

module.exports = app;
