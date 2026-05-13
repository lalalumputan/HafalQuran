import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Linking, ScrollView, Platform,
} from 'react-native';
import { SERVER_URL } from '../config';
import { saveAccessCode, getDeviceId } from '../utils/storage';

const ADMIN_WA   = '6287889477967';
const BSI_NOREK  = '1102442028';
const BSI_NAMA   = 'M Ruby Qimindra';

const PLANS = [
  {
    id:     'bulanan',
    label:  '1 Bulan',
    price:  'Rp 19.000',
    amount: '19.000',
    badge:  null,
  },
  {
    id:     'tahunan',
    label:  '1 Tahun',
    price:  'Rp 149.000',
    amount: '149.000',
    badge:  'Hemat 34%',
  },
];

export default function PaywallModal({ visible, onSuccess, onClose }) {
  const [selectedPlan, setSelectedPlan] = useState('tahunan');
  const [screen, setScreen]             = useState('plan');   // 'plan' | 'transfer'
  const [code, setCode]                 = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const plan = PLANS.find(p => p.id === selectedPlan);

  // Salin nomor rekening
  const copyNorek = () => {
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(BSI_NOREK);
    }
  };

  // Buka WA ke admin setelah transfer
  const handleSudahTransfer = async () => {
    const deviceId = await getDeviceId();
    const msg =
      `Halo, saya sudah transfer Rp ${plan.amount} untuk HafalQuran paket ` +
      `${plan.label}.\nDevice ID: ${deviceId}\nMohon kirimkan kode akses. Terima kasih 🙏`;
    Linking.openURL(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(msg)}`);
  };

  // Validasi kode ke server
  const handleValidate = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('Masukkan kode akses dulu.'); return; }
    setLoading(true);
    setError('');
    try {
      const deviceId = await getDeviceId();
      const res = await fetch(`${SERVER_URL}/validate-code`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code: trimmed, deviceId }),
      });
      const data = await res.json();
      if (data.valid) {
        await saveAccessCode(trimmed, data.plan);
        setCode('');
        setScreen('plan');
        onSuccess();
      } else {
        setError(data.error || 'Kode tidak valid.');
      }
    } catch {
      setError('Tidak bisa menghubungi server. Periksa koneksi.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setScreen('plan');
    setError('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ── LAYAR 1: Pilih Plan ── */}
            {screen === 'plan' && (
              <>
                <Text style={styles.icon}>📖</Text>
                <Text style={styles.title}>Aktifkan Fitur Hafalan</Text>
                <Text style={styles.subtitle}>
                  Rekam bacaan & evaluasi tajwid otomatis.{'\n'}Pilih paket:
                </Text>

                {/* Plan selector */}
                <View style={styles.planRow}>
                  {PLANS.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.planCard, selectedPlan === p.id && styles.planCardActive]}
                      onPress={() => setSelectedPlan(p.id)}
                      activeOpacity={0.8}
                    >
                      {p.badge && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{p.badge}</Text>
                        </View>
                      )}
                      <Text style={[styles.planLabel, selectedPlan === p.id && styles.planLabelActive]}>
                        {p.label}
                      </Text>
                      <Text style={[styles.planPrice, selectedPlan === p.id && styles.planPriceActive]}>
                        {p.price}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Fitur */}
                <View style={styles.features}>
                  <Text style={styles.featureItem}>✓  Semua surah & juz</Text>
                  <Text style={styles.featureItem}>✓  Evaluasi tajwid otomatis</Text>
                  <Text style={styles.featureItem}>✓  Murottal per ayat</Text>
                  <Text style={styles.featureItem}>✓  Tanpa iklan</Text>
                </View>

                {/* Tombol lanjut */}
                <TouchableOpacity
                  style={styles.buyBtn}
                  onPress={() => setScreen('transfer')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buyBtnText}>Lanjut ke Pembayaran →</Text>
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>Sudah punya kode?</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Input kode */}
                <TextInput
                  style={styles.input}
                  placeholder="HQ-XXXXXX"
                  placeholderTextColor="#aaa"
                  value={code}
                  onChangeText={t => { setCode(t); setError(''); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.activateBtn, loading && styles.activateBtnDisabled]}
                  onPress={handleValidate}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#D4AC0D" />
                    : <Text style={styles.activateBtnText}>Aktifkan Kode</Text>
                  }
                </TouchableOpacity>

                <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>Nanti saja</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── LAYAR 2: Info Transfer ── */}
            {screen === 'transfer' && (
              <>
                <TouchableOpacity onPress={() => setScreen('plan')} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>← Kembali</Text>
                </TouchableOpacity>

                <Text style={styles.icon}>🏦</Text>
                <Text style={styles.title}>Transfer Bank BSI</Text>
                <Text style={styles.subtitle}>
                  Paket {plan.label} — <Text style={styles.boldGreen}>{plan.price}</Text>
                </Text>

                {/* Rekening */}
                <View style={styles.bankBox}>
                  <Text style={styles.bankLabel}>No. Rekening BSI</Text>
                  <View style={styles.bankNoRow}>
                    <Text style={styles.bankNo}>{BSI_NOREK}</Text>
                    <TouchableOpacity style={styles.copyBtn} onPress={copyNorek}>
                      <Text style={styles.copyBtnText}>Salin</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.bankName}>a/n {BSI_NAMA}</Text>
                </View>

                {/* Nominal */}
                <View style={styles.amountBox}>
                  <Text style={styles.amountLabel}>Jumlah transfer</Text>
                  <Text style={styles.amountValue}>Rp {plan.amount}</Text>
                  <Text style={styles.amountNote}>
                    ⚠️ Nominal harus TEPAT agar mudah dikonfirmasi
                  </Text>
                </View>

                {/* Tombol konfirmasi WA */}
                <TouchableOpacity
                  style={styles.waBtn}
                  onPress={handleSudahTransfer}
                  activeOpacity={0.85}
                >
                  <Text style={styles.waBtnText}>
                    💬  Saya Sudah Transfer — Konfirmasi via WA
                  </Text>
                </TouchableOpacity>

                <Text style={styles.waHint}>
                  Kode akses akan dikirim ke WhatsApp Anda setelah transfer dikonfirmasi.
                </Text>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>Sudah dapat kode?</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Input kode */}
                <TextInput
                  style={styles.input}
                  placeholder="HQ-XXXXXX"
                  placeholderTextColor="#aaa"
                  value={code}
                  onChangeText={t => { setCode(t); setError(''); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.activateBtn, loading && styles.activateBtnDisabled]}
                  onPress={handleValidate}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#D4AC0D" />
                    : <Text style={styles.activateBtnText}>Aktifkan Kode</Text>
                  }
                </TouchableOpacity>

                <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>Nanti saja</Text>
                </TouchableOpacity>
              </>
            )}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 22,
    width: '100%', maxWidth: 380,
    maxHeight: '90%',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10,
  },

  icon:     { fontSize: 36, marginBottom: 6, textAlign: 'center' },
  title:    { fontSize: 18, fontWeight: 'bold', color: '#1B4332', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  boldGreen:{ fontWeight: 'bold', color: '#1B4332' },

  backBtn:     { marginBottom: 12 },
  backBtnText: { fontSize: 13, color: '#1B4332', fontWeight: '600' },

  // Plan cards
  planRow:        { flexDirection: 'row', gap: 10, marginBottom: 14, width: '100%' },
  planCard:       { flex: 1, borderWidth: 2, borderColor: '#ddd', borderRadius: 14, padding: 12, alignItems: 'center' },
  planCardActive: { borderColor: '#1B4332', backgroundColor: '#f0f9f4' },
  badge:          { backgroundColor: '#D4AC0D', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  badgeText:      { fontSize: 10, fontWeight: 'bold', color: '#1B4332' },
  planLabel:      { fontSize: 13, color: '#888', marginBottom: 4 },
  planLabelActive:{ color: '#1B4332', fontWeight: '600' },
  planPrice:      { fontSize: 18, fontWeight: 'bold', color: '#aaa' },
  planPriceActive:{ color: '#1B4332' },

  // Fitur
  features:    { alignSelf: 'flex-start', marginBottom: 16 },
  featureItem: { fontSize: 13, color: '#555', marginBottom: 4 },

  // Lanjut button
  buyBtn:     { backgroundColor: '#1B4332', borderRadius: 12, padding: 13, width: '100%', alignItems: 'center', marginBottom: 14 },
  buyBtnText: { color: '#D4AC0D', fontWeight: 'bold', fontSize: 15 },

  // Bank box
  bankBox: {
    backgroundColor: '#f0f9f4', borderRadius: 12, padding: 14,
    width: '100%', marginBottom: 10,
    borderWidth: 1, borderColor: '#c8e6c9',
  },
  bankLabel:  { fontSize: 11, color: '#888', marginBottom: 6 },
  bankNoRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bankNo:     { fontSize: 22, fontWeight: 'bold', color: '#1B4332', letterSpacing: 2 },
  copyBtn:    { backgroundColor: '#1B4332', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  copyBtnText:{ fontSize: 12, color: '#D4AC0D', fontWeight: 'bold' },
  bankName:   { fontSize: 12, color: '#555' },

  // Amount box
  amountBox: {
    backgroundColor: '#FFF8DC', borderRadius: 12, padding: 12,
    width: '100%', alignItems: 'center', marginBottom: 14,
    borderWidth: 1, borderColor: '#D4AC0D',
  },
  amountLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  amountValue: { fontSize: 24, fontWeight: 'bold', color: '#1B4332', marginBottom: 6 },
  amountNote:  { fontSize: 11, color: '#856404', textAlign: 'center', lineHeight: 16 },

  // WA button
  waBtn:    { backgroundColor: '#25D366', borderRadius: 12, padding: 13, width: '100%', alignItems: 'center', marginBottom: 8 },
  waBtnText:{ color: '#fff', fontWeight: 'bold', fontSize: 14 },
  waHint:   { fontSize: 11, color: '#888', textAlign: 'center', marginBottom: 14, lineHeight: 16 },

  // Divider
  dividerRow:  { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { fontSize: 11, color: '#aaa', marginHorizontal: 8 },

  // Input kode
  input: {
    borderWidth: 1.5, borderColor: '#c8d8c8', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, width: '100%',
    fontSize: 18, textAlign: 'center', letterSpacing: 2,
    color: '#1a1a1a', marginBottom: 6,
  },
  error: { fontSize: 12, color: '#c0392b', marginBottom: 8, textAlign: 'center' },

  activateBtn:         { backgroundColor: '#1B4332', borderRadius: 12, padding: 13, width: '100%', alignItems: 'center', marginBottom: 10 },
  activateBtnDisabled: { backgroundColor: '#aaa' },
  activateBtnText:     { color: '#D4AC0D', fontWeight: 'bold', fontSize: 15 },

  closeBtn:     { paddingVertical: 6, alignItems: 'center' },
  closeBtnText: { fontSize: 13, color: '#bbb' },
});
