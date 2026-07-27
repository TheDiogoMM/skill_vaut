export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp','plugin')),
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('local_path','upload','url','manual')),
  source_value TEXT NOT NULL,
  local_path TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  summary TEXT,
  utility TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  enrichment_source TEXT CHECK (enrichment_source IN ('ollama','gemini','manual')),
  global_install_status TEXT CHECK (global_install_status IN ('success','failed')),
  download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ideia TEXT NOT NULL,
  resposta_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
