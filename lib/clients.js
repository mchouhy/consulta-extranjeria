const NIE_FORMAT = /^[XYZ]?\d{7,8}[A-Z]$/;
const MAX_NIE_LENGTH = 15;

export function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeNie(value) {
  return normalizeText(value).toUpperCase().replace(/[.\-\s]/g, '');
}

export function parseDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  let parts = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    parts = text.split('-');
  } else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    parts = text.split('/');
  } else {
    const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
    if (match) parts = [match[3], match[2], match[1]];
  }
  if (!parts) return '';

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!isValidIsoDate(iso)) return '';
  return iso;
}

export function isValidIsoDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
  const [year, month, day] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function formatDate(iso) {
  if (!isValidIsoDate(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function createId() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function createClient(raw) {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: normalizeText(raw.name),
    nie: normalizeNie(raw.nie),
    presentationDate: parseDate(raw.presentationDate),
    birthYear: String(raw.birthYear ?? '').trim(),
    createdAt: now,
    updatedAt: now
  };
}

export function updateClient(existing, raw) {
  return {
    ...createClient(raw),
    id: existing.id,
    createdAt: existing.createdAt || new Date().toISOString()
  };
}

export function validateClient(client) {
  const errors = [];
  const warnings = [];

  const name = normalizeText(client.name);
  if (!name) {
    errors.push('El nombre y apellidos son obligatorios.');
  } else if (name.length > 120) {
    errors.push('El nombre no puede superar los 120 caracteres.');
  }

  const nie = normalizeNie(client.nie);
  if (!nie) {
    errors.push('El NIE es obligatorio.');
  } else if (!NIE_FORMAT.test(nie)) {
    warnings.push('El NIE no tiene el formato habitual (por ejemplo, X1234567L). Se guardará de todos modos.');
  }
  if (nie.length > MAX_NIE_LENGTH) {
    errors.push(`El NIE no puede superar los ${MAX_NIE_LENGTH} caracteres admitidos por el formulario oficial.`);
  }

  const presentationDate = parseDate(client.presentationDate);
  const today = new Date().toISOString().slice(0, 10);
  if (!presentationDate) {
    errors.push('La fecha de presentación no es válida. Use el formato DD/MM/AAAA.');
  } else if (presentationDate > today) {
    errors.push('La fecha de presentación no puede ser futura.');
  } else if (presentationDate < '1900-01-01') {
    errors.push('La fecha de presentación no puede ser anterior a 1900.');
  }

  const birthYear = String(client.birthYear ?? '').trim();
  const currentYear = new Date().getFullYear();
  if (!/^\d{4}$/.test(birthYear)) {
    errors.push('El año de nacimiento debe tener 4 dígitos.');
  } else {
    const numericYear = Number(birthYear);
    if (numericYear < 1900 || numericYear > currentYear) {
      errors.push(`El año de nacimiento debe estar entre 1900 y ${currentYear}.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function clientKey(client) {
  return `${normalizeNie(client.nie)}|${parseDate(client.presentationDate)}|${String(client.birthYear).trim()}`;
}

export function isDuplicate(left, right) {
  return normalizeNie(left.nie) === normalizeNie(right.nie) &&
    parseDate(left.presentationDate) === parseDate(right.presentationDate) &&
    String(left.birthYear).trim() === String(right.birthYear).trim();
}

export function findDuplicate(clients, candidate, excludeId = null) {
  return clients.find((client) => client.id !== excludeId && isDuplicate(client, candidate)) || null;
}

function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

export function searchClients(clients, query) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return clients.slice();

  return clients.filter((client) => {
    const haystack = fold([
      client.name,
      client.nie,
      formatDate(client.presentationDate),
      client.birthYear
    ].join(' '));
    return terms.every((term) => haystack.includes(term));
  });
}

export function sortClients(clients) {
  return clients.slice().sort((left, right) =>
    String(left.name).localeCompare(String(right.name), 'es', { sensitivity: 'base' })
  );
}
