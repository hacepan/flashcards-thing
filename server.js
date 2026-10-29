const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch (e) {
    console.warn('Could not load .env file:', e.message);
  }
}

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'flashcards_admin_secret_token';

const {
  db,
  subjectQueries,
  cardQueries,
  historyQueries,
  parseTags,
  saveSubjectWithCards,
  exportSubjectToSQLite,
  importSQLiteFile,
  scanSubjectsFolder
} = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Raw binary body parser for direct SQLite file uploads
app.use('/api/import-sqlite-raw', express.raw({ type: 'application/octet-stream', limit: '50mb' }));

// Static asset folders
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// Authentication middleware for administrative mutations
function requireAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || 
                (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null) || 
                req.query.token;

  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({
      success: false,
      error: 'Acceso no autorizado. Se requiere un token de administrador válido.'
    });
  }
  next();
}

// API: List all subjects from SQLite (Public read)
app.get('/api/subjects', (req, res) => {
  try {
    const rawSubjects = subjectQueries.getAll.all();
    
    const subjects = rawSubjects.map(sub => {
      const cards = cardQueries.getBySubject.all(sub.id);
      const tagSet = new Set();
      cards.forEach(c => {
        parseTags(c.tags).forEach(t => tagSet.add(t));
      });

      return {
        id: sub.id,
        title: sub.title,
        category: sub.category || 'General',
        description: sub.description || '',
        icon: sub.icon || '',
        color: sub.color || '#4f46e5',
        cardCount: sub.card_count || 0,
        hasImages: (sub.image_count || 0) > 0,
        lastAccuracy: sub.last_accuracy,
        tags: Array.from(tagSet)
      };
    });

    res.json({
      success: true,
      count: subjects.length,
      subjects
    });
  } catch (err) {
    console.error('Error listing subjects:', err);
    res.status(500).json({ success: false, error: 'Error al listar las materias de la base de datos' });
  }
});

// API: Get subject with full cards from SQLite (Public read)
app.get('/api/subjects/:id', (req, res) => {
  const subjectId = req.params.id;
  try {
    const subject = subjectQueries.getById.get(subjectId);
    if (!subject) {
      return res.status(404).json({ success: false, error: `Materia "${subjectId}" no encontrada.` });
    }

    const rawCards = cardQueries.getBySubject.all(subjectId);
    const tagSet = new Set();

    const cards = rawCards.map(c => {
      const tags = parseTags(c.tags);
      tags.forEach(t => tagSet.add(t));

      return {
        id: c.id,
        subjectId: c.subject_id,
        concept: c.concept,
        definition: c.definition,
        tags: tags,
        image: c.image || null,
        imagePosition: c.image_position || 'back',
        hint: c.hint || null,
        isStarred: Boolean(c.is_starred),
        timesReviewed: c.times_reviewed,
        timesCorrect: c.times_correct
      };
    });

    res.json({
      success: true,
      subject: {
        id: subject.id,
        title: subject.title,
        category: subject.category,
        description: subject.description,
        icon: subject.icon,
        color: subject.color,
        cardCount: cards.length,
        tags: Array.from(tagSet),
        cards
      }
    });
  } catch (err) {
    console.error(`Error loading subject ${subjectId}:`, err);
    res.status(500).json({ success: false, error: 'Error al cargar la materia' });
  }
});

// API: Create or update subject in SQLite (PRIVATE - REQUIRES ADMIN TOKEN)
app.post('/api/subjects', requireAdminAuth, (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.title || !Array.isArray(data.cards)) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere al menos un título y un arreglo de tarjetas.'
      });
    }

    const rawId = data.id || data.title.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const safeId = rawId.replace(/[^a-z0-9_-]/g, '-').slice(0, 50);

    const subjectObj = {
      id: safeId,
      title: data.title,
      category: data.category || 'General',
      description: data.description || `Mazo (${data.cards.length} tarjetas)`,
      icon: data.icon || '',
      color: data.color || '#4f46e5'
    };

    saveSubjectWithCards(subjectObj, data.cards);

    res.status(201).json({
      success: true,
      message: 'Materia guardada en SQLite',
      subject: subjectObj
    });
  } catch (err) {
    console.error('Error saving subject to SQLite:', err);
    res.status(500).json({ success: false, error: 'Error al guardar la materia' });
  }
});

