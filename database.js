const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(__dirname, 'data');
const SUBJECTS_DIR = path.join(DATA_DIR, 'subjects');
const DB_PATH = path.join(DATA_DIR, 'flashcards.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SUBJECTS_DIR)) {
  fs.mkdirSync(SUBJECTS_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    description TEXT,
    icon TEXT DEFAULT '',
    color TEXT DEFAULT '#4f46e5',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id TEXT NOT NULL,
    concept TEXT NOT NULL,
    definition TEXT NOT NULL,
    tags TEXT,
    image TEXT,
    image_position TEXT DEFAULT 'back',
    hint TEXT,
    is_starred INTEGER DEFAULT 0,
    times_reviewed INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cards_subject ON cards(subject_id);
  CREATE INDEX IF NOT EXISTS idx_cards_starred ON cards(is_starred);

  CREATE TABLE IF NOT EXISTS study_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id TEXT NOT NULL,
    cards_studied INTEGER NOT NULL,
    score INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );
`);

// Helper to parse tags safely
function parseTags(tagsCol) {
  if (!tagsCol) return [];
  try {
    const parsed = JSON.parse(tagsCol);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    return tagsCol.split(',').map(t => t.trim()).filter(Boolean);
  }
  return [];
}

// Subject operations
const subjectQueries = {
  getAll: db.prepare(`
    SELECT 
      s.*,
      COUNT(c.id) as card_count,
      SUM(CASE WHEN c.image IS NOT NULL AND c.image != '' THEN 1 ELSE 0 END) as image_count,
      (SELECT accuracy FROM study_history WHERE subject_id = s.id ORDER BY completed_at DESC LIMIT 1) as last_accuracy
    FROM subjects s
    LEFT JOIN cards c ON c.subject_id = s.id
    GROUP BY s.id
    ORDER BY s.title ASC
  `),

  getById: db.prepare(`SELECT * FROM subjects WHERE id = ?`),

  upsert: db.prepare(`
    INSERT INTO subjects (id, title, category, description, icon, color, updated_at)
    VALUES (@id, @title, @category, @description, @icon, @color, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      description = excluded.description,
      icon = excluded.icon,
      color = excluded.color,
      updated_at = CURRENT_TIMESTAMP
  `),

  delete: db.prepare(`DELETE FROM subjects WHERE id = ?`)
};

// Card operations
const cardQueries = {
  getBySubject: db.prepare(`SELECT * FROM cards WHERE subject_id = ? ORDER BY id ASC`),

  getById: db.prepare(`SELECT * FROM cards WHERE id = ?`),

  insert: db.prepare(`
    INSERT INTO cards (subject_id, concept, definition, tags, image, image_position, hint, is_starred)
    VALUES (@subject_id, @concept, @definition, @tags, @image, @image_position, @hint, @is_starred)
  `),

  update: db.prepare(`
    UPDATE cards SET
      concept = @concept,
      definition = @definition,
      tags = @tags,
      image = @image,
      image_position = @image_position,
      hint = @hint,
      is_starred = @is_starred
    WHERE id = @id
  `),

  delete: db.prepare(`DELETE FROM cards WHERE id = ?`),

  toggleStar: db.prepare(`
    UPDATE cards SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END WHERE id = ?
  `),

  recordReview: db.prepare(`
    UPDATE cards SET 
      times_reviewed = times_reviewed + 1,
      times_correct = times_correct + (CASE WHEN @is_correct = 1 THEN 1 ELSE 0 END)
    WHERE id = @id
  `),

  deleteBySubject: db.prepare(`DELETE FROM cards WHERE subject_id = ?`)
};

// History operations
const historyQueries = {
  add: db.prepare(`
    INSERT INTO study_history (subject_id, cards_studied, score, accuracy)
    VALUES (@subject_id, @cards_studied, @score, @accuracy)
  `),

  getBySubject: db.prepare(`
    SELECT * FROM study_history WHERE subject_id = ? ORDER BY completed_at DESC LIMIT 10
  `),

  getStats: db.prepare(`
    SELECT 
      COUNT(*) as total_sessions,
      AVG(accuracy) as average_accuracy,
      SUM(cards_studied) as total_reviewed
    FROM study_history
  `)
};

// Transaction to save subject and cards
function saveSubjectWithCards(subject, cards) {
  const saveTx = db.transaction(() => {
    subjectQueries.upsert.run(subject);
    cardQueries.deleteBySubject.run(subject.id);

    for (const card of cards) {
      cardQueries.insert.run({
        subject_id: subject.id,
        concept: card.concept || card.front || card.question || 'Concepto sin título',
        definition: card.definition || card.back || card.answer || '',
        tags: Array.isArray(card.tags) ? JSON.stringify(card.tags) : (typeof card.tags === 'string' ? card.tags : '[]'),
        image: card.image || card.backImage || card.frontImage || null,
        image_position: card.imagePosition || card.image_position || 'back',
        hint: card.hint || null,
        is_starred: card.isStarred || card.is_starred ? 1 : 0
      });
    }
  });

  saveTx();
}

// Export a single subject to an independent SQLite file (.db)
function exportSubjectToSQLite(subjectId) {
  const subject = subjectQueries.getById.get(subjectId);
  if (!subject) throw new Error(`Subject ${subjectId} not found`);

  const cards = cardQueries.getBySubject.all(subjectId);

  const tmpPath = path.join(os.tmpdir(), `${subjectId}_${Date.now()}.db`);
  const exportDb = new Database(tmpPath);

  exportDb.exec(`
    CREATE TABLE subject (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      description TEXT,
      icon TEXT,
      color TEXT
    );

    CREATE TABLE cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept TEXT NOT NULL,
      definition TEXT NOT NULL,
      tags TEXT,
      image TEXT,
      image_position TEXT,
      hint TEXT,
      is_starred INTEGER DEFAULT 0
    );
  `);

  exportDb.prepare(`
    INSERT INTO subject (id, title, category, description, icon, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(subject.id, subject.title, subject.category, subject.description, subject.icon, subject.color);

  const insertCard = exportDb.prepare(`
    INSERT INTO cards (concept, definition, tags, image, image_position, hint, is_starred)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCardsTx = exportDb.transaction(() => {
    for (const c of cards) {
      insertCard.run(c.concept, c.definition, c.tags, c.image, c.image_position, c.hint, c.is_starred);
    }
  });
  insertCardsTx();

  exportDb.close();
  return tmpPath;
}

// Import an external SQLite (.db / .sqlite) file
function importSQLiteFile(filePath, customId = null) {
  const extDb = new Database(filePath, { readonly: true });
  try {
    // Check tables
    const tables = extDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

    let subjectInfo = null;
    if (tables.includes('subject')) {
      subjectInfo = extDb.prepare("SELECT * FROM subject LIMIT 1").get();
    } else if (tables.includes('subjects')) {
      subjectInfo = extDb.prepare("SELECT * FROM subjects LIMIT 1").get();
    }

    const fileBase = path.basename(filePath, path.extname(filePath));
    const finalId = customId || subjectInfo?.id || fileBase.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const finalTitle = subjectInfo?.title || fileBase.replace(/[-_]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Find cards table
    let cardsTable = null;
    for (const candidate of ['cards', 'flashcards', 'deck']) {
      if (tables.includes(candidate)) {
        cardsTable = candidate;
        break;
      }
    }

    if (!cardsTable) {
      throw new Error(`No se encontró una tabla de tarjetas ('cards' o 'flashcards') en ${filePath}`);
    }

    const rawCards = extDb.prepare(`SELECT * FROM ${cardsTable}`).all();
    const formattedCards = rawCards.map(rc => ({
      concept: rc.concept || rc.front || rc.question || rc.term || 'Sin concepto',
      definition: rc.definition || rc.back || rc.answer || '',
      tags: parseTags(rc.tags),
      image: rc.image || null,
      imagePosition: rc.image_position || rc.imagePosition || 'back',
      hint: rc.hint || null,
      isStarred: rc.is_starred || 0
    }));

    const subjectObj = {
      id: finalId,
      title: finalTitle,
      category: subjectInfo?.category || 'General',
      description: subjectInfo?.description || `Mazo importado desde SQLite (${formattedCards.length} tarjetas)`,
      icon: subjectInfo?.icon || '📦',
      color: subjectInfo?.color || '#4f46e5'
    };

    saveSubjectWithCards(subjectObj, formattedCards);
    return { subject: subjectObj, cardCount: formattedCards.length };
  } finally {
    extDb.close();
  }
}

// Scan data/subjects for any .db or .sqlite files and import them
function scanSubjectsFolder() {
  if (!fs.existsSync(SUBJECTS_DIR)) return;
  const files = fs.readdirSync(SUBJECTS_DIR);

  for (const file of files) {
    if (file.endsWith('.db') || file.endsWith('.sqlite')) {
      const fullPath = path.join(SUBJECTS_DIR, file);
      try {
        const res = importSQLiteFile(fullPath);
        console.log(`Auto-imported SQLite subject: ${res.subject.title} (${res.cardCount} cards)`);
      } catch (err) {
        console.warn(`Could not auto-import SQLite file ${file}:`, err.message);
      }
    }
  }
}

// Check initial scan
scanSubjectsFolder();

module.exports = {
  db,
  DB_PATH,
  subjectQueries,
  cardQueries,
  historyQueries,
  parseTags,
  saveSubjectWithCards,
  exportSubjectToSQLite,
  importSQLiteFile,
  scanSubjectsFolder
};
