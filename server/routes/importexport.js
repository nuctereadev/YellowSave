const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const mediaService = require('../services/mediaService');

const router = express.Router();
router.use(requireAuth);

function validateItem(item) {
  if (!item || typeof item !== 'object') return 'item must be object';
  if (typeof item.title !== 'string' || !item.title.trim()) return 'title required';
  if (item.title.length > 200) return 'title too long';
  if (!['movie', 'series'].includes(item.type)) return 'invalid type';
  if (!['watched', 'watching', 'wishlist'].includes(item.status)) return 'invalid status';
  if (item.year != null && item.year !== '' && !/^\d{0,4}$/.test(String(item.year))) return 'invalid year';
  if (item.rating != null && item.rating !== '') {
    const r = Number(item.rating);
    if (Number.isNaN(r) || r < 0 || r > 10) return 'invalid rating';
  }
  if (item.poster != null && item.poster !== '') {
    try { new URL(item.poster); } catch { return 'invalid poster url'; }
  }
  if (item.progress != null && String(item.progress).length > 100) return 'progress too long';
  if (item.notes != null && String(item.notes).length > 5000) return 'notes too long';
  return null;
}

router.get('/export', async (req, res) => {
  try {
    const items = await mediaService.listMedia(req.session.userId, { sort: 'oldest' });
    const backup = {
      app: 'YELLOWREEL',
      version: 2,
      exportedAt: new Date().toISOString(),
      items: items.map((x) => ({
        id: x.id,
        title: x.title,
        type: x.type,
        status: x.status,
        year: x.year,
        rating: x.rating == null ? '' : x.rating,
        poster: x.poster,
        progress: x.progress,
        notes: x.notes,
        createdAt: x.createdAt,
        updatedAt: x.updatedAt
      }))
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="yellowreel.json"');
    res.send(JSON.stringify(backup, null, 2));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Export failed.' });
  }
});

router.post('/import', async (req, res) => {
  try {
    const body = req.body || {};
    const incomingRaw = Array.isArray(body) ? body : (Array.isArray(body.items) ? body.items : null);
    if (!incomingRaw) {
      return res.status(400).json({ error: 'Invalid backup: items array missing.' });
    }

    const errors = [];
    incomingRaw.forEach((item, i) => {
      const err = validateItem(item);
      if (err) errors.push(`item ${i}: ${err}`);
    });
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed.', details: errors.slice(0, 10) });
    }

    const seen = new Set();
    for (const item of incomingRaw) {
      const id = item.id || null;
      if (id) {
        if (seen.has(id)) {
          return res.status(400).json({ error: 'Duplicate id within import: ' + id });
        }
        seen.add(id);
      }
    }

    const userId = req.session.userId;
    let imported = 0;
    let skipped = 0;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const item of incomingRaw) {
        const id = item.id ? String(item.id) : crypto.randomUUID();
        const exists = await client.query('SELECT id FROM media_items WHERE user_id = $1 AND id = $2', [userId, id]);
        if (exists.rowCount) { skipped++; continue; }
        await client.query(
          `INSERT INTO media_items (id, user_id, title, type, status, year, rating, poster, progress, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id, userId,
            String(item.title).trim(),
            item.type,
            item.status,
            item.year == null || item.year === '' ? null : String(item.year).trim(),
            item.rating == null || item.rating === '' ? null : Number(item.rating),
            item.poster == null || item.poster === '' ? null : String(item.poster).trim(),
            item.progress == null || item.progress === '' ? null : String(item.progress).trim(),
            item.notes == null || item.notes === '' ? null : String(item.notes),
            typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()
          ]
        );
        imported++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ imported, skipped, total: incomingRaw.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Import failed.' });
  }
});

module.exports = router;
