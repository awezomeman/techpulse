function levenshtein(a, b) {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(report|exclusive|breaking|update|news|analysis|review)\s*$/i, '')
    .replace(/^\s*(breaking|exclusive|update)\s+/i, '');
}

function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;
  
  const maxLen = Math.max(na.length, nb.length);
  const distance = levenshtein(na, nb);
  return 1 - distance / maxLen;
}

export function deduplicate(articles) {
  const byUrl = new Map();
  const duplicates = [];
  
  for (const article of articles) {
    if (byUrl.has(article.id)) {
      const existing = byUrl.get(article.id);
      const existingDate = new Date(existing.publishedAt);
      const newDate = new Date(article.publishedAt);
      
      if (!existing.alsoCoveredBy) existing.alsoCoveredBy = [];
      
      if (newDate < existingDate) {
        byUrl.set(article.id, { ...article, alsoCoveredBy: [existing] });
      } else {
        existing.alsoCoveredBy.push({
          source: article.source,
          sourceHomepage: article.sourceHomepage,
          url: article.url,
          publishedAt: article.publishedAt
        });
      }
    } else {
      byUrl.set(article.id, { ...article });
    }
  }
  
  const urlList = Array.from(byUrl.values());
  const used = new Set();
  const result = [];
  
  for (let i = 0; i < urlList.length; i++) {
    if (used.has(i)) continue;
    
    const a = urlList[i];
    const dupGroup = { kept: a, duplicates: [] };
    used.add(i);
    
    for (let j = i + 1; j < urlList.length; j++) {
      if (used.has(j)) continue;
      
      const b = urlList[j];
      const sim = titleSimilarity(a.title, b.title);
      
      if (sim > 0.85) {
        used.add(j);
        dupGroup.duplicates.push({
          source: b.source,
          sourceHomepage: b.sourceHomepage,
          url: b.url,
          publishedAt: b.publishedAt,
          similarity: Math.round(sim * 100) / 100
        });
      }
    }
    
    if (dupGroup.duplicates.length > 0) {
      duplicates.push(dupGroup);
      a.alsoCoveredBy = (a.alsoCoveredBy || []).concat(dupGroup.duplicates.map(d => ({
        source: d.source,
        sourceHomepage: d.sourceHomepage,
        url: d.url,
        publishedAt: d.publishedAt
      })));
    }
    
    result.push(a);
  }
  
  return { articles: result, duplicates };
}

export function cleanForOutput(article) {
  const { _rawTitle, _sourceUrl, rawCategories, ...clean } = article;
  return clean;
}
