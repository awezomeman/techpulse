import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';

import { normalizeFeed } from './normalize.js';
import { categorizeAll } from './categorize.js';
import { deduplicate, cleanForOutput } from './dedupe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_PATH = join(__dirname, '..', 'config', 'feeds.json');
const PUBLIC_DIR = join(__dirname, '..', 'public');
const DATA_DIR = join(PUBLIC_DIR, 'data');
const ARTICLES_PATH = join(DATA_DIR, 'articles.json');
const META_PATH = join(DATA_DIR, 'meta.json');

const USER_AGENT = 'TechPulse/1.0 (https://github.com/techpulse/techpulse; RSS aggregator; contact@example.com)';

const TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY_BASE = 2000;
const MAX_ARTICLE_AGE_DAYS = 30;
const MAX_ARTICLES = 1000;

function ensureDirs() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadConfig() {
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  const cacheKey = url.replace(/[^a-zA-Z0-9]/g, '_');
  const cachePath = join(DATA_DIR, `.cache_${cacheKey}.json`);
  let headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  };
  
  try {
    if (existsSync(cachePath)) {
      const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (cache.etag) headers['If-None-Match'] = cache.etag;
      if (cache.lastModified) headers['If-Modified-Since'] = cache.lastModified;
    }
  } catch (e) {}
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers,
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    if (response.status === 200) {
      const cache = {};
      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');
      if (etag) cache.etag = etag;
      if (lastModified) cache.lastModified = lastModified;
      try {
        writeFileSync(cachePath, JSON.stringify(cache));
      } catch (e) {}
    }
    
    if (response.status === 304) {
      return { status: 304, notModified: true, text: null };
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    return { status: response.status, notModified: false, text };
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
      console.log(`  Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
      await sleep(delay);
      return fetchWithRetry(url, attempt + 1);
    }
    
    throw error;
  }
}

async function parseFeed(text) {
  const parser = new Parser({
    timeout: TIMEOUT_MS,
    headers: { 'User-Agent': USER_AGENT },
    customFields: {
      item: [
        ['media:content', 'media:content'],
        ['media:thumbnail', 'media:thumbnail'],
        ['content:encoded', 'content:encoded'],
        ['dc:creator', 'dc:creator'],
        ['dc:date', 'dc:date'],
      ]
    }
  });
  
  return parser.parseString(text);
}

async function processSource(source) {
  console.log(`\n📡 ${source.name}`);
  console.log(`   URL: ${source.url}`);
  
  if (!source.enabled) {
    console.log(`   ⏭️  Skipped (disabled)`);
    return { success: false, skipped: true, reason: 'disabled', articles: [] };
  }
  
  try {
    const result = await fetchWithRetry(source.url);
    
    if (result.notModified) {
      console.log(`   ✅ Not modified (cached)`);
      return { success: true, notModified: true, articles: [] };
    }
    
    console.log(`   📥 Fetched (${result.status}, ${result.text.length} bytes)`);
    
    const parsed = await parseFeed(result.text);
    console.log(`   📄 ${parsed.items?.length || 0} items found`);
    
    if (!parsed.items || parsed.items.length === 0) {
      return { success: true, articles: [] };
    }
    
    const normalized = normalizeFeed(parsed, source);
    console.log(`   ✓ Normalized ${normalized.length} articles`);
    
    return { success: true, articles: normalized };
    
  } catch (error) {
    console.error(`   ❌ ${error.message}`);
    return { success: false, error: error.message, articles: [] };
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     TechPulse Feed Fetcher v1.0.0        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Started: ${new Date().toISOString()}`);
  
  ensureDirs();
  const config = loadConfig();
  const sources = config.sources;
  
  console.log(`\n📋 ${sources.length} sources configured, ${sources.filter(s => s.enabled).length} enabled`);
  
  const results = [];
  const allArticles = [];
  
  for (const source of sources) {
    const result = await processSource(source);
    results.push({ name: source.name, ...result });
    
    if (result.articles) {
      allArticles.push(...result.articles);
    }
    
    await sleep(500);
  }
  
  console.log(`\n📊 Processing ${allArticles.length} total articles...`);
  
  const categorized = categorizeAll(allArticles);
  console.log(`   Categorized into ${[...new Set(categorized.map(a => a.category))].length} categories`);
  
  const { articles: deduped, duplicates } = deduplicate(categorized);
  console.log(`   Deduplicated: ${allArticles.length} → ${deduped.length} (removed ${allArticles.length - deduped.length})`);
  if (duplicates.length > 0) {
    console.log(`   Fuzzy matches found: ${duplicates.length} groups`);
  }
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_ARTICLE_AGE_DAYS);
  
  const withinWindow = deduped.filter(a => {
    const date = new Date(a.publishedAt);
    return date >= cutoff;
  });
  console.log(`   Within ${MAX_ARTICLE_AGE_DAYS}-day window: ${withinWindow.length}`);
  
  withinWindow.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  
  const final = withinWindow.slice(0, MAX_ARTICLES).map(cleanForOutput);
  
  writeFileSync(ARTICLES_PATH, JSON.stringify(final, null, 2));
  console.log(`\n💾 Wrote ${final.length} articles to ${ARTICLES_PATH}`);
  
  const sourcesClient = sources
    .filter(s => s.enabled || true)
    .map(s => ({
      name: s.name,
      url: s.url,
      homepage: s.homepage,
      defaultCategory: s.defaultCategory,
      enabled: s.enabled,
      notes: s.notes
    }));
  const SOURCES_PATH = join(DATA_DIR, 'sources.json');
  writeFileSync(SOURCES_PATH, JSON.stringify(sourcesClient, null, 2));
  console.log(`💾 Wrote sources list to ${SOURCES_PATH}`);
  
  const successCount = results.filter(r => r.success).length;
  const failures = results
    .filter(r => !r.success && !r.skipped)
    .map(r => ({ name: r.name, error: r.error }));
  
  const meta = {
    lastBuild: new Date().toISOString(),
    feedCount: sources.filter(s => s.enabled).length,
    successCount,
    failureCount: failures.length,
    articleCount: final.length,
    failures,
    duplicatesFound: duplicates.length,
    categories: [...new Set(final.map(a => a.category))].reduce((acc, cat) => {
      acc[cat] = final.filter(a => a.category === cat).length;
      return acc;
    }, {})
  };
  
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
  console.log(`💾 Wrote meta to ${META_PATH}`);
  
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║              SUMMARY                     ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║ Articles:      ${String(final.length).padStart(6)}                  ║`);
  console.log(`║ Sources OK:     ${String(successCount).padStart(6)}                  ║`);
  console.log(`║ Failed:         ${String(failures.length).padStart(6)}                  ║`);
  console.log(`║ Duplicates:     ${String(duplicates.length).padStart(6)}                  ║`);
  console.log(`║ Last build:     ${new Date().toISOString().slice(0, 19)}      ║`);
  console.log('╚══════════════════════════════════════════╝');
  
  if (failures.length > 0) {
    console.log('\n⚠️  Failures:');
    failures.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
