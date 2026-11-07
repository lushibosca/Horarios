# Propuesta técnica y análisis de seguridad — Respaldo en Google Drive

**Fecha:** 2026-10-17  
**Alcance:** `app.js`, `index.html`, `styles.css`, `sw.js` y `horarios-push/src/index.js`  
**Objetivo:** Incorporar Google Drive como opción de respaldo y sincronización en la nube (manual y automática), con botón propio en **Ajustes → Datos**, manteniendo los estándares de seguridad de `ROADMAP-SEGURIDAD-HORARIOS.md`.

> Las referencias a código se hacen por nombre de función/elemento; los números de línea son orientativos y pueden desfasarse con cada commit.

---

## 1. Contexto y condicionantes de la aplicación

1. **PWA estática en GitHub Pages** (`l-lus.github.io`, `lushibosca.github.io`): no hay backend de base de datos propio; toda la persistencia primaria vive en `localStorage`.
2. **CSP estricta en `<meta>`** (`index.html`, cabecera `<head>`):
   - `script-src 'self'` (sin scripts inline ni librerías de terceros).
   - `connect-src 'self' https://api.github.com https://horarios-push.lushibosca.workers.dev`.
3. **Origen compartido**: todas las apps publicadas bajo un mismo usuario de GitHub Pages (por ejemplo, todo lo que vive en `https://lushibosca.github.io/...`) comparten **el mismo origen**, y por lo tanto `localStorage`, `sessionStorage` de cada pestaña, Cache Storage y `BroadcastChannel`. El aislamiento es por origen, no entre distintos subdominios de `github.io`.
4. **Infraestructura existente**: ya existe el Worker de Cloudflare `horarios-push` (`horarios-push/src/index.js`) con rate limiting nativo por IP/subred, validación de `Origin` y lectura acotada de body.
5. **Modelo de sincronización probado**: `GistSync` y `UIGistYRespaldo` (`app.js`) ya implementan hash de integridad SHA-256, cálculo de diferencias, modal interactivo de **Combinar / Reemplazar** y sincronización automática por perfil con ventana horaria y límite por hora.

---

## 2. Evaluación de alternativas técnicas

A diferencia de GitHub Gist, **Google Drive no ofrece Personal Access Tokens estáticos**. Toda integración con la API de Google Drive requiere **OAuth 2.0**, donde los `access_token` tienen una vida fija de **1 hora (3600 segundos)**.

Para lograr que el respaldo manual y la **sincronización automática al abrir la app** funcionen sin pedirle al usuario que inicie sesión cada hora, se evaluaron tres arquitecturas:

| Criterio | Opción A (Recomendada)<br>OAuth 2.0 + PKCE vía Worker `horarios-push` | Opción B<br>OAuth 2.0 Implicit Flow (100% Frontend) | Opción C<br>Google Apps Script por usuario |
| :--- | :--- | :--- | :--- |
| **Experiencia de usuario (UX)** | **Excelente:** 1 clic en *"Conectar con Google Drive"*, sin copiar tokens ni IDs. | **Regular:** el login vence a la hora; obliga a re-autorizar en un popup frecuente. | **Mala:** cada usuario debe crear y desplegar un script en su cuenta y pegar la URL. |
| **Sincronización automática al abrir** | **Completa:** el `refresh_token` renueva el acceso en segundo plano sin intervención. | **Inviable en la práctica:** al día siguiente el token ya expiró. | **Completa:** la URL del script no vence. |
| **Impacto en `script-src 'self'`** | **Ninguno:** no se carga el SDK de Google (`gsi/client`). Todo es `fetch` nativo. | **Ninguno** si se hace con popup manual; requiere SDK externo si se usa silencioso. | **Ninguno.** |
| **Consumo de KV en Cloudflare** | **0 lecturas / 0 escrituras:** el Worker solo actúa como proxy stateless de OAuth. | **0** (no usa el Worker). | **0** (no usa el Worker). |
| **Seguridad del secreto OAuth** | `GOOGLE_CLIENT_SECRET` aislado en secretos de Cloudflare (`wrangler secret`). | No hay `refresh_token`: el flujo implícito (`response_type=token`) no lo contempla. Además está desaconsejado por OAuth 2.1. | Cada usuario administra su propio script. |

