# Roadmap de seguridad y arquitectura — Horarios

**Revisiones:**
- **2026-10-11:** primera auditoría del frontend.
- **2026-10-16:** implementación de la Fase 1/2 y revisión de cada ítem contra el código.
- **2026-10-18:** se suma el Worker `horarios-push`, los scripts de estadísticas y una revisión de arquitectura. Se incorporó (corregido) un análisis externo de pentest; ver "Correcciones respecto de análisis previos".

**Alcance:**
- **Frontend (GitHub Pages):** `app.js` (10.840 líneas), `index.html`, `styles.css`, `sw.js`, `tema-inicial.js`, `fondos.js`, `feriados.js`, `manifest.json`.
- **Worker (Cloudflare):** `horarios-push/src/index.js` (818 líneas), `horarios-push/wrangler.toml`, `horarios-push/package.json`.
- **Herramientas locales:** `horarios-push/scripts/estadisticas.sh`, `estadisticas_dashboard.py`, `dashboard_plantilla.html`.

**Fuera de alcance:** las otras apps alojadas en el mismo dominio y los headers HTTP reales que sirve GitHub Pages.

**Método:** lectura estática, búsqueda de sinks (`innerHTML`, `JSON.parse`, `fetch`, `window.open`, `localStorage`, operaciones de KV) y seguimiento de cada dato hasta su salida. No se ejecutó la app ni se hizo prueba dinámica. Los números de línea de los ítems ya aplicados son los del momento del fix; los de los pendientes están actualizados al 2026-10-18.

## Contexto que condiciona las decisiones

- **Filosofía de la app:** software libre (MIT), gratuito, sin cuentas, sin paso de build y con los datos en el dispositivo del usuario. Se descarta cualquier medida que cueste dinero, obligue a registrarse o agregue fricción desproporcionada al uso diario.
- App estática hospedada en GitHub Pages: no se pueden enviar headers HTTP. La CSP va por `<meta>`.
- Persistencia en `localStorage` y sync opcional con GitHub Gist (token personal guardado en el navegador).
- El único backend es el Worker `horarios-push` (recordatorios push y estadísticas anónimas), en el **plan gratuito** de Cloudflare. Sus cuotas diarias de KV son parte del modelo de amenazas: 100.000 lecturas, 1.000 escrituras, 1.000 borrados y 1.000 `list`.
- `APP_SECRET` (`app.js:423`) es público por diseño: filtra bots que escanean `*.workers.dev`, no autentica. Cualquiera puede llamar al Worker con requests válidos.
- Uso real: unas 50 personas, red corporativa (muchas detrás de la misma IP de NAT).
- **Varios repos comparten el mismo dominio de GitHub Pages**, por lo tanto el mismo origen: comparten `localStorage` y el espacio de nombres de `CacheStorage`.

## Resumen ejecutivo

**Frontend:** no se encontró ninguna vulnerabilidad explotable. La CSP es estricta (`script-src 'self'`, sin handlers ni estilos inline) y los helpers de seguridad se usan de forma mayormente consistente. Los ítems de mayor valor (service worker, `?accion=`, CSP del reporte, anti-clickjacking) ya están aplicados.

**Worker:** las validaciones de entrada son sólidas (allowlist de push services, chequeo de la clave P-256, anclaje endpoint→dueño, rate limit por IP y por /64 en IPv6). El hallazgo relevante es de **disponibilidad**: con `APP_SECRET` público, un tercero puede agotar la cuota diaria de escrituras de KV y dejar a todos sin recordatorios hasta el día siguiente (UTC). Ningún hallazgo compromete datos de usuarios.

