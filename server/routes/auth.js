const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { validateUsername, validatePassword, normalizeUsername } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const { ensureCsrfToken } = require('../middleware/csrf');

const router = express.Router();

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body || {};
    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3-24 chars, letters/numbers/underscore.' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    const normalized = normalizeUsername(username);
    const existing = await db.query('SELECT id FROM users WHERE username = $1', [normalized]);
    if (existing.rowCount) {
      return res.status(409).json({ error: 'Username already taken.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const createdAt = Date.now();
    const info = await db.query(
      'INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id',
      [normalized, hash, createdAt]
    );
    const userId = info.rows[0].id;
    req.session.userId = userId;
    req.session.username = normalized;
    ensureCsrfToken(req);
    res.status(201).json({
      user: { id: userId, username: normalized, createdAt }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const normalized = String(username).trim().toLowerCase();
    const result = await db.query('SELECT * FROM users WHERE username = $1', [normalized]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    ensureCsrfToken(req);
    res.json({
      user: { id: user.id, username: user.username, createdAt: Number(user.created_at) }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await db.query('SELECT id, username, created_at FROM users WHERE id = $1', [req.session.userId]);
    const user = result.rows[0];
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Unauthorized' });
    }
    ensureCsrfToken(req);
    res.json({
      user: { id: user.id, username: user.username, createdAt: Number(user.created_at) },
      csrfToken: req.session.csrfToken
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed.' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const ok = await bcrypt.compare(String(currentPassword || ''), user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' });
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

router.get('/csrf-token', (req, res) => {
  const token = ensureCsrfToken(req);
  res.json({ csrfToken: token });
});

module.exports = router;
