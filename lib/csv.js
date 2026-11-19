import { createClient, formatDate, validateClient, clientKey, findDuplicate } from './clients.js';

const HEADERS = ['Nombre y apellidos', 'NIE', 'Fecha de presentación', 'Año de nacimiento'];

const FIELD_ALIASES = {
  name: ['nombreyapellidos', 'nombre', 'nombres', 'apellidos', 'nombreyapellido', 'cliente', 'name', 'fullname'],
  nie: ['nie', 'nif', 'dni', 'identificador', 'numeroidentidad'],
  presentationDate: ['fechadepresentacion', 'fechapresentacion', 'fechadepresentaciondelasolicitud', 'fechapresentaciondelasolicitud', 'fechadepresentacionsolicitud', 'fechapresentacionsolicitud', 'fechasolicitud', 'presentacion', 'fecha', 'presentationdate'],
  birthYear: ['anodenacimiento', 'aniodenacimiento', 'anionacimiento', 'anonacimiento', 'anio', 'ano', 'year', 'birthyear', 'anodebirth']
};

function escapeCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function headerKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]/g, '');
}

function mapColumns(header) {
  const indexes = {};
  header.forEach((cell, index) => {
    const key = headerKey(cell);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (indexes[field] === undefined && aliases.includes(key)) {
        indexes[field] = index;
      }
    }
  });

  const missing = Object.keys(FIELD_ALIASES).filter((field) => indexes[field] === undefined);
  return { indexes, missing };
}

export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field.trim() === '') {
      field = '';
      inQuotes = true;
    } else if (char === ',' || char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
}

export function exportClientsCsv(clients) {
  const lines = [HEADERS];
  clients.forEach((client) => {
    lines.push([
      client.name,
      client.nie,
      formatDate(client.presentationDate),
      client.birthYear
    ]);
  });
  return `\uFEFF${lines.map((line) => line.map(escapeCsv).join(',')).join('\r\n')}\r\n`;
}

export function importClientsCsv(text, existingClients) {
  const rows = parseCsv(text);
  const result = {
    totalRows: Math.max(0, rows.length - 1),
    validCount: 0,
    invalidCount: 0,
    errors: [],
    duplicatesInFile: [],
    duplicatesInStorage: [],
    toAdd: [],
    toUpdate: []
  };

  if (rows.length === 0) {
    result.errors.push({ row: 0, message: 'El archivo está vacío.' });
    return result;
  }
  if (rows.length === 1) {
    result.errors.push({ row: 0, message: 'El archivo solo contiene la cabecera.' });
    return result;
  }

  const { indexes, missing } = mapColumns(rows[0]);
  if (missing.length > 0) {
    result.errors.push({
      row: 0,
      message: `Faltan columnas obligatorias: ${missing.join(', ')}.`
    });
    return result;
  }

  const seen = new Map();
  for (let index = 1; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const cells = rows[index];
    const raw = {};
    for (const [field, columnIndex] of Object.entries(indexes)) {
      raw[field] = cells[columnIndex] ?? '';
    }

    const candidate = createClient(raw);
    const validation = validateClient(candidate);
    if (!validation.ok) {
      result.invalidCount += 1;
      validation.errors.forEach((message) => result.errors.push({ row: rowNumber, message }));
      continue;
    }

    const key = clientKey(candidate);
    if (seen.has(key)) {
      result.duplicatesInFile.push({ row: rowNumber, previousRow: seen.get(key) });
      continue;
    }
    seen.set(key, rowNumber);
    result.validCount += 1;

    const existing = findDuplicate(existingClients, candidate);
    if (existing) {
      result.duplicatesInStorage.push({ row: rowNumber, existingId: existing.id });
      result.toUpdate.push({ incoming: candidate, existingId: existing.id });
    } else {
      result.toAdd.push(candidate);
    }
  }

  return result;
}

export function describeImport(plan) {
  const parts = [
    `${plan.validCount} registros válidos`,
    `${plan.toAdd.length} nuevos`,
    `${plan.toUpdate.length} duplicados respecto a la agenda`,
    `${plan.duplicatesInFile.length} duplicados dentro del archivo`,
    `${plan.invalidCount} errores`
  ];
  return parts.join(' · ');
}
