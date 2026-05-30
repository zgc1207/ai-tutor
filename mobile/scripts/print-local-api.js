import os from 'node:os';

const PORT = process.env.API_PORT || '3000';

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => item.address);
}

const addresses = localAddresses();
const urls = addresses.map(address => `http://${address}:${PORT}`);

console.log(JSON.stringify({
  port: PORT,
  simulator: {
    ios: `http://127.0.0.1:${PORT}`,
    android: `http://10.0.2.2:${PORT}`,
  },
  expoGoDeviceUrls: urls,
  note: urls.length
    ? 'Use one of expoGoDeviceUrls on a real phone connected to the same Wi-Fi as this computer.'
    : 'No LAN IPv4 address found. Check Wi-Fi or set the API URL manually.',
}, null, 2));
