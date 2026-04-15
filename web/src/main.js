import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      }
    } catch {
      // Ignore cleanup failures for previously registered PWA assets.
    }
  });
}

const app = createApp(App);
app.use(router);
app.mount('#app');