| ID | Componente | Hallazgo | Severidad | Esfuerzo | Estado |
|---|---|---|---|---|---|
| KV-1 | Worker | Agotamiento de la cuota diaria de escrituras KV | Media | Medio | Pendiente (decidir) |
| CRON-1 | Worker | Entradas con `targetTime` en el pasado se adelantan en la cola | Baja | 1 línea | Pendiente |
| DEP-1 | Worker | Dependencia npm `web-push-neo` 0.1.x con rango `^` | Baja | Bajo | Pendiente |
| WORK-1 | Worker | `localhost` / `127.0.0.1` aceptados como origen en producción | Baja | 3 líneas | Pendiente |
| WORK-2 | Worker | Pings falsos en `/api/hola` distorsionan las estadísticas | Baja | — | Aceptado |
| DASH-1 | Dashboard | `data-tip` sin doble escape en `barrasH` | Baja | 1 línea | Pendiente |
| INFRA-1 | Plataforma | Origen compartido `*.github.io` | Media | Alto | Mediano plazo |
| SW-1 | `sw.js` | `activate` borra cachés de otras apps del mismo origen | Media | 1 línea | ✅ Aplicado |
| SW-2 | `sw.js` | `install` puede guardar archivos viejos (caché HTTP de Pages) | Media | 1 línea | ✅ Aplicado |
| APP-1 | `app.js` | `?accion=` dispara un fichaje desde una URL | Baja | borrar ~15 líneas | ✅ Aplicado |
| REP-1 | `app.js` | Reporte HTML descargado sin CSP | Baja | 1 línea | ✅ Aplicado |
| FLASH-1 | `tema-inicial.js` | Anti-clickjacking incompleto | Baja | 2 líneas | ✅ Aplicado |
| GIST-3 | `app.js` | Gist sin hash se restauraba sin confirmación | Baja | Bajo | ✅ Aplicado |
| APP-3 | `app.js` | Sinks `innerHTML` sin escapar | Baja | — | ✅ Resuelto en el origen |
| SEC-1 | `app.js` | Token de Gist pasado por `sanitizeString` en vez de validado por formato | Baja | 1 línea | Pendiente |
| GIST-1/2 + HELP-1 | `app.js` | Validación de importación y de Gist divergentes | Baja | Medio | Pendiente |
| SW-3 | `sw.js` | Fallback del `fetch` que nunca se ejecuta | Baja | 1 línea | Pendiente |
| SW-4 | `sw.js` | Push con payload `null` | Baja | 3 líneas | Diferido |
| APP-2 | `app.js` | Notas importadas con el sanitizador equivocado | Baja | 1 línea | Diferido |
| ARQ-1 | `app.js` | Monolito de 10.840 líneas sin tests | Mejora | Alto | Mediano plazo |

## Controles verificados (sin cambios necesarios)

### Frontend

| Control | Evidencia |
|---|---|
| `escapeHtml` en todos los `innerHTML` con datos dinámicos | popup del calendario, filtros, secciones del reporte |
| `textContent` / `createElement` para texto de usuario | perfiles, toasts, listas, hints, resultado del Gist (`_mkEl`, `app.js:5732`) |
| `reviverJSONSeguro` en `JSON.parse` de datos externos y de storage | `app.js:874`; usado en importación, Gist (`5061`), storage (excepción: `6259`) |
| `esGistIdValido` antes de armar URLs a la API | `subir`, `bajar`, `saveCredentials`, `window.open` |
| `window.open` con `noopener,noreferrer` | todos los usos |
| IDs con `crypto.getRandomValues` | `generarIDSeguro` |
| Importación: tamaño, tipo, claves raíz permitidas, `validarRegistroSeguro` | `_validarDatosImport` (`app.js:2600`) |
| Notificación push: la URL que se abre sale del scope del SW, no del payload | `sw.js`, `notificationclick` |
| Contenido del push mostrado como texto plano | `showNotification` |
| `fondos.js`: SVG estáticos, sin `href`, scripts ni `style`; `${color}` solo en `fill`/`stroke` | revisión completa |
| `index.html`: sin handlers inline, sin `style=` inline, sin `<iframe>` | grep |
| Token de Gist en `<input type="password" autocomplete="off" maxlength="256">` | `index.html` |

### Worker

| Control | Evidencia |
|---|---|
| Origen comparado por hostname exacto, no por substring | `esOrigenPermitido` (`index.js:66`) |
| Rate limit antes de cualquier otro chequeo; IPv6 agrupado por /64 | `verificarAcceso`, `claveIP` (`index.js:209-250`) |
| Endpoint push solo hacia push services conocidos, sin credenciales ni puerto | `validarSuscripcion` (`index.js:130`) |
| `p256dh` validado como punto P-256 real | `clavesPushValidas` (`index.js:180`) |
| Endpoint canonicalizado antes de hashear | `endpointCanonico` (`index.js:163`) |
| Anclaje endpoint→dueño: nadie puede mandar avisos al dispositivo de otro | `handleSchedule` (`index.js:540`), re-chequeo en el cron (`index.js:735`) |
| Body acotado (8 KB) y solo se guardan campos conocidos | `leerBodyJSON`, `handleSchedule` |
| `cancel` lee antes de borrar para no gastar la cuota de borrados con tokens al azar | `handleCancel` (`index.js:587`) |
| Entrada reclamada antes de enviar: el peor caso es perder un aviso, nunca repetirlo | `procesarUnaNotificacion` (`index.js:753`) |
| Cron acotado a 8 avisos por corrida para no pasar 50 subrequests | `MAX_POR_CORRIDA` (`index.js:43`) |
| Estadísticas: id hasheado, sistema/navegador/país derivados en el Worker de listas cerradas | `handleUso` (`index.js:625`) |
| `VAPID_PRIVATE_KEY` y `APP_SECRET` como secrets, no en `wrangler.toml` | `wrangler.toml` |

