import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const PROFILE_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
  '#9B59B6', '#1ABC9C', '#E67E22', '#E91E63',
];

export const DAILY_LIMIT_SECS = 7 * 60; // 420 detik

const generateId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;

const today = () => new Date().toISOString().split('T')[0];

// ── PROFILES ────────────────────────────────────────────────

export const getProfiles = async () => {
  try {
    const d = await AsyncStorage.getItem('hq_profiles');
    return d ? JSON.parse(d) : [];
  } catch { return []; }
};

export const createProfile = async (name, color) => {
  const profile = {
    id: generateId(),
    name: name.trim(),
    color,
    createdAt: new Date().toISOString(),
  };
  const profiles = await getProfiles();
  profiles.push(profile);
  await AsyncStorage.setItem('hq_profiles', JSON.stringify(profiles));
  return profile;
};

export const deleteProfile = async (id) => {
  const profiles = await getProfiles();
  await AsyncStorage.setItem(
    'hq_profiles',
    JSON.stringify(profiles.filter(p => p.id !== id))
  );
  await AsyncStorage.removeItem(`hq_progress_${id}`);
  // hq_usage_device tidak dihapus — limit berlaku per perangkat, bukan per profil
};

// ── PROGRESS ────────────────────────────────────────────────

export const getProgress = async (profileId) => {
  try {
    const d = await AsyncStorage.getItem(`hq_progress_${profileId}`);
    return d ? JSON.parse(d) : {};
  } catch { return {}; }
};

export const saveProgress = async (profileId, surahNumber, score) => {
  try {
    const all = await getProgress(profileId);
    const prev = all[surahNumber] || { bestScore: 0, attempts: 0 };
    all[surahNumber] = {
      bestScore: Math.max(prev.bestScore, score),
      attempts: prev.attempts + 1,
      lastDate: new Date().toISOString(),
      completed: Math.max(prev.bestScore, score) >= 80,
    };
    await AsyncStorage.setItem(`hq_progress_${profileId}`, JSON.stringify(all));
  } catch (e) { console.warn('saveProgress error:', e); }
};

// ── USAGE (limit harian per PERANGKAT, bukan per profil) ─────
// Satu instalasi app = satu pool 7 menit/hari, dibagi semua profil.
// Key: 'hq_usage_device'  (tidak terikat profileId)

const DEVICE_USAGE_KEY = 'hq_usage_device';

export const getUsageToday = async () => {
  try {
    const d = await AsyncStorage.getItem(DEVICE_USAGE_KEY);
    const all = d ? JSON.parse(d) : {};
    return all[today()] || 0;
  } catch { return 0; }
};

export const addUsage = async (seconds) => {
  try {
    const d = await AsyncStorage.getItem(DEVICE_USAGE_KEY);
    const all = d ? JSON.parse(d) : {};
    const t = today();
    all[t] = (all[t] || 0) + Math.max(0, seconds);
    // Simpan hanya 30 hari terakhir
    const trimmed = Object.fromEntries(
      Object.entries(all).sort().slice(-30)
    );
    await AsyncStorage.setItem(DEVICE_USAGE_KEY, JSON.stringify(trimmed));
  } catch (e) { console.warn('addUsage error:', e); }
};

export const getRemainingSeconds = async () => {
  const used  = await getUsageToday();
  const limit = await getDailyLimit();
  return Math.max(0, limit - used);
};

export const formatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ── AKSES KODE ───────────────────────────────────────────────────────────────

const ACCESS_KEY  = 'hq_access_code';
const PLAN_KEY    = 'hq_plan';          // 'free' | 'bulanan' | 'tahunan'
const DEVICE_ID_KEY = 'hq_device_id';

/** Ambil atau buat deviceId permanen untuk device ini */
export const getDeviceId = async () => {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      // Generate ID unik untuk device ini
      id = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch { return 'unknown-device'; }
};

/** Apakah device ini sudah punya akses aktif? */
export const hasAccess = async () => {
  try {
    const code = await AsyncStorage.getItem(ACCESS_KEY);
    return !!code;
  } catch { return false; }
};

/** Deteksi plan dari prefix kode */
const detectPlanFromCode = (code) => {
  const c = code.toUpperCase();
  if (c.startsWith('HQT-')) return 'tahunan';
  if (c.startsWith('HQB-')) return 'bulanan';
  return 'bulanan'; // default untuk kode lama HQ-
};

/** Ambil plan saat ini ('free' | 'bulanan' | 'tahunan') */
export const getPlan = async () => {
  try {
    const plan = await AsyncStorage.getItem(PLAN_KEY);
    if (plan) return plan;
    // Auto-migrasi: user lama punya kode tapi belum ada hq_plan tersimpan
    const code = await AsyncStorage.getItem(ACCESS_KEY);
    if (code) {
      const detected = detectPlanFromCode(code);
      await AsyncStorage.setItem(PLAN_KEY, detected);
      return detected;
    }
    return 'free';
  } catch { return 'free'; }
};

/**
 * Batas rekaman per hari berdasarkan plan:
 *   free     → 60 detik (1 menit)
 *   bulanan  → 420 detik (7 menit)
 *   tahunan  → 420 detik (7 menit)
 *   hafiz    → 900 detik (15 menit) — untuk masa depan
 */
export const getDailyLimit = async () => {
  const plan = await getPlan();
  switch (plan) {
    case 'tahunan': return 420;
    case 'bulanan': return 420;
    case 'hafiz':   return 900;
    default:        return 60;   // free
  }
};

/** Simpan kode setelah berhasil divalidasi server */
export const saveAccessCode = async (code, planFromServer) => {
  await AsyncStorage.setItem(ACCESS_KEY, code);
  // Simpan plan: utamakan dari server (lebih akurat), fallback deteksi lokal
  const plan = planFromServer || detectPlanFromCode(code);
  await AsyncStorage.setItem(PLAN_KEY, plan);
};

/** Hapus akses (untuk testing / reset) */
export const clearAccessCode = async () => {
  await AsyncStorage.removeItem(ACCESS_KEY);
};

// ── FREE TRIAL (1 menit pertama) ─────────────────────────────────────────────

const FIRST_USE_KEY = 'hq_first_use_ts';
const FREE_TRIAL_MS = 60 * 1000; // 60 detik

/**
 * Ambil (atau catat pertama kali) timestamp saat user pertama membuka HafalScreen.
 * Dipanggil saat HafalScreen mount.
 */
export const getFirstUseTimestamp = async () => {
  try {
    let ts = await AsyncStorage.getItem(FIRST_USE_KEY);
    if (!ts) {
      ts = String(Date.now());
      await AsyncStorage.setItem(FIRST_USE_KEY, ts);
    }
    return parseInt(ts, 10);
  } catch {
    return Date.now();
  }
};

/**
 * Berapa milidetik tersisa dari free trial?
 * Return ≤ 0 jika trial sudah habis.
 */
export const getFreeTrialRemaining = async () => {
  const firstUse = await getFirstUseTimestamp();
  return FREE_TRIAL_MS - (Date.now() - firstUse);
};