// API: Delete subject from SQLite (PRIVATE - REQUIRES ADMIN TOKEN)
app.delete('/api/subjects/:id', requireAdminAuth, (req, res) => {
  const subjectId = req.params.id;
  try {
    const existing = subjectQueries.getById.get(subjectId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Materia no encontrada.' });
    }
    subjectQueries.delete.run(subjectId);
    res.json({ success: true, message: `Materia "${subjectId}" eliminada.` });
  } catch (err) {
    console.error(`Error deleting subject ${subjectId}:`, err);
    res.status(500).json({ success: false, error: 'Error al eliminar la materia' });
  }
});

// API: Toggle card star in SQLite (Public interaction for study)
app.post('/api/cards/:id/star', (req, res) => {
  const cardId = parseInt(req.params.id, 10);
  try {
    const card = cardQueries.getById.get(cardId);
    if (!card) return res.status(404).json({ success: false, error: 'Tarjeta no encontrada' });

    cardQueries.toggleStar.run(cardId);
    const updated = cardQueries.getById.get(cardId);
    res.json({ success: true, isStarred: Boolean(updated.is_starred) });
  } catch (err) {
    console.error('Error toggling card star:', err);
    res.status(500).json({ success: false, error: 'Error al actualizar tarjeta' });
  }
});

// API: Record study session results (Public interaction for study)
app.post('/api/study/record', (req, res) => {
  try {
    const { subjectId, cardsStudied, score, accuracy, cardReviews } = req.body;
    if (!subjectId) return res.status(400).json({ success: false, error: 'Falta subjectId' });

    historyQueries.add.run({
      subject_id: subjectId,
      cards_studied: cardsStudied || 0,
      score: score || 0,
      accuracy: accuracy || 0
    });

    if (Array.isArray(cardReviews)) {
      for (const rev of cardReviews) {
        if (rev.id) {
          cardQueries.recordReview.run({
            id: rev.id,
            is_correct: rev.isCorrect ? 1 : 0
          });
        }
      }
    }

    res.json({ success: true, message: 'Sesión registrada correctamente' });
  } catch (err) {
    console.error('Error recording study session:', err);
    res.status(500).json({ success: false, error: 'Error al registrar sesión' });
  }
});

// API: Export subject as standalone SQLite (.db) file
app.get('/api/subjects/:id/export-sqlite', (req, res) => {
  const subjectId = req.params.id;
  try {
    const tmpDbPath = exportSubjectToSQLite(subjectId);
    res.download(tmpDbPath, `${subjectId}.db`, (err) => {
      if (err) console.error('Error sending exported SQLite file:', err);
      if (fs.existsSync(tmpDbPath)) {
        try { fs.unlinkSync(tmpDbPath); } catch (e) {}
      }
    });
  } catch (err) {
    console.error(`Error exporting subject ${subjectId} to SQLite:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Upload and import a standalone SQLite file (PRIVATE - REQUIRES ADMIN TOKEN)
app.post('/api/import-sqlite-raw', requireAdminAuth, (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibieron datos binarios del archivo SQLite.' });
    }

    const tmpPath = path.join(os.tmpdir(), `import_${Date.now()}.db`);
    fs.writeFileSync(tmpPath, req.body);

    const importRes = importSQLiteFile(tmpPath);
    try { fs.unlinkSync(tmpPath); } catch (e) {}

    res.json({
      success: true,
      message: `¡Materia "${importRes.subject.title}" importada con ${importRes.cardCount} tarjetas!`,
      subject: importRes.subject
    });
  } catch (err) {
    console.error('Error importing SQLite file:', err);
    res.status(500).json({ success: false, error: `Error al importar SQLite: ${err.message}` });
  }
});

// HTML5 History API routing fallback (allows browser back, direct URLs like /study/:id)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/data/')) {
    return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Flashcards Studio running with SQLite at http://localhost:${PORT}`);
  console.log(`Admin authentication active. Endpoints POST/DELETE protected.`);
});
