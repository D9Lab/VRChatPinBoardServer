CREATE TABLE IF NOT EXISTS pinboards (
  pinboardId TEXT PRIMARY KEY NOT NULL,
  hashKey TEXT NOT NULL,
  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pinboardId TEXT NOT NULL,
  noteindex INTEGER NOT NULL,
  localPosition TEXT NOT NULL,
  angle TEXT NOT NULL,
  colorHue TEXT NOT NULL,
  content TEXT NOT NULL,
  userHash TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  UNIQUE(pinboardId, noteindex)
  FOREIGN KEY (pinboardId) REFERENCES pinboards(pinboardId) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_pinboard ON notes (pinboardId);
CREATE INDEX IF NOT EXISTS idx_notes_index ON notes (noteindex);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_unique ON notes (pinboardId, noteindex);