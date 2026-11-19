import {
  getClients,
  saveClients,
  upsertClient,
  removeClient,
  getSettings,
  saveSettings
} from './lib/storage.js';
import {
  createClient,
  updateClient,
  validateClient,
  findDuplicate,
  searchClients,
  sortClients,
  formatDate
} from './lib/clients.js';
import { exportClientsCsv, importClientsCsv, describeImport } from './lib/csv.js';

const OFFICIAL_HOST = 'infoext2.delegaciondelgobierno.gob.es';
const OFFICIAL_PATH = '/infoext2/consulta.html';
const OFFICIAL_URL = `https://${OFFICIAL_HOST}${OFFICIAL_PATH}`;
const VIEW_NAMES = ['list', 'detail', 'form', 'settings', 'import'];

const state = {
  clients: [],
  query: '',
  selectedId: null,
  editingId: null,
  formBack: 'list',
  plan: null,
  view: 'list'
};

let confirmResolver = null;

function byId(id) {
  return document.getElementById(id);
}

function showView(name) {
  VIEW_NAMES.forEach((view) => {
    byId(`view-${view}`).hidden = view !== name;
  });
  state.view = name;
  byId('status').hidden = true;
}

function showStatus(message, isError = false) {
  const status = byId('status');
  status.textContent = message;
  status.classList.toggle('is-error', isError);
  status.hidden = false;
}

function makeButton(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function renderList() {
  const container = byId('client-list');
  container.replaceChildren();

  const matches = sortClients(searchClients(state.clients, state.query));
  byId('empty-list').hidden = matches.length > 0;

  matches.forEach((client) => {
    const card = document.createElement('div');
    card.className = 'client-card';
    if (client.id === state.selectedId) card.classList.add('is-selected');

    const name = document.createElement('span');
    name.className = 'client-name';
    name.textContent = client.name;

    const meta = document.createElement('span');
    meta.className = 'client-meta';
    meta.textContent = `${client.nie} · ${formatDate(client.presentationDate)} · ${client.birthYear}`;

    const edit = makeButton('Editar', 'mini-btn');
    edit.addEventListener('click', (event) => {
      event.stopPropagation();
      openForm(client.id);
    });

    const remove = makeButton('Eliminar', 'mini-btn danger');
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      confirmDelete(client);
    });

    card.append(name, meta, edit, remove);
    card.addEventListener('click', () => selectClient(client.id));
    container.append(card);
  });
}

function renderDetail() {
  const client = state.clients.find((item) => item.id === state.selectedId);
  if (!client) return false;

  byId('detail-name').textContent = client.name;
  byId('detail-nie').textContent = client.nie;
  byId('detail-presentation').textContent = formatDate(client.presentationDate);
  byId('detail-birth-year').textContent = client.birthYear;
  return true;
}

async function selectClient(id) {
  state.selectedId = id;
  await saveSettings({ lastSelectedId: id });
  renderList();
  if (renderDetail()) showView('detail');
}

function openForm(id = null) {
  const client = id ? state.clients.find((item) => item.id === id) : null;
  state.editingId = client ? client.id : null;
  state.formBack = client && state.view === 'detail' ? 'detail' : 'list';

  byId('form-title').textContent = client ? 'Editar cliente' : 'Nuevo cliente';
  byId('f-name').value = client ? client.name : '';
  byId('f-nie').value = client ? client.nie : '';
  byId('f-presentation').value = client ? formatDate(client.presentationDate) : '';
  byId('f-birth-year').value = client ? client.birthYear : '';
  byId('form-errors').hidden = true;
  byId('form-warnings').hidden = true;

  showView('form');
  byId('f-name').focus();
}

