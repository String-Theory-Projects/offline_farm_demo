const CACHE_NAME = 'farm-management-v3';
const urlsToCache = [
    // Main pages
    '/',
    '/scan/',
    // Static assets
    '/static/farm_app/service-worker.js',
    // External dependencies (jsQR library)
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
];

// Install - Cache app shell and critical assets
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching app shell and assets');
                // Cache pages first, then try to cache external resources
                return cache.addAll([
                    '/',
                    '/scan/',
                ]).then(() => {
                    // Try to cache external resources, but don't fail if they're unavailable
                    return Promise.allSettled(
                        urlsToCache.slice(2).map(url => 
                            fetch(url).then(response => {
                                if (response.ok) {
                                    return cache.put(url, response);
                                }
                            }).catch(() => {
                                // Silently fail for external resources
                                console.log('Could not cache:', url);
                            })
                        )
                    );
                });
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

    // Skip cross-origin requests that we can't cache (except known CDNs)
    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === location.origin;
    const isJsQR = url.href.includes('jsdelivr.net/npm/jsqr');
    
    if (!isSameOrigin && !isJsQR) {
        return; // Let browser handle other cross-origin requests
    }

    // Special handling for navigation requests (CRITICAL for offline)
    if (event.request.mode === 'navigate' || 
        (event.request.destination === 'document' && event.request.method === 'GET')) {
        event.respondWith(
            (async () => {
                try {
                    // Try exact match first
                    let cachedResponse = await caches.match(event.request);
                    
                    // If not found, try matching by URL pathname
                    if (!cachedResponse) {
                        cachedResponse = await caches.match(url.pathname);
                    }
                    
                    // If still not found, try with trailing slash
                    if (!cachedResponse && !url.pathname.endsWith('/')) {
                        cachedResponse = await caches.match(url.pathname + '/');
                    }
                    
                    if (cachedResponse) {
                        console.log('Service Worker: Serving navigation from cache:', url.pathname);
                        return cachedResponse;
                    }
                    
                    // If not cached and online, fetch and cache
                    if (navigator.onLine) {
                        try {
                            const response = await fetch(event.request);
                            if (response.ok) {
                                const responseToCache = response.clone();
                                const cache = await caches.open(CACHE_NAME);
                                await cache.put(event.request, responseToCache);
                                // Also cache by pathname for easier matching
                                await cache.put(url.pathname, responseToCache);
                                console.log('Service Worker: Cached navigation:', url.pathname);
                                return response;
                            }
                        } catch (err) {
                            console.log('Service Worker: Network fetch failed for navigation:', err);
                        }
                    }
                    
                    // Offline - try to return any cached page or fallback
                    const fallback = await caches.match('/') || 
                                   await caches.match('/scan/');
                    
                    if (fallback) {
                        console.log('Service Worker: Returning fallback page for:', url.pathname);
                        return fallback;
                    }
                    
                    // Last resort: return basic offline page
                    return new Response(
                        '<!DOCTYPE html><html><head><title>Offline</title></head><body><h1>Offline</h1><p>This page is not available offline.</p></body></html>',
                        {
                            headers: { 'Content-Type': 'text/html' },
                            status: 503
                        }
                    );
                } catch (error) {
                    console.error('Service Worker: Navigation error:', error);
                    return new Response('Offline', { status: 503 });
                }
            })()
        );
        return;
    }

    // Handle other requests (scripts, styles, images, API)
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached version if available
                if (cachedResponse) {
                    console.log('Service Worker: Serving from cache:', event.request.url);
                    return cachedResponse;
                }

                // Fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache if not a valid response
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Clone the response for caching
                        const responseToCache = response.clone();

                        // Cache pages, API responses, and static assets
                        const shouldCache = 
                            event.request.destination === 'document' || // HTML pages
                            event.request.destination === 'script' ||   // JavaScript
                            event.request.destination === 'style' ||    // CSS
                            event.request.destination === 'image' ||    // Images
                            event.request.url.includes('/api/') ||      // API endpoints
                            event.request.url.includes('/static/') ||   // Static files
                            isJsQR;                                     // jsQR library

                        if (shouldCache) {
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                    console.log('Service Worker: Cached:', event.request.url);
                                })
                                .catch((err) => {
                                    console.error('Service Worker: Cache put failed:', err);
                                });
                        }

                        return response;
                    })
                    .catch((error) => {
                        console.log('Service Worker: Network fetch failed:', event.request.url);
                        
                        // For API requests, return cached data if available
                        if (event.request.url.includes('/api/')) {
                            return caches.match(event.request)
                                .then(cached => {
                                    if (cached) {
                                        return cached;
                                    }
                                    return new Response(
                                        JSON.stringify({ error: 'Offline - no cached data' }),
                                        {
                                            status: 503,
                                            headers: { 'Content-Type': 'application/json' }
                                        }
                                    );
                                });
                        }
                        
                        // For other requests, try to return from cache
                        return caches.match(event.request)
                            .then(cached => cached || Promise.reject(error));
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

