(() => {
  const FORM_SELECTOR = 'form#consultaInfoWebForm';
  const FIELD_SPECS = [
    { key: 'nie', id: 'nie', name: 'nie' },
    { key: 'presentationDate', id: 'fechaPresentacion', name: 'fechaPresentacion' },
    { key: 'birthYear', id: 'anio', name: 'anio' }
  ];
  const MESSAGE_TYPES = {
    PING: 'CE_PING',
    FILL: 'CE_FILL_FORM'
  };

  function findFields() {
    const form = document.querySelector(FORM_SELECTOR);
    if (!form) {
      return {
        error: 'No se ha reconocido el formulario oficial. Abra la página de consulta y vuelva a cargarla.'
      };
    }

    const fields = {};
    for (const spec of FIELD_SPECS) {
      const selector = `input#${spec.id}[name="${spec.name}"]`;
      const elements = form.querySelectorAll(selector);
      if (elements.length !== 1) {
        return {
          error: 'La estructura del formulario oficial ha cambiado. No se ha rellenado ningún campo.'
        };
      }
      fields[spec.key] = elements[0];
    }

    return { form, fields };
  }

  function asText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function isValidIso(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
  }

  function readPayload(payload) {
    const source = payload || {};
    const nie = asText(source.nie);
    const presentationDate = asText(source.presentationDate);
    const birthYear = asText(source.birthYear);

    if (!nie || !presentationDate || !birthYear) {
      return { error: 'Faltan datos del cliente. Revise la ficha antes de rellenar.' };
    }
    if (nie.length > 15) {
      return { error: 'El NIE supera la longitud admitida por el formulario oficial.' };
    }
    if (!isValidIso(presentationDate)) {
      return { error: 'La fecha de presentación no tiene un formato válido.' };
    }
    if (!/^\d{4}$/.test(birthYear)) {
      return { error: 'El año de nacimiento no tiene un formato válido.' };
    }

    return { values: { nie, presentationDate, birthYear } };
  }

  function formattedDate(iso) {
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  }

  function setNativeValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('keyup', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function fillForm(payload) {
    const located = findFields();
    if (located.error) {
      return { ok: false, code: 'FORM_NOT_RECOGNIZED', error: located.error };
    }

    const parsed = readPayload(payload);
    if (parsed.error) {
      return { ok: false, code: 'INVALID_DATA', error: parsed.error };
    }

    const { fields } = located;
    const expected = {};
    for (const spec of FIELD_SPECS) {
      const input = fields[spec.key];
      const value = spec.key === 'presentationDate'
        ? (input.type === 'date' ? parsed.values.presentationDate : formattedDate(parsed.values.presentationDate))
        : parsed.values[spec.key];
      setNativeValue(input, value);
      expected[spec.key] = value;
    }

    const failed = FIELD_SPECS.filter((spec) => fields[spec.key].value !== expected[spec.key]);
    if (failed.length > 0) {
      return {
        ok: false,
        code: 'VERIFICATION_FAILED',
        error: 'La página no ha aceptado todos los valores. Revise el formulario antes de continuar.'
      };
    }

    return {
      ok: true,
      count: FIELD_SPECS.length,
      message: 'Campos rellenados. Revíselos, complete el CAPTCHA y pulse «CONSULTAR» en la página oficial.'
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === MESSAGE_TYPES.PING) {
      sendResponse({ ok: true, formFound: !findFields().error });
      return false;
    }

    if (message.type === MESSAGE_TYPES.FILL) {
      try {
        sendResponse(fillForm(message.payload));
      } catch (error) {
        sendResponse({
          ok: false,
          code: 'UNEXPECTED_ERROR',
          error: 'No se ha podido rellenar el formulario. Compruebe la página oficial.'
        });
      }
      return false;
    }

    return false;
  });
})();
