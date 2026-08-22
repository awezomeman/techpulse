import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let keywordConfig = null;
let categoryNames = null;

function loadConfig() {
  if (keywordConfig) return;
  const configPath = join(__dirname, '..', 'config', 'feeds.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  keywordConfig = config.keywords || {};
  categoryNames = config.categories || {};
}

function normalizeForMatching(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCategory(text, keywords) {
  const normalized = normalizeForMatching(text);
  const words = new Set(normalized.split(' '));
  let score = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase();
    if (words.has(normalizedKeyword)) {
      score += 3;
    }
    if (normalized.includes(normalizedKeyword)) {
      score += 2;
    }
    if (normalized.split(' ').some(w => w.includes(normalizedKeyword) && w.length > normalizedKeyword.length)) {
      score += 1;
    }
  }
  return score;
}

function mapFeedCategory(rawCategories) {
  if (!rawCategories || rawCategories.length === 0) return null;
  
  const categoryMap = {
    'artificial intelligence': 'ai',
    'machine learning': 'ai',
    'ai': 'ai',
    'security': 'security',
    'cybersecurity': 'security',
    'privacy': 'security',
    'hardware': 'hardware',
    'chips': 'hardware',
    'semiconductors': 'hardware',
    'software': 'software',
    'open source': 'software',
    'policy': 'policy',
    'regulation': 'policy',
    'government': 'policy',
    'startups': 'startups',
    'venture capital': 'startups',
    'funding': 'startups',
    'cryptocurrency': 'crypto',
    'blockchain': 'crypto',
    'bitcoin': 'crypto',
    'science': 'science',
    'space': 'science',
    'research': 'science'
  };
  
  for (const cat of rawCategories) {
    const lower = cat.toLowerCase().trim();
    if (categoryMap[lower]) {
      return categoryMap[lower];
    }
    for (const [key, value] of Object.entries(categoryMap)) {
      if (lower.includes(key)) {
        return value;
      }
    }
  }
  return null;
}

export function categorize(article, config = null) {
  loadConfig();
  
  const feedCategory = mapFeedCategory(article.rawCategories);
  if (feedCategory) {
    return { ...article, category: feedCategory };
  }
  
  const text = `${article.title} ${article.excerpt}`;
  const scores = {};
  
  for (const [category, keywords] of Object.entries(keywordConfig)) {
    scores[category] = scoreCategory(text, keywords);
  }
  
  let bestCategory = null;
  let bestScore = 0;
  
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  
  if (bestScore >= 3) {
    return { ...article, category: bestCategory };
  }
  
  return { ...article, category: article.category || 'general' };
}

export function categorizeAll(articles) {
  return articles.map(a => categorize(a));
}