### Conclusión arquitectónica
La **Opción A** es la más sólida: aprovecha el Worker `horarios-push` que ya está en producción para guardar el `GOOGLE_CLIENT_SECRET` y emitir/renovar tokens, sin gastar cuota de KV ni cargar scripts de Google en el navegador.

---

## 3. Elección del permiso (Scope) en Google Drive

Google ofrece dos scopes clasificados como **no sensibles** (*non-sensitive*), lo que significa que la aplicación en Google Cloud Console **no requiere verificación ni auditoría de seguridad paga** para ser usada por los ~50 usuarios.

> **Importante:** la pantalla de consentimiento debe pasarse a estado **"In production"**. En estado **"Testing"** los `refresh_token` **vencen a los 7 días** (rompiendo la sincronización automática) y el uso queda limitado a 100 usuarios de prueba cargados a mano. Con scopes no sensibles, publicar no exige verificación, pero sí completar nombre de la app, email de soporte y URL de política de privacidad.

### Alternativa 3.1: `https://www.googleapis.com/auth/drive.appdata` *(Recomendada)*
Guarda los respaldos en el espacio oculto de datos de aplicación (`appDataFolder`) dentro del Google Drive del usuario.
* **Ventajas de UX:** el usuario no tiene que tocar ni configurar ningún ID de archivo; la app busca automáticamente `horarios_backup_<perfilId>.json` (y cachea su `driveFileId` en el perfil). El archivo no aparece en la interfaz de Drive, por lo que no puede moverse ni editarse por accidente (solo puede borrarse a propósito desde *Configuración → Administrar apps → Borrar datos ocultos de la app*).
* **Ventajas de seguridad:** incluso ante un robo de token, este permiso **solo permite leer y escribir dentro de la carpeta oculta de Horarios**. No permite ver nombres, carpetas ni ningún otro archivo del Google Drive del usuario.

### Alternativa 3.2: `https://www.googleapis.com/auth/drive.file`
Crea un archivo visible `horarios_backup_<perfilId>.json` en la raíz (o carpeta elegida) del Google Drive del usuario, dando acceso únicamente a los archivos creados por la propia app.
* **Ventaja:** el usuario puede ver el archivo en su unidad de Drive (similar al botón *"Abrir en GitHub"* de Gist) o compartir el ID entre perfiles.
* **Desventaja:** si el usuario lo mueve a la papelera o lo edita manualmente en Drive, la sincronización falla o salta la alerta de hash inválido.

> **Recomendación:** Usar **`drive.appdata`** por defecto por su simplicidad (cero configuración tras iniciar sesión) y mínimo privilegio, o bien **`drive.file`** si se desea mantener un campo opcional de `File ID` + botón *"Abrir en Drive"* idéntico a la experiencia actual de Gist.

---

## 4. Diseño de Interfaz (UI) e Integración en el Código

### 4.1. Botón propio en `Ajustes → Datos` (`index.html`, sección `Datos`)
En la lista `.settings-list` de la sección **Datos**, se agrega el botón dedicado **Google Drive** justo debajo de **GitHub Gist**:

```html
<button class="btn-gist">
    <svg class="icon"><use href="#icon-gist" /></svg>
    <span>GitHub Gist</span>
    <svg class="icon icon-indicator"><use href="#icon-chevron-right" /></svg>
</button>
<button class="btn-drive">
    <svg class="icon"><use href="#icon-drive" /></svg>
    <span>Google Drive</span>
    <svg class="icon icon-indicator"><use href="#icon-chevron-right" /></svg>
</button>
```
*(Se añade el `<symbol id="icon-drive">` monocromático `currentColor` al sprite SVG de `index.html` para que respete todos los temas de la app).*

