import { STORAGE_KEYS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorPerfiles } from './gestor-perfiles.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';

// ====================================================================
//                     GIST SYNC MODULE
// ====================================================================
const GIST_FILENAME = 'horarios_backup.json';
const GIST_ID_REGEX = /^[a-f0-9]{20,40}$/i;
const RANGO_HORARIO_DEFAULT = { desde: '21:00', hasta: '00:00' };

// Tokens de GitHub (clásicos ghp_…, fine-grained github_pat_… y los viejos de 40 hex): solo letras, números y '_'
const TOKEN_REGEX = /^[A-Za-z0-9_]{20,255}$/;

function esGistIdValido(id) { return typeof id === 'string' && GIST_ID_REGEX.test(id.trim()); }
function esTokenValido(token) { return typeof token === 'string' && TOKEN_REGEX.test(token.trim()); }

function _conPerfil(fn) {
    const perfil = GestorPerfiles.obtenerDatosPerfil();
    if (perfil) { fn(perfil); GestorPerfiles.guardarPerfiles(); }
}

function getToken() { return Almacenamiento.getItem(STORAGE_KEYS.GIST_TOKEN, ''); }

function getGistId() { return GestorPerfiles.obtenerDatosPerfil()?.gistId || ''; }
function getLastSync() { return GestorPerfiles.obtenerDatosPerfil()?.gistLastSync || null; }
function getMergeBehavior() { return GestorPerfiles.obtenerDatosPerfil()?.gistMergeBehavior || 'replace'; }
function setMergeBehavior(valor) { _conPerfil(perfil => { perfil.gistMergeBehavior = valor; }); }

function getAutoSync() {
    const val = GestorPerfiles.obtenerDatosPerfil()?.gistAutoSync;
    if (val === 1 || val === 2) return val;
    if (val === true) return 1;
    return 0;
}
function setAutoSync(valor) { _conPerfil(perfil => { perfil.gistAutoSync = valor; }); }

function getRangoHorario() {
    const perfil = GestorPerfiles.obtenerDatosPerfil();
    return {
        desde: perfil?.gistRangoDesde || RANGO_HORARIO_DEFAULT.desde,
        hasta: perfil?.gistRangoHasta || RANGO_HORARIO_DEFAULT.hasta
    };
}
function setRangoHorario(desde, hasta) { _conPerfil(perfil => { perfil.gistRangoDesde = desde; perfil.gistRangoHasta = hasta; }); }

function _claveHoraActual() {
    return TiempoUtils.fechaLocalISOFull().slice(0, 13);
}

function _clavesSyncCount(tipo) {
    return { key: `gistSyncCount_${tipo}`, keyFecha: `gistSyncFecha_${tipo}` };
}

function getSyncCount(tipo) {
    const perfil = GestorPerfiles.obtenerDatosPerfil();
    const { key, keyFecha } = _clavesSyncCount(tipo);
    if (!perfil?.[keyFecha] || perfil[keyFecha] !== _claveHoraActual()) return 0;
    return perfil?.[key] || 0;
}

function marcarSync(tipo) {
    if (getSyncLimite(tipo) === 0) return;
    const { key, keyFecha } = _clavesSyncCount(tipo);
    _conPerfil(perfil => {
        const clave = _claveHoraActual();
        const esNuevaHora = perfil[keyFecha] !== clave;
        perfil[keyFecha] = clave;
        perfil[key] = esNuevaHora ? 1 : (perfil[key] || 0) + 1;
    });
}

function getSyncLimite(tipo) {
    const defValue = tipo === 'bajar' ? 2 : (tipo === 'subir' ? 1 : 2);
    return Almacenamiento.getNumber(STORAGE_KEYS.GIST_LIMITE(tipo), defValue);
}

function setSyncLimite(tipo, valor) {
    const anteriorLimite = getSyncLimite(tipo);
    Almacenamiento.setItem(STORAGE_KEYS.GIST_LIMITE(tipo), valor);
    if (anteriorLimite === 0 && valor > 0) {
        const { key, keyFecha } = _clavesSyncCount(tipo);
        _conPerfil(perfil => {
            perfil[key] = 0;
            perfil[keyFecha] = null;
        });
    }
}

