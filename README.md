# Consulta de Extranjería

> Extensión de Google Chrome (Manifest V3) para mantener una agenda **local** de clientes y rellenar automáticamente los tres campos del formulario oficial de consulta de expedientes de extranjería.

## Para qué la hice

La hice para resolver el mismo problema que su hermana `consulta-nacionalidad`, pero en la sede de extranjería: evitar copiar a mano NIE, fecha de presentación y año de nacimiento en consultas frecuentes de un despacho jurídico, sin subir esa información personal a ningún servidor. Es un proyecto **independiente**: tiene su propio espacio de almacenamiento y sus propios permisos, por lo que puede convivir con la otra extensión sin mezclar datos. El usuario conserva siempre el control del CAPTCHA y del envío de la consulta.

## Stack

- Chrome Extensions **Manifest V3**.
- **JavaScript nativo** con módulos ES, HTML5 y CSS3.
- **Chrome Storage API** (`chrome.storage.local`).
- **Content scripts** limitados a `https://infoext2.delegaciondelgobierno.gob.es/infoext2/consulta.html`.
- Sin frameworks, dependencias, compilación, CDN ni servicios externos.

## Arquitectura

- `popup.html` / `popup.css` / `popup.js`: interfaz con vistas de listado, ficha, alta/edición, datos y CSV, y revisión de importación, además de un modal de confirmación.
- `lib/storage.js`: acceso a `chrome.storage.local` mediante las claves propias `ce.clients.v1` y `ce.settings.v1`, independientes de `cn.*`.
- `lib/clients.js`: normalización, validación, búsqueda, ordenación y detección de duplicados por NIE + fecha de presentación + año de nacimiento.
- `lib/csv.js`: importación y exportación con BOM UTF-8, aliases de cabecera y validación fila a fila.
- `content.js`: localiza `input#nie[name="nie"]`, `input#fechaPresentacion[name="fechaPresentacion"]` e `input#anio[name="anio"]` dentro de `form#consultaInfoWebForm`, escribe con el setter nativo, dispara los eventos que espera la página y vuelve a leer los valores para verificarlos.
- Flujo: el popup comprueba que la pestaña activa sea la URL oficial y envía los datos con `chrome.tabs.sendMessage`; el content script rellena los campos. No se toca el CAPTCHA ni `#btnConsulta`.

**Instalación rápida:** clonar o descargar la carpeta y cargarla descomprimida desde `chrome://extensions` con el modo de desarrollador activado (detalles en el apartado 2).

**Límite importante:** la extensión solo escribe en los campos. **No pulsa** el botón «CONSULTAR», no resuelve CAPTCHA, no elude controles de seguridad y no realiza consultas masivas. La revisión, el CAPTCHA y el envío los hace siempre el usuario en la página oficial.

## 1. Qué hace

- Alta, edición, eliminación y búsqueda de clientes (nombre y apellidos, NIE, fecha de presentación de la solicitud y año de nacimiento).
- Selección de un cliente y comprobación de sus datos antes de rellenar.
- Rellenado de NIE, fecha de presentación y año de nacimiento en el formulario oficial, con verificación posterior y mensaje de éxito o error.
- Exportación e importación de la agenda en CSV, con validación, detección de duplicados y confirmación expresa antes de cualquier modificación.
- Todo el almacenamiento es local (`chrome.storage.local`). Sin cuentas, servidores, sincronización, analítica ni servicios externos.
- Proyecto independiente de `consulta-nacionalidad`: usa claves propias (`ce.clients.v1`, `ce.settings.v1`) y no mezcla datos con la otra extensión.

## 2. Instalación local

1. Descargar o clonar esta carpeta; no hace falta compilar ni instalar dependencias.
2. Abrir Chrome y entrar en `chrome://extensions`.
3. Activar **Modo de desarrollador** (arriba a la derecha).
4. Pulsar **Cargar descomprimida** y seleccionar la carpeta que contiene `manifest.json`.
5. Fijar la extensión a la barra de herramientas si se desea acceso rápido.

Para probar el autocompletado, abrir primero la página oficial:

`https://infoext2.delegaciondelgobierno.gob.es/infoext2/consulta.html`

