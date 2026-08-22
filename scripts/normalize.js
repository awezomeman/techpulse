import crypto from 'crypto';

const GRADIENTS = [
  'linear-gradient(135deg, #1e3a5f, #0d2137)',
  'linear-gradient(135deg, #2d1b4e, #1a0f2e)',
  'linear-gradient(135deg, #1f3d2f, #0f1f18)',
  'linear-gradient(135deg, #3d1f1f, #1f0f0f)',
  'linear-gradient(135deg, #0d3b2e, #072018)',
  'linear-gradient(135deg, #2e1f3d, #1a0f2e)',
  'linear-gradient(135deg, #3d3d1f, #1f1f0f)',
  'linear-gradient(135deg, #1f2f3d, #0f1820)',
  'linear-gradient(135deg, #3d2e1f, #1f1a0f)',
  'linear-gradient(135deg, #1f3d3d, #0f1f1f)',
  'linear-gradient(135deg, #2e3d1f, #1a1f0f)',
  'linear-gradient(135deg, #3d1f3d, #1f0f1f)',
];

export function stripHtml(html) {
  if (!html) return '';
  let text = html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))))
    .replace(/&#x[0-9a-fA-F]+;/g, (m) => String.fromCharCode(parseInt(m.slice(3, -1), 16)));
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

export function truncate(text, maxLength = 300) {
  if (!text) return '';
  const stripped = text.replace(/\s+/g, ' ').trim();
  if (stripped.length <= maxLength) return stripped;
  const truncated = stripped.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + '…';
  }
  return truncated + '…';
}

export function computeId(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export function extractImage(item) {
  if (item['media:content']?.$?.url) {
    return item['media:content'].$.url;
  }
  if (item['media:thumbnail']?.$?.url) {
    return item['media:thumbnail'].$.url;
  }
  if (item.enclosure?.type?.startsWith('image/')) {
    return item.enclosure.url;
  }
  const htmlContent = item['content:encoded'] || item.content || item.summary || item.description || '';
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }
  return null;
}

export function getGradient(title) {
  const hash = crypto.createHash('sha256').update(title || 'default').digest('hex');
  const index = parseInt(hash.slice(0, 8), 16) % GRADIENTS.length;
  return GRADIENTS[index];
}

export function estimateReadTime(text) {
  if (!text) return 1;
  const wordCount = text.trim().split(/\s+/).length;
  return Math.max(1, Math.floor(wordCount / 200));
}

export function normalizeItem(item, sourceConfig) {
  const title = stripHtml(item.title);
  const rawExcerpt = item['content:encoded'] || item.content || item.summary || item.description || item.contentSnippet || '';
  const excerpt = truncate(stripHtml(rawExcerpt), 300);
  const url = item.link || item.guid || item.id;
  const author = item.creator || item.author || item['dc:creator'] || null;
  
  let publishedAt = null;
  const dateStr = item.isoDate || item.pubDate || item.published || item.updated || item['dc:date'];
  if (dateStr) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      publishedAt = parsed.toISOString();
    }
  }
  if (!publishedAt) {
    publishedAt = new Date().toISOString();
  }
  
  const imageUrl = extractImage(item);
  const id = computeId(url);
  
  return {
    id,
    title,
    excerpt,
    url,
    source: sourceConfig.name,
    sourceHomepage: sourceConfig.homepage,
    author: author ? stripHtml(author) : null,
    publishedAt,
    category: sourceConfig.defaultCategory,
    imageUrl,
    readTimeMinutes: estimateReadTime(excerpt),
    rawCategories: item.categories || [],
    _rawTitle: title,
    _sourceUrl: sourceConfig.url
  };
}

export function normalizeFeed(parsedFeed, sourceConfig) {
  if (!parsedFeed?.items) return [];
  return parsedFeed.items.map(item => normalizeItem(item, sourceConfig));
}
