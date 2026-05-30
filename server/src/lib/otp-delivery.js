import {
  getAuthOtpDeliveryEndpoint,
  getAuthOtpDeliveryProvider,
  getAuthOtpDeliveryToken,
  isAuthOtpDevModeEnabled,
} from './config.js';

export async function deliverLoginOtp({ phone, code, purpose, requestId, expiresAt }) {
  const provider = getAuthOtpDeliveryProvider();
  if (provider === 'dev' || isAuthOtpDevModeEnabled()) {
    return {
      provider,
      delivered: provider === 'dev',
      devMode: true,
    };
  }

  if (provider !== 'http') {
    throw Object.assign(new Error(`Unsupported OTP delivery provider: ${provider}`), { statusCode: 500 });
  }

  const endpoint = getAuthOtpDeliveryEndpoint();
  if (!endpoint) {
    throw Object.assign(new Error('AUTH_OTP_DELIVERY_ENDPOINT is required for http OTP delivery'), { statusCode: 500 });
  }

  const token = getAuthOtpDeliveryToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      phone,
      code,
      purpose,
      requestId,
      expiresAt,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw Object.assign(new Error(`OTP delivery failed: ${response.status} ${text}`), { statusCode: 502 });
  }

  return {
    provider,
    delivered: true,
    devMode: false,
  };
}