## Roadmap — Frontend

### Fase 1 — Alto valor, bajo costo

#### [x] SW-1 · `activate` borra cachés ajenas
- **Dónde:** `sw.js`, evento `activate`.
- **Problema:** el filtro era `name !== CACHE_NAME`. Con varias apps en el mismo origen, cada actualización de Horarios borraba las cachés de las otras apps, y cualquier otra app con el mismo patrón borraba la de Horarios (se rompía el modo offline).
- **Fix aplicado:** `.filter(name => name.startsWith('horarios-') && name !== CACHE_NAME)`.
- **Pendiente fuera de este repo:** el `activate` de `idr/sw.js` borra todas las cachés que no son suyas. Si Horarios comparte origen con IDR (`lushibosca.github.io`), hay que aplicarle el mismo filtro.

#### [x] SW-2 · `install` puede cachear archivos desactualizados
- **Dónde:** `sw.js`, `cache.addAll(urlsToCache)`.
- **Problema:** `addAll` pasa por la caché HTTP del navegador. GitHub Pages responde con `max-age=600`, así que una actualización dentro de los 10 minutos posteriores a un deploy podía quedar con el `app.js` anterior.
- **Fix aplicado:** `cache.addAll(urlsToCache.map(u => new Request(u, { cache: 'reload' })))`.

#### [x] APP-1 · Eliminar `?accion=entrada|salida|restante`
- **Problema:** hacía `click()` sobre Fichar al abrir `…/?accion=entrada`. `manifest.json` no define `shortcuts`, así que el único camino era una URL armada a mano.
- **Fix aplicado:** se borraron la función y su llamada. Si se quiere recuperar la funcionalidad: declarar `shortcuts` en el manifest y pedir confirmación antes de fichar.

#### [x] APP-3 · Sinks sin escapar — resuelto en el origen
- En lugar de escapar cada sink, `horasDiarias` se valida al cargar el perfil (número entre 0 y 24, si no 7), con el mismo criterio que la importación. Era el único valor de esa lista que podía llegar sin validar; `horaSalida`, `horaBuf` y `totalConDiff` (`app.js:4651`) salen siempre de cálculos numéricos.
- **Queda (diferido):** `titulo` se escapa dos veces en `_popupStat` (`app.js:7831` y `7850`); un label con `&` se vería `&amp;`. Dejar el escape en 7850 y quitarlo en 7831.

#### [ ] APP-2 · Notas importadas con el sanitizador equivocado (diferido)
- **Dónde:** `app.js:2566` (`normalizarRegistrosImportados`).
- **Problema:** el alta y la edición usan `sanitizeNotas` (allowlist). La importación, por archivo y por Gist, usa `sanitizeString` (denylist), así que una nota importada puede traer `= + - @ ( ) ; %`. No es XSS porque se escapa al mostrar; solo importaría con una exportación CSV o Excel.
- **Fix:** `S.sanitizeNotas(r.notas, true) || null`.

### Fase 2 — Defensa en profundidad

#### [x] REP-1 · CSP en el reporte HTML descargable
- **Fix aplicado:** `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">` en el `<head>` del reporte.

#### [x] FLASH-1 · Anti-clickjacking más robusto
- **Contexto:** `frame-ancestors` en `<meta>` es ignorado por la especificación; `tema-inicial.js` implementa un frame-buster.
- **Problema:** solo ocultaba la página si la navegación del `top` lanzaba excepción. Un `<iframe sandbox>` la bloquea sin excepción.
- **Fix aplicado:** ocultar siempre que `window.top !== window.self` (`flash.js:4-7`).

#### [x] GIST-3 · Confirmación cuando falta el hash
- **Fix aplicado:** `_validarDatosGist` pide confirmación si el Gist no trae hash, igual que la importación de archivo.
- **Queda (cosmético):** `_hashNoCoincide` viaja como propiedad dentro de los propios datos y está en la lista de claves permitidas (`app.js:5687`). Un Gist manipulado solo puede usarlo para mostrar un aviso de más.
- **Nota:** el SHA-256 sin clave detecta corrupción, no manipulación (quien edita el JSON puede recalcularlo). El texto "modificado" del aviso promete más de lo que garantiza.

