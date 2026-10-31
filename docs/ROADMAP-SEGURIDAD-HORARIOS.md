# Roadmap de seguridad — Horarios

> **Nota (2026-10-30):** este documento se escribió cuando la app era un único `app.js` (más `styles.css` y `flash.js`). Hoy el código está modularizado en `src/` (ver [`ARQUITECTURA.md`](ARQUITECTURA.md)); las referencias a `app.js` corresponden al código anterior: `GistSync` → `src/services/sincronizacion-gist.js`, `UIGistYRespaldo` → `src/ui/gist-respaldo.js`, el Worker/Push → `src/services/recordatorio-push.js`.

**Fecha del análisis:** 2026-10-11
**Alcance:** `app.js` (10.638 líneas), `index.html`, `styles.css`, `sw.js`, `flash.js`, `fondos.js`, `manifest.json`
**Fuera de alcance:** el Worker de Cloudflare (`horarios-push`), las otras apps alojadas en el mismo dominio, los headers HTTP reales que sirve GitHub Pages.
**Método:** lectura estática, búsqueda de sinks (`innerHTML`, `JSON.parse`, `fetch`, `window.open`, `localStorage`) y seguimiento de cada dato hasta su salida. No se ejecutó la app ni se hizo prueba dinámica.

## Contexto que condiciona las decisiones

- App estática hospedada en GitHub Pages: no se pueden enviar headers HTTP. La CSP va por `<meta>`.
- Sin backend propio. Persistencia en `localStorage` y sync opcional con GitHub Gist (token personal guardado en el navegador).
- Uso real: unas 50 personas, red corporativa.
- **Varios repos comparten el mismo dominio de GitHub Pages**, por lo tanto el mismo origen: comparten `localStorage` y el espacio de nombres de `CacheStorage`.

## Resumen ejecutivo

No se encontró ninguna vulnerabilidad explotable hoy. La CSP es estricta (`script-src 'self'`, sin handlers ni estilos inline) y los helpers de seguridad se usan de forma mayormente consistente.

Los hallazgos son inconsistencias entre rutas de código, defensa en profundidad y un problema de convivencia con otras apps del mismo origen (cachés del service worker). Ninguno es crítico. Los de mayor valor práctico están en `sw.js`.

| ID | Hallazgo | Severidad | Esfuerzo |
|---|---|---|---|
| SW-1 | `activate` borra cachés de otras apps del mismo origen | Media | 1 línea |
| SW-2 | `install` puede guardar archivos viejos (caché HTTP de Pages) | Media | 1 línea |
| APP-1 | `?accion=` dispara un fichaje desde una URL, sin confirmación y sin uso legítimo | Baja | borrar ~15 líneas |
| APP-2 | Notas importadas usan el sanitizador equivocado | Baja | 1 línea |
| APP-3 | Sinks `innerHTML` sin escapar y un doble escape | Baja | 5 ediciones |
| REP-1 | Reporte HTML descargado sin CSP | Baja | 1 línea |
| FLASH-1 | Anti-clickjacking incompleto | Baja | 2 líneas |
| GIST-1/2/3 | Chequeos de la ruta Gist más débiles que los de la importación de archivo | Baja | 3 chequeos |
| SW-3/4 | Robustez del service worker (fallback y push `null`) | Baja | pocas líneas |

## Estado de implementación (2026-10-16)

Se revisó cada ítem contra el código antes de aplicarlo.

- **Aplicados:** SW-1, SW-2, APP-1, REP-1, FLASH-1, GIST-3 (solo la confirmación cuando falta el hash) y el tamaño del ícono en el manifest. `CACHE_NAME` subido.
- **APP-3, resuelto en el origen:** en lugar de escapar cada sink, `horasDiarias` se valida al cargar el perfil (número entre 0 y 24, si no 7), con el mismo criterio que la importación. Era el único valor de esa lista que podía llegar sin validar; `horaSalida`, `horaBuf` y `totalConDiff` salen siempre de cálculos numéricos.
- **Diferidos por bajo valor** (ver la tabla "Diferido o descartado"): APP-2, el doble escape de `titulo` (APP-3), GIST-1, GIST-2, mover `_hashNoCoincide` fuera de `data` (GIST-3), SW-3, SW-4, el `JSON.parse` opcional y la validación del tema en `flash.js`.
- **Prefijo de `localStorage`:** no hace falta. Servicios (`gestion_servicios_*`) e IDR (`IDR_*`, `SGI_*`, `RCK_*`) no comparten claves con Horarios.
- **Pendiente fuera de este repo:** si Horarios también se publica en `lushibosca.github.io`, comparte origen con IDR, y el `activate` de `idr/sw.js` borra todas las cachés que no son suyas. Hay que aplicarle el mismo filtro de SW-1.

