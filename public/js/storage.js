const PREFIX = 'techpulse_';

function getStorage() {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return localStorage;
  } catch (e) {
    return null;
  }
}

const storage = getStorage();

function getKey(key) {
  return PREFIX + key;
}

export function getItem(key, defaultValue = null) {
  if (!storage) return defaultValue;
  try {
    const raw = storage.getItem(getKey(key));
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

export function setItem(key, value) {
  if (!storage) return false;
  try {
    storage.setItem(getKey(key), JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function removeItem(key) {
  if (!storage) return false;
  try {
    storage.removeItem(getKey(key));
    return true;
  } catch (e) {
    return false;
  }
}

const BOOKMARKS_KEY = 'bookmarks';

export function getBookmarks() {
  return getItem(BOOKMARKS_KEY, {});
}

export function isBookmarked(id) {
  const bookmarks = getBookmarks();
  return !!bookmarks[id];
}

export function toggleBookmark(id, article = null) {
  const bookmarks = getBookmarks();
  if (bookmarks[id]) {
    delete bookmarks[id];
    setItem(BOOKMARKS_KEY, bookmarks);
    return false;
  } else {
    bookmarks[id] = article ? {
      id: article.id,
      title: article.title,
      url: article.url,
      source: article.source,
      savedAt: new Date().toISOString()
    } : { id, savedAt: new Date().toISOString() };
    setItem(BOOKMARKS_KEY, bookmarks);
    return true;
  }
}

export function clearBookmarks() {
  setItem(BOOKMARKS_KEY, {});
}

export function exportBookmarks() {
  const bookmarks = getBookmarks();
  const data = {
    exportDate: new Date().toISOString(),
    app: 'TechPulse',
    version: '1.0.0',
    bookmarks: Object.values(bookmarks)
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `techpulse-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const READ_KEY = 'read';

export function getReadState() {
  return getItem(READ_KEY, {});
}

export function isRead(id) {
  const read = getReadState();
  return !!read[id];
}

export function markRead(id) {
  const read = getReadState();
  read[id] = new Date().toISOString();
  setItem(READ_KEY, read);
}

export function markUnread(id) {
  const read = getReadState();
  delete read[id];
  setItem(READ_KEY, read);
}

export function clearReadState() {
  setItem(READ_KEY, {});
}

const PREFS_KEY = 'preferences';

const DEFAULT_PREFS = {
  theme: 'dark',
  density: 'comfortable',
  autoRefresh: true,
  defaultCategory: 'all',
  hiddenSources: [],
  hideRead: false
};

export function getPreferences() {
  return { ...DEFAULT_PREFS, ...getItem(PREFS_KEY, {}) };
}

export function setPreference(key, value) {
  const prefs = getPreferences();
  prefs[key] = value;
  setItem(PREFS_KEY, prefs);
  return prefs;
}

export function getPreference(key) {
  return getPreferences()[key];
}

export function isSourceHidden(source) {
  return getPreferences().hiddenSources.includes(source);
}

export function toggleSourceHidden(source) {
  const prefs = getPreferences();
  const idx = prefs.hiddenSources.indexOf(source);
  if (idx >= 0) {
    prefs.hiddenSources.splice(idx, 1);
  } else {
    prefs.hiddenSources.push(source);
  }
  setItem(PREFS_KEY, prefs);
  return prefs.hiddenSources;
}