### 4.2. Modal de configuración de Google Drive (`#modal-drive`)
Sigue exactamente la estructura visual y ergonómica de `#modal-gist`, manteniendo coherencia total en la app:

1. **Cabecera de estado (`#drive-estado`):**
   - Muestra `Sin conectar` o `Conectado` (junto con el email o indicador de cuenta vinculada) y `Última sync: dd/mm/aaaa hh:mm`.
2. **Sección Conexión:**
   - Si no está conectado: botón **Conectar con Google Drive** (abre el flujo OAuth).
   - Si está conectado: estado de la sesión, ID del archivo asociado al perfil activo y botón **Desconectar cuenta** (que revoca el token y limpia las credenciales).
3. **Sección Automatización (por perfil):**
   - **Sincronización automática:** alterna entre `Sin automatizar` (0), `Restaurar al abrir` (1) y `Respaldar al abrir` (2).
   - **Al bajar datos:** alterna entre `Reemplazar` y `Combinar` (activo cuando el modo automático es `Restaurar`).
   - **Límites y horario (colapsable):** límite de ejecuciones por hora (`0 = sin límite`, por defecto 2 bajadas / 1 subida) y franja horaria `Desde` / `Hasta` (por defecto `21:00` a `00:00`).
4. **Acciones manuales (`Subir` / `Bajar`) y pie del modal (`Guardar` / `Volver`).**

### 4.3. Accesos rápidos en la tarjeta de Registros (`actualizarBotonesHistorico`)
Los botones rápidos de la barra del histórico (`#btn-hist-respaldar` y `#btn-hist-restaurar`) hoy cambian entre archivo local y Gist según si hay Gist configurado. Con Google Drive:
- Si el perfil activo tiene **solo Gist** conectado → sube/baja de Gist.
- Si el perfil activo tiene **solo Google Drive** conectado → sube/baja de Google Drive.
- Si el perfil tiene **ambos** conectados → prioriza el que tenga **Sincronización automática activa** en ese perfil (o el último sincronizado `lastSync`), evitando agregar botones extra en la barra compacta.
- Si no tiene ninguno → abre los modales de Respaldar / Restaurar archivo local.

### 4.4. Factorización en `app.js` para evitar duplicación
En lugar de duplicar las ~900 líneas de `UIGistYRespaldo`, se reutilizan los componentes comunes:
- **Módulo `DriveSync`**: implementa la misma interfaz pública que `GistSync` (`subir()`, `bajar()`, `getLastSync()`, `getAutoSync()`, `getMergeBehavior()`, `dentroDelRangoHorario()`, `superaLimite()`, `marcarSync()`).
- **Validación y Merge compartidos**: `_validarDatosGist`, `_calcularDiffGist`, `_calcularRegistrosMerge` y el modal `#modal-gist-merge` reciben un parámetro `origen` (`'Gist'` | `'Google Drive'`) para adaptar únicamente los textos del título, alertas y mensajes de `HistoryManager` (`"reemplazar con Google Drive"` / `"combinar con Google Drive"`).
- **Guardado por perfil (`PerfilManager`)**: cada perfil almacena sus propias propiedades `driveFileId`, `driveLastSync`, `driveAutoSync`, `driveMergeBehavior`, `driveRangoDesde`, `driveRangoHasta`, mientras que el `driveRefreshToken` es global a todos los perfiles (igual que `gistToken`).

---

## 5. Flujo técnico paso a paso (OAuth 2.0 + PKCE + Drive REST API)

