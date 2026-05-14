import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, TextInput,
} from 'react-native';
import { fetchSurah } from '../services/quranApi';
import { SURAH_MEANING_ID } from '../utils/surahNames';

const BISMILLAH = 'بسم الله الرحمن الرحيم';

export default function SurahScreen({ route, navigation }) {
  const { surah, profile, fromAyah, toAyah } = route.params;
  const [ayahs, setAyahs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(0);
  const [maxAyah, setMaxAyah] = useState(0); // batas atas dari juz / total surah
  const [showTranslation, setShowTranslation] = useState(false);
  const [showTranslit, setShowTranslit] = useState(false);

  // Tampilkan Bismillah untuk semua surah kecuali Al-Fatiha (1) dan At-Tawbah (9)
  const showBismillah = surah.number !== 1 && surah.number !== 9;

  useEffect(() => {
    navigation.setOptions({ title: surah.englishName });
    fetchSurah(surah.number)
      .then(data => {
        setAyahs(data);
        const start = fromAyah || 1;
        const max   = toAyah ? Math.min(toAyah, data.length) : data.length;
        setStartAyah(start);
        setMaxAyah(max);
        // Default: maksimal 5 ayat dari titik awal, agar anak tidak kewalahan
        setEndAyah(Math.min(start + 4, max));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selectedCount = endAyah > 0 ? endAyah - startAyah + 1 : 0;

  const handleStart = () => {
    const selectedAyahs = ayahs.slice(startAyah - 1, endAyah);
    navigation.navigate('Hafal', { surah, ayahs: selectedAyahs, profile });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1B4332" />
        <Text style={styles.loadingText}>Memuat surah...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.surahHeader}>
        <Text style={styles.arabicTitle}>{surah.name}</Text>
        <Text style={styles.surahMeta}>
          {surah.englishName} • {SURAH_MEANING_ID[surah.number] || surah.englishNameTranslation}
        </Text>
        <Text style={styles.surahMeta}>{ayahs.length} Ayat</Text>
      </View>

      {/* Range selector */}
      <View style={styles.rangeSection}>
        <Text style={styles.rangeTitle}>Pilih ayat yang akan dihafal</Text>
        <View style={styles.rangeRow}>
          <View style={styles.rangeItem}>
            <Text style={styles.rangeItemLabel}>Dari Ayat</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setStartAyah(v => Math.max(1, v - 1))}>
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.counterInput}
                value={String(startAyah)}
                onChangeText={t => {
                  const n = parseInt(t, 10);
                  if (!isNaN(n) && n >= 1 && n <= ayahs.length) {
                    setStartAyah(n);
                    if (n > endAyah) setEndAyah(n);
                  } else if (t === '') {
                    setStartAyah(1);
                  }
                }}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
              />
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => {
                  const next = startAyah + 1;
                  if (next <= ayahs.length) {
                    setStartAyah(next);
                    if (next > endAyah) setEndAyah(next);
                  }
                }}>
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.rangeSep}>—</Text>

          <View style={styles.rangeItem}>
            <Text style={styles.rangeItemLabel}>Sampai Ayat</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setEndAyah(v => Math.max(startAyah, v - 1))}>
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.counterInput}
                value={String(endAyah)}
                onChangeText={t => {
                  const n = parseInt(t, 10);
                  if (!isNaN(n) && n >= startAyah && n <= maxAyah) {
                    setEndAyah(n);
                  } else if (t === '') {
                    setEndAyah(startAyah);
                  }
                }}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
              />
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setEndAyah(v => Math.min(maxAyah, v + 1))}>
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <Text style={styles.rangeInfo}>
          {selectedCount} ayat dipilih
          {selectedCount > 0 ? `  (ayat ${startAyah}–${endAyah})` : ''}
        </Text>
        {/* Hint batas juz */}
        {maxAyah < ayahs.length && (
          <Text style={styles.rangeHint}>
            💡 Segmen juz ini: ayat {startAyah}–{maxAyah}
          </Text>
        )}
        <TouchableOpacity
          style={styles.semuaBtn}
          onPress={() => { setStartAyah(fromAyah || 1); setEndAyah(maxAyah); }}
        >
          <Text style={styles.semuaBtnText}>
            Semua di Segmen Ini ({maxAyah - (fromAyah || 1) + 1} ayat)
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.85}>
        <Text style={styles.startBtnText}>Mulai Hafalan →</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Toggle terjemahan & latin */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Tampilkan:</Text>
          <TouchableOpacity
            style={[styles.toggleBtn, showTranslation && styles.toggleBtnOn]}
            onPress={() => setShowTranslation(v => !v)}
          >
            <Text style={[styles.toggleBtnText, showTranslation && styles.toggleBtnTextOn]}>
              🇮🇩 Terjemahan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, showTranslit && styles.toggleBtnOn]}
            onPress={() => setShowTranslit(v => !v)}
          >
            <Text style={[styles.toggleBtnText, showTranslit && styles.toggleBtnTextOn]}>
              🔤 Latin
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Isi Surah</Text>

        {/* Header Bismillah */}
        {showBismillah && (
          <View style={styles.bismillahCard}>
            <Text style={styles.bismillahText}>{BISMILLAH}</Text>
          </View>
        )}

        {ayahs.map(ayah => (
          <View
            key={ayah.numberInSurah}
            style={[
              styles.ayahCard,
              ayah.numberInSurah >= startAyah &&
              ayah.numberInSurah <= endAyah &&
              styles.ayahCardSelected,
            ]}
          >
            <View style={styles.ayahBadge}>
              <Text style={styles.ayahBadgeText}>{ayah.numberInSurah}</Text>
            </View>
            <Text style={styles.arabicText}>{ayah.text}</Text>
            {showTranslit && (
              <Text style={styles.translitText}>{ayah.transliteration}</Text>
            )}
            {showTranslation && (
              <Text style={styles.translationText}>{ayah.translation}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#555' },

  surahHeader: { backgroundColor: '#1B4332', padding: 20, alignItems: 'center' },
  arabicTitle: { color: '#D4AC0D', fontSize: 34 },
  surahMeta: { color: '#ffffff99', fontSize: 13, marginTop: 6 },

  rangeSection: {
    backgroundColor: '#fff', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  rangeTitle: { fontSize: 13, color: '#555', fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rangeItem: { alignItems: 'center', flex: 1 },
  rangeItemLabel: { fontSize: 12, color: '#888', marginBottom: 8 },
  counterRow: { flexDirection: 'row', alignItems: 'center' },
  counterBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center',
  },
  counterBtnText: { fontSize: 22, color: '#1B4332', fontWeight: 'bold', lineHeight: 26 },
  counterInput: {
    fontSize: 22, fontWeight: 'bold', color: '#1B4332',
    marginHorizontal: 8, minWidth: 48, textAlign: 'center',
    borderBottomWidth: 2, borderBottomColor: '#1B4332',
    paddingVertical: 2,
  },
  rangeSep: { fontSize: 22, color: '#bbb', paddingTop: 18, paddingHorizontal: 6 },
  rangeInfo: {
    fontSize: 12, color: '#1B4332', textAlign: 'center',
    marginTop: 10, fontWeight: '600',
  },
  rangeHint: {
    fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4, fontStyle: 'italic',
  },
  semuaBtn: {
    marginTop: 10, borderWidth: 1.5, borderColor: '#1B4332',
    borderRadius: 8, paddingVertical: 7, alignItems: 'center',
  },
  semuaBtnText: { color: '#1B4332', fontSize: 13, fontWeight: '600' },

  startBtn: {
    backgroundColor: '#D4AC0D', margin: 16, padding: 15,
    borderRadius: 14, alignItems: 'center', elevation: 3,
  },
  startBtnText: { color: '#1B4332', fontSize: 16, fontWeight: 'bold' },

  scroll: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 10 },
  sectionLabel: { fontSize: 13, color: '#888', marginBottom: 10, fontWeight: '600' },

  bismillahCard: {
    backgroundColor: '#1B4332', borderRadius: 14, padding: 16,
    marginBottom: 10, alignItems: 'center',
  },
  bismillahText: { fontSize: 22, color: '#D4AC0D', textAlign: 'center' },

  ayahCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 10, elevation: 1,
  },
  ayahCardSelected: {
    backgroundColor: '#eaf5ea', borderWidth: 1.5, borderColor: '#1B4332',
  },
  ayahBadge: {
    backgroundColor: '#1B4332', width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  ayahBadgeText: { color: '#D4AC0D', fontSize: 11, fontWeight: 'bold' },
  arabicText: { fontSize: 24, textAlign: 'right', lineHeight: 42, color: '#1a1a1a' },
  translitText: { fontSize: 13, color: '#555', marginTop: 6, fontStyle: 'italic' },
  translationText: { fontSize: 13, color: '#1B4332', marginTop: 4, lineHeight: 20 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  toggleLabel: { fontSize: 12, color: '#888', marginRight: 8 },
  toggleBtn: {
    borderWidth: 1.5, borderColor: '#c8d8c8', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5, marginRight: 8,
  },
  toggleBtnOn: { backgroundColor: '#1B4332', borderColor: '#1B4332' },
  toggleBtnText: { fontSize: 12, color: '#555', fontWeight: '600' },
  toggleBtnTextOn: { color: '#D4AC0D' },
});
