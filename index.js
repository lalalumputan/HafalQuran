require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'HafalQuran Server running' });
});

app.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('Received file:', req.file.originalname, req.file.mimetype, req.file.size, 'bytes');

    const filename = req.file.originalname || 'recording.m4a';
    const ext = filename.split('.').pop()?.toLowerCase() || 'm4a';
    const mimeMap = { m4a: 'audio/m4a', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', webm: 'audio/webm' };
    const contentType = mimeMap[ext] || 'audio/m4a';

    const form = new FormData();
    form.append('file', req.file.buffer, { filename, contentType });
    form.append('model', 'whisper-1');
    form.append('language', 'ar');
    form.append('prompt', 'بسم الله الرحمن الرحيم قراءة قرآنية كريمة');

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    console.log('Transcription result:', response.data.text);
    res.json({ text: response.data.text });
  } catch (e) {
    console.error('Transcribe error:', e?.response?.data || e.message);
    res.status(500).json({ error: 'Transcription failed', detail: e?.response?.data });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