```mermaid
sequenceDiagram
    actor U as Usuario
    participant App as Horarios PWA (app.js)
    participant Popup as Popup OAuth + oauth-callback.html
    participant GoogleAuth as Google OAuth 2.0
    participant Worker as Cloudflare Worker (horarios-push)
    participant Drive as Google Drive API (googleapis.com)

    U->>App: Toca "Conectar con Google Drive"
    App->>Popup: window.open('about:blank') sincrónico dentro del clic
    App->>App: Genera code_verifier (PKCE) y state aleatorio en sessionStorage
    App->>Popup: popup.location = accounts.google.com/o/oauth2/v2/auth (access_type=offline, prompt=consent)
    U->>GoogleAuth: Autoriza acceso (scope: drive.appdata)
    GoogleAuth->>Popup: Redirige a oauth-callback.html?code=...&state=...
    Popup->>App: Envía { code, state } por BroadcastChannel (same-origin) y se cierra
    App->>App: Verifica state === sessionStorage.state
    App->>Worker: POST /api/oauth/google/exchange { code, codeVerifier, redirectUri }
    Worker->>GoogleAuth: POST oauth2.googleapis.com/token (+ GOOGLE_CLIENT_SECRET)
    GoogleAuth-->>Worker: { access_token, refresh_token, expires_in }
    Worker-->>App: { accessToken, refreshToken, expiresIn }
    App->>App: Guarda refreshToken en localStorage y accessToken en memoria
    U->>App: Toca "Subir" o "Bajar"
    App->>Drive: fetch directo a www.googleapis.com/drive/v3/files (Bearer accessToken)
```

### 5.1. Parámetros obligatorios de la URL de autorización
`https://accounts.google.com/o/oauth2/v2/auth` con:
- `client_id=<GOOGLE_CLIENT_ID>` (público; vive en `app.js`, no es un secreto).
- `redirect_uri=<origen>/Horarios/oauth-callback.html`.
- `response_type=code`, `scope=https://www.googleapis.com/auth/drive.appdata`.
- `code_challenge=<S256>`, `code_challenge_method=S256`, `state=<aleatorio>`.
- **`access_type=offline`**: sin este parámetro Google **no devuelve `refresh_token`** y la sincronización automática no funciona.
- **`prompt=consent`**: Google solo entrega el `refresh_token` en el primer consentimiento; forzarlo garantiza recibirlo también al reconectar tras un *Desconectar*.

### 5.2. Apertura del popup (bloqueadores de ventanas)
`crypto.subtle.digest` (necesario para el `code_challenge`) es asíncrono. Si `window.open` se llama después de un `await`, el navegador pierde el gesto del usuario y bloquea el popup. Por eso se abre la ventana vacía **sincrónicamente** dentro del handler del clic y se le asigna la URL de Google una vez calculado el PKCE (o se precalcula el par verifier/challenge al abrir el modal).

### 5.3. Compatibilidad con PWA instalada
- **Android (Chrome):** el popup abre en una pestaña del mismo perfil; `BroadcastChannel` llega a la app. Validar en dispositivo real.
- **iOS (PWA en pantalla de inicio):** `window.open` sale a Safari, que tiene **almacenamiento separado** del de la PWA, por lo que el mensaje por `BroadcastChannel` no llega. Plan B: flujo por **redirección en la misma ventana** (guardar `state` y `code_verifier` en `sessionStorage`, navegar a Google y procesar el `code` en `oauth-callback.html`, que vuelve a `index.html`). Debe probarse antes de dar la funcionalidad por cerrada.

### 5.4. Operaciones contra la API de Google Drive (directas desde el navegador)
1. **Localizar el archivo del perfil (`DriveSync._buscarArchivo`)** — necesario para restaurar en un dispositivo nuevo, donde el perfil aún no tiene `driveFileId`:
   - `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='horarios_backup_<perfilId>.json'&fields=files(id,modifiedTime)`.
   - Si hay resultado, se guarda su `id` en `perfil.driveFileId`. Si hubiera más de uno (por ejemplo, por una carrera entre dispositivos), se usa el de `modifiedTime` más reciente.
   - El `perfilId` que se interpola en `q` se valida antes con regex estricta (sin comillas ni barras) para evitar inyección en la consulta.
