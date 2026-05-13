/**
 * tajwidAnalyzer.js
 * Deteksi 10 hukum tajwid dari teks Arab berharakat (Uthmani).
 *
 * Aturan yang dideteksi:
 *  A. Nun Sukun / Tanwin (4 hukum + Iqlab)
 *     1. Izhar Halqi   – nun sukun/tanwin sebelum ء ه ع ح غ خ
 *     2. Idgham Bigunnah – nun sukun/tanwin sebelum ي ن م و
 *     3. Idgham Bilagunnah – nun sukun/tanwin sebelum ل ر
 *     4. Iqlab         – nun sukun/tanwin sebelum ب
 *     5. Ikhfa' Haqiqi – nun sukun/tanwin sebelum 15 huruf sisanya
 *
 *  B. Mim Sukun (3 hukum)
 *     6. Idgham Mimi   – mim sukun sebelum م
 *     7. Ikhfa' Syafawi – mim sukun sebelum ب
 *     8. Izhar Syafawi – mim sukun sebelum huruf lainnya
 *
 *  C. Qalqalah
 *     9. Qalqalah      – huruf قطبجد berharakat sukun
 *
 *  D. Gunnah
 *    10. Gunnah        – nun atau mim bertasydid (نّ / مّ)
 *
 *  E. Mad (disederhanakan menjadi 2 tingkat)
 *    11. Mad Wajib / Lazim – mad diikuti hamza (wajib) atau sukun/syiddah (lazim)
 *    12. Mad Tabi'i        – mad dasar (2 harakat)
 *
 * Catatan keterbatasan:
 *  – Idgham dan ikhfa' untuk tanwin bersifat cross-word; fungsi detectWordTajwid
 *    menerima parameter nextWord opsional untuk menangani kasus ini.
 *  – Satu kata hanya diberi satu label (prioritas sesuai urutan di atas).
 */

// ── Karakter & regex pembantu ──────────────────────────────────────────────────

// Harakat / diakritik (sama dengan textComparison.js, tidak menyentuh huruf dasar)
const HARAKAT_RE = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g;

/** Ambil huruf dasar pertama dari sebuah kata (setelah strip harakat) */
const firstBaseLetter = (word) => {
  if (!word) return '';
  return word.replace(HARAKAT_RE, '').trim()[0] || '';
};

/** Apakah kata ini diakhiri tanwin (ً ٌ ٍ)? */
const endsTanwin = (word) => /[ًٌٍ]/.test(word);

/** Apakah kata ini diakhiri nun sukun di posisi akhir? */
const endsNunSukun = (word) => /نْ\s*$/.test(word);

// Kelompok huruf untuk nun sukun / tanwin
const RE_IZHAR      = /^[ءهعحغخ]/;   // Izhar Halqi
const RE_IDGHAM_GUN = /^[ينمو]/;      // Idgham Bigunnah
const RE_IDGHAM_LAG = /^[لر]/;        // Idgham Bilagunnah
const RE_IQLAB      = /^[ب]/;         // Iqlab
// Ikhfa': 15 huruf selain kelompok di atas dan bukan huruf halaq
const RE_IKHFA      = /^[تثجدذزسشصضطظفقك]/;

// Hamza (untuk Mad Wajib)
const RE_HAMZA      = /[ءأإؤئ]/;

// ── Deteksi nun sukun atau tanwin terhadap huruf berikutnya ───────────────────

const detectNunTanwin = (nextChar) => {
  if (!nextChar) return null;
  if (RE_IQLAB.test(nextChar))      return 'iqlab';
  if (RE_IDGHAM_GUN.test(nextChar)) return 'idghamBigunnah';
  if (RE_IDGHAM_LAG.test(nextChar)) return 'idghamBilagunnah';
  if (RE_IZHAR.test(nextChar))      return 'izhar';
  if (RE_IKHFA.test(nextChar))      return 'ikhfa';
  return null;
};

// ── Fungsi utama ──────────────────────────────────────────────────────────────

/**
 * Deteksi hukum tajwid pada satu kata.
 * @param {string} word       – kata Arab berharakat
 * @param {string} [nextWord] – kata berikutnya (opsional, untuk aturan cross-word)
 * @returns {string|null}     – kunci hukum tajwid, atau null
 */