#### [ ] SEC-1 · Validar el token de Gist por formato
- **Dónde:** `saveCredentials`, `app.js:4991`.
- **Problema:** el token pasa por `S.sanitizeString`, una denylist pensada para texto que se mostrará. Hoy no puede corromperlo (un token de GitHub solo tiene `[A-Za-z0-9_]`, sin `=`, `<` ni comillas), pero un token mal pegado se guarda alterado en silencio en vez de rechazarse.
- **Fix:**
  ```js
  const limpio = token.trim();
  if (!/^[A-Za-z0-9_]{20,255}$/.test(limpio)) { /* avisar: token con formato inválido */ return; }
  Almacenamiento.setItem(STORAGE_KEYS.GIST_TOKEN, limpio);
  ```
- **Texto de ayuda sugerido:** recomendar un *fine-grained token* con permiso **Gists** únicamente. Cualquier token con acceso a gists, clásico o fine-grained, alcanza a **todos** los gists de la cuenta, no solo al de Horarios.

#### [ ] GIST-1/2 + HELP-1 · Una sola validación para archivo y Gist
- **Dónde:** `_validarDatosImport` (`app.js:2600`) y `_validarDatosGist` (`app.js:5685`); descarga en `bajar()` (`app.js:5051-5061`).
- **Problema:** las dos rutas validan el mismo esquema con reglas distintas:
  - La de archivo comprueba `MAX_REGISTROS` antes de procesar (`2620`); la de Gist, después de normalizar (`5701`). (GIST-1)
  - La de Gist no revisa `file.truncated` ni aplica `MAX_JSON_SIZE`. (GIST-2; en la práctica un contenido truncado ya falla en `JSON.parse`.)
- **Fix:** una única función pura (por ejemplo `D.validarPayloadRespaldo(data)` → `{ registros, error }`) usada por ambas rutas, con las confirmaciones de UI (hash ausente o inválido) fuera de ella. Resuelve GIST-1 y GIST-2 de paso.

#### [ ] SW-3 · Fallback del fetch que nunca se ejecuta
- **Dónde:** `sw.js:74`.
- **Problema:** `caches.match(a) || caches.match(b)` devuelve siempre la primera Promise (es truthy). Casi no ocurre porque `index.html` siempre está precacheado, pero el arreglo es una línea.
- **Fix:**
  ```js
  return caches.match('./index.html', { ignoreSearch: true })
      .then(r => r || caches.match('./', { ignoreSearch: true }));
  ```

#### [ ] SW-4 · Push con payload inesperado (diferido)
- **Dónde:** `sw.js:82-90`, evento `push`.
- **Problema:** si el JSON es `null`, `data.title` lanza y no se muestra notificación. El Worker siempre manda un objeto con `title`.
- **Fix:** `if (!data || typeof data !== 'object') data = {};` y acotar `title`/`body` con `String(...).slice(...)`.

### Fase 3 — Opcionales (un renglón cada uno)

- [ ] `app.js:6259`: agregar `S.reviverJSONSeguro` al `JSON.parse` de `dataset.grupoData` (el de `6554` ya lo tiene).
- [ ] `flash.js:11`: validar `temaOscuro` contra la misma lista que `GestorTemas.TEMAS`. Hoy, ante un valor inválido, `tema-inicial.js` pone `data-theme` con basura y deja tema claro mientras `GestorTemas` cae a `dark`, lo que produce un parpadeo.
- [x] `manifest.json`: `icon-1024.png` declaraba `sizes: "512x512"`; corregido a `1024x1024`.

## Roadmap — Worker `horarios-push`

#### [ ] KV-1 · Agotamiento de la cuota diaria de escrituras KV
- **Severidad:** Media (disponibilidad del servicio de recordatorios; no expone datos).
- **Dónde:** `handleSchedule` (`index.js:499-565`), `anclarEndpoint` (`index.js:477`), `RATE_LIMITER` en `wrangler.toml` (20 req/min por IP).
- **Cálculo:**
  - Uso normal: **1 escritura por `/api/schedule`** (la entrada `sched:`). El anclaje `push:` solo se escribe la primera vez que se ve un endpoint o cuando le quedan menos de 30 días.
  - Atacante: con `APP_SECRET` público, puede mandar requests válidos con un endpoint y un `ownerToken` nuevos en cada uno (claves P-256 generadas al azar). Cada request cuesta **2 escrituras** (anclaje nuevo + entrada). A 20 req/min desde una sola IP son 40 escrituras/min: **las 1.000 diarias se agotan en unos 25 minutos**.
  - Efecto: los `put` fallan y nadie puede programar un recordatorio hasta que la cuota se reinicia (00:00 UTC). Borrados y `list` tienen cuotas propias, así que el cron sigue corriendo y entrega lo que ya estaba encolado.
