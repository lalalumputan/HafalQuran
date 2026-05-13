import { Platform } from 'react-native';
import { SERVER_URL } from '../config';

// Native: file extension → MIME type
const MIME_TYPES = {
  m4a:  'audio/m4a',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  caf:  'audio/x-caf',
  aac:  'audio/aac',
  webm: 'audio/webm',
};

export const transcribeAudio = async (uri) => {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    // Web: expo-av mengembalikan blob URL (blob:http://...)
    // Perlu fetch blob tersebut lalu append ke FormData
    const blobRes  = await fetch(uri);
    const blob     = await blobRes.blob();
    const mimeType = blob.type || 'audio/webm';
    const ext      = mimeType.includes('webm') ? 'webm'
                   : mimeType.includes('mp4')  ? 'mp4'
                   : 'webm';
    formData.append('file', blob, `recording.${ext}`);
  } else {
    // Native (Android/iOS): pakai referensi file {uri, name, type}
    const ext      = uri.split('.').pop()?.toLowerCase() || 'm4a';
    const mimeType = MIME_TYPES[ext] || 'audio/m4a';
    formData.append('file', { uri, name: `recording.${ext}`, type: mimeType });
  }

  const response = await fetch(`${SERVER_URL}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Server error');
  }

  const data = await response.json();
  return { text: data.text || '', words: data.words || [] };
};
