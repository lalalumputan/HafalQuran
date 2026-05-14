import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ScrollView, Alert,
} from 'react-native';
import {
  getProfiles, createProfile, deleteProfile, PROFILE_COLORS,
} from '../utils/storage';

const getInitials = (name) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().substring(0, 2).toUpperCase();
};

export default function ProfileScreen({ navigation }) {
  const [profiles, setProfiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PROFILE_COLORS[0]);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    const data = await getProfiles();
    setProfiles(data);
    // Kalau belum ada profil, langsung tampilkan form
    if (data.length === 0) setShowForm(true);
  };

  const handleSelect = (profile) => {
    navigation.replace('Home', { profile });
  };

  const handleDelete = (profile) => {
    Alert.alert(
      'Hapus Profil',
      `Yakin hapus profil "${profile.name}"?\nProgress hafalan akan hilang permanen.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            await deleteProfile(profile.id);
            loadProfiles();
          },
        },
      ]
    );
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createProfile(name, newColor);
    setNewName('');
    setNewColor(PROFILE_COLORS[0]);
    setShowForm(false);
    loadProfiles();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.logo}>☪️</Text>
      <Text style={styles.title}>Hafal Al-Quran</Text>
      <Text style={styles.subtitle}>Siapa yang mau belajar hari ini?</Text>

      {/* Daftar profil */}
      <View style={styles.grid}>
        {profiles.map(profile => (
          <View key={profile.id} style={styles.profileWrap}>
            <TouchableOpacity
              style={[styles.profileCircle, { backgroundColor: profile.color }]}
              onPress={() => handleSelect(profile)}
              onLongPress={() => handleDelete(profile)}
              activeOpacity={0.8}
            >
              <Text style={styles.profileInitials}>{getInitials(profile.name)}</Text>
            </TouchableOpacity>
            <Text style={styles.profileName} numberOfLines={1}>{profile.name}</Text>
            <Text style={styles.profileHint}>tahan = hapus</Text>
          </View>
        ))}

        {/* Tombol profil baru */}
        <View style={styles.profileWrap}>
          <TouchableOpacity
            style={styles.addCircle}
            onPress={() => setShowForm(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={styles.addIcon}>{showForm ? '✕' : '+'}</Text>
          </TouchableOpacity>
          <Text style={styles.profileName}>Profil Baru</Text>
          <Text style={styles.profileHint}> </Text>
        </View>
      </View>

      {/* Form buat profil baru */}
      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formLabel}>Nama</Text>
          <TextInput
            style={styles.input}
            placeholder="Nama anak..."
            placeholderTextColor="#aaa"
            value={newName}
            onChangeText={setNewName}
            maxLength={20}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />

          <Text style={styles.formLabel}>Pilih Warna</Text>
          <View style={styles.colorRow}>
            {PROFILE_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  newColor === c && styles.colorDotActive,
                ]}
                onPress={() => setNewColor(c)}
              />
            ))}
          </View>

          {/* Preview */}
          {newName.trim().length > 0 && (
            <View style={styles.preview}>
              <View style={[styles.previewCircle, { backgroundColor: newColor }]}>
                <Text style={styles.previewInitials}>{getInitials(newName)}</Text>
              </View>
              <Text style={styles.previewName}>{newName.trim()}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, !newName.trim() && styles.saveBtnOff]}
            onPress={handleCreate}
            disabled={!newName.trim()}
          >
            <Text style={styles.saveBtnText}>Simpan Profil</Text>
          </TouchableOpacity>
        </View>
      )}

      {profiles.length === 0 && !showForm && (
        <Text style={styles.emptyHint}>
          Belum ada profil.{'\n'}Tekan "+" untuk membuat profil pertama.
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerApp}>HafalQuran™</Text>
        <Text style={styles.footerDev}>developed by lalalumputan</Text>
        <Text style={styles.footerYear}>© 2026 • v1.1.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F0' },
  content: { padding: 24, alignItems: 'center', paddingBottom: 48 },
  logo: { fontSize: 52, marginTop: 16, marginBottom: 10 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1B4332', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 32, textAlign: 'center' },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 20, marginBottom: 28,
  },
  profileWrap: { alignItems: 'center', width: 80 },
  profileCircle: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  profileInitials: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  profileName: {
    fontSize: 13, fontWeight: '600', color: '#333',
    marginTop: 8, textAlign: 'center',
  },
  profileHint: { fontSize: 9, color: '#bbb', marginTop: 2 },

  addCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff', borderWidth: 2.5,
    borderColor: '#1B4332', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  addIcon: { fontSize: 32, color: '#1B4332', fontWeight: 'bold', lineHeight: 36 },

  form: {
    backgroundColor: '#fff', borderRadius: 18, padding: 20,
    width: '100%', elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6,
  },
  formLabel: {
    fontSize: 12, color: '#888', fontWeight: '600',
    marginBottom: 8, marginTop: 14,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5, borderColor: '#c8d8c8', borderRadius: 10,
    padding: 12, fontSize: 16, color: '#333',
  },
  colorRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4,
  },
  colorDot: { width: 34, height: 34, borderRadius: 17 },
  colorDotActive: {
    borderWidth: 3, borderColor: '#1B4332',
    transform: [{ scale: 1.2 }],
  },

  preview: { alignItems: 'center', marginTop: 14 },
  previewCircle: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  previewInitials: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  previewName: { fontSize: 14, color: '#333', marginTop: 6, fontWeight: '600' },

  saveBtn: {
    backgroundColor: '#1B4332', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 18,
  },
  saveBtnOff: { backgroundColor: '#c8d8c8' },
  saveBtnText: { color: '#D4AC0D', fontSize: 15, fontWeight: 'bold' },

  emptyHint: {
    fontSize: 14, color: '#999', textAlign: 'center',
    marginTop: 16, lineHeight: 22,
  },

  footer: { alignItems: 'center', marginTop: 40, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#e0e0e0', width: '100%' },
  footerApp: { fontSize: 15, fontWeight: 'bold', color: '#1B4332', letterSpacing: 1 },
  footerDev: { fontSize: 12, color: '#888', marginTop: 4 },
  footerYear: { fontSize: 11, color: '#bbb', marginTop: 2 },
});