2. **Subir (`DriveSync.subir`)**:
   - Si el perfil ya tiene `driveFileId` válido (o se encontró en el paso 1): `PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=media` con el JSON.
   - Si no existe (o el `PATCH` devuelve `404`): crea el archivo con `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` enviando los metadatos (`{ name: 'horarios_backup_<perfilId>.json', parents: ['appDataFolder'] }`) y el cuerpo JSON, y guarda el `id` resultante en `perfil.driveFileId`.
3. **Bajar (`DriveSync.bajar`)**:
   - Si no hay `driveFileId`, ejecuta primero el paso 1. Si tampoco se encuentra archivo, informa *"No hay respaldo en Google Drive para este perfil"*.
   - `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` con header `Authorization: Bearer <accessToken>`.
4. **Renovación transparente de token**:
   - El `accessToken` y su timestamp de expiración (`expiresAt`) se mantienen en memoria. Si faltan menos de 60 segundos para vencer (o no existe en memoria tras recargar la página), `DriveSync` llama primero a `POST /api/oauth/google/refresh` en el Worker enviando el `refreshToken` y obtiene un `accessToken` fresco. La respuesta de refresh normalmente **no** incluye un `refresh_token` nuevo; se conserva el existente.
   - Si Google responde `invalid_grant` (token revocado o vencido), se borra el `driveRefreshToken` y el modal vuelve a mostrar `Sin conectar`.

---

## 6. Análisis de Seguridad

Siguiendo la metodología de `ROADMAP-SEGURIDAD-HORARIOS.md`, se analizan todos los vectores de ataque que introduce esta funcionalidad y los controles que deben implementarse desde el diseño.

### 6.1. Criptografía y flujo OAuth 2.0 (Prevención de CSRF, robo de código y Open Redirect)

| ID | Vector / Riesgo | Control de seguridad a implementar |
| :--- | :--- | :--- |
| **DRV-SEC-1** | **CSRF en el callback OAuth** (un atacante intenta vincular su propia cuenta de Google Drive a la app de la víctima para inyectarle registros falsos o leer lo que la víctima suba). | Generar un parámetro `state` de 32 bytes aleatorios con `crypto.getRandomValues` antes de abrir el popup, guardarlo en `sessionStorage` (propio de la pestaña y descartado al cerrarla) y exigir coincidencia exacta (`stateRecibido === stateGuardado`) antes de canjear el código. Consumir y borrar el `state` inmediatamente. |
| **DRV-SEC-2** | **Intercepción del `authorization_code`** en tránsito, en historial o por otra app del mismo origen escuchando el `BroadcastChannel`. | Uso obligatorio de **PKCE (`S256`)**: el navegador genera un `code_verifier` criptográfico aleatorio de 43-128 caracteres base64url, envía `code_challenge = BASE64URL(SHA256(code_verifier))` a Google y luego envía el `code_verifier` al Worker para el canje. El `code_verifier` nunca sale de la pestaña de Horarios (salvo hacia el Worker), por lo que un `code` interceptado es inútil. |
| **DRV-SEC-3** | **Fuga del código en la página de retorno (`oauth-callback.html`)**. | `oauth-callback.html` debe tener su propia CSP estricta (`default-src 'none'; script-src 'self'`), `<meta name="referrer" content="no-referrer">`, limpiar inmediatamente la URL con `history.replaceState(null, '', location.pathname)` antes de hacer nada, transmitir `{ code, state }` mediante `BroadcastChannel('horarios_oauth_drive')` y ejecutar `window.close()`. **Nota:** el `BroadcastChannel` está restringido al mismo origen, pero ese origen incluye a las demás apps de GitHub Pages del mismo usuario (ver §1.3); por eso la confidencialidad del `code` se apoya en PKCE (DRV-SEC-2) y su autenticidad en el `state` (DRV-SEC-1), no en el canal. |
| **DRV-SEC-4** | **Abuso del Worker como proxy OAuth por orígenes no autorizados (`redirect_uri` spoofing)**. | La barrera principal es Google: solo acepta `redirect_uri` registradas en la Cloud Console. Como defensa en profundidad, el Worker **no acepta cualquier `redirectUri`** enviada por el cliente: la valida contra una lista blanca estricta (`https://l-lus.github.io/Horarios/oauth-callback.html`, `https://lushibosca.github.io/Horarios/oauth-callback.html` y, en desarrollo, la URI de `localhost` que también debe estar registrada en la Console). |
| **DRV-SEC-5** | **El `code` queda persistido en Cache Storage por el Service Worker.** El handler `fetch` de `sw.js` guarda con `cache.put(event.request, …)` toda navegación GET del scope que no esté en caché; la request a `oauth-callback.html?code=…&state=…` quedaría almacenada con la URL completa, legible por cualquier app del mismo origen. | Agregar `./oauth-callback.html` y `./oauth-callback.js` a `urlsToCache` (con el `ignoreSearch: true` actual se sirven desde caché y nunca se hace `put` de la URL con query), **o** excluir explícitamente `oauth-callback.html` del handler `fetch`. Subir `CACHE_NAME`. |

