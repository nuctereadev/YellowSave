const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const mediaService = require('../services/mediaService');

const router = express.Router();
router.use(requireAuth);

function sendLine(res, obj){
  res.write(JSON.stringify(obj) + '\n');
  if (typeof res.flush === 'function') res.flush();
}

function validateItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'item must be object';
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
  if (item.id != null && (typeof item.id !== 'string' || item.id.length > 100)) return 'invalid id';
  if (item.createdAt != null && typeof item.createdAt !== 'number') return 'invalid createdAt';
  if (item.updatedAt != null && typeof item.updatedAt !== 'number') return 'invalid updatedAt';
  return null;
}

router.get('/export', async (req, res) => {
  try {
    const items = await mediaService.listMedia(req.session.userId, { sort: 'oldest' });
    const backup = {
      app: 'YellowSave',
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
    res.setHeader('Content-Disposition', 'attachment; filename="yellowsave.json"');
    res.send(JSON.stringify(backup, null, 2));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'ساخت فایل پشتیبان انجام نشد.' });
  }
});

router.post('/import', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const body = req.body || {};
  const incomingRaw = Array.isArray(body) ? body : (Array.isArray(body.items) ? body.items : null);
  const mode = body.mode === 'replace' ? 'replace' : 'merge';

  if (!incomingRaw) {
    sendLine(res, { error: 'ساختار پشتیبان نامعتبر است: آرایه items یافت نشد.' });
    return res.end();
  }
  if (!Array.isArray(body) && body.app && !['YELLOWREEL','YellowSave'].includes(body.app)) {
    sendLine(res, { error: 'فایل پشتیبان YellowSave نیست.' });
    return res.end();
  }
  if (!Array.isArray(body) && body.version && body.version !== 2) {
    sendLine(res, { error: 'نسخه پشتیبان پشتیبانی نمی‌شود. فقط نسخه ۲.' });
    return res.end();
  }
  if (incomingRaw.length === 0) {
    sendLine(res, { error: 'پشتیبان خالی است.' });
    return res.end();
  }
  if (incomingRaw.length > 5000) {
    sendLine(res, { error: 'تعداد عنوان‌ها بیش از حد مجاز (۵۰۰۰) است.' });
    return res.end();
  }

  sendLine(res, { stage: 'validating' });

  // validate all
  const errors = [];
  incomingRaw.forEach((item, i) => {
    const err = validateItem(item);
    if (err) errors.push({ index: i, id: item && item.id, title: item && item.title, reason: err });
  });
  // duplicate ids within backup
  const seen = new Set();
  for (const item of incomingRaw) {
    if (item && item.id) {
      if (seen.has(item.id)) {
        errors.push({ index: -1, id: item.id, title: item.title, reason: 'duplicate id in backup' });
      } else seen.add(item.id);
    }
  }

  if (errors.length) {
    sendLine(res, { error: 'اعتبارسنجی پشتیبان ناموفق بود.', failed: errors.length, errors });
    return res.end();
  }

  const userId = req.session.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (mode === 'replace') {
      await client.query('DELETE FROM media_items WHERE user_id = $1', [userId]);
    }

    let imported = 0;
    let skipped = 0;
    const total = incomingRaw.length;
    const batchSize = 100;

    sendLine(res, { stage: 'saving', processed: 0, total });

    for (let i = 0; i < incomingRaw.length; i += batchSize) {
      const batch = incomingRaw.slice(i, i + batchSize);
      const toInsert = batch.map(item => ({
        item,
        id: item.id ? String(item.id) : crypto.randomUUID()
      }));

      if (toInsert.length) {
        const values = [];
        const params = [];
        let p = 1;
        for (const { item, id } of toInsert) {
          values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
          params.push(
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
          );
        }
        const result = await client.query(
          `INSERT INTO media_items (id, user_id, title, type, status, year, rating, poster, progress, notes, created_at, updated_at) VALUES ${values.join(',')} ON CONFLICT (user_id, id) DO NOTHING`,
          params
        );
        const inserted = result.rowCount || 0;
        imported += inserted;
        skipped += toInsert.length - inserted;
      }

      sendLine(res, { stage: 'saving', processed: Math.min(i + batch.length, total), total });
    }

    await client.query('COMMIT');

    sendLine(res, { stage: 'done' });
    sendLine(res, { result: { imported, skipped, failed: 0, total, errors: [] } });
    res.end();
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('import error', e);
    sendLine(res, { error: 'خطا در ذخیره اطلاعات در دیتابیس.' });
    res.end();
  } finally {
    client.release();
  }
});

module.exports = router;
