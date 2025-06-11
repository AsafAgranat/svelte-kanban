// src/service-worker.js
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

import { build, files, version } from "$service-worker";

// Create a unique cache name for this version of the app.
const CACHE_NAME = `cache-${version}`;

const ASSETS_TO_CACHE = build.concat(files);

sw.addEventListener("install", (event) => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache and caching static assets");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  sw.skipWaiting(); // Activate worker immediately
});

sw.addEventListener("activate", (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  sw.clients.claim(); // Take control of all open clients
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;

  // Always network-first for navigation requests (HTML)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If successful, clone and cache it.
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try to serve from cache
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match("/offline.html"); // Optional: an offline fallback page
          });
        })
    );
    return;
  }

  // Cache-first for other assets (CSS, JS, images)
  event.respondWith(
    caches
      .match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok && request.method === "GET" && !request.url.includes("graph.microsoft.com")) {
            // Don't cache API calls here
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Optional: if both cache and network fail for non-navigation,
        // you could return a generic fallback or error.
        // For API calls, this will just let the network error propagate.
        if (request.destination === "image") {
          // return caches.match('/placeholder-image.png'); // Optional
        }
      })
  );
});
