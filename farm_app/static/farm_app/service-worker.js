const CACHE_NAME = 'farm-management-v1';
const urlsToCache = [
    '/',
    '/scan/',
];

// Install - Cache app shell
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('Service Worker: Cache failed', error);
            })
    );
    self.skipWaiting();
});

// Activate - Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Fetch - Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Never cache POST, PUT, DELETE requests - always go to network
    if (event.request.method !== 'GET') {
        // For non-GET requests, always fetch from network (no caching, no intercepting)
        // Let the request go through normally - don't intercept
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached version if available
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache if not a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Cache API responses and pages
                        if (event.request.url.includes('/api/') || 
                            event.request.destination === 'document') {
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }

                        return response;
                    })
                    .catch(() => {
                        // If offline and request is for a page, return cached index
                        if (event.request.destination === 'document') {
                            return caches.match('/');
                        }
                        // For API requests, return a basic error response
                        if (event.request.url.includes('/api/')) {
                            return new Response(
                                JSON.stringify({ error: 'Offline - no cached data' }),
                                {
                                    status: 503,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                    });
            })
    );
});

// Background sync for pending activities
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-activities') {
        event.waitUntil(syncActivities());
    }
});

async function syncActivities() {
    // This will be called when connection is restored
    // The main app will handle the actual sync
    console.log('Service Worker: Background sync triggered');
}

