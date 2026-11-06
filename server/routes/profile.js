const express = require('express');
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const userRes = await db.query('SELECT id, username, created_at FROM users WHERE id = $1', [req.session.userId]);
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const total = await db.query('SELECT COUNT(*) AS c FROM media_items WHERE user_id = $1', [user.id]);
    const movies = await db.query("SELECT COUNT(*) AS c FROM media_items WHERE user_id = $1 AND type='movie'", [user.id]);
    const series = await db.query("SELECT COUNT(*) AS c FROM media_items WHERE user_id = $1 AND type='series'", [user.id]);
    const watched = await db.query("SELECT COUNT(*) AS c FROM media_items WHERE user_id = $1 AND status='watched'", [user.id]);
    const rated = await db.query('SELECT rating FROM media_items WHERE user_id = $1 AND rating IS NOT NULL', [user.id]);
    const avg = rated.rows.length ? rated.rows.reduce((a, r) => a + r.rating, 0) / rated.rows.length : null;
    res.json({
      user: { id: user.id, username: user.username, createdAt: Number(user.created_at) },
      stats: { total: Number(total.rows[0].c), movies: Number(movies.rows[0].c), series: Number(series.rows[0].c), watched: Number(watched.rows[0].c), avgRating: avg }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

module.exports = router;
