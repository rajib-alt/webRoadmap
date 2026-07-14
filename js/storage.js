const DB_NAME = 'web-analytics-roadmap-tracker';
const DB_VERSION = 1;
const STATE_KEY = 'app-state';

const DEFAULT_STATE = {
  version: 1,
  taskStates: {},
  taskStages: {},
  notes: {},
  reviews: {},
  sessions: [],
  screenshots: {},
  settings: {
    githubOwner: '',
    githubRepo: '',
    githubBranch: 'main',
    githubDataPath: 'roadmap-data',
    rememberTokenForSession: false,
  },
  profile: {
    name: '',
    startDate: '',
    targetRole: '',
    activePlan: 'intensive12',
  },
  lastUpdated: null,
};

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('app')) db.createObjectStore('app');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}

function mergeDefaults(saved = {}) {
  return {
    ...structuredClone(DEFAULT_STATE),
    ...saved,
    settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
    profile: { ...DEFAULT_STATE.profile, ...(saved.profile || {}) },
    taskStates: saved.taskStates || {},
    taskStages: saved.taskStages || {},
    notes: saved.notes || {},
    reviews: saved.reviews || {},
    sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
    screenshots: saved.screenshots || {},
  };
}

export async function loadState() {
  const db = await openDb();
  const tx = db.transaction('app', 'readonly');
  const req = tx.objectStore('app').get(STATE_KEY);
  const value = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return mergeDefaults(value);
}

export async function saveState(state) {
  const db = await openDb();
  const next = { ...state, lastUpdated: new Date().toISOString() };
  const tx = db.transaction('app', 'readwrite');
  tx.objectStore('app').put(next, STATE_KEY);
  await txDone(tx);
  return next;
}

export async function saveFileRecord(record) {
  const db = await openDb();
  const tx = db.transaction('files', 'readwrite');
  tx.objectStore('files').put(record);
  await txDone(tx);
  return record;
}

export async function getFileRecord(id) {
  const db = await openDb();
  const tx = db.transaction('files', 'readonly');
  const req = tx.objectStore('files').get(id);
  const value = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return value;
}

export async function deleteFileRecord(id) {
  const db = await openDb();
  const tx = db.transaction('files', 'readwrite');
  tx.objectStore('files').delete(id);
  await txDone(tx);
}

export async function clearAllData() {
  const db = await openDb();
  const tx = db.transaction(['app', 'files'], 'readwrite');
  tx.objectStore('app').clear();
  tx.objectStore('files').clear();
  await txDone(tx);
  sessionStorage.removeItem('roadmapGithubToken');
}

export function getSessionToken() {
  return sessionStorage.getItem('roadmapGithubToken') || '';
}

export function setSessionToken(token) {
  if (token) sessionStorage.setItem('roadmapGithubToken', token);
  else sessionStorage.removeItem('roadmapGithubToken');
}

export function exportStateJson(state) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    app: 'web-analytics-roadmap-tracker',
    state,
  }, null, 2);
}

export function importStateJson(text) {
  const parsed = JSON.parse(text);
  const candidate = parsed?.state || parsed;
  if (!candidate || typeof candidate !== 'object') throw new Error('The selected file does not contain valid roadmap data.');
  return mergeDefaults(candidate);
}

export function createId(prefix = 'item') {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