Esa dirección puede mostrar primero una pantalla de acceso; si es así, pulsar **ENTRAR FORMULARIO**. El formulario con los tres campos se sirve de nuevo en `/infoext2/consulta.html`. Si la página ya estaba abierta antes de instalar o actualizar la extensión, **recargarla una vez** para que se inicie el content script.

## 3. Uso de la agenda

- **Añadir cliente:** botón «Añadir cliente» del popup. Los cuatro campos son obligatorios.
- **Editar:** botón «Editar» de la tarjeta del cliente, o «Editar datos» desde su ficha.
- **Eliminar:** botón «Eliminar» de la tarjeta. Se solicita confirmación; la acción no se puede deshacer, por lo que se recomienda exportar antes.
- **Buscar:** escribir en el campo de búsqueda. Se busca por nombre, NIE, fecha mostrada y año de nacimiento; se ignoran mayúsculas y tildes.
- **Seleccionar:** pulsar la tarjeta. Se abre la ficha con los datos tal como se enviarán al formulario.

### Formato de los datos

| Dato | Formato guardado | Observaciones |
| --- | --- | --- |
| Nombre y apellidos | Texto | Obligatorio, máximo 120 caracteres. |
| NIE | Texto en mayúsculas, sin puntos, guiones ni espacios | Se avisa si no sigue el formato habitual (`X1234567L`), pero se permite guardar otros identificadores. El formulario oficial admite 15 caracteres como máximo. |
| Fecha de presentación | ISO `YYYY-MM-DD` | Se muestra y se escribe en el popup como `DD/MM/AAAA`. No puede ser futura ni anterior a 1900. |
| Año de nacimiento | Cuatro dígitos | Entre 1900 y el año actual. |

### Estructura real comprobada del formulario

El 19 de noviembre de 2026 se inspeccionó el HTML servido por la sede. El formulario es `form#consultaInfoWebForm` y los tres controles se identifican por su `id` y su atributo `name`:

| Campo | Selector real | Tipo |
| --- | --- | --- |
| NIE | `input#nie[name="nie"]` | Texto, `maxlength="15"` |
| Fecha de presentación | `input#fechaPresentacion[name="fechaPresentacion"]` | Texto, `maxlength="10"`, formato `DD/MM/AAAA` |
| Año de nacimiento | `input#anio[name="anio"]` | Texto, `maxlength="4"` |

El content script exige que haya **exactamente uno** de cada control dentro del formulario. Si falta alguno o hay varios, no escribe nada y muestra un error comprensible. Dispara los eventos `input`, `change`, `keyup` y `blur` (la página tiene controladores jQuery asociados a `focus`/`keyup`) y después vuelve a leer los tres valores para verificarlos.

No toca la imagen del CAPTCHA (`img[alt="captcha"]`) ni el botón `#btnConsulta` (`onclick="envioForm()"`).

## 4. Autocompletado

1. Abrir la página oficial indicada arriba y, si aparece, pulsar **ENTRAR FORMULARIO**.
2. Pulsar el icono de la extensión.
3. Seleccionar un cliente y revisar la ficha.
4. Pulsar **Rellenar formulario**.
5. Comprobar los tres valores en la página oficial, resolver el CAPTCHA y pulsar **CONSULTAR** manualmente.

Si la pestaña activa no es la página oficial, el popup indicará que hay que abrirla primero. Si la sede cambia la estructura del formulario, se muestra un error y no se modifica ningún campo.

## 5. Importación y exportación CSV

Desde **Datos y CSV** en el popup.

- **Exportar CSV:** genera `clientes-extranjeria-AAAA-MM-DD.csv` con BOM UTF-8 (compatible con Excel) y columnas:
  `Nombre y apellidos,NIE,Fecha de presentación,Año de nacimiento`.
  La fecha se exporta en `DD/MM/AAAA`. Es la copia de seguridad recomendada.
- **Importar CSV:** seleccionar un archivo `.csv`. Se admiten `,` o `;` como separador, comillas dobles, BOM y cabeceras en español con o sin tildes (también se aceptan alias como `name`, `year` o `presentationDate`). Las fechas admiten `DD/MM/AAAA`, `DD-MM-AAAA` y `AAAA-MM-DD`.

Tras la lectura se muestra un resumen con filas analizadas, registros válidos, nuevos, duplicados respecto a la agenda, duplicados dentro del archivo y errores por fila. Las filas con errores no se importan.

