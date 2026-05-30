import {
  getPushEndpoint,
  getPushProvider,
  getPushToken,
} from './config.js';

export async function sendPushNotification({ deviceToken, title, body, data = {} }) {
  const provider = getPushProvider();
  if (provider === 'dev') {
    return {
      provider,
      status: 'sent',
      rawPayload: {
        simulated: true,
        token: deviceToken.token,
        title,
        body,
        data,
      },
    };
  }

  if (provider !== 'http') {
    throw new Error(`Unsupported push provider: ${provider}`);
  }

  const endpoint = getPushEndpoint();
  if (!endpoint) throw new Error('PUSH_ENDPOINT is required when PUSH_PROVIDER=http');

  const headers = { 'content-type': 'application/json' };
  const token = getPushToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      platform: deviceToken.platform,
      provider: deviceToken.provider,
      token: deviceToken.token,
      title,
      body,
      data,
    }),
  });

  const responseText = await response.text();
  let rawPayload = { status: response.status, body: responseText };
  try {
    rawPayload = responseText ? JSON.parse(responseText) : rawPayload;
  } catch {
    // Keep text body for providers that do not return JSON.
  }

  if (!response.ok) {
    return {
      provider,
      status: 'failed',
      rawPayload,
      errorMessage: `Push provider failed with ${response.status}`,
    };
  }

  return {
    provider,
    status: 'sent',
    rawPayload,
  };
}
