import { APP_STORAGE_PREFIX, STORAGE_KEYS } from './constantes.js';
import { SeguridadYUtils } from './seguridad.js';

// ====================================================================
// STORAGE HELPER MODULE
// ====================================================================
/** @type {{ mostrarToast: (mensaje: string, tipo?: string) => void }} */
let notify = { mostrarToast: () => { } };
let _profileKeyResolver = (key) => `${key}_default`;

/** @type {Set<string>} */
const CLAVES_ESTATICAS_HORARIOS = new Set(
    Object.values(STORAGE_KEYS).filter(v => typeof v === 'string')
);

const BASES_POR_PERFIL_HORARIOS = [
    STORAGE_KEYS.IGNORAR_TF,
    STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO,
    STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO,
    STORAGE_KEYS.FONDO_CARD,
    STORAGE_KEYS.ORDEN_CARDS,
    STORAGE_KEYS.HISTORY,
    STORAGE_KEYS.BIENVENIDA_VISTA,
    STORAGE_KEYS.FERIADOS_PROCESADOS,
    STORAGE_KEYS.PUSH_ANTICIPACION_MIN,
    STORAGE_KEYS.PUSH_USAR_BUFFER_SEMANAL,
    STORAGE_KEYS.PUSH_BUFFER_SOLO_ULTIMO_DIA,
    STORAGE_KEYS.PUSH_HABILITADO,
    STORAGE_KEYS.PUSH_INFO_ACTIVA,
    STORAGE_KEYS.PUSH_AVISOS_RESTANTES,
    'breakStartTime',
    'cardVisible_registrar',
    'cardVisible_estadisticas',
    'cardVisible_historico'
];

const PATRONES_DINAMICOS_HORARIOS = [
    /^gistSyncLimite_(subir|bajar)$/,
    /^mes-\d{4}-\d{1,2}-expandido$/,
    /^anio-\d{4}-expandido$/,
    /^cardVisible_(registrar|estadisticas|historico)(_(default|perfil_[a-zA-Z0-9_-]+))?$/,
    new RegExp(`^(${BASES_POR_PERFIL_HORARIOS.join('|')})_(default|perfil_[a-zA-Z0-9_-]+)$`)
];

function configurarNotificaciones(handlers) { notify = { ...notify, ...handlers }; }
function setProfileKeyResolver(fn) {
    if (typeof fn === 'function') _profileKeyResolver = fn;
}

function _getKey(key, useProfile) {
    const baseKey = useProfile ? _profileKeyResolver(key) : key;
    return baseKey.startsWith(APP_STORAGE_PREFIX) ? baseKey : `${APP_STORAGE_PREFIX}${baseKey}`;
}

/** @param {any} [idsPerfilesExtra] */
function esClaveLegadaHorarios(key, idsPerfilesExtra = null) {
    if (!key || typeof key !== 'string' || key.startsWith(APP_STORAGE_PREFIX)) return false;
    if (CLAVES_ESTATICAS_HORARIOS.has(key)) return true;
    if (PATRONES_DINAMICOS_HORARIOS.some(rx => rx.test(key))) return true;
    if (idsPerfilesExtra && idsPerfilesExtra.size > 0) {
        for (const base of BASES_POR_PERFIL_HORARIOS) {
            if (key.startsWith(`${base}_`)) {
                const pid = key.slice(base.length + 1);
                if (idsPerfilesExtra.has(pid)) return true;
            }
        }
    }
    return false;
}

function _migrarClaveIndividual(legacyKey) {
    const newKey = `${APP_STORAGE_PREFIX}${legacyKey}`;
    const legacyVal = localStorage.getItem(legacyKey);
    if (legacyVal === null) return false;

    if (localStorage.getItem(newKey) !== null) {
        localStorage.removeItem(legacyKey);
        return true;
    }

    try {
        localStorage.setItem(newKey, legacyVal);
        localStorage.removeItem(legacyKey);
        return true;
    } catch (e) {
        // Si falló por cuota al duplicar temporalmente, liberar primero la clave vieja y reintentar
        try {
            localStorage.removeItem(legacyKey);
            localStorage.setItem(newKey, legacyVal);
            return true;
        } catch (errRestore) {
            try { localStorage.setItem(legacyKey, legacyVal); } catch (_) { }
            return false;
        }
    }
}

