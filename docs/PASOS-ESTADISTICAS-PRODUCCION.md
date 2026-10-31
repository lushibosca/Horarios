# Estadísticas de uso: pasar a producción

Pasos para llevar las estadísticas de uso (Worker + Workers Analytics Engine)
de la cuenta de testing (`l-lus`) a la de producción (`lushibosca`).

| | Testing | Producción |
|---|---|---|
| Worker | `https://horarios-push.l-lus.workers.dev` | `https://horarios-push.lushibosca.workers.dev` |
| ID del KV `HORARIOS_KV` | `3a0eedae91464c27b339e36b7c2afc0e` | `344dd2ed61a14114a4f64b0132230364` |
| Account ID | `6a4b4eb86e16c3c64dea60628b031a0e` | ver en el dashboard de producción |

## 1. Activar Analytics Engine en la cuenta de producción

Se hace una sola vez por cuenta, desde el dashboard (wrangler no lo puede hacer).

1. Entrar a <https://dash.cloudflare.com> con la cuenta de producción.
2. Ir a **Workers & Pages → Analytics Engine** y habilitarlo (es gratis).
3. Si pide crear un dataset, usar exactamente estos nombres:
   - **Dataset name:** `horarios_uso`
   - **Dataset binding:** `USO`

## 2. Preparar el Worker (`horarios-push/`)

`src/index.js` se despliega tal como está: ya acepta los dos orígenes
(`l-lus.github.io` y `lushibosca.github.io`).

En `wrangler.toml` hay que **cambiar el ID del KV** por el de producción:

```toml
kv_namespaces = [
  { binding = "HORARIOS_KV", id = "344dd2ed61a14114a4f64b0132230364" }
]
```

El resto queda igual: `RATE_LIMITER`, `RATE_LIMITER_USO`, el dataset
`horarios_uso` con binding `USO`, el cron y `VAPID_PUBLIC_KEY`.

> Ojo: si se despliega con el ID de testing, el Worker de producción falla o
> usa un KV equivocado y los recordatorios push dejan de funcionar.

## 3. Desplegar el Worker en producción

```bash
cd horarios-push
npx wrangler logout
npx wrangler login               # iniciar sesión con la cuenta de PRODUCCIÓN
npx wrangler whoami              # confirmar que es la cuenta correcta
npx wrangler deploy --dry-run    # tiene que listar env.USO y env.RATE_LIMITER_USO
npx wrangler deploy
```

Los secrets (`VAPID_PRIVATE_KEY`, `APP_SECRET`) ya están cargados en
producción y se conservan entre deploys, no hace falta volver a ponerlos.

Comprobar que la ruta nueva responde (no registra nada):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://horarios-push.lushibosca.workers.dev/api/hola \
  -H 'Origin: https://lushibosca.github.io' --data '{}'
# Esperado: 401 (falta el secreto). Un 404 significa que el deploy no tomó la ruta.
```

## 4. Apuntar la app a producción

1. `src/services/recordatorio-push.js`: `WORKER_URL = 'https://horarios-push.lushibosca.workers.dev'`.
2. `index.html`: en la CSP, `connect-src` con
   `https://horarios-push.lushibosca.workers.dev` en vez de la de `l-lus`.
3. Correr `npm run release` (sube `CACHE_NAME` en `sw.js` y `APP_VERSION`) y luego `npm test`,
   para que los dispositivos bajen los módulos nuevos.
4. Commit y push al repo que publica `lushibosca.github.io`.

## 5. Token para consultar las estadísticas

El token de testing no sirve: hay que crear uno en la cuenta de producción.

1. <https://dash.cloudflare.com/profile/api-tokens> → **Create Token** →
   **Create Custom Token**.
2. **Permissions:** `Account` → `Account Analytics` → `Read`.
3. **Account Resources:** `Include` → la cuenta de producción.
4. Crear y copiar el token (se muestra una sola vez). No guardarlo en el repo.

## 6. Ver las estadísticas

```bash
cd horarios-push
export CF_ACCOUNT_ID=<account id de producción>
export CF_API_TOKEN=<token de producción>
./scripts/estadisticas.sh        # últimos 30 días
./scripts/estadisticas.sh 7      # últimos 7 días
```

Muestra dispositivos y sesiones (totales y por día), PWA vs navegador, sistema y
navegador, y versión de la app. Hasta que alguien abra la versión nueva se ve
`(sin datos todavía)`.

## Para tener en cuenta

- Los datos se guardan unos **3 meses** en Analytics Engine.
- Los días del script están en **UTC**: lo de 21:00 a 23:59 (hora argentina) cae
  en el día siguiente.
- Los datos de testing y producción quedan separados, cada uno en su cuenta.
- Una "sesión" es como mucho un ping cada 30 minutos por dispositivo.