### 6.2. Seguridad en el Worker de Cloudflare (`horarios-push`)

1. **Protección del `GOOGLE_CLIENT_SECRET`**:
   - Se almacena exclusivamente como secreto cifrado de Cloudflare (`npx wrangler secret put GOOGLE_CLIENT_SECRET`). Nunca aparece en el código fuente ni en `wrangler.toml`.
   - El `GOOGLE_CLIENT_ID` **no** es secreto: el frontend lo necesita para armar la URL de autorización. Vive en `app.js` y en `wrangler.toml` (`[vars]`).
2. **Reutilización de `verificarAcceso(request, env)`**:
   - Los dos nuevos endpoints (`/api/oauth/google/exchange` y `/api/oauth/google/refresh`) pasan por el mismo filtro inicial que `/api/schedule` y `/api/cancel`:
     - Rate limit nativo (`env.RATE_LIMITER.limit`) por IPv4 o subred `/64` IPv6 (`claveIP`).
     - Verificación del header `Origin` contra `esOrigenPermitido(origin)`.
     - Verificación de `X-App-Secret` (`tieneSecretoValido`).
   - **Alcance real de este filtro:** el `X-App-Secret` está en `app.js` (es público) y `verificarAcceso` acepta requests **sin** `Origin` (curl, scripts). Por lo tanto estos controles frenan el uso casual desde otros sitios web y limitan el volumen, pero **no** impiden que alguien llame a los endpoints desde fuera del navegador. La seguridad efectiva de `/exchange` descansa en PKCE y la de `/refresh` en la posesión del `refreshToken`.
3. **Aislamiento de la cuota de KV**:
   - Ninguno de los endpoints de OAuth toca `env.HORARIOS_KV`. Si un atacante enviara ráfagas de tokens inválidos, lo frena `RATE_LIMITER` sin gastar ni una sola lectura/escritura del KV que usan las notificaciones push.
4. **Validación estricta del body (`leerBodyJSON`)**:
   - Se limita el tamaño máximo del body a `2048` bytes. Hoy `leerBodyJSON` usa un tope fijo (`MAX_BODY_BYTES = 8 KB`); se le agrega un parámetro opcional `maxBytes` para estos endpoints.
   - Se valida con expresiones regulares el formato de `code` (`/^[A-Za-z0-9/_-]+$/`, máx. 512 chars), `codeVerifier` (`/^[A-Za-z0-9_-]{43,128}$/`) y `refreshToken` (`/^[A-Za-z0-9._/-]{20,512}$/`) antes de hacer el subrequest a `https://oauth2.googleapis.com/token`.
