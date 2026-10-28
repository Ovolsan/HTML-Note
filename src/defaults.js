// Оформление по умолчанию для новых листов и блоков (ПКМ по «Рамка» / «Отступы внутри» → «Запомнить по умолчанию»).
const KEY = 'hn-defaults-v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

/** kind: 'frame' | 'block' → { border?, pad? } */
export function getDefaults(kind) {
  return { ...(load()[kind] || {}) };
}

export function setDefault(kind, patch) {
  const all = load();
  all[kind] = { ...(all[kind] || {}), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* без запоминания */ }
}

export function resetDefault(kind, field) {
  const all = load();
  if (all[kind]) delete all[kind][field];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* без запоминания */ }
}
