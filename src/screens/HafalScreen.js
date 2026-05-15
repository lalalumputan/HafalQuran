import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { transcribeAudio } from '../services/whisperApi';
import { compareTexts } from '../utils/textComparison';
import { getAyahAudioUrl, getBismillahAudioUrl } from '../services/quranApi';
import { saveProgress, addUsage, getRemainingSeconds, hasAccess, getPlan, formatTime } from '../utils/storage';
import { SERVER_URL } from '../config';
import { detectWordTajwid, TAJWID_INFO } from '../utils/tajwidAnalyzer';
import PaywallModal from '../components/PaywallModal';

const BISMILLAH_TEXT = 'بسم الله الرحمن الرحيم';

export default function HafalScreen({ route }) {
  const { ayahs, surah, profile } = route.params;
  const [showAyah, setShowAyah]               = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showTranslit, setShowTranslit]       = useState(false);
  const [isRecording, setIsRecording]         = useState(false);
  const [isEvaluating, setIsEvaluating]       = useState(false);
  const [isPlaying, setIsPlaying]               = useState(false);
  const [currentAyahIdx, setCurrentAyahIdx]     = useState(-1); // ayat murottal yg sedang diputar
  const [result, setResult]                     = useState(null);
  const [rawTranscription, setRawTranscription] = useState('');
  const [recordingUri, setRecordingUri]         = useState(null);
  const [isPlayingRec, setIsPlayingRec]         = useState(false);
  const [showPaywall, setShowPaywall]           = useState(false);
  const [showSurvey, setShowSurvey]             = useState(false);
  const [surveyAnswered, setSurveyAnswered]     = useState(false);
  const [singlePlayingIdx, setSinglePlayingIdx] = useState(-1); // ayat tunggal yg diputar
  const [remainingSecs, setRemainingSecs]       = useState(null); // null = belum di-load
  const [currentPlan, setCurrentPlan]           = useState('free');

  const soundRef        = useRef(null);
  const recordingRef    = useRef(null);
  const playingRef      = useRef(false);
  const recordStartRef  = useRef(null);
  const recSoundRef     = useRef(null);  // untuk putar ulang rekaman user
  const quotaTimerRef   = useRef(null);  // auto-stop saat kuota habis mid-recording

  // Sertakan Bismillah jika dimulai dari ayat 1 (kecuali Al-Fatiha & At-Tawbah)
  const includesBismillah =
    surah.number !== 1 &&
    surah.number !== 9 &&
    ayahs[0]?.numberInSurah === 1;

  // Teks referensi lengkap untuk evaluasi
  const combinedText =
    (includesBismillah ? BISMILLAH_TEXT + ' ' : '') +
    ayahs.map(a => a.text).join(' ');

  const ayahLabel =
    ayahs.length === 1
      ? `Ayat ${ayahs[0].numberInSurah}`
      : `Ayat ${ayahs[0].numberInSurah}–${ayahs[ayahs.length - 1].numberInSurah}`;

  // ── Per-word data: tajwid + indeks global untuk evaluasi ──────────────────
  const { wordsByAyah, activeTajwidTypes, hasTajwid } = useMemo(() => {
    let offset = includesBismillah ? 4 : 0;
    const byAyah = ayahs.map(() => []);
    const tajwidSet = new Set();

    // Bangun flat list kata semua ayah agar bisa lookup kata berikutnya lintas ayat
    const allWords = ayahs.flatMap(a => a.text.trim().split(/\s+/));

    let globalWordIdx = 0;
    ayahs.forEach((ayah, ayahIdx) => {
      const words = ayah.text.trim().split(/\s+/);
      words.forEach(word => {
        // Kata berikutnya: dalam ayat sama atau ayat berikutnya
        const nextWord = allWords[globalWordIdx + 1] || null;
        const tajwid = detectWordTajwid(word, nextWord);
        if (tajwid) tajwidSet.add(tajwid);
        byAyah[ayahIdx].push({ word, globalIdx: offset, tajwid });
        offset++;
        globalWordIdx++;
      });
    });
    return { wordsByAyah: byAyah, activeTajwidTypes: [...tajwidSet], hasTajwid: tajwidSet.size > 0 };
  }, [ayahs, includesBismillah]);

  // ── Load kuota saat mount ──────────────────────────────────────────────────
  useEffect(() => {
    const loadQuota = async () => {
      const plan = await getPlan();
      const rem  = await getRemainingSeconds();
      setCurrentPlan(plan);
      setRemainingSecs(rem);
    };
    loadQuota();
  }, []);

  // ── Refresh kuota setelah rekaman selesai ─────────────────────────────────
  const refreshQuota = async () => {
    const rem = await getRemainingSeconds();
    setRemainingSecs(rem);
  };

  // ── Cleanup audio saat unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Hentikan semua audio agar tidak double-play saat pindah surah
      playingRef.current = false;
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = '';
      }
      soundRef.current?.unloadAsync();
      recordingRef.current?.stopAndUnloadAsync();
      recSoundRef.current?.unloadAsync();
      clearTimeout(quotaTimerRef.current);
    };
  }, []);

  // ── Putar ulang rekaman user ───────────────────────────────────────────────
  const stopRecording = async () => {
    try {
      await recSoundRef.current?.stopAsync();
      await recSoundRef.current?.unloadAsync();
    } catch { /* ignore */ }
    recSoundRef.current = null;
    setIsPlayingRec(false);
  };

  const playRecording = async () => {
    if (!recordingUri) return;
    if (isPlayingRec) { await stopRecording(); return; }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      setIsPlayingRec(true);
      const { sound } = await Audio.Sound.createAsync(
        { uri: recordingUri },
        { shouldPlay: true },
        (status) => {
          if (status.didJustFinish) stopRecording();
        }
      );
      recSoundRef.current = sound;
    } catch {
      setIsPlayingRec(false);
      Alert.alert('Error', 'Tidak bisa memutar rekaman.');
    }
  };

  // ── Murottal ───────────────────────────────────────────────────────────────
  const webAudioRef = useRef(null); // untuk web: satu elemen <audio> yang di-reuse

  const stopMurottal = async () => {
    playingRef.current = false;
    setIsPlaying(false);
    setCurrentAyahIdx(-1);
    if (Platform.OS === 'web') {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = '';
      }
    } else {
      try {
        await soundRef.current?.stopAsync();
        await soundRef.current?.unloadAsync();
      } catch { /* ignore */ }
      soundRef.current = null;
    }
  };

  // ── Putar satu ayat saja ──────────────────────────────────────────────────
  const playSingleAyah = async (ayahIdx) => {
    // Jika ayat ini sedang diputar → stop
    if (singlePlayingIdx === ayahIdx) {
      setSinglePlayingIdx(-1);
      if (Platform.OS === 'web') {
        webAudioRef.current?.pause();
      } else {
        try { await soundRef.current?.stopAsync(); await soundRef.current?.unloadAsync(); } catch {}
        soundRef.current = null;
      }
      return;
    }

    // Stop apapun yang sedang main
    await stopMurottal();
    setSinglePlayingIdx(ayahIdx);

    try {
      const url = getAyahAudioUrl(ayahs[ayahIdx].number);
      if (Platform.OS === 'web') {
        const audio = webAudioRef.current || new window.Audio();
        webAudioRef.current = audio;
        audio.src = url;
        await audio.play();
        audio.onended = () => setSinglePlayingIdx(-1);
        audio.onerror = () => setSinglePlayingIdx(-1);
      } else {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(status => {
          if (status.didJustFinish) {
            setSinglePlayingIdx(-1);
            sound.unloadAsync();
            soundRef.current = null;
          }
        });
      }
    } catch {
      setSinglePlayingIdx(-1);
      Alert.alert('Error', 'Tidak bisa memutar audio.');
    }
  };

  // Web: pakai satu elemen <audio> HTML dan ganti src per ayat
  // agar Safari iOS tidak memblokir autoplay setelah ayat pertama
  // PENTING: pakai window.Audio bukan Audio (Audio sudah di-import dari expo-av)
  const playMurottalWeb = async () => {
    const audio = webAudioRef.current || new window.Audio();
    webAudioRef.current = audio;

    // Putar Bismillah dulu sebelum ayat pertama (kecuali Al-Fatiha & At-Tawbah)
    if (includesBismillah && playingRef.current) {
      audio.src = getBismillahAudioUrl();
      try {
        await audio.play();
        await new Promise(resolve => {
          audio.onended = resolve;
          audio.onerror = resolve;
        });
      } catch { /* lanjut meski bismillah gagal */ }
    }

    for (let i = 0; i < ayahs.length; i++) {
      if (!playingRef.current) break;
      setCurrentAyahIdx(i);
      audio.src = getAyahAudioUrl(ayahs[i].number);
      try {
        await audio.play();
        await new Promise(resolve => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          audio.onended = finish;
          audio.onerror = finish;
          // Cek jika stop ditekan
          const timer = setInterval(() => {
            if (!playingRef.current) { clearInterval(timer); finish(); }
          }, 200);
          audio.onended = () => { clearInterval(timer); finish(); };
        });
      } catch { break; }
    }
    playingRef.current = false;
    setIsPlaying(false);
    setCurrentAyahIdx(-1);
  };

  // Native: expo-av per ayat
  const playMurottalNative = async () => {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

    // Putar Bismillah dulu sebelum ayat pertama
    if (includesBismillah && playingRef.current) {
      try {
        const { sound: bismSound } = await Audio.Sound.createAsync(
          { uri: getBismillahAudioUrl() }, { shouldPlay: true }
        );
        await new Promise(resolve => {
          bismSound.setOnPlaybackStatusUpdate(s => {
            if (s.didJustFinish || !playingRef.current) resolve();
          });
        });
        await bismSound.unloadAsync();
      } catch { /* lanjut meski bismillah gagal */ }
    }

    for (let i = 0; i < ayahs.length; i++) {
      if (!playingRef.current) break;
      setCurrentAyahIdx(i);
      const { sound } = await Audio.Sound.createAsync(
        { uri: getAyahAudioUrl(ayahs[i].number) },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      await new Promise(resolve => {
        sound.setOnPlaybackStatusUpdate(status => {
          if (status.didJustFinish || !playingRef.current) resolve();
        });
      });
      await sound.unloadAsync();
      soundRef.current = null;
    }
    playingRef.current = false;
    setIsPlaying(false);
    setCurrentAyahIdx(-1);
  };

  const playMurottal = async () => {
    try {
      await stopMurottal();
      setIsPlaying(true);
      playingRef.current = true;
      if (Platform.OS === 'web') {
        await playMurottalWeb();
      } else {
        await playMurottalNative();
      }
    } catch {
      playingRef.current = false;
      setIsPlaying(false);
      setCurrentAyahIdx(-1);
      Alert.alert('Error', 'Tidak bisa memutar audio. Periksa koneksi internet.');
    }
  };

  // ── Survey Hafiz ───────────────────────────────────────────────────────────
  // Muncul satu kali saat kuota habis (atau paywall muncul), untuk riset pasar
  const triggerSurveyIfNeeded = async (plan) => {
    if (surveyAnswered) return;
    const shown = await AsyncStorage.getItem('hq_survey_shown');
    if (shown) { setSurveyAnswered(true); return; }
    // Hanya tampilkan untuk user non-tahunan (tahunan sudah premium)
    if (plan !== 'tahunan') {
      setShowSurvey(true);
    }
  };

  const submitSurvey = async (answer) => {
    setShowSurvey(false);
    setSurveyAnswered(true);
    await AsyncStorage.setItem('hq_survey_shown', '1');
    try {
      const deviceId = await AsyncStorage.getItem('hq_device_id');
      const plan     = await getPlan();
      await fetch(`${SERVER_URL}/survey-interest`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ answer, deviceId, plan }),
      });
    } catch { /* silent — tidak kritis */ }
  };

  // ── Rekam ──────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      // Cek daily limit dulu (free=60s, berbayar=420s)
      const remaining = await getRemainingSeconds();
      if (remaining <= 0) {
        const unlocked = await hasAccess();
        const plan     = await getPlan();
        if (!unlocked) {
          // Free user habis kuota harian → tampilkan paywall
          setShowPaywall(true);
          triggerSurveyIfNeeded('free');
        } else if (plan === 'tahunan') {
          Alert.alert('Kuota Hari Ini Habis 🌙', 'Kembali lagi besok ya!');
        } else {
          Alert.alert(
            'Kuota Hari Ini Habis ⏱️',
            'Upgrade ke paket Tahunan untuk hemat lebih banyak!',
            [
              { text: 'Nanti', style: 'cancel' },
              { text: 'Lihat Paket Tahunan', onPress: () => setShowPaywall(true) },
            ]
          );
          triggerSurveyIfNeeded(plan);
        }
        return;
      }
      setResult(null);
      setRecordingUri(null);
      await stopRecording();
      await stopMurottal();
      // Di web, browser otomatis minta izin saat getUserMedia dipanggil di dalam createAsync.
      // requestPermissionsAsync() di web mengembalikan granted:false sebelum izin pernah diminta
      // sehingga recording tidak pernah bisa dimulai. Skip check ini khusus web.
      if (Platform.OS !== 'web') {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) { Alert.alert('Izin Diperlukan', 'Aplikasi butuh izin mikrofon.'); return; }
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync({
        android: {
          extension: '.m4a', outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100, numberOfChannels: 1, bitRate: 128000,
        },
        ios: {
          extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100, numberOfChannels: 1, bitRate: 128000,
        },
        web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
      });
      recordingRef.current = recording;
      recordStartRef.current = Date.now();
      setIsRecording(true);

      // Auto-stop saat kuota habis (skip jika lifetime / unlimited)
      clearTimeout(quotaTimerRef.current);
      if (isFinite(remaining)) {
        quotaTimerRef.current = setTimeout(() => {
          if (recordingRef.current) stopAndEvaluate();
        }, remaining * 1000);
      }

    } catch (e) {
      Alert.alert('Error', 'Tidak bisa memulai rekaman: ' + (e.message || ''));
    }
  };

  const stopAndEvaluate = async () => {
    clearTimeout(quotaTimerRef.current);
    try {
      setIsRecording(false);
      setIsEvaluating(true);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (!uri) throw new Error('File rekaman tidak ditemukan.');

      const durationSecs = Math.round(
        (Date.now() - (recordStartRef.current || Date.now())) / 1000
      );

      const { text: transcribed } = await transcribeAudio(uri);
      setRawTranscription(transcribed);
      setRecordingUri(uri);

      const evalResult = compareTexts(
        combinedText,
        transcribed,
        ayahs.map(a => a.text),   // untuk cek urutan per-ayat
      );
      setResult(evalResult);

      await addUsage(durationSecs); // selalu track, device-wide (free maupun berbayar)
      await refreshQuota();          // update tampilan sisa kuota
      if (profile?.id) {
        await saveProgress(profile.id, surah.number, evalResult.score);
      }
    } catch (e) {
      Alert.alert('Gagal Evaluasi', e.message || 'Terjadi kesalahan.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // ── Warna skor ─────────────────────────────────────────────────────────────
  const scoreColor = result
    ? result.score >= 80 ? '#1B4332' : result.score >= 50 ? '#b8860b' : '#c0392b'
    : '#000';
  const scoreFeedback = result
    ? result.score >= 80 ? 'Masya Allah! Bacaan sangat baik!'
      : result.score >= 50 ? 'Bagus! Terus berlatih ya!'
      : 'Coba dengar murottal lagi, lalu ulangi'
    : '';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.ayahLabel}>{ayahLabel}</Text>

      {/* ── Kartu Ayat ── */}
      <View style={styles.ayahCard}>
        {/* ── Tombol putar per-ayat — selalu tampil ── */}
        <View style={styles.singlePlayRow}>
          <Text style={styles.singlePlayRowLabel}>Dengar per ayat:</Text>
          <View style={styles.singlePlayBtnGroup}>
            {ayahs.map((ayah, ayahIdx) => (
              <TouchableOpacity
                key={ayah.numberInSurah}
                style={[
                  styles.singlePlayBtn,
                  singlePlayingIdx === ayahIdx && styles.singlePlayBtnActive,
                ]}
                onPress={() => playSingleAyah(ayahIdx)}
                disabled={isPlaying}
              >
                <Text style={[
                  styles.singlePlayIcon,
                  singlePlayingIdx === ayahIdx && styles.singlePlayIconActive,
                ]}>
                  {singlePlayingIdx === ayahIdx ? '⏹' : '▶'}
                </Text>
                <Text style={[
                  styles.singlePlayNum,
                  singlePlayingIdx === ayahIdx && styles.singlePlayNumActive,
                ]}>
                  {ayah.numberInSurah}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {showAyah ? (
          <>
            {/* Bismillah header */}
            {includesBismillah && (
              <Text style={styles.bismillahText}>{BISMILLAH_TEXT}</Text>
            )}

            {/* Per-ayah: badge + word chips + translit/translation */}
            {ayahs.map((ayah, ayahIdx) => {
              const isCurrentlyPlaying = isPlaying && currentAyahIdx === ayahIdx;
              return (
                <View
                  key={ayah.numberInSurah}
                  style={[
                    ayahIdx > 0 && styles.ayahSeparator,
                    isCurrentlyPlaying && styles.ayahPlayingWrap,
                  ]}
                >
                  {/* Label ayat */}
                  <View style={styles.ayahNumRow}>
                    <View style={styles.ayahNumBadge}>
                      <Text style={styles.ayahNumText}>{ayah.numberInSurah}</Text>
                    </View>
                  </View>

                  {/* Word chips RTL */}
                  <View style={styles.wordChipsContainer}>
                    {wordsByAyah[ayahIdx].map((item, j) => {
                      const evalWord =
                        result && item.globalIdx < result.words.length
                          ? result.words[item.globalIdx]
                          : null;
                      const tajwidInfo = item.tajwid ? TAJWID_INFO[item.tajwid] : null;

                      return (
                        <View
                          key={j}
                          style={[
                            styles.wordChip,
                            // Murottal highlight: gold background saat ayat ini diputar
                            isCurrentlyPlaying && styles.wordChipPlaying,
                            // Evaluasi: hijau/merah setelah rekaman dinilai
                            evalWord && {
                              backgroundColor: evalWord.correct ? '#d4edda' : '#f8d7da',
                            },
                            // Tajwid: garis bawah berwarna
                            tajwidInfo && {
                              borderBottomWidth: 3,
                              borderBottomColor: tajwidInfo.color,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.wordChipText,
                              isCurrentlyPlaying && styles.wordChipTextPlaying,
                              evalWord && { color: evalWord.correct ? '#155724' : '#721c24' },
                            ]}
                          >
                            {item.word}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {showTranslit && (
                    <Text style={styles.translitText}>{ayah.transliteration}</Text>
                  )}
                  {showTranslation && (
                    <Text style={styles.translationText}>{ayah.translation}</Text>
                  )}
                </View>
              );
            })}

            {/* Legenda tajwid — hanya tampil jika ada */}
            {hasTajwid && (
              <View style={styles.tajwidLegend}>
                <Text style={styles.tajwidLegendTitle}>Hukum Tajwid terdeteksi:</Text>
                <View style={styles.tajwidLegendRow}>
                  {activeTajwidTypes.map(type => {
                    const info = TAJWID_INFO[type];
                    return (
                      <View
                        key={type}
                        style={[styles.tajwidLegendItem, { borderBottomColor: info.color, borderBottomWidth: 3 }]}
                      >
                        <Text style={[styles.tajwidLegendLabel, { color: info.color }]}>
                          {info.label}
                        </Text>
                        <Text style={styles.tajwidLegendDesc}>{info.desc}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.hiddenBox}>
            <Text style={styles.hiddenIcon}>🕌</Text>
            <Text style={styles.hiddenTitle}>Ayat disembunyikan</Text>
            <Text style={styles.hiddenHint}>Hafalkan dulu, lalu tekan rekam</Text>
          </View>
        )}

        <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowAyah(v => !v)}>
          <Text style={styles.toggleBtnText}>
            {showAyah ? 'Sembunyikan Ayat' : 'Lihat Ayat'}
          </Text>
        </TouchableOpacity>

        {showAyah && (
          <View style={styles.extraToggleRow}>
            <TouchableOpacity
              style={[styles.extraToggleBtn, showTranslit && styles.extraToggleBtnOn]}
              onPress={() => setShowTranslit(v => !v)}
            >
              <Text style={[styles.extraToggleText, showTranslit && styles.extraToggleTextOn]}>
                🔤 Latin
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.extraToggleBtn, showTranslation && styles.extraToggleBtnOn]}
              onPress={() => setShowTranslation(v => !v)}
            >
              <Text style={[styles.extraToggleText, showTranslation && styles.extraToggleTextOn]}>
                🇮🇩 Terjemahan
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Murottal: play / stop ── */}
      <TouchableOpacity
        style={[styles.audioBtn, isPlaying && styles.audioBtnActive]}
        onPress={isPlaying ? stopMurottal : playMurottal}
        activeOpacity={0.8}
      >
        <Text style={[styles.audioBtnText, isPlaying && styles.audioBtnTextActive]}>
          {isPlaying
            ? `⏹  Hentikan  (ayat ${ayahs[currentAyahIdx]?.numberInSurah ?? '...'})`
            : '▶  Dengar Murottal'}
        </Text>
      </TouchableOpacity>

      {/* ── Info kuota ── */}
      {remainingSecs !== null && !isRecording && (
        <View style={[
          styles.quotaBar,
          currentPlan === 'lifetime'                    && styles.quotaBarLifetime,
          currentPlan !== 'lifetime' && remainingSecs <= 0 && styles.quotaBarEmpty,
          currentPlan !== 'lifetime' && remainingSecs > 0 && remainingSecs <= 60 && styles.quotaBarLow,
        ]}>
          <Text style={styles.quotaBarText}>
            {currentPlan === 'lifetime'
              ? '♾️  Unlimited — Lifetime Access'
              : remainingSecs <= 0
                ? `⏱ Kuota hari ini habis (${currentPlan === 'free' ? 'Gratis 1 mnt' : 'Premium 7 mnt'})`
                : `⏱ Sisa hari ini: ${formatTime(remainingSecs)} (${currentPlan === 'free' ? 'Gratis' : 'Premium'})`
            }
          </Text>
        </View>
      )}

      {/* ── Rekam ── */}
      <TouchableOpacity
        style={[styles.recordBtn, isRecording && styles.recordingActive]}
        onPress={isRecording ? stopAndEvaluate : startRecording}
        disabled={isEvaluating}
        activeOpacity={0.85}
      >
        {isEvaluating ? (
          <>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.recordBtnText}>  Mengevaluasi...</Text>
          </>
        ) : (
          <Text style={styles.recordBtnText}>
            {isRecording ? '⏹  Selesai Membaca' : '🎤  Mulai Membaca'}
          </Text>
        )}
      </TouchableOpacity>

      {/* ── Hasil Evaluasi ── */}
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Hasil Evaluasi</Text>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>{result.score}%</Text>
          <Text style={[styles.scoreFeedback, { color: scoreColor }]}>{scoreFeedback}</Text>

          {/* Ringkasan skor */}
          <View style={styles.scoreSummaryRow}>
            <Text style={styles.scoreSummaryText}>
              Kata benar: {result.words.filter(w => w.correct).length}/{result.words.length}
            </Text>
            <Text style={[
              styles.scoreSummaryText,
              { color: result.orderOk ? '#1B4332' : '#c0392b' },
            ]}>
              Urutan: {result.orderOk ? '✅ Benar' : '⚠️ Tidak sesuai'}
            </Text>
          </View>

          {/* Putar ulang rekaman */}
          {recordingUri && (
            <TouchableOpacity
              style={[styles.replayBtn, isPlayingRec && styles.replayBtnActive]}
              onPress={playRecording}
            >
              <Text style={styles.replayBtnText}>
                {isPlayingRec ? '⏹  Hentikan' : '🔁  Putar Ulang Bacaan'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          {/* Whisper output */}
          <View style={styles.debugBox}>
            <Text style={styles.debugLabel}>Whisper mendengar:</Text>
            <Text style={styles.debugText}>{rawTranscription}</Text>
          </View>

          {/* ── Evaluasi per-ayat ── */}
          <Text style={styles.wordLabel}>Rincian per Ayat:</Text>

          {/* Bismillah jika ada */}
          {includesBismillah && (() => {
            const bismWords = result.words.slice(0, 4);
            return (
              <View style={styles.ayahResultSection}>
                <View style={styles.ayahResultHeader}>
                  <View style={styles.ayahResultBadge}>
                    <Text style={styles.ayahResultBadgeText}>Bismillah</Text>
                  </View>
                </View>
                <View style={styles.wordRow}>
                  {bismWords.map((w, i) => (
                    <View key={i} style={[styles.resultWordChip, w.correct ? styles.chipCorrect : styles.chipWrong]}>
                      <Text style={[styles.resultWordText, w.correct ? styles.chipCorrectText : styles.chipWrongText]}>
                        {w.word}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          {/* Per-ayat */}
          {ayahs.map((ayah, ayahIdx) => {
            const items    = wordsByAyah[ayahIdx];
            const anyRight = items.some(item => result.words[item.globalIdx]?.correct);
            const isWrongOrder = result.ayahOrderStatus?.[ayahIdx] === 'wrong';
            // Cari partner ayat yang jadi pasangan pelanggaran
            const violation = result.ayahViolations?.find(
              v => v.prevIdx === ayahIdx || v.currIdx === ayahIdx
            );
            const partnerIdx = violation
              ? (violation.prevIdx === ayahIdx ? violation.currIdx : violation.prevIdx)
              : null;

            return (
              <View key={ayah.numberInSurah} style={styles.ayahResultSection}>
                {/* Header ayat */}
                <View style={[
                  styles.ayahResultHeader,
                  isWrongOrder && styles.ayahResultHeaderWrong,
                  !anyRight && styles.ayahResultHeaderMissed,
                ]}>
                  <View style={[
                    styles.ayahResultBadge,
                    isWrongOrder && styles.ayahResultBadgeWrong,
                    !anyRight && styles.ayahResultBadgeMissed,
                  ]}>
                    <Text style={styles.ayahResultBadgeText}>Ayat {ayah.numberInSurah}</Text>
                  </View>
                  {isWrongOrder && partnerIdx !== null && (
                    <Text style={styles.ayahResultOrderWarn}>
                      ⚠️ {violation.prevIdx === ayahIdx
                        ? `Terdeteksi setelah Ayat ${ayahs[partnerIdx]?.numberInSurah}`
                        : `Terdeteksi sebelum Ayat ${ayahs[partnerIdx]?.numberInSurah}`}
                    </Text>
                  )}
                  {!anyRight && !isWrongOrder && (
                    <Text style={styles.ayahResultMissedLabel}>Tidak terdeteksi</Text>
                  )}
                </View>

                {/* Kata-kata */}
                <View style={styles.wordRow}>
                  {items.map((item, j) => {
                    const evalWord  = result.words[item.globalIdx];
                    const correct   = evalWord?.correct;
                    const tajwidInfo = item.tajwid ? TAJWID_INFO[item.tajwid] : null;

                    // State: correct / wrong / missed (ayah semua salah)
                    const chipStyle = correct
                      ? styles.chipCorrect
                      : anyRight ? styles.chipWrong : styles.chipMissed;
                    const textStyle = correct
                      ? styles.chipCorrectText
                      : anyRight ? styles.chipWrongText : styles.chipMissedText;

                    return (
                      <View
                        key={j}
                        style={[
                          styles.resultWordChip,
                          chipStyle,
                          tajwidInfo && { borderBottomWidth: 3, borderBottomColor: tajwidInfo.color },
                        ]}
                      >
                        <Text style={[
                          styles.resultWordText,
                          textStyle,
                          !anyRight && styles.resultWordStrike,
                        ]}>
                          {item.word}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}
      {/* Paywall — muncul jika belum punya kode akses */}
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false);
          // Langsung mulai rekam setelah kode berhasil diaktifkan
          startRecording();
        }}
      />

      {/* Survey Hafiz — muncul satu kali saat kuota habis */}
      {showSurvey && (
        <View style={styles.surveyOverlay}>
          <View style={styles.surveyCard}>
            <Text style={styles.surveyIcon}>📊</Text>
            <Text style={styles.surveyTitle}>Bantu Kami Berkembang!</Text>
            <Text style={styles.surveyBody}>
              Apakah kamu tertarik dengan{'\n'}
              <Text style={styles.surveyHighlight}>Paket Hafiz (20 menit/hari)</Text>
              {'\n'}seharga Rp 49.000/bulan?
            </Text>
            <View style={styles.surveyBtnRow}>
              <TouchableOpacity
                style={[styles.surveyBtn, styles.surveyBtnYes]}
                onPress={() => submitSurvey('yes')}
              >
                <Text style={styles.surveyBtnText}>👍 Ya!</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.surveyBtn, styles.surveyBtnMaybe]}
                onPress={() => submitSurvey('maybe')}
              >
                <Text style={styles.surveyBtnText}>🤔 Mungkin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.surveyBtn, styles.surveyBtnNo]}
                onPress={() => submitSurvey('no')}
              >
                <Text style={styles.surveyBtnText}>👎 Tidak</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F0' },
  content: { padding: 16, paddingBottom: 32 },

  ayahLabel: {
    textAlign: 'center', color: '#555', fontSize: 13,
    marginBottom: 14, fontWeight: '600',
  },

  // ── Ayah card ──
  ayahCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  bismillahText: {
    fontSize: 22, textAlign: 'center', color: '#1B4332',
    marginBottom: 14, fontWeight: '600', letterSpacing: 1,
  },

  // Highlight ayat yang sedang diputar murottal
  ayahPlayingWrap: {
    backgroundColor: '#FFFDE7',
    borderWidth: 1.5,
    borderColor: '#D4AC0D',
    borderRadius: 10,
    padding: 8,
    marginHorizontal: -4,
  },

  // ── Per-word chips ──
  wordChipsContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  wordChip: {
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 3, margin: 2,
  },
  // Chip saat murottal sedang putar ayat ini
  wordChipPlaying: {
    backgroundColor: '#FFF9C4',
  },
  wordChipText: { fontSize: 20, color: '#1a1a1a' },
  wordChipTextPlaying: { color: '#7B5800', fontWeight: '600' },

  ayahSeparator: { borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 12, paddingTop: 10 },
  ayahNumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },

  // Row tombol putar per-ayat (selalu tampil di atas kartu)
  singlePlayRow: {
    marginBottom: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  singlePlayRowLabel: { fontSize: 11, color: '#888', marginBottom: 8, fontWeight: '600' },
  singlePlayBtnGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  singlePlayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: '#1B4332', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  singlePlayBtnActive:  { backgroundColor: '#1B4332', borderColor: '#1B4332' },
  singlePlayIcon:       { fontSize: 9, color: '#1B4332' },
  singlePlayIconActive: { fontSize: 9, color: '#D4AC0D' },
  singlePlayNum:        { fontSize: 12, fontWeight: 'bold', color: '#1B4332' },
  singlePlayNumActive:  { color: '#D4AC0D' },
  ayahNumBadge: {
    backgroundColor: '#1B4332', width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
  ayahNumText: { color: '#D4AC0D', fontSize: 10, fontWeight: 'bold' },
  playingIndicator: { color: '#D4AC0D', fontSize: 16, marginRight: 6 },

  translitText: { fontSize: 13, color: '#555', marginTop: 4, fontStyle: 'italic' },
  translationText: { fontSize: 13, color: '#1B4332', marginTop: 4, lineHeight: 20 },

  // ── Tajwid legend ──
  tajwidLegend: {
    marginTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10,
  },
  tajwidLegendTitle: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 8 },
  tajwidLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tajwidLegendItem: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f8f8f8',
  },
  tajwidLegendLabel: { fontSize: 12, fontWeight: 'bold' },
  tajwidLegendDesc: { fontSize: 10, color: '#666', marginTop: 2 },

  hiddenBox: { alignItems: 'center', paddingVertical: 24 },
  hiddenIcon: { fontSize: 36, marginBottom: 10 },
  hiddenTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  hiddenHint: { fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center' },

  toggleBtn: {
    borderWidth: 1, borderColor: '#c8d8c8', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center', marginTop: 10,
  },
  toggleBtnText: { color: '#1B4332', fontSize: 13, fontWeight: '600' },

  extraToggleRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  extraToggleBtn: {
    borderWidth: 1.5, borderColor: '#c8d8c8', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  extraToggleBtnOn: { backgroundColor: '#1B4332', borderColor: '#1B4332' },
  extraToggleText: { fontSize: 12, color: '#555', fontWeight: '600' },
  extraToggleTextOn: { color: '#D4AC0D' },

  // ── Quota bar ──
  quotaBar: {
    backgroundColor: '#f0f9f4', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: '#c8e6c9',
  },
  quotaBarLow:      { backgroundColor: '#FFF8DC', borderColor: '#D4AC0D' },
  quotaBarEmpty:    { backgroundColor: '#fdecea', borderColor: '#f5c6cb' },
  quotaBarLifetime: { backgroundColor: '#f3e8ff', borderColor: '#9B59B6' },
  quotaBarText:     { fontSize: 12, color: '#555', textAlign: 'center', fontWeight: '600' },

  // ── Murottal button ──
  audioBtn: {
    borderWidth: 2, borderColor: '#1B4332', borderRadius: 12,
    padding: 14, alignItems: 'center', marginBottom: 12, backgroundColor: '#fff',
  },
  audioBtnActive: { backgroundColor: '#1B4332', borderColor: '#1B4332' },
  audioBtnText: { color: '#1B4332', fontSize: 14, fontWeight: '600' },
  audioBtnTextActive: { color: '#D4AC0D' },

  // ── Record button ──
  recordBtn: {
    backgroundColor: '#1B4332', borderRadius: 12, padding: 16,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
    marginBottom: 14, elevation: 2,
  },
  recordingActive: { backgroundColor: '#c0392b' },
  recordBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // ── Result card ──
  resultCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    marginBottom: 16, alignItems: 'center', elevation: 2,
  },
  resultTitle: { fontSize: 13, color: '#888', marginBottom: 6, fontWeight: '600' },
  scoreValue: { fontSize: 52, fontWeight: 'bold', marginBottom: 6 },
  scoreFeedback: { fontSize: 15, textAlign: 'center', marginBottom: 14 },

  // ── Score summary ──
  scoreSummaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    width: '100%', marginBottom: 12, gap: 8,
  },
  scoreSummaryText: { fontSize: 12, color: '#555', fontWeight: '600' },

  // ── Evaluasi per-ayat ──
  ayahResultSection: { width: '100%', marginBottom: 10 },
  ayahResultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f0f9f4', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6,
  },
  ayahResultHeaderWrong:  { backgroundColor: '#FFF3CD' },
  ayahResultHeaderMissed: { backgroundColor: '#f5f5f5' },
  ayahResultBadge: {
    backgroundColor: '#1B4332', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  ayahResultBadgeWrong:  { backgroundColor: '#b8860b' },
  ayahResultBadgeMissed: { backgroundColor: '#999' },
  ayahResultBadgeText:   { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  ayahResultOrderWarn:   { fontSize: 11, color: '#856404', flex: 1 },
  ayahResultMissedLabel: { fontSize: 11, color: '#999', fontStyle: 'italic' },

  // ── Word chip states ──
  chipCorrect: { backgroundColor: '#d4edda' },
  chipWrong:   { backgroundColor: '#f8d7da' },
  chipMissed:  { backgroundColor: '#eeeeee', opacity: 0.7 },

  chipCorrectText: { color: '#155724' },
  chipWrongText:   { color: '#721c24' },
  chipMissedText:  { color: '#999' },

  resultWordStrike: { textDecorationLine: 'line-through' },

  replayBtn: {
    borderWidth: 2, borderColor: '#D4AC0D', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 22, marginTop: 4, marginBottom: 14,
  },
  replayBtnActive: { backgroundColor: '#FFF8DC' },
  replayBtnText: { color: '#b8860b', fontSize: 14, fontWeight: '600' },

  divider: { width: '100%', height: 1, backgroundColor: '#eee', marginBottom: 12 },

  debugBox: {
    backgroundColor: '#f0f0f0', borderRadius: 8, padding: 10,
    marginBottom: 12, width: '100%',
  },
  debugLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  debugText: { fontSize: 15, textAlign: 'right', color: '#333' },

  wordLabel: { fontSize: 12, color: '#888', alignSelf: 'flex-start', marginBottom: 8 },
  wordRow: { flexDirection: 'row-reverse', flexWrap: 'wrap' },
  resultWordChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, margin: 3 },
  resultWordText: { fontSize: 17, writingDirection: 'rtl' },

  // ── Survey Hafiz ──
  surveyOverlay: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    zIndex: 999,
  },
  surveyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center',
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
    borderWidth: 1.5, borderColor: '#D4AC0D',
  },
  surveyIcon:      { fontSize: 28, marginBottom: 6 },
  surveyTitle:     { fontSize: 15, fontWeight: 'bold', color: '#1B4332', marginBottom: 6 },
  surveyBody:      { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  surveyHighlight: { fontWeight: 'bold', color: '#1B4332' },
  surveyBtnRow:    { flexDirection: 'row', gap: 8, width: '100%' },
  surveyBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  surveyBtnYes:   { backgroundColor: '#1B4332' },
  surveyBtnMaybe: { backgroundColor: '#b8860b' },
  surveyBtnNo:    { backgroundColor: '#888' },
  surveyBtnText:  { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});
