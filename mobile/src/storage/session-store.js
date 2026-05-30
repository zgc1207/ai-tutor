import * as SecureStore from 'expo-secure-store';

const API_BASE_KEY = 'ai_tutor_api_base';
const SESSION_TOKEN_KEY = 'ai_tutor_session_token';

export async function loadSessionState() {
  const [apiBase, sessionToken] = await Promise.all([
    SecureStore.getItemAsync(API_BASE_KEY),
    SecureStore.getItemAsync(SESSION_TOKEN_KEY),
  ]);
  return {
    apiBase: apiBase || '',
    sessionToken: sessionToken || '',
  };
}

export function saveApiBase(apiBase) {
  const value = String(apiBase || '').trim();
  if (!value) return SecureStore.deleteItemAsync(API_BASE_KEY);
  return SecureStore.setItemAsync(API_BASE_KEY, value);
}

export function saveSessionToken(sessionToken) {
  const value = String(sessionToken || '').trim();
  if (!value) return SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  return SecureStore.setItemAsync(SESSION_TOKEN_KEY, value);
}

export async function clearSessionState() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
  ]);
}