- **Importar solo nuevos:** añade los registros nuevos; omite los duplicados existentes y no modifica nada más.
- **Importar y actualizar duplicados:** aparece solo si hay duplicados. Actualiza las fichas existentes que tengan el mismo NIE, fecha de presentación y año de nacimiento. En ambos casos se pide confirmación antes de escribir en el almacenamiento.

## 6. Actualizar la extensión tras modificar el código

1. En `chrome://extensions`, pulsar el icono de recarga de la extensión.
2. Recargar la pestaña de la sede para que se vuelva a inyectar `content.js`.
3. Si se han cambiado archivos del popup, cerrar y volver a abrirlo.

No hay proceso de compilación. Para verificar cambios en la estructura de la sede, inspeccionar el formulario con las herramientas de desarrollador y actualizar `FIELD_SPECS` en `content.js` y esta documentación.

## 7. Privacidad y permisos

- Permisos solicitados: `storage` y acceso de host únicamente a `https://infoext2.delegaciondelgobierno.gob.es/infoext2/*`.
- El content script se inyecta solo en `https://infoext2.delegaciondelgobierno.gob.es/infoext2/consulta.html`.
- Uso exclusivo de `chrome.storage.local`. No se usa `chrome.storage.sync`, bases de datos remotas, APIs externas, CDN, analítica, telemetría ni sincronización.
- No se registran NIE, fechas ni otros datos personales en la consola. Los mensajes de error son genéricos.
- No hay datos de clientes reales en el código fuente ni en archivos de prueba.
- La arquitectura está separada en módulos (`storage`, `clients`, `csv`) para facilitar el mantenimiento; **no se ha implementado** ningún sistema de usuarios, permisos ni servidor compartido.

## 8. Estructura

```
manifest.json      Configuración MV3 y permisos mínimos
popup.html         Estructura del popup
popup.css          Estilos del popup
popup.js           Coordinación de vistas y acciones
content.js         Inyección y rellenado en la página oficial
lib/storage.js     Acceso a chrome.storage.local (claves ce.*)
lib/clients.js     Validación, normalización y búsqueda
lib/csv.js         Importación y exportación CSV
icons/             Iconos PNG 16, 48 y 128
README.md          Esta documentación
```

## 9. Pruebas realizadas

Se ejecutaron pruebas reales con **Chrome 157.0.8103.79** en modo headless, cargando la extensión descomprimida mediante el protocolo de desarrollo de Chrome (`Extensions.loadUnpacked`, equivalente a «Cargar descomprimida») y usando **datos ficticios**. Fecha: 19 de noviembre de 2026.

Comprobado y ejecutado:

- Parseo de `manifest.json` y comprobación de sintaxis de todos los archivos JavaScript.
- Carga de la extensión y apertura del popup sin errores.
- Inspección de la página real: ruta de acceso, formulario, tres campos, eventos jQuery y botón CAPTCHA/CONSULTAR.
- Alta de cliente, visualización de la fecha en `DD/MM/AAAA`, guardado en ISO y normalización del NIE.
- Edición de cliente y persistencia de los datos tras cerrar y relanzar Chrome con el mismo perfil.
- Eliminación con confirmación (tanto confirmar como cancelar).
- Búsqueda por NIE y por nombre sin tildes/mayúsculas, y selección de clientes desde la lista.
- Generación del CSV por el botón de exportación: nombre de archivo, BOM y cabeceras adaptadas.
- Importación CSV: resumen, detección de duplicados internos y respecto a la agenda, confirmación y alta de nuevos sin sobrescribir.
- Rellenado de los tres campos en la página oficial, con mensaje de éxito y **sin cambio de URL** (no se pulsa «CONSULTAR»).
- Mensaje cuando la página oficial no está abierta o activa.
- Mensaje y **ninguna modificación de campos** al eliminar artificialmente un campo del formulario.
- Verificación de que no se escriben claves `cn.*` ni se modifica el proyecto `consulta-nacionalidad`.

Pendiente de verificación manual por el usuario en un navegador interactivo:

- La resolución real del CAPTCHA y el envío de una consulta real (la extensión no los realiza).
- La experiencia visual y el tamaño del popup en la instalación habitual de Chrome.
- El flujo completo con datos reales del despacho (en las pruebas solo se usaron datos ficticios).
