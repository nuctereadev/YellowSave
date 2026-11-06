const express = require('express');
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { validateMediaInput, cleanMediaInput } = require('../middleware/validate');
const mediaService = require('../services/mediaService');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const items = await mediaService.listMedia(req.session.userId, {
      search: req.query.search || '',
      type: req.query.type || 'all',
      status: req.query.status || 'all',
      sort: req.query.sort || 'newest'
    });
    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load media.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const userId = req.session.userId;
    const total = await db.query('SELECT COUNT(*) AS c FROM media_items WHERE user_id = $1', [userId]);
    const movies = await db.query("SELECT COUNT(*) AS c FROM media_items WHERE user_id = $1 AND type='movie'", [userId]);
    const series = await db.query("SELECT COUNT(*) AS c FROM media_items WHERE user_id = $1 AND type='series'", [userId]);
    const watched = await db.query("SELECT COUNT(*) AS c FROM media_items WHERE user_id = $1 AND status='watched'", [userId]);
    const rated = await db.query('SELECT rating FROM media_items WHERE user_id = $1 AND rating IS NOT NULL', [userId]);
    const avg = rated.rows.length ? rated.rows.reduce((a, r) => a + r.rating, 0) / rated.rows.length : null;
    res.json({ total: Number(total.rows[0].c), movies: Number(movies.rows[0].c), series: Number(series.rows[0].c), watched: Number(watched.rows[0].c), avgRating: avg });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = req.body || {};
    const errors = validateMediaInput(data);
    if (errors.length) return res.status(400).json({ error: 'Invalid fields: ' + errors.join(', ') });
    const clean = cleanMediaInput(data);
    if (data.id) {
      const exists = await db.query('SELECT id FROM media_items WHERE user_id = $1 AND id = $2', [req.session.userId, data.id]);
      if (exists.rowCount) return res.status(409).json({ error: 'Duplicate id.' });
    }
    const item = await mediaService.createMedia(req.session.userId, { ...clean, id: data.id, createdAt: data.createdAt, updatedAt: data.updatedAt });
    res.status(201).json({ item });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create media.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = req.body || {};
    const errors = validateMediaInput(data);
    if (errors.length) return res.status(400).json({ error: 'Invalid fields: ' + errors.join(', ') });
    const clean = cleanMediaInput(data);
    const item = await mediaService.updateMedia(req.session.userId, req.params.id, clean);
    if (!item) return res.status(404).json({ error: 'Not found.' });
    res.json({ item });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update media.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await mediaService.deleteMedia(req.session.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete media.' });
  }
});

module.exports = router;
