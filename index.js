require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const axios    = require('axios');
const FormData = require('form-data');
const cors     = require('cors');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ── KODE AKSES ───────────────────────────────────────────────────────────────
// Kode valid disimpan di env var VALID_CODES (comma-separated), contoh:
//   VALID_CODES=HQ-5F163E,HQ-06A6CF,HQ-910955,...
//
// Usage tracking disimpan di memory (Map).
// Catatan: tracking reset kalau server restart — untuk Opsi A ini cukup,
// karena kode sudah unik per pembeli.

const VALID_CODES = new Set(
  (process.env.VALID_CODES || '')
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean)
);

// Map: code → deviceId yang sudah pakai
const usedBy = new Map();

// POST /validate-code  { code: "HQ-XXXXXX", deviceId: "..." }
app.post('/validate-code', (req, res) => {
  const { code, deviceId } = req.body;
  if (!code || !deviceId)
    return res.status(400).json({ valid: false, error: 'Missing code or deviceId' });

  const c = code.trim().toUpperCase();

  if (!VALID_CODES.has(c))
    return res.json({ valid: false, error: 'Kode tidak ditemukan' });

  const owner = usedBy.get(c);
  if (owner && owner !== deviceId)
    return res.json({ valid: false, error: 'Kode sudah dipakai di perangkat lain' });

  // Catat siapa yang pakai kode ini
  usedBy.set(c, deviceId);
  console.log(`[KODE] ${c} diaktifkan oleh ${deviceId}`);

  return res.json({ valid: true, message: 'Akses diaktifkan! Selamat menghafal 📖' });
});

// GET /admin/status?secret=xxx  — lihat berapa kode terpakai
app.get('/admin/status', (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: 'Forbidden' });

  const total     = VALID_CODES.size;
  const usedCount = usedBy.size;
  const usedList  = Object.fromEntries(usedBy);

  return res.json({ total, used: usedCount, available: total - usedCount, usedList });
});

// ── WHISPER TRANSCRIBE ───────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'HafalQuran Server running' });
});

app.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: 'No audio file provided' });

    console.log('Received file:', req.file.originalname, req.file.mimetype, req.file.size, 'bytes');

    const filename    = req.file.originalname || 'recording.m4a';
    const ext         = filename.split('.').pop()?.toLowerCase() || 'm4a';
    const mimeMap     = { m4a: 'audio/m4a', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', webm: 'audio/webm' };
    const contentType = mimeMap[ext] || 'audio/m4a';

    const form = new FormData();
    form.append('file', req.file.buffer, { filename, contentType });
    form.append('model', 'whisper-1');
    form.append('language', 'ar');
    form.append('prompt', 'بسم الله الرحمن الرحيم قراءة قرآنية كريمة');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
      }
    );

    console.log('Transcription result:', response.data.text);
    res.json({ text: response.data.text, words: response.data.words || [] });
  } catch (e) {
    console.error('Transcribe error:', e?.response?.data || e.message);
    res.status(500).json({ error: 'Transcription failed', detail: e?.response?.data });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