5. **No exposición de errores internos de Google**:
   - El Worker devuelve únicamente `{ accessToken, refreshToken, expiresIn }` (con `Cache-Control: no-store`) o un código de error genérico (`400` / `401`), sin reenviar cabeceras ni trazas crudas. Excepción: `invalid_grant` se mapea a un código propio (ej. `{ error: 'reconectar' }`) para que el cliente sepa que debe pedir reconexión.

### 6.3. Seguridad en el Frontend (`app.js`, `index.html`)

1. **Conservación de `script-src 'self'` en la CSP**:
   - No se incluye `<script src="https://accounts.google.com/gsi/client">`. Esto evita que código externo de terceros se ejecute con acceso al DOM y al `localStorage` de todas las apps del origen.
   - En la CSP de `index.html`, `connect-src` solo suma los endpoints REST de Google:
     ```http
     connect-src 'self' https://api.github.com https://horarios-push.lushibosca.workers.dev https://www.googleapis.com https://oauth2.googleapis.com;
     ```
2. **Validación de `driveFileId` antes de construir URLs (SSRF / Path Traversal en cliente)**:
   - Igual que `GistSync.esGistIdValido`, se define `DriveSync.esFileIdValido(id)` con regex estricta `/^[a-zA-Z0-9_-]{10,100}$/`. Nunca se interpola un `driveFileId` en una URL de `fetch` ni en `window.open` sin pasar antes por este validador.
3. **Defensa contra respuestas gigantes o corruptas desde Google Drive**:
   - Al descargar el archivo desde Drive (`GET .../files/{id}?alt=media`), se lee el texto verificando que no supere `S.SECURITY_LIMITS.MAX_JSON_SIZE` (4 MB) **antes** de llamar a `JSON.parse(texto, S.reviverJSONSeguro)`.
   - Se verifica `data.registros.length <= S.SECURITY_LIMITS.MAX_REGISTROS` **antes** de `normalizarRegistrosImportados`.
   - En el roadmap, GIST-1 y GIST-2 quedaron diferidos porque la API de Gist trunca los archivos a ~1 MB. **Ese argumento no aplica a Drive**, que devuelve el archivo completo sin límite práctico; para Drive estos chequeos son **obligatorios**. Al compartir la función de validación, Gist los hereda sin costo.
   - Se exige la misma allowlist de claves raíz (`registros`, `diasHabiles`, `horasDiarias`, `historialDiasHabiles`, `fecha`, `version`, `hash`, `timestamp`) y la confirmación interactiva si el hash SHA-256 falta o no coincide.
   - **Alcance del hash:** el SHA-256 detecta corrupción o ediciones manuales, pero **no es una firma**: quien tenga el token puede reescribir el archivo y recalcular el hash. La defensa ante datos manipulados es la validación estructural y de límites, igual que con Gist.
4. **Almacenamiento del token y riesgo del origen compartido**:
   - El `driveRefreshToken` se guarda en `localStorage` (el `accessToken` de corta duración se mantiene solo en una variable privada en memoria dentro de la clausura de `DriveSync`).
   - **Impacto ante un eventual XSS en otra app del mismo origen (`lushibosca.github.io`)**: el atacante podría leer el `driveRefreshToken` y, usando el Worker (cuyo `X-App-Secret` es público), obtener `access_token` válidos. Gracias al scope restringido `drive.appdata` (o `drive.file`), eso le da **lectura y escritura del respaldo de Horarios** (datos personales de horarios del usuario), pero **no** acceso a la cuenta de Google, al correo ni a ningún otro documento de Drive. Es un riesgo menor que el actual con Gist, cuyo PAT con scope `gist` da acceso a todos los gists del usuario.
   - Cifrar el token o moverlo a IndexedDB no mitiga un XSS del mismo origen. La única mitigación de fondo es servir Horarios desde un **origen propio** (dominio propio o usuario de GitHub Pages dedicado); queda fuera del alcance de esta propuesta.
