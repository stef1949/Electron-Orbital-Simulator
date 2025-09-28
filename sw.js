// Service Worker for Electron Orbital Simulator PWA
const CACHE_NAME = 'electron-orbital-simulator-v1';
const CDN_CACHE_NAME = 'cdn-resources-v1';

// Resources to cache for offline use
const STATIC_RESOURCES = [
  './',
  './index.html',
  './manifest.json',
  './assets/logo.svg',
  './assets/orbital_screenshot.png',
  './assets/icon-192x192.png',
  './assets/icon-512x512.png'
];

// CDN resources that we'll try to cache opportunistically
const CDN_RESOURCES = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    Promise.all([
      // Cache static resources
      caches.open(CACHE_NAME).then((cache) => {
        console.log('Caching static resources');
        return cache.addAll(STATIC_RESOURCES);
      }),
      // Try to cache CDN resources (may fail in restricted environments)
      caches.open(CDN_CACHE_NAME).then((cache) => {
        console.log('Attempting to cache CDN resources');
        return Promise.allSettled(
          CDN_RESOURCES.map(url => 
            fetch(url).then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            }).catch(err => {
              console.log(`Could not cache ${url}:`, err.message);
            })
          )
        );
      })
    ]).then(() => {
      console.log('Service Worker installation complete');
      // Force activation of new service worker
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== CDN_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activation complete');
      // Claim control of all clients
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Handle different types of requests
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          console.log('Serving from cache:', event.request.url);
          return response;
        }
        
        // If not in cache, try network
        return fetch(event.request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response for caching
          const responseClone = response.clone();
          
          // Determine which cache to use
          let cachePromise;
          if (CDN_RESOURCES.some(cdnUrl => event.request.url.startsWith(cdnUrl))) {
            cachePromise = caches.open(CDN_CACHE_NAME);
          } else if (url.origin === location.origin) {
            cachePromise = caches.open(CACHE_NAME);
          }
          
          // Cache the response if appropriate
          if (cachePromise) {
            cachePromise.then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          
          return response;
        }).catch((error) => {
          console.log('Network request failed:', event.request.url, error);
          
          // For CDN resources that fail, we could provide fallbacks
          if (event.request.url.includes('tailwindcss.com')) {
            // Return a minimal CSS fallback for styling
            return new Response(`
              body { font-family: sans-serif; margin: 0; padding: 1rem; background: #181818; color: #f7f7f7; }
              .text-center { text-align: center; }
              .mb-4 { margin-bottom: 1rem; }
              button { padding: 0.5rem 1rem; margin: 0.25rem; border: none; border-radius: 0.25rem; cursor: pointer; background: #333; color: white; }
              button:hover { background: #555; }
              input[type="range"] { width: 200px; }
              .flex { display: flex; }
              .justify-center { justify-content: center; }
              .gap-2 { gap: 0.5rem; }
            `, {
              headers: { 'Content-Type': 'text/css' }
            });
          }
          
          // For other failed requests, throw the error
          throw error;
        });
      })
    );
  }
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('Service Worker script loaded');