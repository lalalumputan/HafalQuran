const BASE_URL = 'https://api.alquran.cloud/v1';
const AUDIO_BASE = 'https://cdn.islamic.network/quran/audio/128/ar.alafasy';

export const fetchSurahList = async () => {
  const res = await fetch(`${BASE_URL}/surah`);
  const json = await res.json();
  return json.data;
};

// Ambil huruf dasar Arab saja — harakat, tatweel, dan karakter lain dibuang
// Hanya menyisakan U+0621–U+063A dan U+0641–U+064A (28 huruf Arab dasar)
const getBaseLetters = (word) => word
  .replace(/ٱ/g, 'ا')               // ٱ (Alef Wasla) → ا
  .replace(/[آأإ]/g, 'ا') // آأإ → ا
  .replace(/[ىی]/g, 'ي')       // ى ی → ي
  .replace(/[^ء-غف-ي]/g, ''); // buang semua bukan huruf dasar Arab

// 4 kata Bismillah dalam bentuk huruf dasar
const BISMILLAH_BASE = ['بسم', 'الله', 'الرحمن', 'الرحيم'];
// = ['بسم', 'الله', 'الرحمن', 'الرحيم']

const removeBismillah = (text) => {
  const words = text.trim().split(/\s+/);
  const baseWords = words.map(w => getBaseLetters(w));

  const isBismillah = BISMILLAH_BASE.every((bw, i) => baseWords[i] === bw);

  if (!isBismillah) return text;
  return words.slice(4).join(' ').trim();
};

export const fetchSurah = async (number) => {
  // Ambil Arab, terjemahan Indonesia, dan transliterasi Latin sekaligus
  const res = await fetch(
    `${BASE_URL}/surah/${number}/editions/quran-uthmani,id.indonesian,en.transliteration`
  );
  const json = await res.json();

  const [arabicData, translationData, transliterationData] = json.data;

  let ayahs = arabicData.ayahs.map((ayah, i) => ({
    ...ayah,
    translation: translationData.ayahs[i]?.text || '',
    transliteration: transliterationData.ayahs[i]?.text || '',
  }));

  if (number !== 1 && ayahs.length > 0) {
    const cleaned = removeBismillah(ayahs[0].text);
    if (cleaned === '') {
      // Bismillah adalah ayat tersendiri — buang
      ayahs = ayahs.slice(1);
    } else {
      ayahs[0] = { ...ayahs[0], text: cleaned };
    }
  }

  return ayahs;
};

export const getAyahAudioUrl = (ayahNumber) => {
  return `${AUDIO_BASE}/${ayahNumber}.mp3`;
};

// Bismillah = ayat 1 Al-Fatiha (global ayat #1) — diputar sebelum surah
export const getBismillahAudioUrl = () => `${AUDIO_BASE}/1.mp3`;
