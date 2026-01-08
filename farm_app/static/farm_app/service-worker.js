const CACHE_NAME = 'farm-management-v4';
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
                ]).then(async () => {
                    // Cache pages with alternative keys for Safari compatibility
                    const homePage = await cache.match('/');
                    const scanPage = await cache.match('/scan/');
                    
                    if (homePage) {
                        await cache.put('/scan/', homePage.clone()); // Fallback
                    }
                    if (scanPage) {
                        await cache.put('/scan', scanPage.clone()); // Without trailing slash
                    }
                    
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

    // Special handling for navigation requests (CRITICAL for offline, especially Safari)
    // Safari requires explicit handling of navigation requests
    // Check if this is a navigation request - Safari can be tricky here
    const acceptHeader = event.request.headers.get('accept') || '';
    const isNavigation = event.request.mode === 'navigate' || 
                        event.request.destination === 'document' ||
                        acceptHeader.includes('text/html') ||
                        (event.request.method === 'GET' && !event.request.url.includes('.') && !event.request.url.includes('/api/') && !event.request.url.includes('/static/'));
    
    if (isNavigation && event.request.method === 'GET') {
        event.respondWith(
            (async () => {
                try {
                    // Try multiple cache matching strategies for Safari compatibility
                    let cachedResponse = null;
                    
                    // Strategy 1: Exact request match
                    cachedResponse = await caches.match(event.request);
                    
                    // Strategy 2: Match by URL pathname
                    if (!cachedResponse) {
                        cachedResponse = await caches.match(url.pathname);
                    }
                    
                    // Strategy 3: Match with trailing slash
                    if (!cachedResponse && !url.pathname.endsWith('/')) {
                        cachedResponse = await caches.match(url.pathname + '/');
                    }
                    
                    // Strategy 4: Match without trailing slash
                    if (!cachedResponse && url.pathname.endsWith('/') && url.pathname !== '/') {
                        cachedResponse = await caches.match(url.pathname.slice(0, -1));
                    }
                    
                    // Strategy 5: Match by full URL href
                    if (!cachedResponse) {
                        cachedResponse = await caches.match(url.href);
                    }
                    
                    // Strategy 6: Create new request with just the URL (Safari compatibility)
                    if (!cachedResponse) {
                        const simpleRequest = new Request(url.href, {
                            method: 'GET',
                            headers: { 'Accept': 'text/html' }
                        });
                        cachedResponse = await caches.match(simpleRequest);
                    }
                    
                    // Strategy 7: Try matching without query string (Safari sometimes adds query params)
                    if (!cachedResponse && url.search) {
                        const urlWithoutQuery = url.origin + url.pathname;
                        cachedResponse = await caches.match(urlWithoutQuery) || 
                                        await caches.match(urlWithoutQuery + '/');
                    }
                    
                    if (cachedResponse) {
                        console.log('Service Worker: Serving navigation from cache:', url.pathname);
                        // Safari requires a fresh Response object with proper headers
                        const responseHeaders = new Headers(cachedResponse.headers);
                        // Ensure Content-Type is set correctly for Safari
                        if (!responseHeaders.has('Content-Type')) {
                            responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
                        }
                        // Safari needs proper status
                        const status = cachedResponse.status || 200;
                        
                        return new Response(cachedResponse.body, {
                            status: status,
                            statusText: cachedResponse.statusText || 'OK',
                            headers: responseHeaders
                        });
                    }
                    
                    // If not cached and online, fetch and cache
                    if (navigator.onLine) {
                        try {
                            const response = await fetch(event.request.clone());
                            if (response.ok) {
                                const responseToCache = response.clone();
                                const cache = await caches.open(CACHE_NAME);
                                
                                // Cache multiple ways for better matching (Safari compatibility)
                                await cache.put(event.request, responseToCache.clone());
                                await cache.put(url.pathname, responseToCache.clone());
                                if (!url.pathname.endsWith('/') && url.pathname !== '/') {
                                    await cache.put(url.pathname + '/', responseToCache.clone());
                                } else if (url.pathname.endsWith('/') && url.pathname !== '/') {
                                    await cache.put(url.pathname.slice(0, -1), responseToCache.clone());
                                }
                                // Also cache by full URL for Safari
                                await cache.put(url.href, responseToCache.clone());
                                
                                console.log('Service Worker: Cached navigation:', url.pathname);
                                return response;
                            }
                        } catch (err) {
                            console.log('Service Worker: Network fetch failed for navigation:', err);
                        }
                    }
                    
                    // Offline - try to return any cached page (Safari fallback strategy)
                    let fallback = null;
                    
                    // Try to match the specific page first
                    if (url.pathname === '/scan/' || url.pathname === '/scan') {
                        fallback = await caches.match('/scan/') || await caches.match('/scan');
                    } else if (url.pathname === '/' || url.pathname === '') {
                        fallback = await caches.match('/');
                    } else {
                        // Try dashboard or any other page
                        fallback = await caches.match('/') || 
                                  await caches.match('/scan/') ||
                                  await caches.match('/dashboard/');
                    }
                    
                    if (fallback) {
                        console.log('Service Worker: Returning fallback page for:', url.pathname);
                        const responseHeaders = new Headers(fallback.headers);
                        if (!responseHeaders.has('Content-Type')) {
                            responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
                        }
                        return new Response(fallback.body, {
                            status: 200, // Always use 200 for Safari
                            statusText: 'OK',
                            headers: responseHeaders
                        });
                    }
                    
                    // Last resort: return basic offline page
                    return new Response(
                        '<!DOCTYPE html><html><head><title>Offline</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><h1>Offline</h1><p>This page is not available offline.</p></body></html>',
                        {
                            headers: { 
                                'Content-Type': 'text/html; charset=utf-8',
                                'Cache-Control': 'no-cache'
                            },
                            status: 200 // Use 200 instead of 503 for Safari
                        }
                    );
                } catch (error) {
                    console.error('Service Worker: Navigation error:', error);
                    // Return a valid HTML response for Safari with proper structure
                    const offlineHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline</title>
</head>
<body>
    <h1>Offline</h1>
    <p>This page is not available offline. Please check your connection.</p>
    <script>
        // Try to redirect to home if available
        if (window.location.pathname !== '/') {
            window.location.href = '/';
        }
    </script>
</body>
</html>`;
                    return new Response(offlineHtml, {
                        headers: { 
                            'Content-Type': 'text/html; charset=utf-8',
                            'Cache-Control': 'no-cache'
                        },
                        status: 200
                    });
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
                            event.request.destination === 'script' ||   // JavaScript (including jsQR)
                            event.request.destination === 'style' ||    // CSS
                            event.request.destination === 'image' ||    // Images
                            event.request.url.includes('/api/') ||      // API endpoints
                            event.request.url.includes('/static/') ||   // Static files
                            isJsQR ||                                   // jsQR library from CDN
                            event.request.url.includes('jsdelivr.net'); // All jsdelivr CDN resources

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

