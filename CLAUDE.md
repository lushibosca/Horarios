# Directivas del proyecto

- Después de cada cambio en el código, estilos o HTML, ejecutar `npm run release` (sube `APP_VERSION` y `CACHE_NAME` del Service Worker para invalidar la caché) y luego `npm run typecheck` y `npm test`. El workflow de GitHub (`.github/workflows/tests.yml`) corre también `npm run typecheck`, y ahí fallaron errores de tipos que `npm test` no detecta.
- Si `npm run typecheck` y `npm test` pasan sin errores, hacer commit automáticamente (sin esperar a que se pida) con un mensaje descriptivo en español, incluyendo `sw.js` con la versión nueva. No hacer push.
