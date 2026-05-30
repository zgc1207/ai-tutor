// PWA shell registration for browser and mobile home-screen installs.
(function registerPrototypePwa() {
  if (!('serviceWorker' in navigator)) return;
  const isLocalFile = location.protocol === 'file:';
  if (isLocalFile) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
})();
