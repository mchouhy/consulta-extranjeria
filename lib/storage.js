const CLIENTS_KEY = 'ce.clients.v1';
const SETTINGS_KEY = 'ce.settings.v1';

const DEFAULT_SETTINGS = {
  lastSelectedId: null
};

export async function getClients() {
  const data = await chrome.storage.local.get(CLIENTS_KEY);
  return Array.isArray(data[CLIENTS_KEY]) ? data[CLIENTS_KEY] : [];
}

export async function saveClients(clients) {
  if (!Array.isArray(clients)) {
    throw new TypeError('Se esperaba una lista de clientes.');
  }
  await chrome.storage.local.set({ [CLIENTS_KEY]: clients });
}

export async function upsertClient(client) {
  const clients = await getClients();
  const index = clients.findIndex((item) => item.id === client.id);
  const next = clients.slice();
  if (index === -1) {
    next.push(client);
  } else {
    next[index] = client;
  }
  await saveClients(next);
  return next;
}

export async function removeClient(id) {
  const clients = await getClients();
  await saveClients(clients.filter((item) => item.id !== id));
}

export async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

export async function saveSettings(settings) {
  const current = await getSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...current, ...settings }
  });
}
