function isNonEmptyString(v, max = 10000) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

function validateUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function validateMediaInput(data) {
  const errors = [];
  if (!isNonEmptyString(data.title, 200)) errors.push('title');
  if (!['movie', 'series'].includes(data.type)) errors.push('type');
  if (!['watched', 'watching', 'wishlist'].includes(data.status)) errors.push('status');
  if (data.year != null && data.year !== '' && !/^\d{0,4}$/.test(String(data.year))) errors.push('year');
  if (data.rating != null && data.rating !== '') {
    const r = Number(data.rating);
    if (Number.isNaN(r) || r < 0 || r > 10) errors.push('rating');
  }
  if (data.poster != null && data.poster !== '') {
    try { new URL(data.poster); } catch { errors.push('poster'); }
  }
  if (data.progress != null && String(data.progress).length > 100) errors.push('progress');
  if (data.notes != null && String(data.notes).length > 5000) errors.push('notes');
  return errors;
}

function cleanMediaInput(data) {
  return {
    title: String(data.title).trim(),
    type: data.type,
    status: data.status,
    year: data.year == null ? '' : String(data.year).trim(),
    rating: data.rating == null || data.rating === '' ? null : Number(data.rating),
    poster: data.poster == null ? '' : String(data.poster).trim(),
    progress: data.progress == null ? '' : String(data.progress).trim(),
    notes: data.notes == null ? '' : String(data.notes)
  };
}

module.exports = {
  isNonEmptyString,
  validateUsername,
  validatePassword,
  normalizeUsername,
  validateMediaInput,
  cleanMediaInput
};
