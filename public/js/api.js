const DATA_URL = './data/articles.json';
const META_URL = './data/meta.json';

let cachedArticles = null;
let cachedMeta = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchJSON(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-cache'
    });
    clearTimeout(timer);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

export async function loadArticles() {
  const now = Date.now();
  if (cachedArticles && (now - lastFetch) < CACHE_TTL) {
    return { articles: cachedArticles, fromCache: true };
  }
  
  try {
    const articles = await fetchJSON(DATA_URL);
    cachedArticles = articles;
    lastFetch = now;
    
    if ('caches' in window) {
      try {
        const cache = await caches.open('techpulse-data');
        await cache.put(DATA_URL, new Response(JSON.stringify(articles)));
      } catch (e) {}
    }
    
    return { articles, fromCache: false };
  } catch (error) {
    if ('caches' in window) {
      try {
        const cache = await caches.open('techpulse-data');
        const response = await cache.match(DATA_URL);
        if (response) {
          const articles = await response.json();
          cachedArticles = articles;
          return { articles, fromCache: true, offline: true };
        }
      } catch (e) {}
    }
    
    throw error;
  }
}

export async function loadMeta() {
  if (cachedMeta) return cachedMeta;
  
  try {
    const meta = await fetchJSON(META_URL);
    cachedMeta = meta;
    return meta;
  } catch (error) {
    if ('caches' in window) {
      try {
        const cache = await caches.open('techpulse-data');
        const response = await cache.match(META_URL);
        if (response) {
          return await response.json();
        }
      } catch (e) {}
    }
    return null;
  }
}

export async function checkForNewArticles(currentIds) {
  try {
    const { articles } = await loadArticles();
    const newArticles = articles.filter(a => !currentIds.includes(a.id));
    return newArticles;
  } catch (error) {
    return [];
  }
}

export async function refresh() {
  cachedArticles = null;
  cachedMeta = null;
  lastFetch = 0;
  return loadArticles();
}