5. **Revocación real al desconectar**:
   - Cuando el usuario toca *"Desconectar"*, además de borrar `driveRefreshToken` de `localStorage` y limpiar el token en memoria, se envía un `POST https://oauth2.googleapis.com/revoke` con el token en el **body** (`Content-Type: application/x-www-form-urlencoded`, `token=<refreshToken>`), no en la query string, para invalidar la credencial en los servidores de Google.

### 6.4. Resumen de riesgos residuales

| Riesgo | Gravedad | Estado |
| :--- | :--- | :--- |
| `code` persistido en Cache Storage por el SW | Media | Mitigado por DRV-SEC-5 |
| `refreshToken` legible por otras apps del mismo origen | Media (solo da acceso al respaldo) | Inherente a GitHub Pages; menor que el riesgo actual de Gist |
| CSRF, intercepción del `code`, fuga por Referer | Baja | Mitigado (state + PKCE + `no-referrer`) |
| Abuso de los endpoints del Worker | Baja | Rate limit; sin consumo de KV |

---

## 7. Plan de implementación paso a paso

1. **Fase 1 — Configuración en Google Cloud Console (~15 min):**
   - Crear proyecto en Google Cloud Console → habilitar **Google Drive API**.
   - Configurar pantalla de consentimiento OAuth con el scope `.../auth/drive.appdata` (o `drive.file`), nombre de la app, email de soporte y URL de política de privacidad.
   - **Publicar la app ("In production")** para evitar el vencimiento de `refresh_token` a los 7 días del modo Testing.
   - Crear credencial **ID de cliente de aplicación web**, autorizando los orígenes de GitHub Pages y las URI de redirección `.../Horarios/oauth-callback.html` (más la de `localhost` para desarrollo).
   - Cargar `GOOGLE_CLIENT_SECRET` en el Worker (`wrangler secret put`) y `GOOGLE_CLIENT_ID` como variable pública (`[vars]` en `wrangler.toml`) y constante en `app.js`.

2. **Fase 2 — Endpoints OAuth en `horarios-push/src/index.js`:**
   - Agregar rutas `POST /api/oauth/google/exchange` y `POST /api/oauth/google/refresh` protegidas por `verificarAcceso`, `leerBodyJSON` (con tope de 2 KB) y validación de `redirectUri`.

3. **Fase 3 — Página `oauth-callback.html`, `sw.js` e `index.html`:**
   - Crear `oauth-callback.html` + `oauth-callback.js` (estáticos, con CSP propia, sin inline scripts).
   - En `sw.js`: agregar ambos archivos a `urlsToCache` (DRV-SEC-5) y subir `CACHE_NAME`.
   - Actualizar `connect-src` en `index.html`.
   - Agregar ícono `#icon-drive`, botón **Google Drive** en `Ajustes → Datos` y el modal `#modal-drive`.
   - Añadir la sección explicativa de Google Drive en el modal de **Ayuda** (`#modal-ayuda`).

4. **Fase 4 — Módulo `DriveSync` y factorización en `app.js`:**
   - Implementar `DriveSync` (PKCE, apertura sincrónica del popup, manejo de token en memoria, búsqueda en `appDataFolder`, subida/bajada multipart/media y límites por perfil).
   - Unificar la validación y el modal de merge con `UIGistYRespaldo`.
   - Conectar `_initAutoSync()` y `actualizarBotonesHistorico()` para que soporten ambos proveedores.

5. **Fase 5 — Pruebas en dispositivos reales:**
   - Conectar, subir, bajar y desconectar en escritorio, Android (PWA instalada) e iOS (PWA instalada; validar el plan B de §5.3).
   - Restaurar en un dispositivo/navegador limpio (sin `driveFileId`) para verificar la búsqueda en `appDataFolder`.
   - Verificar en DevTools → Cache Storage que no quede ninguna entrada con `?code=`.
