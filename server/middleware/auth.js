function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = require('crypto').randomUUID();
  }
  return req.session.csrfToken;
}

module.exports = { requireAuth, ensureCsrfToken };
