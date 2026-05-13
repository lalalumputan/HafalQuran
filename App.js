import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import ProfileScreen from './src/screens/ProfileScreen';
import HomeScreen from './src/screens/HomeScreen';
import SurahScreen from './src/screens/SurahScreen';
import HafalScreen from './src/screens/HafalScreen';

const STATUS_BAR_HEIGHT = Constants.statusBarHeight ?? 24;

export default function App() {
  const [route, setRoute] = useState({ name: 'Profile', params: {} });
  const [history, setHistory] = useState([]);
  const [homeKey, setHomeKey] = useState(0);

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
});
