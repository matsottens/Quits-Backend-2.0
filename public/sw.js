// API Connectivity Service Worker
const API_HOSTS = [
  'api.quits.cc',
  'quits-backend-2-0-mahy1vpr6-mats-ottens-hotmailcoms-projects.vercel.app'
];

const API_CACHE_NAME = 'api-cache-v1';
const HEALTH_ENDPOINTS = ['/health', '/api/health'];
const MAX_RETRY_ATTEMPTS = 3;
const FETCH_TIMEOUT = 8000; // 8 seconds

// Helper function to timeout fetch requests
const timeoutFetch = (url, options, timeout) => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;
    
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timeout for ${url}`));
    }, timeout);
    
    fetch(url, { ...options, signal })
      .then(response => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

// Check if a URL is for an API endpoint
const isApiRequest = (url) => {
  const urlObj = new URL(url);
  return API_HOSTS.some(host => urlObj.hostname === host);
};

// Attempt to fetch with fallbacks
const fetchWithFallbacks = async (request) => {
  const originalUrl = new URL(request.url);
  let attempts = 0;
  let lastError;

  // Try the original request first
  try {
    const response = await timeoutFetch(request, {}, FETCH_TIMEOUT);
    if (response.ok) return response;
  } catch (e) {
    lastError = e;
    console.warn(`Failed primary request to ${originalUrl.pathname}: ${e.message}`);
  }

  // If original fails, try alternative hosts
  for (const host of API_HOSTS) {
    if (originalUrl.hostname === host) continue; // Skip the one we already tried
    
    attempts++;
    if (attempts > MAX_RETRY_ATTEMPTS) break;
    
    const fallbackUrl = new URL(request.url);
    fallbackUrl.hostname = host;
    
    try {
      const fallbackRequest = new Request(fallbackUrl.toString(), request);
      const response = await timeoutFetch(fallbackRequest, {}, FETCH_TIMEOUT);
      
      if (response.ok) {
        console.log(`Successfully fetched from fallback host: ${host}`);
        return response;
      }
    } catch (e) {
      lastError = e;
      console.warn(`Failed fallback request to ${host}: ${e.message}`);
    }
  }
  
  // If all fallbacks fail, try to serve from cache
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log(`Serving from cache: ${originalUrl.pathname}`);
      return cachedResponse;
    }
  } catch (e) {
    console.warn(`Cache retrieval failed: ${e.message}`);
  }
  
  // If everything fails, throw the last error
  throw lastError || new Error('All API request attempts failed');
};

// Cache successful responses
const cacheResponse = async (request, response) => {
  if (!response.ok) return response;
  
  const clonedResponse = response.clone();
  
  try {
    const cache = await caches.open(API_CACHE_NAME);
    await cache.put(request, clonedResponse);
  } catch (e) {
    console.warn(`Failed to cache response: ${e.message}`);
  }
  
  return response;
};

// Service Worker event handlers
self.addEventListener('install', event => {
  self.skipWaiting();
  console.log('API Service Worker installed');
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
  console.log('API Service Worker activated');
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Only intercept API requests
  if (!isApiRequest(event.request.url)) {
    return;
  }
  
  // Handle API requests with resilience
  event.respondWith(
    fetchWithFallbacks(event.request)
      .then(response => cacheResponse(event.request, response))
      .catch(error => {
        console.error(`Request failed for ${url.pathname}: ${error.message}`);
        
        // Return a custom error response
        return new Response(JSON.stringify({
          error: 'api_connection_failed',
          message: 'Failed to connect to API service',
          url: url.pathname,
          timestamp: new Date().toISOString()
        }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        });
      })
  );
}); 