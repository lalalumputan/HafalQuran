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

// ── UPSTASH REDIS (persistent) ───────────────────────────────────────────────
// Menyimpan: code:HQ-XXXXXX → deviceId
// Sehingga 1 kode hanya bisa dipakai 1 device, permanen walau server restart.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redisGet = async (key) => {
  const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;   // null jika belum ada
};

const redisSet = async (key, value) => {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
};

// ── KODE AKSES ───────────────────────────────────────────────────────────────
// Kode valid disimpan di env var VALID_CODES (comma-separated):
//   VALID_CODES=HQ-5F163E,HQ-06A6CF,...
// Tracking pemakaian disimpan di Redis → permanen & anti-share

const VALID_CODES = new Set(
  (process.env.VALID_CODES || '')
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean)
);

// POST /validate-code  { code: "HQ-XXXXXX", deviceId: "..." }
app.post('/validate-code', async (req, res) => {
  const { code, deviceId } = req.body;
  if (!code || !deviceId)
    return res.status(400).json({ valid: false, error: 'Missing code or deviceId' });

  const c = code.trim().toUpperCase();

  // 1. Cek apakah kode ada di daftar
  if (!VALID_CODES.has(c))
    return res.json({ valid: false, error: 'Kode tidak ditemukan' });

  // 2. Cek di Redis siapa yang sudah pakai kode ini
  const owner = await redisGet(`code:${c}`);

  if (owner && owner !== deviceId)
    return res.json({ valid: false, error: 'Kode sudah dipakai di perangkat lain' });

  // 3. Jika belum pernah dipakai → simpan ke Redis
  if (!owner) {
    await redisSet(`code:${c}`, deviceId);
    console.log(`[KODE] ${c} → ${deviceId}`);
  }

  return res.json({ valid: true, message: 'Akses diaktifkan! Selamat menghafal 📖' });
});

// GET /admin/status?secret=xxx
app.get('/admin/status', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: 'Forbidden' });

  // Cek satu per satu kode ke Redis
  const result = {};
  for (const c of VALID_CODES) {
    const owner = await redisGet(`code:${c}`);
    result[c] = owner ? { used: true, deviceId: owner } : { used: false };
  }
  const usedCount = Object.values(result).filter(v => v.used).length;
  return res.json({
    total:     VALID_CODES.size,
    used:      usedCount,
    available: VALID_CODES.size - usedCount,
    codes:     result,
  });
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
