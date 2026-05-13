import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { fetchSurahList } from '../services/quranApi';
import {
  getProgress, getRemainingSeconds,
  DAILY_LIMIT_SECS, formatTime,
} from '../utils/storage';
import { JUZ_LIST, JUZ_SEGMENTS } from '../utils/juzData';
import { SURAH_MEANING_ID } from '../utils/surahNames';

export default function HomeScreen({ route, navigation }) {
  const { profile } = route.params;
  const [allSurahs, setAllSurahs] = useState([]);
  const [progress, setProgress] = useState({});
  const [selectedJuz, setSelectedJuz] = useState(30);
  const [loading, setLoading] = useState(true);
  const [remainingSecs, setRemainingSecs] = useState(DAILY_LIMIT_SECS);

  useEffect(() => {
    fetchSurahList()
      .then(data => { setAllSurahs(data); setLoading(false); })
      .catch(() => setLoading(false));
    getProgress(profile.id).then(setProgress);
    getRemainingSeconds().then(setRemainingSecs);
  }, []);

  // Bangun daftar entri untuk juz yang dipilih
  const segments = JUZ_SEGMENTS[selectedJuz] || [];
  const juzEntries = segments
    .map(seg => {
      const surah = allSurahs.find(s => s.number === seg.s);
      if (!surah) return null;
      const isFull = seg.from === 1 && seg.to === surah.numberOfAyahs;
      return { surah, from: seg.from, to: seg.to, isFull };
    })
    .filter(Boolean);

  const uniqueSurahCount = new Set(juzEntries.map(e => e.surah.number)).size;
  const completedCount = [...new Set(juzEntries.map(e => e.surah.number))]
    .filter(n => progress[n]?.completed).length;

  const timeRatio = remainingSecs / DAILY_LIMIT_SECS;
  const timeColor = timeRatio > 0.5 ? '#1B4332'
    : timeRatio > 0.2 ? '#b8860b'
    : '#c0392b';

  const initials = profile.name.trim().split(/\s+/)
    .slice(0, 2).map(w => w[0]).join('').toUpperCase();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1B4332" />
        <Text style={styles.loadingText}>Memuat Al-Quran...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Profil & sisa waktu */}
      <View style={styles.profileBar}>
        <View style={[styles.avatar, { backgroundColor: profile.color }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile.name}</Text>
          <Text style={[styles.remainingLabel, { color: timeColor }]}>
            {remainingSecs > 0
              ? `Sisa perangkat hari ini: ${formatTime(remainingSecs)}`
              : 'Waktu perangkat habis hari ini 🌙'}
          </Text>
          <View style={styles.timeTrack}>
            <View style={[
              styles.timeFill,
              { width: `${Math.round(timeRatio * 100)}%`, backgroundColor: timeColor },
            ]} />
          </View>
        </View>
        <TouchableOpacity
          style={styles.switchBtn}
          onPress={() => navigation.navigate('Profile', {})}
        >
          <Text style={styles.switchBtnText}>Ganti{'\n'}Profil</Text>
        </TouchableOpacity>
      </View>

      {/* Juz selector */}
      <View style={styles.juzHeader}>
        <Text style={styles.juzTitle}>Pilih Juz</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.juzScroll}>
          {JUZ_LIST.map(juz => (
            <TouchableOpacity
              key={juz}
              style={[styles.juzBtn, selectedJuz === juz && styles.juzBtnActive]}
              onPress={() => setSelectedJuz(juz)}
            >
              <Text style={[styles.juzBtnText, selectedJuz === juz && styles.juzBtnTextActive]}>
                {juz}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Stats bar */}
      {juzEntries.length > 0 && (
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            Juz {selectedJuz} • {uniqueSurahCount} Surah •{' '}
            <Text style={styles.statsGreen}>{completedCount} selesai</Text>
          </Text>
        </View>
      )}

      {/* Daftar entri per juz */}
      <FlatList
        data={juzEntries}
        keyExtractor={(item, idx) => `${item.surah.number}-${item.from}-${idx}`}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>Memuat data juz...</Text>
          </View>
        }
        renderItem={({ item }) => {
          const prog = progress[item.surah.number];
          const score = prog?.bestScore ?? null;
          const done = prog?.completed;
          const ayahCount = item.to - item.from + 1;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('Surah', {
                surah: item.surah,
                profile,
                fromAyah: item.from,
                toAyah: item.to,
              })}
              activeOpacity={0.7}
            >
              <View style={styles.numberBadge}>
                <Text style={styles.numberText}>{item.surah.number}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.surahName}>{item.surah.englishName}</Text>
                <Text style={styles.surahMeaning}>
                  {SURAH_MEANING_ID[item.surah.number] || item.surah.englishNameTranslation}
                </Text>
                {item.isFull ? (
                  <Text style={styles.ayahInfo}>{ayahCount} ayat</Text>
                ) : (
                  <Text style={styles.ayahInfo}>
                    Ayat {item.from}–{item.to}
                    <Text style={styles.ayahCount}> ({ayahCount} ayat)</Text>
                  </Text>
                )}
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.arabicName}>{item.surah.name}</Text>
                {score !== null && (
                  <View style={[styles.scoreBadge, done ? styles.scoreDone : styles.scorePartial]}>
                    <Text style={styles.scoreText}>{score}%</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, color: '#555', fontSize: 15 },
  emptyText: { color: '#888', fontSize: 15 },

  profileBar: {
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  remainingLabel: { fontSize: 12, marginTop: 2 },
  timeTrack: {
    height: 4, backgroundColor: '#e0e0e0', borderRadius: 2,
    marginTop: 5, overflow: 'hidden',
  },
  timeFill: { height: 4, borderRadius: 2 },
  switchBtn: {
    borderWidth: 1.5, borderColor: '#c8d8c8', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginLeft: 10,
  },
  switchBtnText: { fontSize: 11, color: '#1B4332', fontWeight: '600', textAlign: 'center' },

  juzHeader: { backgroundColor: '#1B4332', paddingTop: 10, paddingBottom: 12 },
  juzTitle: { color: '#D4AC0D', fontSize: 12, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8 },
  juzScroll: { paddingHorizontal: 12 },
  juzBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 3, backgroundColor: '#ffffff22',
  },
  juzBtnActive: { backgroundColor: '#D4AC0D' },
  juzBtnText: { color: '#ffffffaa', fontSize: 13, fontWeight: '600' },
  juzBtnTextActive: { color: '#1B4332', fontWeight: 'bold' },

  statsBar: { backgroundColor: '#e8f0e8', paddingHorizontal: 16, paddingVertical: 8 },
  statsText: { fontSize: 13, color: '#555' },
  statsGreen: { color: '#1B4332', fontWeight: 'bold' },

  list: { padding: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  numberBadge: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#1B4332', justifyContent: 'center',
    alignItems: 'center', marginRight: 14,
  },
  numberText: { color: '#D4AC0D', fontWeight: 'bold', fontSize: 14 },
  cardInfo: { flex: 1 },
  surahName: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  surahMeaning: { fontSize: 12, color: '#777', marginTop: 2 },
  ayahInfo: { fontSize: 11, color: '#1B4332', marginTop: 4, fontWeight: '600' },
  ayahCount: { color: '#888', fontWeight: 'normal' },
  cardRight: { alignItems: 'flex-end' },
  arabicName: { fontSize: 20, color: '#1B4332' },
  scoreBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  scoreDone: { backgroundColor: '#d4edda' },
  scorePartial: { backgroundColor: '#fff3cd' },
  scoreText: { fontSize: 11, fontWeight: 'bold', color: '#333' },
});
