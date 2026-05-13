// normalize: hapus harakat/tashkeel TANPA menyentuh huruf Arab dasar (U+0621–U+064A)
//
// BUG LAMA yang sering terjadi: range [ؐ-ً] = U+0610–U+064B MENCAKUP semua huruf
// Arab dasar (ء–ي = U+0621–U+064A), sehingga seluruh teks Arab ikut terhapus!
//
// FIX: gunakan codepoint eksplisit yang hanya menargetkan diakriti:
//   ؐ–ؚ  tanda dekoratif Quran (sallallahou, dll) — sebelum huruf Arab
//   ً–ٟ  harakat/tashkeel (fathatan, dammatan, kasratan, fathah,
//                  dammah, kasrah, shadda, sukun, dst)
//   ٰ         dagger alef (superscript alef)
//   ۖ–ۜ  tanda Quranic high
//   ۟–ۤ  tanda Quranic
//   ۧ–ۨ  tanda Quranic small high/low
//   ۪–ۭ  tanda Quranic low

const HARAKAT_RE = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g;

const normalize = (text) => {
  return text
    .replace(HARAKAT_RE, '')
    // Samakan semua variasi alef → ا
    .replace(/[آأإٱ]/g, 'ا')   // آ أ إ ٱ → ا
    // Alef maqsura → ya (U+0649 → U+064A)
    .replace(/ى/g, 'ي')
    // Farsi Yeh → Arabic Yeh (U+06CC → U+064A)
    .replace(/ی/g, 'ي')
    // Farsi Kaf → Arabic Kaf (U+06A9 → U+0643)
    .replace(/ک/g, 'ك')
    // Hapus tatweel (U+0640)
    .replace(/ـ/g, '')
    // Hapus tanda baca Arab & Latin
    .replace(/[،؛؟۔.,!?]/g, '')
    // Hapus spasi berlebih
    .replace(/\s+/g, ' ')
    .trim();
};

const levenshtein = (a, b) => {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
};

const wordSimilarity = (a, b) => {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return Math.max(0, 1 - levenshtein(a, b) / maxLen);
};

/**
 * Sequential alignment (DP) antara kata referensi dan kata transkripsi.
 * Mengembalikan:
 *   refToTrans[i] = indeks kata transkripsi yg cocok dengan kata referensi ke-i (-1 jika tidak ada)
 *   transToRef[j] = indeks kata referensi yg cocok dengan kata transkripsi ke-j (-1 jika tidak ada)
 *
 * Dipakai untuk memetakan timestamp Whisper → indeks kata referensi saat putar ulang.
 */
