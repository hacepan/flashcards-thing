#!/usr/bin/env node

/**
 * Script CLI privado para importar materias a SQLite
 * Uso:
 *   node scripts/import.js ruta/al/archivo.json
 *   node scripts/import.js ruta/al/archivo.db
 */

const path = require('path');
const fs = require('fs');
const { saveSubjectWithCards, importSQLiteFile } = require('../database');

const filePath = process.argv[2];

if (!filePath) {
  console.log('Uso: node scripts/import.js <archivo.json | archivo.db>');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), filePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: El archivo "${resolvedPath}" no existe.`);
  process.exit(1);
}

const ext = path.extname(resolvedPath).toLowerCase();

if (ext === '.json') {
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const data = JSON.parse(raw);

    const fallbackId = path.basename(resolvedPath, '.json').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const cards = Array.isArray(data) ? data : (data.cards || []);

    const subjectObj = {
      id: (data && data.id) || fallbackId,
      title: (data && data.title) || fallbackId.replace(/[-_]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      category: (data && data.category) || 'General',
      description: (data && data.description) || `Mazo importado (${cards.length} tarjetas)`,
      icon: (data && data.icon) || '',
      color: (data && data.color) || '#4f46e5'
    };

    saveSubjectWithCards(subjectObj, cards);
    console.log(`✅ Materia "${subjectObj.title}" importada con éxito con ${cards.length} tarjetas.`);
  } catch (err) {
    console.error('Error al importar archivo JSON:', err.message);
    process.exit(1);
  }
} else if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
  try {
    const res = importSQLiteFile(resolvedPath);
    console.log(`✅ Materia SQLite "${res.subject.title}" importada con éxito con ${res.cardCount} tarjetas.`);
  } catch (err) {
    console.error('Error al importar archivo SQLite:', err.message);
    process.exit(1);
  }
} else {
  console.error(`Formato no soportado "${ext}". Debe ser .json o .db / .sqlite`);
  process.exit(1);
}
