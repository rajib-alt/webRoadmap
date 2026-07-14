const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';

function requireConfig(config) {
  const missing = ['owner', 'repo', 'branch', 'token'].filter((key) => !config[key]);
  if (missing.length) throw new Error(`Missing GitHub setting: ${missing.join(', ')}`);
}

function apiHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  };
}

function encodePath(path) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUtf8(value) {
  const clean = value.replace(/\n/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function base64ToBlob(value, type = 'application/octet-stream') {
  const clean = value.replace(/\n/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type });
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  const text = await response.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) {
    const message = payload?.message || `${response.status} ${response.statusText}`;
    throw new Error(`GitHub API: ${message}`);
  }
  return payload;
}

export async function testConnection(config) {
  requireConfig(config);
  const url = `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const repo = await request(url, { headers: apiHeaders(config.token) });
  return { fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch };
}

export async function getFile(config, path) {
  requireConfig(config);
  const url = `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`;
  try {
    return await request(url, { headers: apiHeaders(config.token) });
  } catch (error) {
    if (/404|Not Found|Resource not found/i.test(error.message)) return null;
    throw error;
  }
}

export async function putFile(config, path, content, message, isBinary = false) {
  requireConfig(config);
  const current = await getFile(config, path);
  const body = {
    message,
    content: isBinary ? await blobToBase64(content) : utf8ToBase64(content),
    branch: config.branch,
  };
  if (current?.sha) body.sha = current.sha;
  const url = `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(path)}`;
  return request(url, {
    method: 'PUT',
    headers: { ...apiHeaders(config.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function readJsonFile(config, path) {
  const file = await getFile(config, path);
  if (!file?.content) return null;
  return JSON.parse(base64ToUtf8(file.content));
}

export async function readBlobFile(config, path, type) {
  const file = await getFile(config, path);
  if (!file?.content) return null;
  return base64ToBlob(file.content, type);
}

function noteMarkdown(taskId, note, stage, updatedAt) {
  return `# ${taskId}\n\n- Stage: ${stage || 'Not set'}\n- Updated: ${updatedAt || new Date().toISOString()}\n\n## Notes\n\n${note || ''}\n`;
}

export async function pushRoadmapData({ config, state, getLocalFile, onProgress = () => {} }) {
  requireConfig(config);
  const dataPath = (config.dataPath || 'roadmap-data').replace(/^\/+|\/+$/g, '');
  const screenshotEntries = Object.values(state.screenshots || {}).flat();
  let completed = 0;
  const noteEntries = Object.entries(state.notes || {}).filter(([, note]) => String(note || '').trim());
  const total = screenshotEntries.length + noteEntries.length + 2;
  const tick = (label) => { completed += 1; onProgress({ completed, total, label }); };

  await putFile(config, `${dataPath}/README.md`, `# Roadmap learning data\n\nThis folder is written by the Web Analytics Roadmap Tracker. It contains progress, notes, and uploaded learning evidence.\n`, 'chore(roadmap): initialise learning-data folder');
  tick('Prepared data folder');

  for (const [taskId, note] of noteEntries) {
    const markdown = noteMarkdown(taskId, note, state.taskStages?.[taskId], state.lastUpdated);
    await putFile(config, `${dataPath}/notes/${taskId}.md`, markdown, `docs(roadmap): update notes for ${taskId}`);
    tick(`Saved note ${taskId}`);
  }

  for (const meta of screenshotEntries) {
    if (!meta?.id) continue;
    const fileRecord = await getLocalFile(meta.id);
    if (!fileRecord?.blob) {
      tick(`Skipped missing screenshot ${meta.name || meta.id}`);
      continue;
    }
    const safeName = (meta.name || `${meta.id}.png`).replace(/[^a-zA-Z0-9._-]+/g, '-');
    const remotePath = meta.remotePath || `${dataPath}/screenshots/${meta.taskId || 'general'}/${meta.id}-${safeName}`;
    await putFile(config, remotePath, fileRecord.blob, `docs(roadmap): add evidence ${safeName}`, true);
    meta.remotePath = remotePath;
    meta.syncedAt = new Date().toISOString();
    tick(`Saved screenshot ${safeName}`);
  }

  const cleanState = structuredClone(state);
  const payload = JSON.stringify({ app: 'web-analytics-roadmap-tracker', version: 1, syncedAt: new Date().toISOString(), state: cleanState }, null, 2);
  await putFile(config, `${dataPath}/progress.json`, payload, 'chore(roadmap): sync learning progress');
  tick('Saved progress.json');
  return cleanState;
}

export async function pullRoadmapData({ config, saveLocalFile, onProgress = () => {} }) {
  requireConfig(config);
  const dataPath = (config.dataPath || 'roadmap-data').replace(/^\/+|\/+$/g, '');
  const payload = await readJsonFile(config, `${dataPath}/progress.json`);
  if (!payload?.state) throw new Error('No synced roadmap-data/progress.json file was found in this repository.');
  const state = payload.state;
  const screenshots = Object.values(state.screenshots || {}).flat().filter((item) => item?.remotePath);
  let completed = 0;
  for (const meta of screenshots) {
    const blob = await readBlobFile(config, meta.remotePath, meta.type || 'image/png');
    if (blob) await saveLocalFile({ id: meta.id, blob, name: meta.name, type: meta.type, createdAt: meta.createdAt, remotePath: meta.remotePath });
    completed += 1;
    onProgress({ completed, total: screenshots.length || 1, label: `Restored ${meta.name || meta.id}` });
  }
  return state;
}
