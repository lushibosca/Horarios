// Sube la versión de la app: APP_VERSION (src/core/constantes.js) y CACHE_NAME (sw.js).
// Formato: vAAMMDD (versión visible) y vAAMMDD.HHMM (caché del Service Worker).
// Uso: npm run release   (después: npm test, que valida que ambas coincidan y que sw.js liste todos los módulos)
import fs from 'node:fs';

const pad = n => String(n).padStart(2, '0');
const ahora = new Date();
const fecha = `${pad(ahora.getFullYear() % 100)}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}`;
const hora = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}`;
const version = `v${fecha}`;
const cache = `${version}.${hora}`;

function reemplazar(archivo, regex, nuevo) {
    const original = fs.readFileSync(archivo, 'utf8');
    if (!regex.test(original)) throw new Error(`${archivo}: no se encontró el patrón ${regex}`);
    fs.writeFileSync(archivo, original.replace(regex, nuevo));
}

reemplazar('src/core/constantes.js', /(APP_VERSION\s*=\s*')[^']+(')/, `$1${version}$2`);
reemplazar('sw.js', /(CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\})[^`]+(-cache`)/, `$1${cache}$2`);

console.log(`APP_VERSION = ${version}\nCACHE_NAME  = horarios-${cache}-cache`);