## Controles verificados (sin cambios necesarios)

| Control | Evidencia |
|---|---|
| `escapeHtml` en todos los `innerHTML` con datos dinámicos | popup del calendario (4468-4517), filtros (6528), secciones del reporte (7194, 7457) |
| `textContent` / `createElement` para texto de usuario | perfiles, toasts, listas, hints |
| `reviverJSONSeguro` en `JSON.parse` de datos externos y de storage | 601, 953, 1419, 2580, 4901, 6389, 10471 (excepción: 6094) |
| `esGistIdValido` antes de armar URLs a la API | `subir`, `bajar`, `saveCredentials`, `window.open` (5445-5447) |
| `window.open` con `noopener,noreferrer` | 5447, 5449, 5735 |
| IDs con `crypto.getRandomValues` | `generarIDSeguro` (829) |
| Importación: tamaño, tipo, claves raíz permitidas, `validarRegistroSeguro` | 2570-2580, 2520-2521 |
| Notificación push: la URL que se abre sale del scope del SW, no del payload | `sw.js`, `notificationclick` |
| Contenido del push mostrado como texto plano | `showNotification` |
| `fondos.js`: SVG estáticos, sin `href`, scripts ni `style`; `${color}` solo en `fill`/`stroke` | revisión completa |
| `index.html`: sin handlers inline, sin `style=` inline, sin `<iframe>` | grep |
| Token de Gist en `<input type="password" autocomplete="off" maxlength="256">` | `index.html` 1285 |

## Roadmap

Cada ítem tiene un checkbox de estado para usar durante la auditoría.

### Fase 1 — Alto valor, bajo costo

#### [x] SW-1 · `activate` borra cachés ajenas
- **Dónde:** `sw.js`, evento `activate` (línea 36).
- **Problema:** el filtro es `name !== CACHE_NAME`. Con varias apps en el mismo origen, cada actualización de Horarios borra las cachés de las otras apps, y cualquier otra app con el mismo patrón borra la de Horarios (se rompe el modo offline).
- **Fix:**
  ```js
  .filter(name => name.startsWith('horarios-') && name !== CACHE_NAME)
  ```
- **Verificar:** crear a mano una caché `otra-app-v1` en DevTools → Application → Cache Storage, cambiar `CACHE_NAME`, recargar y confirmar que `otra-app-v1` sigue ahí. Revisar el `sw.js` de las otras apps con el mismo criterio.

#### [x] SW-2 · `install` puede cachear archivos desactualizados
- **Dónde:** `sw.js`, `cache.addAll(urlsToCache)` (línea 21).
- **Problema:** `addAll` pasa por la caché HTTP del navegador. GitHub Pages responde con `max-age=600`, así que si un celular actualiza dentro de los 10 minutos posteriores a un deploy, la caché nueva puede quedar con el `app.js` anterior. Un parche de seguridad podría no llegar.
- **Fix:**
  ```js
  cache.addAll(urlsToCache.map(u => new Request(u, { cache: 'reload' })))
  ```
- **Verificar:** desplegar un cambio visible, subir `CACHE_NAME` y actualizar de inmediato desde un celular con la PWA instalada.

#### [x] APP-1 · Eliminar `?accion=entrada|salida|restante`
- **Dónde:** `app.js`, llamada en 10414 y función `_manejarAccionDeShortcut` (10417-10431).
- **Problema:** hace `click()` sobre Fichar al abrir `…/?accion=entrada`. `manifest.json` no define `shortcuts`, así que no hay ningún acceso directo legítimo que lo use: el único camino es una URL armada a mano. Cualquier link puede crear un fichaje (hay undo, por eso la severidad es baja).
- **Fix:** borrar la función y su llamada. Si se quiere conservar la funcionalidad: declarar `shortcuts` en el manifest y pedir confirmación (o un toast con "Deshacer") antes de fichar.
- **Verificar:** abrir `…/index.html?accion=entrada` y comprobar que no se registra nada.