function migrarClavesLegadas() {
    if (typeof localStorage === 'undefined') return 0;
    try {
        const idsPerfiles = new Set(['default']);
        const rawPerfiles = localStorage.getItem(STORAGE_KEYS.PERFILES) ?? localStorage.getItem(`${APP_STORAGE_PREFIX}${STORAGE_KEYS.PERFILES}`);
        if (rawPerfiles) {
            try {
                const parsed = JSON.parse(rawPerfiles, SeguridadYUtils.reviverJSONSeguro);
                if (parsed && typeof parsed === 'object') {
                    Object.keys(parsed).forEach(id => idsPerfiles.add(id));
                }
            } catch (_) { }
        }

        const candidatas = new Set(CLAVES_ESTATICAS_HORARIOS);
        ['subir', 'bajar'].forEach(t => candidatas.add(STORAGE_KEYS.GIST_LIMITE(t)));
        ['registrar', 'estadisticas', 'historico'].forEach(c => candidatas.add(STORAGE_KEYS.CARD_VISIBLE(c)));
        idsPerfiles.forEach(pid => {
            BASES_POR_PERFIL_HORARIOS.forEach(base => candidatas.add(`${base}_${pid}`));
        });

        if (typeof localStorage.length === 'number' && typeof localStorage.key === 'function') {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k) candidatas.add(k);
            }
        }
        try {
            Object.keys(localStorage).forEach(k => candidatas.add(k));
        } catch (_) { }

        let migradas = 0;
        for (const key of candidatas) {
            if (esClaveLegadaHorarios(key, idsPerfiles) && _migrarClaveIndividual(key)) {
                migradas++;
            }
        }
        return migradas;
    } catch (e) {
        console.error('Error durante migración de claves de localStorage:', e);
        return 0;
    }
}

migrarClavesLegadas();

function setItem(key, value, useProfile = false) {
    try {
        const finalKey = _getKey(key, useProfile);
        const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
        localStorage.setItem(finalKey, valueToStore);
        return true;
    } catch (e) {
        console.error(`Error guardando en Storage (${key}):`, e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            notify.mostrarToast('Almacenamiento lleno, no se pudo guardar', 'error');
        }
        return false;
    }
}

/** @param {any} [defaultValue] */
function getItem(key, defaultValue = null, useProfile = false) {
    try {
        const value = localStorage.getItem(_getKey(key, useProfile));
        return value !== null ? value : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

function getBoolean(key, defaultValue = false, useProfile = false) {
    const val = getItem(key, null, useProfile);
    if (val === null) return defaultValue;
    return val === 'true';
}

function getNumber(key, defaultValue = 0, useProfile = false) {
    const val = getItem(key, null, useProfile);
    if (val === null) return defaultValue;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultValue : parsed;
}

/** @param {any} [defaultValue] */
function getObject(key, defaultValue = null, useProfile = false) {
    const val = getItem(key, null, useProfile);
    if (!val) return defaultValue;
    try {
        return JSON.parse(val, SeguridadYUtils.reviverJSONSeguro);
    } catch (e) {
        return defaultValue;
    }
}

function removeItem(key, useProfile = false) {
    try {
        localStorage.removeItem(_getKey(key, useProfile));
    } catch (e) { }
}

export const Almacenamiento = {
    APP_STORAGE_PREFIX,
    setItem,
    getItem,
    getBoolean,
    getNumber,
    getObject,
    removeItem,
    configurarNotificaciones,
    setProfileKeyResolver,
    esClaveLegadaHorarios,
    migrarClavesLegadas,
    _getKey
};