function showListMessages(errors, warnings) {
  const errorBox = byId('form-errors');
  const warningBox = byId('form-warnings');

  errorBox.replaceChildren();
  warningBox.replaceChildren();

  errors.forEach((message) => {
    const line = document.createElement('div');
    line.textContent = message;
    errorBox.append(line);
  });
  warnings.forEach((message) => {
    const line = document.createElement('div');
    line.textContent = message;
    warningBox.append(line);
  });

  errorBox.hidden = errors.length === 0;
  warningBox.hidden = warnings.length === 0;
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const raw = {
    name: byId('f-name').value,
    nie: byId('f-nie').value,
    presentationDate: byId('f-presentation').value,
    birthYear: byId('f-birth-year').value
  };

  const existing = state.editingId
    ? state.clients.find((item) => item.id === state.editingId)
    : null;
  const candidate = existing ? updateClient(existing, raw) : createClient(raw);
  const validation = validateClient(candidate);
  const warnings = validation.warnings.slice();

  const duplicate = findDuplicate(state.clients, candidate, state.editingId);
  if (duplicate) {
    warnings.push('Ya existe un cliente con el mismo NIE, fecha de presentación y año de nacimiento. Puede guardarlo de todos modos.');
  }

  if (!validation.ok) {
    showListMessages(validation.errors, warnings);
    return;
  }

  await upsertClient(candidate);
  state.clients = await getClients();
  state.selectedId = candidate.id;
  await saveSettings({ lastSelectedId: candidate.id });
  renderList();
  renderDetail();
  showView('detail');
  showStatus('Cliente guardado correctamente.');
}

function askConfirm(title, message, label) {
  byId('confirm-title').textContent = title;
  byId('confirm-message').textContent = message;
  byId('confirm-ok').textContent = label;
  byId('confirm-modal').hidden = false;
  byId('confirm-ok').focus();

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirm(answer) {
  byId('confirm-modal').hidden = true;
  if (confirmResolver) {
    confirmResolver(answer);
    confirmResolver = null;
  }
}

async function confirmDelete(client) {
  const accepted = await askConfirm(
    'Eliminar cliente',
    `Se eliminará la ficha de ${client.name}. Esta acción no se puede deshacer.`,
    'Eliminar'
  );
  if (!accepted) return;

  await removeClient(client.id);
  state.clients = await getClients();
  if (state.selectedId === client.id) state.selectedId = null;
  await saveSettings({ lastSelectedId: state.selectedId });
  renderList();
  showView('list');
  showStatus('Cliente eliminado.');
}

async function handleFill() {
  const client = state.clients.find((item) => item.id === state.selectedId);
  if (!client) {
    showStatus('Seleccione un cliente antes de rellenar.', true);
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) {
    showStatus(`Abra primero el formulario oficial (${OFFICIAL_URL}) y vuelva a pulsar «Rellenar formulario».`, true);
    return;
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch (error) {
    showStatus(`Abra primero el formulario oficial (${OFFICIAL_URL}) y vuelva a pulsar «Rellenar formulario».`, true);
    return;
  }

  if (url.hostname !== OFFICIAL_HOST || url.pathname !== OFFICIAL_PATH) {
    showStatus(`Abra primero el formulario oficial (${OFFICIAL_URL}) y vuelva a pulsar «Rellenar formulario».`, true);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'CE_FILL_FORM',
      payload: {
        nie: client.nie,
        presentationDate: client.presentationDate,
        birthYear: client.birthYear
      }
    });
    if (response && response.ok) {
      showStatus(response.message);
    } else {
      showStatus((response && response.error) || 'No se ha podido rellenar el formulario.', true);
    }
  } catch (error) {
    showStatus('No se ha podido conectar con la página oficial. Vuelva a cargarla e inténtelo de nuevo.', true);
  }
}

function handleExport() {
  if (state.clients.length === 0) {
    showStatus('No hay clientes para exportar.', true);
    return;
  }

  const csv = exportClientsCsv(sortClients(state.clients));
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clientes-extranjeria-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showStatus('Copia CSV exportada.');
}

async function handleFile(file) {
  if (!file) return;
  const text = await file.text();
  state.plan = importClientsCsv(text, state.clients);
  renderImport();
  showView('import');
}