#### [ ] APP-2 · Notas importadas con el sanitizador equivocado
- **Dónde:** `app.js:2483` (`normalizarRegistrosImportados`).
- **Problema:** el alta y la edición usan `sanitizeNotas` (allowlist `[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ ]`, líneas 2347-2348 y filtro del input en 10105). La importación, tanto por archivo como por Gist, usa `sanitizeString` (denylist). Una nota importada puede traer `= + - @ ( ) ; %`, que la UI nunca permite. Hoy no es XSS porque se escapa al mostrar, pero habilita inyección de fórmulas si algún día se exporta CSV o Excel.
- **Fix:** `S.sanitizeNotas(r.notas, true) || null`. Opcional: que `validarRegistroSeguro` (866-867) también valide el charset de `notas`, no solo el largo.
- **Verificar:** importar un JSON con `"notas": "=1+1"` y comprobar que queda `11`.

#### [ ] APP-3 · Sinks sin escapar y doble escape
- **Dónde y fix:**
  - `app.js:7651` — `${D.horasDiarias()}h` → `${S.escapeHtml(String(D.horasDiarias()))}h`
  - `app.js:4486` y su uso en el template del popup — escapar `totalConDiff` al interpolarlo
  - `app.js:8228` y `8234` — `S.escapeHtml(horaSalida)` y `S.escapeHtml(horaBuf)`
  - `app.js:7658` y `7677` — `titulo` se escapa dos veces (un label con `&` se vería `&amp;`). Dejar el escape en 7677 y quitarlo en 7658.
- **Problema:** hoy todos esos valores vienen de números o constantes, pero `horasDiarias` se carga de `localStorage` sin validar (ver "Observaciones") y el escape no debería depender del tipo que llegue desde arriba. La CSP impide ejecución de script, por eso es defensa en profundidad.
- **Verificar:** en DevTools, poner `horasDiarias` de un perfil como `"<b>x</b>"`, recargar y abrir el popup de "Promedio Diario": debe verse como texto.

### Fase 2 — Defensa en profundidad

