CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie','series')),
  status TEXT NOT NULL CHECK (status IN ('watched','watching','wishlist')),
  year TEXT,
  rating DOUBLE PRECISION,
  poster TEXT,
  progress TEXT,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_media_user ON media_items (user_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_items (user_id, type);
CREATE INDEX IF NOT EXISTS idx_media_status ON media_items (user_id, status);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at BIGINT NOT NULL
);