export const detectWordTajwid = (word, nextWord = null) => {

  // ── 1. Qalqalah ─────────────────────────────────────────────────────────────
  // Huruf qalqalah (ق ط ب ج د) berharakat sukun
  if (/[قطبجد]ْ/.test(word)) return 'qalqalah';

  // ── 2. Gunnah ───────────────────────────────────────────────────────────────
  // Nun atau mim bertasydid
  if (/[نم]ّ/.test(word)) return 'gunnah';

  // ── 3. Mad Wajib Muttasil / Mad Lazim ──────────────────────────────────────
  // Mad diikuti hamza dalam kata yang sama (wajib) atau sukun/tasydid (lazim)
  if (/َاء|ُوء|ِيء|ٰء/.test(word))           return 'madWajib';
  if (/[َُِ][اوي]ْ|[َُِ][اوي]ّ|ٰ[ّْ]/.test(word)) return 'madLazim';

  // ── 4. Mad Tabi'i ───────────────────────────────────────────────────────────
  // Vokal panjang dasar: fathah+alef, dammah+waw, kasrah+ya, atau alef khanjariyah
  if (/ٰ|[َ]ا|[ُ]و|[ِ]ي/.test(word)) return 'mad';

  // ── 5. Mim Sukun ────────────────────────────────────────────────────────────
  // Cek مْ di dalam kata; karakter setelah مْ menentukan hukumnya
  const mimMatch = word.match(/مْ(.)?/);
  if (mimMatch) {
    // Karakter setelah sukun (dalam kata), atau huruf pertama kata berikutnya
    const ch = mimMatch[1] || firstBaseLetter(nextWord);
    if (/^م/.test(ch)) return 'idghamMimi';
    if (/^ب/.test(ch)) return 'ikhfaSyafawi';
    if (ch)            return 'izharSyafawi';
  }

  // ── 6. Nun Sukun dalam kata ──────────────────────────────────────────────────
  const nunMatch = word.match(/نْ(.)?/);
  if (nunMatch) {
    const ch = nunMatch[1];
    if (ch) {
      // nun sukun di tengah kata → huruf berikutnya sudah diketahui
      const r = detectNunTanwin(ch);
      if (r) return r;
    } else if (nextWord) {
      // nun sukun di akhir kata → lihat huruf pertama kata berikutnya
      const r = detectNunTanwin(firstBaseLetter(nextWord));
      if (r) return r;
    }
  }

  // ── 7. Tanwin (cross-word) ──────────────────────────────────────────────────
  // Tanwin hanya bermakna jika ada kata berikutnya
  if (nextWord && endsTanwin(word)) {
    const r = detectNunTanwin(firstBaseLetter(nextWord));
    if (r) return r;
  }

  return null;
};

// ── Label, warna, dan deskripsi per hukum ─────────────────────────────────────

export const TAJWID_INFO = {
  // Nun sukun / Tanwin
  izhar: {
    label: 'Izhar',
    desc:  'Baca jelas (nun sebelum ء ه ع ح غ خ)',
    color: '#1A5276',
    bg:    '#D6EAF8',
  },
  idghamBigunnah: {
    label: 'Idgham + Gunnah',
    desc:  'Masuk dengung (sebelum ي ن م و)',
    color: '#148F77',
    bg:    '#D1F2EB',
  },
  idghamBilagunnah: {
    label: 'Idgham – Gunnah',
    desc:  'Masuk tanpa dengung (sebelum ل ر)',
    color: '#1E8449',
    bg:    '#D5F5E3',
  },
  iqlab: {
    label: 'Iqlab',
    desc:  'Nun → mim (sebelum ب)',
    color: '#C0392B',
    bg:    '#FADBD8',
  },
  ikhfa: {
    label: 'Ikhfa\'',
    desc:  'Samar-dengung (sebelum 15 huruf ikhfa)',
    color: '#6C3483',
    bg:    '#E8DAEF',
  },

  // Mim sukun
  idghamMimi: {
    label: 'Idgham Mimi',
    desc:  'Mim masuk mim + gunnah',
    color: '#784212',
    bg:    '#FDEBD0',
  },
  ikhfaSyafawi: {
    label: 'Ikhfa\' Syafawi',
    desc:  'Mim samar sebelum ب',
    color: '#B03A2E',
    bg:    '#FADBD8',
  },
  izharSyafawi: {
    label: 'Izhar Syafawi',
    desc:  'Mim jelas (bukan sebelum م / ب)',
    color: '#5D6D7E',
    bg:    '#EAF0F6',
  },

  // Qalqalah
  qalqalah: {
    label: 'Qalqalah',
    desc:  'Memantul: ق ط ب ج د + sukun',
    color: '#7D3C98',
    bg:    '#F5EEF8',
  },

  // Gunnah
  gunnah: {
    label: 'Gunnah',
    desc:  'Dengung 2 harakat (نّ / مّ)',
    color: '#BA4A00',
    bg:    '#FDEBD0',
  },

  // Mad
  madWajib: {
    label: 'Mad Wajib',
    desc:  'Panjang 4–5 harakat (mad + hamza)',
    color: '#154360',
    bg:    '#D6EAF8',
  },
  madLazim: {
    label: 'Mad Lazim',
    desc:  'Panjang 6 harakat (mad + sukun/syiddah)',
    color: '#0E2D3C',
    bg:    '#AED6F1',
  },
  mad: {
    label: 'Mad Tabi\'i',
    desc:  'Panjang dasar 2 harakat',
    color: '#1F618D',
    bg:    '#D6EAF8',
  },
};
