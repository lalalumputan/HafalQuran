require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const axios    = require('axios');
const FormData = require('form-data');
const cors     = require('cors');
// Email via Resend REST API (tanpa npm package, pakai fetch bawaan Node 18+)

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ── UPSTASH REDIS (persistent) ───────────────────────────────────────────────
// Menyimpan: code:HQ-XXXXXX → deviceId
// Sehingga 1 kode hanya bisa dipakai 1 device, permanen walau server restart.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_EMAIL = 'lhaeza@gmail.com';

const sendEmail = async (subject, html) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[EMAIL] RESEND_API_KEY belum diset'); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'HafalQuran <onboarding@resend.dev>',
      to:      [ADMIN_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn('[EMAIL] Gagal kirim:', err);
  }
};

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

const redisIncr = async (key) => {
  await fetch(`${REDIS_URL}/incr/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
};

// Deteksi plan dari prefix kode
const detectPlanFromCode = (code) => {
  const c = code.toUpperCase();
  if (c.startsWith('HQT-')) return 'tahunan';
  if (c.startsWith('HQB-')) return 'bulanan';
  return 'bulanan'; // default untuk kode lama HQ-
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
  const plan = detectPlanFromCode(c);
  if (!owner) {
    await redisSet(`code:${c}`, deviceId);
    await redisSet(`plan:${c}`, plan);
    console.log(`[KODE] ${c} → ${deviceId} (${plan})`);
  }

  return res.json({ valid: true, plan, message: 'Akses diaktifkan! Selamat menghafal 📖' });
});

// POST /survey-interest  { answer: 'yes'|'maybe'|'no', deviceId, plan }
app.post('/survey-interest', async (req, res) => {
  const { answer, deviceId, plan } = req.body;
  if (!answer) return res.status(400).json({ error: 'Missing answer' });

  const label   = { yes: '👍 Ya, tertarik!', maybe: '🤔 Mungkin', no: '👎 Tidak' };
  const planMap = { bulanan: 'Bulanan', tahunan: 'Tahunan', free: 'Free' };
  const ts      = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  // Simpan statistik ke Redis
  await redisIncr(`survey:hafiz:${answer}`);

  // Kirim email notifikasi
  try {
    await sendEmail(
      `[HafalQuran] Survey Hafiz: ${label[answer] || answer}`,
      `<h2>📊 Respons Survey Paket Hafiz</h2>
       <table style="border-collapse:collapse;font-family:sans-serif">
         <tr><td style="padding:6px 12px;color:#888">Jawaban</td><td style="padding:6px 12px;font-weight:bold">${label[answer] || answer}</td></tr>
         <tr><td style="padding:6px 12px;color:#888">Paket saat ini</td><td style="padding:6px 12px">${planMap[plan] || plan || '-'}</td></tr>
         <tr><td style="padding:6px 12px;color:#888">Device ID</td><td style="padding:6px 12px;font-size:12px;color:#555">${deviceId || '-'}</td></tr>
         <tr><td style="padding:6px 12px;color:#888">Waktu</td><td style="padding:6px 12px">${ts} WIB</td></tr>
       </table>`
    );
  } catch (e) {
    console.warn('[SURVEY] Email gagal dikirim:', e.message);
  }

  console.log(`[SURVEY] ${answer} | plan:${plan} | device:${deviceId}`);
  return res.json({ ok: true });
});

// GET /admin/survey?secret=xxx — lihat statistik survey
app.get('/admin/survey', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: 'Forbidden' });

  const [yes, maybe, no] = await Promise.all([
    redisGet('survey:hafiz:yes'),
    redisGet('survey:hafiz:maybe'),
    redisGet('survey:hafiz:no'),
  ]);
  const toNum = v => parseInt(v || '0', 10);
  return res.json({
    hafiz_interest: {
      yes:   toNum(yes),
      maybe: toNum(maybe),
      no:    toNum(no),
      total: toNum(yes) + toNum(maybe) + toNum(no),
    },
  });
});

// GET /admin/test-email?secret=xxx — kirim email test untuk verifikasi Resend
app.get('/admin/test-email', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: 'Forbidden' });

  if (!process.env.RESEND_API_KEY)
    return res.status(500).json({ error: 'RESEND_API_KEY belum diset di Render Environment' });
  try {
    await sendEmail(
      '[HafalQuran] Test Email ✅',
      '<p>Email test dari HafalQuran server. Resend berhasil dikonfigurasi!</p>'
    );
    return res.json({ ok: true, message: 'Email terkirim ke ' + ADMIN_EMAIL });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
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