- **Lo que no sirve:**
  - Bajar `RATE_LIMITER` solo estira el tiempo del ataque (a 10/min tarda unos 50 minutos) y desde varias IPs no frena nada. Además, el umbral es alto a propósito por los usuarios detrás de la misma IP corporativa (`index.js:203-205`).
  - Mover `endpointHash` a la metadata de `sched:` **rompe el anclaje**: esa clave es por dueño, así que no detecta a otro dueño reclamando el mismo endpoint.
- **Opciones, de mayor a menor efecto:**
  1. **Mover las entradas de KV a D1** (sigue gratis). Según la documentación de Cloudflare, el plan gratuito de D1 permite del orden de 100.000 filas escritas por día, unas 100 veces la cuota de KV; **confirmar los límites vigentes antes de decidir**. Cambia el almacenamiento del Worker, no la app.
  2. **Aceptar el riesgo y documentarlo:** el ataque no compromete datos, se nota enseguida (falla la programación) y se resuelve solo al día siguiente. Razonable para 50 usuarios.
- **Verificar (si se migra):** con un script local que mande 100 schedules válidos, comprobar que la programación de un usuario real sigue funcionando.

#### [ ] CRON-1 · Entradas con fecha pasada se adelantan en la cola
- **Severidad:** Baja.
- **Dónde:** `MAX_PAST_MS` (`index.js:29`), `validarTargetTime` (`index.js:193`), orden por `targetTime` en `processDueNotifications` (`index.js:680`), metadata en `handleSchedule` (`index.js:561`).
- **Problema:** el cron procesa 8 entradas vencidas cada 2 minutos (4/min), ordenadas por `targetTime`. `MAX_PAST_MS` (5 minutos, por desincronización de reloj) permite crear entradas que ya nacen "viejas" y quedan delante de los avisos reales recién vencidos. Con 20 req/min se encolan más rápido de lo que el cron las saca; la cuota de escrituras (KV-1) limita el total a unas 1.000 por día, que es hasta unas 4 horas de demora.
- **Fix:** guardar en la metadata `targetTime: Math.max(targetTime, Date.now())`. Así ninguna entrada nueva se adelanta a las existentes. Se mantiene el margen de 5 minutos, porque es para relojes desincronizados, y `entry.targetTime` sigue intacto para la ventana de reintentos.
- **Descartado:** paginar `list()` con `cursor`. El cron ya usa unas 720 de las 1.000 operaciones `list` diarias (`*/2 * * * *`); paginar durante un ataque agotaría esa cuota y dejaría al cron sin funcionar. Con menos de 1.000 entradas `sched:` (la cuota de escrituras lo garantiza) una página alcanza.

#### [ ] DEP-1 · Dependencia npm en el Worker
- **Severidad:** Baja.
- **Dónde:** `horarios-push/package.json`: `"web-push-neo": "^0.1.2"` (`index.js:1`).
- **Problema:** es la única dependencia de runtime del proyecto y maneja la VAPID privada. Es una librería joven (0.1.x) y el rango `^` acepta cualquier 0.1.x nueva en un `npm install`.
- **Fix:** fijar la versión exacta (`"web-push-neo": "0.1.2"`), deployar siempre con `npm ci` sobre el `package-lock.json` y revisar el diff de la librería antes de actualizarla.

#### [ ] WORK-1 · `localhost` aceptado como origen en producción
- **Severidad:** Baja.
- **Dónde:** `esOrigenPermitido` (`index.js:66-72`).
- **Problema:** cualquier página servida desde `localhost` o `127.0.0.1` pasa el chequeo de origen y recibe CORS del Worker de producción. El impacto real es bajo: hace falta algo corriendo en la máquina del usuario, y desde fuera de un navegador el `Origin` se omite igual.
- **Fix:** `esOrigenPermitido(origin, env)` y aceptar `localhost` solo si `env.ALLOW_LOCALHOST === 'true'` (definido en `.dev.vars` para `wrangler dev`, ausente en producción).

#### [—] WORK-2 · Pings falsos en `/api/hola` (aceptado)
- **Dónde:** `handleUso` (`index.js:625`), `RATE_LIMITER_USO` (60/min).
- **Problema:** con `APP_SECRET` público se pueden mandar UUIDs al azar e inflar los dispositivos del dashboard.
- **Por qué se acepta:** es inherente a una telemetría anónima y sin cuentas. Bajar el límite a 10/min igual permite unas 14.000 altas falsas por día desde una sola IP, y podría descartar pings legítimos detrás del NAT corporativo. No afecta a los usuarios ni a KV. Si los números se ven raros, filtrar en el dashboard por país o versión.

## Herramientas locales