#### [x] REP-1 · CSP en el reporte HTML descargable
- **Dónde:** template de `generarReporte`, `<head>` en ~7503-7506; descarga en 7528.
- **Problema:** el reporte se abre desde disco y queda fuera de la política de la app. Hoy el escape es consistente (se revisaron todas las filas), así que es un cinturón adicional.
- **Fix:** agregar en el `<head>`:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  ```
- **Verificar:** generar un reporte, abrirlo y comprobar en consola que no hay violaciones de CSP (solo usa estilos inline).

#### [x] FLASH-1 · Anti-clickjacking más robusto
- **Dónde:** `flash.js`, líneas 3-6.
- **Contexto:** `frame-ancestors` en `<meta>` es ignorado por la especificación, y `flash.js` ya implementa un frame-buster. Está bien pensado.
- **Problema:** solo oculta la página si la navegación del `top` lanza excepción. Si en cambio queda bloqueada sin excepción (iframe con `sandbox` sin `allow-top-navigation`), la app queda visible dentro del marco.
- **Fix:**
  ```js
  if (window.top !== window.self) {
      document.documentElement.style.display = 'none';
      try { window.top.location = window.self.location.href; } catch (e) { }
  }
  ```
- **Verificar:** embeber la app en un `<iframe sandbox>` desde un HTML local y comprobar que se ve en blanco.

#### [ ] GIST-1 · `MAX_REGISTROS` antes de normalizar
- **Dónde:** `app.js:5537` (`_validarDatosGist`).
- **Problema:** la importación de archivo comprueba el largo antes de procesar (2537) y la ruta Gist después de normalizar todo.
- **Fix:** mover `if (data.registros.length > S.SECURITY_LIMITS.MAX_REGISTROS) throw …` antes de `normalizarRegistrosImportados`.

#### [ ] GIST-2 · Gist truncado o demasiado grande
- **Dónde:** `bajar()` (~4896-4902).
- **Problema:** no se revisa `file.truncated` ni el tamaño; la importación de archivo sí aplica `MAX_JSON_SIZE`.
- **Fix:** `if (file.truncated || file.content.length > S.SECURITY_LIMITS.MAX_JSON_SIZE) throw new Error('El Gist es demasiado grande para leerse completo')`.

#### [x] GIST-3 · Confirmación cuando falta el hash
- **Dónde:** `_validarDatosGist` (5522-5540) vs `_validarDatosImport` (2529-2535).
- **Problema:** la importación de archivo pide confirmación si el archivo no trae hash; el Gist lo acepta en silencio. Además, `_hashNoCoincide` viaja como propiedad dentro de los propios datos y está en la lista de claves permitidas (5526).
- **Fix:** replicar la confirmación y devolver el resultado del hash por separado en vez de mutar `data`.
- **Nota:** el SHA-256 sin clave detecta corrupción, no manipulación (quien edita el JSON puede recalcularlo). El texto "modificado" del aviso promete más de lo que garantiza.

#### [ ] SW-3 · Fallback del fetch que nunca se ejecuta
- **Dónde:** `sw.js:73`.
- **Problema:** `caches.match(a) || caches.match(b)` devuelve siempre la primera Promise (es truthy), y si falla devuelve `undefined`.
- **Fix:**
  ```js
  .catch(async () => {
    if (event.request.mode === 'navigate') {
      return (await caches.match('./index.html', { ignoreSearch: true }))
          || (await caches.match('./', { ignoreSearch: true }));
    }
    return Response.error();
  })
  ```

#### [ ] SW-4 · Push con payload inesperado
- **Dónde:** `sw.js`, evento `push` (líneas 82-90).
- **Problema:** si el JSON es `null`, `data.title` lanza y no se muestra notificación.
- **Fix:**
  ```js
  if (!data || typeof data !== 'object') data = {};
  const title = String(data.title || 'Horarios').slice(0, 100);
  const body = String(data.body || 'Se cumplió tu horario de hoy').slice(0, 200);
  ```

### Fase 3 — Opcionales (un renglón cada uno)

- [ ] `app.js:6094`: agregar `S.reviverJSONSeguro` al `JSON.parse` (el de 6389 ya lo tiene).
- [ ] `flash.js`: validar `temaOscuro` contra la misma lista que `ThemeManager.TEMAS`. Hoy, ante un valor inválido, `flash.js` pone `data-theme` con basura y deja tema claro mientras `ThemeManager` cae a `dark`, lo que produce un parpadeo.
- [x] `manifest.json`: `icon-1024.png` declara `sizes: "512x512"`; corregir a `1024x1024`.

## Condicional: prefijar claves de `localStorage`

**Hacerlo solo si hay colisiones reales.** Abrir DevTools → Application → Local Storage en el dominio y comprobar si dos apps escriben la misma clave (`gistToken`, `perfiles`, `history`, `temaOscuro`…).

- **Qué resuelve:** que apps distintas se pisen datos.
- **Qué NO resuelve:** un XSS en otra app del mismo origen puede leer todo `localStorage` con o sin prefijo. La protección real contra eso es otra (ver "Riesgo del origen compartido").
- **Dónde tocar:** `StorageHelper` concentra el acceso (916, 929, 961) y `flash.js` lee dos claves directamente (líneas 10 y 31). Hace falta una migración única al arrancar, incluyendo `pushInstallId` y `pushOwnerToken`, y en `flash.js` una lectura con respaldo de la clave vieja.
- **Costo de comodidad:** si hoy el token de Gist se carga una sola vez y las demás apps lo reutilizan por compartir la clave, prefijar obliga a ingresarlo en cada app.

## Riesgo del origen compartido (fuera del alcance de este roadmap)

La app más débil del dominio define el riesgo de todas. Un XSS en cualquiera expone el token de Gist y los datos de las demás. Mitigaciones, de mayor a menor efecto:

1. Misma CSP estricta (`script-src 'self'`, sin inline) en todas las apps del dominio.
2. Mismo criterio de escape en todas; priorizar las de `app.js` grande.
3. Mover a otro origen (otra cuenta u organización de GitHub, o dominio propio) lo que maneje datos más sensibles.

## Diferido o descartado, con motivo

| Ítem | Motivo |
|---|---|
| Trusted Types / helper `setHTML` para los ~25 `innerHTML` | Cambio grande para una superficie que ya está limpia; soporte variable entre navegadores |
| Rediseñar `sanitizeString` (es una denylist) | Feo pero inofensivo con `escapeHtml` + CSP. Único caso con sentido: el token (4831), con una allowlist tipo `^(ghp_\|github_pat_)[A-Za-z0-9_]+$` |
| Validar todo `localStorage` al cargar (`perfiles` 1032, historial 1474, bootstrap 10191-10205) | Solo el propio código escribe ahí; el escape en los sinks (APP-3) cubre el riesgo real. Se vuelve relevante si aparece otra app escribiendo en esas claves |
| Allowlist de tags y atributos en `_sanitizarSVG` | Los fondos son estáticos y propios (`fondos.js`) |
| Opciones extra del fetch a Gist (`AbortController`, `cache: 'no-store'`, `credentials: 'omit'`, `redirect: 'error'`) | Mejoran la experiencia, no la seguridad |
| APP-2 · `sanitizeNotas` en la importación | No hay exportación a CSV ni Excel, así que la inyección de fórmulas es hipotética. Aplicar si se agrega una exportación tabular |
| APP-3 · doble escape de `titulo` | Solo se nota con un label que tenga `&` o `<`; es un detalle visual |
| GIST-1 · `MAX_REGISTROS` antes de normalizar | Normalizar unos miles de registros no tiene costo; solo aporta coherencia |
| GIST-2 · Gist truncado | La API corta los archivos a ~1 MB y 1000 registros quedan muy por debajo; un contenido truncado ya falla en `JSON.parse` |
| GIST-3 · `_hashNoCoincide` dentro de `data` | Cosmético: un Gist manipulado solo puede usarlo para mostrar un aviso de más, nunca para saltearse uno |
| SW-3 · fallback del fetch | `index.html` siempre está precacheado; el caso casi no ocurre |
| SW-4 · push con `null` | El Worker valida `title` y siempre manda un objeto |
| `JSON.parse` sin reviver (`dataset.grupoData`) | El dato lo escribe el propio código y solo se usan los IDs |
| Validar `temaOscuro` en `flash.js` | Es un parpadeo cuando el storage está corrupto; UX, no seguridad |
| Chequeo `file.type === 'application/json'` (2572) | Puede rechazar archivos válidos según el sistema operativo; no es un control de seguridad |

## Riesgos conocidos que se mantienen

- Token de Gist en `localStorage` en texto plano: inherente a una app sin backend.
- `APP_SECRET` visible en el código (`app.js:424`): cualquiera que abra la app lo ve. No protege de un tercero; la defensa efectiva está en el Worker (token de propiedad, rate limit).
- Un Gist "secreto" de GitHub es no listado, no privado: quien tenga la URL puede leerlo.
- El hash de los respaldos detecta corrupción accidental, no manipulación.

## Observaciones de diseño (sin acción)

- Los datos cargados desde `localStorage` no pasan por `validarRegistroSeguro` ni por las validaciones de rango de la importación; solo la importación (archivo y Gist) lo hace.
- `sanitizeString` muta silenciosamente: borra comillas y `<>`, y su regex `/on\w+\s*=/` eliminaría texto legítimo como "Condiciones = …" en un nombre de perfil.
- La importación de archivo y la de Gist exigen cosas distintas (ver GIST-1/2/3); conviene que ambas pasen por la misma función de validación.

## Correcciones respecto de conversaciones previas

- Se había sugerido agregar un frame-buster; `flash.js` ya lo tiene (ver FLASH-1 para el ajuste).
- Se había indicado que prefijar las claves limita lo que puede leer un XSS vecino. Es incorrecto: el prefijo solo evita colisiones.

## Orden sugerido de implementación

1. `sw.js`: SW-1, SW-2 (y de paso SW-3, SW-4).
2. `app.js`: APP-1, APP-2, APP-3.
3. REP-1 y FLASH-1.
4. GIST-1, GIST-2, GIST-3.
5. Opcionales de la Fase 3.
6. Revisar colisiones de `localStorage` y decidir sobre el prefijo.

## Checklist de verificación final

- [ ] Con una caché ajena creada a mano, una actualización del SW no la borra.
- [ ] Un deploy inmediatamente seguido de la actualización del SW sirve el `app.js` nuevo.
- [ ] `…/?accion=entrada` no registra nada.
- [ ] Importar un JSON con `notas: "=1+1"` guarda `11`.
- [ ] Con `horasDiarias` manipulado a mano en storage, el popup de estadísticas muestra texto, no HTML.
- [ ] El reporte HTML descargado abre sin errores de CSP.
- [ ] La app embebida en un `<iframe sandbox>` queda oculta.
- [ ] Bajar un Gist sin hash pide confirmación; uno con más de `MAX_REGISTROS` entradas se rechaza antes de procesarse.
- [ ] Un push con payload `null` igual muestra la notificación por defecto.