function renderImport() {
  const plan = state.plan;
  const summary = byId('import-summary');
  summary.replaceChildren();

  const lines = [
    ['Filas analizadas', plan.totalRows],
    ['Registros válidos', plan.validCount],
    ['Nuevos', plan.toAdd.length],
    ['Duplicados respecto a la agenda', plan.toUpdate.length],
    ['Duplicados dentro del archivo', plan.duplicatesInFile.length],
    ['Registros con errores', plan.invalidCount]
  ];

  lines.forEach(([label, value]) => {
    const line = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    line.append(document.createTextNode(`${label}: `), strong);
    summary.append(line);
  });

  const errors = byId('import-errors');
  errors.replaceChildren();
  plan.errors.forEach((entry) => {
    const line = document.createElement('p');
    line.textContent = `Fila ${entry.row}: ${entry.message}`;
    errors.append(line);
  });
  errors.hidden = plan.errors.length === 0;

  byId('btn-import-new').disabled = plan.toAdd.length === 0;
  byId('btn-import-update').hidden = plan.toUpdate.length === 0;
}

async function applyImport(updateExisting) {
  const plan = state.plan;
  if (!plan) return;
  if (plan.toAdd.length === 0 && !(updateExisting && plan.toUpdate.length > 0)) return;

  const message = updateExisting
    ? `Se añadirán ${plan.toAdd.length} registros nuevos y se actualizarán ${plan.toUpdate.length} registros existentes.`
    : `Se añadirán ${plan.toAdd.length} registros nuevos. No se modificará ningún registro existente.`;
  const accepted = await askConfirm('Confirmar importación', message, 'Importar');
  if (!accepted) return;

  const current = await getClients();
  const byClientId = new Map(current.map((client) => [client.id, client]));
  if (updateExisting) {
    plan.toUpdate.forEach(({ incoming, existingId }) => {
      const existing = byClientId.get(existingId);
      if (existing) {
        byClientId.set(existingId, {
          ...incoming,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString()
        });
      }
    });
  }

  await saveClients([...byClientId.values(), ...plan.toAdd]);
  state.clients = await getClients();
  state.plan = null;
  renderList();
  showView('list');
  showStatus(`Importación completada. ${describeImport(plan)}`);
}

byId('search').addEventListener('input', (event) => {
  state.query = event.target.value;
  renderList();
});

byId('btn-add').addEventListener('click', () => openForm());
byId('btn-settings').addEventListener('click', () => showView('settings'));
byId('btn-edit').addEventListener('click', () => openForm(state.selectedId));
byId('btn-fill').addEventListener('click', handleFill);
byId('client-form').addEventListener('submit', handleFormSubmit);
byId('btn-form-cancel').addEventListener('click', () => showView(state.formBack));

document.querySelectorAll('[data-back]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.back));
});
document.querySelector('[data-back-context="form"]').addEventListener('click', () => showView(state.formBack));

byId('btn-export').addEventListener('click', handleExport);
byId('btn-import').addEventListener('click', () => byId('file-import').click());
byId('file-import').addEventListener('change', (event) => {
  handleFile(event.target.files[0]);
  event.target.value = '';
});

byId('btn-import-new').addEventListener('click', () => applyImport(false));
byId('btn-import-update').addEventListener('click', () => applyImport(true));
byId('btn-import-cancel').addEventListener('click', () => {
  state.plan = null;
  showView('settings');
});

byId('confirm-ok').addEventListener('click', () => closeConfirm(true));
byId('confirm-cancel').addEventListener('click', () => closeConfirm(false));
byId('confirm-modal').addEventListener('click', (event) => {
  if (event.target === byId('confirm-modal')) closeConfirm(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !byId('confirm-modal').hidden) closeConfirm(false);
});

async function init() {
  state.clients = await getClients();
  const settings = await getSettings();
  if (settings.lastSelectedId && state.clients.some((client) => client.id === settings.lastSelectedId)) {
    state.selectedId = settings.lastSelectedId;
  }
  renderList();
  showView('list');
}

init();