#### [ ] DASH-1 · `data-tip` sin doble escape en el dashboard
- **Severidad:** Baja (no explotable hoy).
- **Dónde:** `horarios-push/scripts/dashboard_plantilla.html:328` (`barrasH`); sink en `mostrarTip` (`276`, `283`).
- **Problema:** `esc(k)` se interpola dentro de `data-tip="…"`. El navegador decodifica las entidades al leer el atributo, así que `dataset.tip` devuelve `<` y `>` reales, y `tip.innerHTML` los interpreta. El gráfico de líneas ya lo hace bien (`esc(p.tip)`, línea 314).
- **Por qué no es explotable:** todos los valores de `k` salen del Worker de listas cerradas o validados por regex (`modo`, `VERSION_RE`, `sistemaDeUA`, `navegadorDeUA`, `cf.country`).
- **Fix:** escapar el tip completo como en la línea 314:
  ```js
  `<div class="hbar" data-tip="${esc(`<b>${esc(k)}</b>: ${fmt(n)} dispositivos (${pct(n, total)})`)}">`
  ```
  Agregar una CSP aporta poco: el script de la plantilla es inline y necesitaría `'unsafe-inline'`.

## Riesgo del origen compartido (INFRA-1)

La app más débil del dominio define el riesgo de todas. El navegador aísla `localStorage`, `CacheStorage` y los service workers por **origen** (esquema + host + puerto), no por ruta: `l-lus.github.io/horarios` y `l-lus.github.io/otra-app` son el mismo origen. Un XSS en cualquier app del dominio puede:
- leer `gistToken` (acceso a todos los gists de la cuenta), `pushOwnerToken` (programar o cancelar los recordatorios de ese usuario) y todo el historial;
- llamar al Worker con un `Origin` válido.

La severidad depende de las otras apps del dominio, no de Horarios. Mitigaciones, de mayor a menor efecto:

1. **Origen propio, gratis:** publicar Horarios desde una **organización de GitHub** dedicada (`<org>.github.io` es otro origen) o desde Cloudflare Pages (`<proyecto>.pages.dev`). Un dominio propio también sirve, pero tiene costo. **Ojo:** cambiar de origen deja atrás el `localStorage` de todos los usuarios. Hace falta un plan de migración (aviso en la app vieja para exportar o sincronizar con Gist e importar en la nueva) y agregar el nuevo origen a `ALLOWED_ORIGINS`.
2. Misma CSP estricta (`script-src 'self'`, sin inline, sin CDNs sin SRI) en todas las apps del dominio.
3. Mismo criterio de escape en todas; priorizar las de `app.js` grande.

### [x] Prefijar claves de `localStorage` (`APP_STORAGE_PREFIX = 'horarios_'`)

**Implementado en `src/core/constantes.js`, `src/core/almacenamiento.js` y `src/core/tema-inicial.js`:**
- **Prefijo único de aplicación:** todas las lecturas, escrituras y borrados en `Almacenamiento` aplican automáticamente el prefijo `horarios_` (`APP_STORAGE_PREFIX`), aislando el espacio de nombres frente a otras apps publicadas bajo la misma cuenta de GitHub Pages (`gestion_servicios_*`, `IDR_*`, `SGI_*`, `RCK_*`).
- **Migración automática transparente (`Almacenamiento.migrarClavesLegadas()`):** al cargar el módulo (y al iniciar `OrquestadorUI.init()`), detecta cualquier clave legada sin prefijo perteneciente a Horarios (claves estáticas de `STORAGE_KEYS`, `pushInstallId`, `pushOwnerToken`, `statsId`, `statsUltimoPing`, claves por perfil `<base>_<perfilId>`, `mes-*-expandido`, `anio-*-expandido`, `gistSyncLimite_*`, `cardVisible_*`, `breakStartTime_*`), copia su valor a `horarios_<clave>` y elimina la clave vieja sin tocar claves de otros repositorios del mismo origen.
- **Anti-FOUC sin parpadeo (`src/core/tema-inicial.js`):** lee primero `horarios_temaOscuro` y `horarios_reducirAnimaciones` con fallback inmediato a las claves legadas en caso de ser el primer pintado previo a la migración.
- **Nota de seguridad:** evita colisiones de claves entre repositorios del mismo dominio; el aislamiento criptográfico frente a un eventual XSS en otra app del mismo origen sigue dependiendo de INFRA-1 (CSP estricta en todos los repos o dominio/subdominio propio).

## Arquitectura y calidad de código

#### [x] ARQ-1 · Evolución del monolito `app.js`
- **Completado (2026-10-25):** el antiguo `app.js` monolítico fue dividido en 47 módulos ES (`src/data/`, `src/core/`, `src/services/`, `src/ui/`, `src/main.js`) con grafo de dependencias acíclico (0 ciclos, 0 violaciones de capas), documentado en [`docs/ARQUITECTURA.md`](./ARQUITECTURA.md) y verificado automáticamente mediante `node --test` en `tests/architecture.test.mjs` y `tests/domain.test.mjs`.

