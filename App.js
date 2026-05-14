import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import ProfileScreen from './src/screens/ProfileScreen';
import HomeScreen from './src/screens/HomeScreen';
import SurahScreen from './src/screens/SurahScreen';
import HafalScreen from './src/screens/HafalScreen';

const STATUS_BAR_HEIGHT = Constants.statusBarHeight ?? 24;

const APP_VERSION = '1.1.0';

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [route, setRoute]             = useState({ name: 'Profile', params: {} });
  const [history, setHistory]         = useState([]);
  const [homeKey, setHomeKey]         = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setShowLanding(false), 2000);
    return () => clearTimeout(t);
  }, []);

  const navigate = (name, params = {}) => {
    setHistory(h => [...h, route]);
    setRoute({ name, params });
  };

  // Replace: ganti route tanpa tambah history (dipakai ProfileScreen → Home)
  const replace = (name, params = {}) => {
    setHistory([]);
    setRoute({ name, params });
    if (name === 'Home') setHomeKey(k => k + 1);
  };

  const goBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRoute(prev);
    setHistory(h => h.slice(0, -1));
    if (prev.name === 'Home') setHomeKey(k => k + 1);
  };

  const navigation = { navigate, goBack, replace, setOptions: () => {} };

  const profile = route.params?.profile;
  const titles = {
    Profile: 'HafalQuran',
    Home: profile?.name ? `Halo, ${profile.name}! 👋` : 'HafalQuran',
    Surah: route.params?.surah?.englishName || 'Surah',
    Hafal: 'Mode Hafalan',
  };

  if (showLanding) {
    return (
      <View style={styles.landing}>
        <StatusBar style="light" />
        <Image source={require('./assets/icon.png')} style={styles.landingIcon} />
        <Text style={styles.landingTitle}>HafalQuran</Text>
        <Text style={styles.landingTagline}>Hafal Al-Quran dengan tajwid & murottal</Text>
        <Text style={styles.landingVersion}>v{APP_VERSION}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: STATUS_BAR_HEIGHT }]}>
        {history.length > 0 && (
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {titles[route.name]}
        </Text>
      </View>

      <View style={styles.screen}>
        {route.name === 'Profile' && (
          <ProfileScreen navigation={navigation} />
        )}
        {route.name === 'Home' && (
          <HomeScreen
            key={homeKey}
            route={{ params: route.params }}
            navigation={navigation}
          />
        )}
        {route.name === 'Surah' && (
          <SurahScreen route={{ params: route.params }} navigation={navigation} />
        )}
        {route.name === 'Hafal' && (
          <HafalScreen route={{ params: route.params }} navigation={navigation} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    backgroundColor: '#1B4332',
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  backBtn: { marginRight: 12, paddingBottom: 2 },
  backText: { color: '#D4AC0D', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1 },
  screen: { flex: 1 },

  // Landing splash
  landing: {
    flex: 1, backgroundColor: '#1B4332',
    justifyContent: 'center', alignItems: 'center',
  },
  landingIcon: { width: 110, height: 110, borderRadius: 24, marginBottom: 20 },
  landingTitle: {
    fontSize: 32, fontWeight: 'bold', color: '#D4AC0D', letterSpacing: 1,
  },
  landingTagline: {
    fontSize: 13, color: '#ffffff99', marginTop: 8, textAlign: 'center', paddingHorizontal: 40,
  },
  landingVersion: { fontSize: 11, color: '#ffffff55', marginTop: 24 },
});