const alignSequential = (refWords, transWords, threshold = 0.85) => {
  const N = refWords.length;
  const M = transWords.length;

  // dp[i][j] = jumlah kata yang berhasil dicocokkan untuk ref[0..i-1] vs trans[0..j-1]
  const dp = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0));

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      const sim = wordSimilarity(refWords[i - 1], transWords[j - 1]);
      const hit = sim >= threshold ? 1 : 0;
      dp[i][j] = Math.max(
        dp[i - 1][j],            // lewati kata referensi (deletion)
        dp[i][j - 1],            // lewati kata transkripsi (insertion)
        dp[i - 1][j - 1] + hit  // cocok / tidak cocok
      );
    }
  }

  // Traceback
  const refToTrans = new Array(N).fill(-1);
  const transToRef = new Array(M).fill(-1);

  let i = N, j = M;
  while (i > 0 && j > 0) {
    const sim = wordSimilarity(refWords[i - 1], transWords[j - 1]);
    const hit = sim >= threshold ? 1 : 0;
    const diag = dp[i - 1][j - 1] + hit;

    if (diag >= dp[i - 1][j] && diag >= dp[i][j - 1]) {
      if (hit) {
        refToTrans[i - 1] = j - 1;
        transToRef[j - 1] = i - 1;
      }
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return { refToTrans, transToRef };
};

/**
 * Cari posisi tengah ayah dalam transWords secara independen (tanpa tergantung
 * global LCS). Ini lebih akurat untuk mendeteksi urutan karena tidak terpengaruh
 * oleh kata yang berulang (seperti الناس yang muncul 6× di An-Nas).
 *
 * Cara kerja: scan maju, cocokkan kata ayah satu per satu ke transWords.
 * Rata-rata posisi kata yang cocok = "center" ayah di transkripsi.
 *
 * @param {string[]} ayahWords  – kata-kata ayah setelah normalize
 * @param {string[]} transWords – semua kata transkripsi setelah normalize
 * @param {number}   threshold  – ambang similaritas (default 0.80)
 * @returns {number} center index, atau -1 jika ayah tidak terdeteksi
 */
const findAyahCenter = (ayahWords, transWords, threshold = 0.80) => {
  const positions = [];
  let ai = 0;
  for (let ti = 0; ti < transWords.length && ai < ayahWords.length; ti++) {
    if (wordSimilarity(ayahWords[ai], transWords[ti]) >= threshold) {
      positions.push(ti);
      ai++;
    }
  }
  // Minimal 40% kata cocok agar dianggap ditemukan
  if (positions.length < Math.max(1, ayahWords.length * 0.4)) return -1;
  return positions.reduce((a, b) => a + b, 0) / positions.length;
};

/**
 * Bandingkan teks referensi dengan transkripsi Whisper.
 *
 * @param {string}   original    – teks referensi lengkap
 * @param {string}   transcribed – hasil transkripsi Whisper
 * @param {string[]} [ayahTexts] – array teks per-ayat (tanpa bismillah).
 *                                 Jika diberikan, urutan ayat diperiksa dan
 *                                 pelanggaran urutan diberi penalti skor.
 *
 * Return:
 *   score      – persentase kata yang benar (0–100), sudah termasuk penalti urutan
 *   words      – [{word, correct}, ...] untuk setiap kata referensi
 *   transToRef – mapping indeks transkripsi → indeks referensi
 *   orderOk    – true jika semua ayat dibaca dalam urutan yang benar
 */
export const compareTexts = (original, transcribed, ayahTexts = null) => {
  const origWords  = normalize(original).split(/\s+/).filter(Boolean);
  const transWords = normalize(transcribed).split(/\s+/).filter(Boolean);


  if (transWords.length === 0) {
    return {
      score: 0,
      words: origWords.map(w => ({ word: w, correct: false })),
      transToRef: [],
      orderOk: true,
    };
  }

  const THRESHOLD = 0.85;
  const { refToTrans, transToRef } = alignSequential(origWords, transWords, THRESHOLD);

  const words = origWords.map((origWord, i) => ({
    word: origWord,
    correct: refToTrans[i] >= 0,
  }));

  const correct  = words.filter(w => w.correct).length;
  const rawScore = Math.round((correct / origWords.length) * 100);

  // ── Cek urutan ayat ──────────────────────────────────────────────────────
  // Hitung "pusat gravitasi" posisi transkripsi untuk setiap ayat.
  // Jika pusat ayat-N lebih kecil dari ayat-(N-1) → ayat terbalik → penalti.
  let score   = rawScore;
  let orderOk = true;

  if (ayahTexts && ayahTexts.length > 1) {
    // Hitung pusat per-ayat dengan pencarian INDEPENDEN ke transWords.
    // Tidak pakai global refToTrans karena bisa salah jika ada kata berulang
    // (contoh: الناس muncul 6× di An-Nas → LCS global salah petakan posisi).
    const centers = ayahTexts.map(text => {
      const ayahWords = normalize(text).split(/\s+/).filter(Boolean);
      return findAyahCenter(ayahWords, transWords);
    });

    // Deteksi pelanggaran dengan lastValidCenter agar gap center=-1 tidak
    // melewatkan perbandingan antar ayat yang jauh.
    const ayahOrderStatus = centers.map(() => 'ok');
    const ayahViolations  = [];
    let violations      = 0;
    let lastValidCenter = -1;
    let lastValidIdx    = -1;

    for (let i = 0; i < centers.length; i++) {
      if (centers[i] < 0) continue;
      if (lastValidCenter >= 0 && centers[i] < lastValidCenter) {
        violations++;
        ayahOrderStatus[i]            = 'wrong';
        ayahOrderStatus[lastValidIdx] = 'wrong';
        ayahViolations.push({ prevIdx: lastValidIdx, currIdx: i });
      }
      lastValidCenter = centers[i];
      lastValidIdx    = i;
    }

    if (violations > 0) {
      orderOk = false;
      const penalty = Math.pow(0.6, violations);
      score = Math.round(rawScore * penalty);
    }

    return { score, words, transToRef, orderOk, ayahOrderStatus, ayahViolations };
  }


  return { score, words, transToRef, orderOk, ayahOrderStatus: ayahTexts ? ayahTexts.map(() => 'ok') : [] };
};