#### [ ] HELP-1 · Helpers
- **Validación única de respaldos:** ver GIST-1/2 + HELP-1.
- **Promover `_mkEl`** (`app.js:5732`, firma `(tag, cls, texto)`) a `UIBase`: construye DOM con `textContent`, sin `innerHTML`, y podría reemplazar armados manuales en otros módulos a medida que se los toque.

## Diferido o descartado, con motivo

| Ítem | Motivo |
|---|---|
| Trusted Types / helper `setHTML` para los ~25 `innerHTML` | Cambio grande para una superficie que ya está limpia; soporte variable entre navegadores |
| Rediseñar `sanitizeString` (es una denylist) | Feo pero inofensivo con `escapeHtml` + CSP. El único caso con sentido es el token (SEC-1) |
| Validar todo `localStorage` al cargar (`perfiles`, historial, `diasHabiles`) | Solo el propio código escribe ahí y `horasDiarias` ya se valida. Se vuelve relevante si aparece otra app escribiendo en esas claves |
| Cifrar el token de Gist con PIN o contraseña (WebCrypto) | Agrega fricción en cada sesión a una app pensada sin cuentas ni contraseñas. El riesgo real (origen compartido) se ataca mejor con INFRA-1 |
| Allowlist de tags y atributos en `_sanitizarSVG` | Los fondos son estáticos y propios (`fondos.js`) |
| Opciones extra del fetch a Gist (`AbortController`, `cache: 'no-store'`, `credentials: 'omit'`, `redirect: 'error'`) | Mejoran la experiencia, no la seguridad |
| APP-2 · `sanitizeNotas` en la importación | No hay exportación CSV ni Excel, así que la inyección de fórmulas es hipotética. Aplicar si se agrega una exportación tabular |
| APP-3 · doble escape de `titulo` | Solo se nota con un label que tenga `&` o `<`; es un detalle visual |
| GIST-2 sin unificar | La API corta los archivos a ~1 MB y 1.000 registros quedan muy por debajo; un contenido truncado ya falla en `JSON.parse`. Se resuelve gratis con la validación única |
| GIST-3 · `_hashNoCoincide` dentro de `data` | Cosmético: un Gist manipulado solo puede usarlo para mostrar un aviso de más, nunca para saltearse uno |
| SW-4 · push con `null` | El Worker valida `title` y siempre manda un objeto |
| Validar `temaOscuro` en `tema-inicial.js` | Es un parpadeo cuando el storage está corrupto; UX, no seguridad |
| Chequeo `file.type === 'application/json'` | Puede rechazar archivos válidos según el sistema operativo; no es un control de seguridad |
| Bajar `RATE_LIMITER` / `RATE_LIMITER_USO` | No frena KV-1 ni WORK-2 desde varias IPs y puede cortar a usuarios reales detrás del NAT corporativo |
| Paginar `list()` en el cron | Agota la cuota diaria de `list` justo durante un ataque (ver CRON-1) |
| Achicar `MAX_PAST_MS` | El margen es para relojes desincronizados; el adelantamiento en la cola se resuelve con la metadata (CRON-1) |
| CSP en `dashboard_plantilla.html` | El script es inline; la CSP necesitaría `'unsafe-inline'` y casi no aportaría |
| Unificar `document.getElementById` en un helper `$` | No existe tal helper en `app.js`; no aporta seguridad |

## Riesgos conocidos que se mantienen

- Token de Gist en `localStorage` en texto plano: inherente a una app sin backend. Mitigado por la CSP y agravado por el origen compartido (INFRA-1).
- `APP_SECRET` visible en el código (`app.js:423`): no protege de un tercero. La defensa efectiva está en el Worker (anclaje, token de propiedad, rate limit), y KV-1 / WORK-2 son su consecuencia directa.
- Un Gist "secreto" de GitHub es no listado, no privado: quien tenga la URL puede leerlo.
- El hash de los respaldos detecta corrupción accidental, no manipulación.
- Un corte de red momentáneo al enviar un push pierde ese aviso (se reintenta solo ante 429 o 5xx del push service, por diseño).

## Observaciones de diseño (sin acción)

- Los datos cargados desde `localStorage` no pasan por `validarRegistroSeguro` ni por las validaciones de rango de la importación; solo la importación (archivo y Gist) lo hace.
- `sanitizeString` muta en silencio: borra comillas y `<>`, y su regex `/on\w+\s*=/` eliminaría texto legítimo como "Condiciones = …" en un nombre de perfil.
- La URL del Worker está fija en `app.js:421`; pasar entre testing y producción requiere editar el código (ver `PASOS-ESTADISTICAS-PRODUCCION.md`).

