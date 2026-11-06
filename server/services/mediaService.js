const db = require('../database/db');
const crypto = require('crypto');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    year: row.year == null ? '' : row.year,
    rating: row.rating == null ? null : row.rating,
    poster: row.poster == null ? '' : row.poster,
    progress: row.progress == null ? '' : row.progress,
    notes: row.notes == null ? '' : row.notes,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

async function listMedia(userId, filters = {}) {
  const { search, type, status, sort } = filters;
  const params = [userId];
  let sql = 'SELECT * FROM media_items WHERE user_id = $1';
  let i = 2;
  if (type && type !== 'all') {
    sql += ` AND type = $${i++}`;
    params.push(type);
  }
  if (status && status !== 'all') {
    sql += ` AND status = $${i++}`;
    params.push(status);
  }
  if (search) {
    const q = '%' + String(search).toLowerCase() + '%';
    sql += ` AND (LOWER(title) LIKE $${i} OR LOWER(COALESCE(notes,'')) LIKE $${i+1} OR LOWER(COALESCE(progress,'')) LIKE $${i+2} OR LOWER(COALESCE(year,'')) LIKE $${i+3})`;
    params.push(q, q, q, q);
    i += 4;
  }
  let orderBy = 'created_at DESC';
  if (sort === 'oldest') orderBy = 'created_at ASC';
  else if (sort === 'rating') orderBy = 'COALESCE(rating,0) DESC, created_at DESC';
  else if (sort === 'title') orderBy = 'LOWER(title) ASC';
  sql += ' ORDER BY ' + orderBy;
  const res = await db.query(sql, params);
  return res.rows.map(mapRow);
}

async function getMedia(userId, id) {
  const res = await db.query('SELECT * FROM media_items WHERE user_id = $1 AND id = $2', [userId, id]);
  return mapRow(res.rows[0]);
}

async function createMedia(userId, data) {
  const id = data.id || crypto.randomUUID();
  const now = Date.now();
  const createdAt = data.createdAt || now;
  const updatedAt = data.updatedAt || now;
  await db.query(
    `INSERT INTO media_items (id, user_id, title, type, status, year, rating, poster, progress, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, userId, data.title, data.type, data.status,
      data.year === '' ? null : data.year,
      data.rating == null || data.rating === '' ? null : Number(data.rating),
      data.poster === '' ? null : data.poster,
      data.progress === '' ? null : data.progress,
      data.notes === '' ? null : data.notes,
      createdAt, updatedAt
    ]
  );
  return getMedia(userId, id);
}

async function updateMedia(userId, id, data) {
  const existing = await db.query('SELECT id FROM media_items WHERE user_id = $1 AND id = $2', [userId, id]);
  if (!existing.rowCount) return null;
  const now = Date.now();
  await db.query(
    `UPDATE media_items SET title=$1, type=$2, status=$3, year=$4, rating=$5, poster=$6, progress=$7, notes=$8, updated_at=$9
     WHERE user_id=$10 AND id=$11`,
    [
      data.title, data.type, data.status,
      data.year === '' ? null : data.year,
      data.rating == null || data.rating === '' ? null : Number(data.rating),
      data.poster === '' ? null : data.poster,
      data.progress === '' ? null : data.progress,
      data.notes === '' ? null : data.notes,
      data.updatedAt || now,
      userId, id
    ]
  );
  return getMedia(userId, id);
}

async function deleteMedia(userId, id) {
  const res = await db.query('DELETE FROM media_items WHERE user_id = $1 AND id = $2', [userId, id]);
  return res.rowCount > 0;
}

module.exports = { listMedia, getMedia, createMedia, updateMedia, deleteMedia, mapRow };