function superaLimite(tipo) {
    const limite = getSyncLimite(tipo);
    if (limite === 0) return false;
    return getSyncCount(tipo) >= limite;
}

function dentroDelRangoHorario() {
    const { desde, hasta } = getRangoHorario();
    const horaActual = TiempoUtils.obtenerHoraActual();
    return desde <= hasta ? (horaActual >= desde && horaActual <= hasta) : (horaActual >= desde || horaActual <= hasta);
}

/** Guarda token y Gist ID. Un token con caracteres no válidos no se guarda (devuelve false). */
function saveCredentials(token, gistId) {
    if (token && !esTokenValido(token)) return false;
    if (token) Almacenamiento.setItem(STORAGE_KEYS.GIST_TOKEN, token.trim());
    else Almacenamiento.removeItem(STORAGE_KEYS.GIST_TOKEN);

    _conPerfil(perfil => {
        if (gistId && esGistIdValido(gistId)) perfil.gistId = gistId.trim();
        else if (gistId === '') delete perfil.gistId;
    });
    return true;
}

function saveLastSync(gistId) {
    const ahoraISO = new Date().toISOString();
    _conPerfil(perfil => {
        perfil.gistLastSync = ahoraISO;
        if (gistId && esGistIdValido(gistId)) perfil.gistId = gistId.trim();
    });
}

function formatLastSync(isoOrLegacy) {
    if (!isoOrLegacy) return null;
    const d = new Date(isoOrLegacy);
    return isNaN(d.getTime()) ? isoOrLegacy : d.toLocaleString('es-AR');
}

async function _gistFetch(url, options = {}) {
    const token = getToken();
    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...options.headers
        }
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || `Error ${response.status}`);
    return response.json();
}

/** Sube un respaldo ya armado (ImportarExportar.armarRespaldo) al Gist del perfil, o crea uno nuevo. Devuelve el id. */
async function subir(data) {
    const token = getToken();
    if (!token) throw new Error('Falta el token de GitHub');

    const gistId = getGistId();
    const gistIdValido = esGistIdValido(gistId);
    const url = gistIdValido ? `https://api.github.com/gists/${gistId}` : 'https://api.github.com/gists';
    const method = gistIdValido ? 'PATCH' : 'POST';

    const result = await _gistFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Horarios PWA - Backup automático', public: false, files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } })
    });
    saveLastSync(result.id);
    return result.id;
}

async function bajar() {
    const token = getToken();
    const gistId = getGistId();
    if (!token) throw new Error('Falta el token de GitHub');
    if (!gistId || !esGistIdValido(gistId)) throw new Error('Gist ID inválido — dejá el campo vacío y subí primero para crear uno');

    const respuesta = await _gistFetch(`https://api.github.com/gists/${gistId}`);
    const file = respuesta?.files?.[GIST_FILENAME];
    if (!file || typeof file.content !== 'string') throw new Error(`Archivo ${GIST_FILENAME} no encontrado en el Gist`);
    // La API corta el contenido de archivos de más de 1 MB (truncated): parsearlo daría un JSON roto
    if (file.truncated) throw new Error('El respaldo del Gist es demasiado grande para descargarlo');
    if (file.content.length > S.SECURITY_LIMITS.MAX_JSON_SIZE) throw new Error('El respaldo del Gist es demasiado grande');

    // La validación (estructura, hash e integridad) la hace ImportarExportar.prepararRespaldo, igual que con un archivo local
    const data = JSON.parse(file.content, S.reviverJSONSeguro);

    saveLastSync(gistId);
    return data;
}

export const SincronizacionGist = { getToken, getGistId, getLastSync, formatLastSync, getMergeBehavior, setMergeBehavior, getAutoSync, setAutoSync, getRangoHorario, setRangoHorario, RANGO_HORARIO_DEFAULT, getSyncCount, marcarSync, superaLimite, getSyncLimite, setSyncLimite, dentroDelRangoHorario, saveCredentials, esGistIdValido, esTokenValido, subir, bajar };