## Correcciones respecto de análisis previos

**Conversaciones previas (2026-10-11):**
- Se había sugerido agregar un frame-buster; `tema-inicial.js` ya lo tenía (ver FLASH-1).
- Se había indicado que prefijar las claves limita lo que puede leer un XSS vecino. Es incorrecto: el prefijo solo evita colisiones.

**Análisis externo de pentest (2026-10-18), incorporado acá con estas correcciones:**
- **"El Worker no tiene dependencias y la criptografía de push es propia (RFC 8291)":** falso. El Worker usa `web-push-neo` desde npm (`index.js:1`). Las líneas citadas son de validación, no de criptografía. De ahí sale DEP-1.
- **Nombres inexistentes:** `env.NOTIFICATIONS`, `manejarSchedule`, `anchor:<hash>` y `ANCHOR_TTL_S` no existen. Los reales son `HORARIOS_KV`, `handleSchedule` y `push:<hash>`.
- **"2 escrituras por cada `/api/schedule`":** solo es así para un atacante con endpoints nuevos. En uso normal el anclaje se renueva a lo sumo una vez por mes (`index.js:478`).
- **"Al agotar las escrituras, los deletes del cron fallan":** KV tiene cuotas separadas para escrituras y borrados. Lo que se cae es la programación de avisos.
- **"El mínimo del rate limiter es 10 req/min":** falso. `limit` acepta cualquier entero; lo que solo admite 10 o 60 es `period`.
- **Arreglo de KV-1 con `endpointHash` en la metadata de `sched:`:** rompe el anclaje endpoint→dueño.
- **Paginación de `list()` en CRON-1:** agota la cuota de `list` (ver "Diferido o descartado").
- **Helper `$` en `app.js:13`:** no existe.
- **Firma de `_mkEl`:** es `(tag, cls, texto)`, no `(tag, props, children)`.
- **"Corrupción del token por `sanitizeString`":** no puede ocurrir con tokens reales; el cambio se mantiene (SEC-1) por claridad y para rechazar tokens mal pegados.
- **Severidades:** INFRA-1 bajó de Crítica a Media (depende de otras apps del dominio); KV-1, de Alta a Media (disponibilidad, sin exposición de datos); WORK-1, de Media a Baja. DASH-1 se marca no explotable hoy (todas las entradas son listas cerradas).
- **Medidas que no encajan con la filosofía de la app:** cifrado del token con PIN y dominio propio pago como única salida para INFRA-1; se proponen alternativas gratuitas.

## Orden sugerido de implementación

1. Quick wins: WORK-1, SW-3, DASH-1, SEC-1 y DEP-1 (minutos cada uno).
2. CRON-1: la metadata con `Math.max(targetTime, Date.now())`.
3. KV-1: decidir entre migrar a D1 o aceptar y documentar el riesgo.
4. GIST-1/2 + HELP-1: validación única de respaldos.
5. Opcionales de la Fase 3 y diferidos que se vuelvan relevantes.
6. Mediano plazo: INFRA-1 (con plan de migración de datos) y ARQ-1 (por partes).

## Checklist de verificación final

**Aplicados:**
- [ ] Con una caché ajena creada a mano, una actualización del SW no la borra.
- [ ] Un deploy inmediatamente seguido de la actualización del SW sirve el `app.js` nuevo.
- [ ] `…/?accion=entrada` no registra nada.
- [ ] Con `horasDiarias` manipulado a mano en storage, el popup de estadísticas muestra el valor por defecto.
- [ ] El reporte HTML descargado abre sin errores de CSP.
- [ ] La app embebida en un `<iframe sandbox>` queda oculta.
- [ ] Bajar un Gist sin hash pide confirmación.

**Pendientes:**
- [ ] Con la app sin conexión y `index.html` borrado de la caché, la navegación cae a `./` (SW-3).
- [ ] Un token con caracteres inválidos se rechaza con aviso y no se guarda (SEC-1).
- [ ] Un Gist con más de `MAX_REGISTROS` entradas se rechaza antes de procesarse (GIST-1).
- [ ] Un request desde `http://localhost:8080` al Worker de producción recibe 403 (WORK-1).
- [ ] Un schedule con `targetTime` 4 minutos en el pasado queda en la cola detrás de los avisos ya vencidos (CRON-1).
- [ ] En el dashboard, una categoría con `<b>x</b>` en el nombre se muestra como texto en el tooltip de `barrasH` (DASH-1).
- [ ] `package.json` del Worker sin `^` en `web-push-neo` y deploy con `npm ci` (DEP-1).
