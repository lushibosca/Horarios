import { STORAGE_KEYS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { SeguridadYUtils } from '../core/seguridad.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorPerfiles } from './gestor-perfiles.js';
import { TiposRegistro } from './tipos-registro.js';
import { EstadoApp } from './estado-app.js';

// ====================================================================
// PUSH REMINDER MODULE — notification via Cloudflare
// ====================================================================
const WORKER_URL = 'https://horarios-push.lushibosca.workers.dev';
const VAPID_PUBLIC_KEY = 'BMU-iLslFVrTxUKMHRUn8r_CtyCLX41ppVTUgdATAdPYE8ayJ0U_ew6d50CmvghkIdv34fGuXvf-KP5W62rs3ms';
const APP_SECRET = '487e4c492604b653b56e9ba234cb9eda007fc149c66650e9'; // que mira bobo, anda paya
const MARGEN_CRON_MS = 60 * 1000;
const AVISO_FALLO_CADA_MS = 10 * 60 * 1000;
const REINTENTOS_MAX = 3;
const REINTENTO_ESPERA_MS = 60 * 1000;
let _generacionProgramacion = 0;
let _generacionCancelada = 0;

/** @type {{ mostrarToast: (mensaje: string, tipo?: string, duracion?: number, detalle?: string|null) => void }} */
let notify = { mostrarToast: () => { } };
function configurarNotificaciones(handlers) { notify = { ...notify, ...handlers }; }

const _ultimoAvisoFallo = {};
function _avisarFallo(accion, status) {
    const motivo = status == null
        ? (navigator.onLine === false ? 'sin conexión' : 'no se pudo contactar al servicio')
        : status === 409 ? 'este dispositivo está vinculado a otra instalación'
            : status === 429 ? 'el servicio está recibiendo demasiados pedidos'
                : 'el servicio no está disponible ahora';
    const clave = `${accion}|${motivo}`;
    const ahora = Date.now();
    if (ahora - (_ultimoAvisoFallo[clave] || 0) < AVISO_FALLO_CADA_MS) return;
    _ultimoAvisoFallo[clave] = ahora;
    const mensaje = accion === 'cancelar'
        ? 'No se pudo cancelar el aviso de hoy (puede que igual te llegue)'
        : 'No se pudo programar el aviso de fin de jornada';
    notify.mostrarToast(mensaje, 'warning', 5000, motivo);
}

function _headersWorker() {
    const headers = { 'Content-Type': 'application/json' };
    if (APP_SECRET && !APP_SECRET.startsWith('PEGA_ACA')) headers['X-App-Secret'] = APP_SECRET;
    return headers;
}

function _postWorker(path, payload, keepalive = false) {
    return fetch(`${WORKER_URL}${path}`, {
        method: 'POST',
        headers: _headersWorker(),
        body: JSON.stringify(payload),
        keepalive: !!keepalive
    });
}

function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from([...atob(base64)].map(c => c.charCodeAt(0)));
}

let _idInstalacionFallback = null;

function _idInstalacion() {
    const KEY = STORAGE_KEYS.PUSH_INSTALL_ID;
    const existente = Almacenamiento.getItem(KEY, null);
    if (existente) return existente;

    const nuevo = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (Almacenamiento.setItem(KEY, nuevo)) return nuevo;
    if (!_idInstalacionFallback) {
        _idInstalacionFallback = crypto.randomUUID
            ? crypto.randomUUID()
            : `sin-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return _idInstalacionFallback;
}

let _ownerTokenFallback = null;

function _generarOwnerToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function _ownerToken() {
    const KEY = STORAGE_KEYS.PUSH_OWNER_TOKEN;
    const existente = Almacenamiento.getItem(KEY, null);
    if (existente && /^[a-f0-9]{64}$/.test(existente)) return existente;

    const nuevo = _generarOwnerToken();
    if (Almacenamiento.setItem(KEY, nuevo)) return nuevo;
    if (!_ownerTokenFallback) _ownerTokenFallback = _generarOwnerToken();
    return _ownerTokenFallback;
}

function _perfilActivo() {
    return (GestorPerfiles ? GestorPerfiles.obtenerPerfilActual() : null) || 'default';
}

function _claveRecordatorio(fechaISO, perfilId) {
    return `${_idInstalacion()}:${perfilId || _perfilActivo()}:${fechaISO}`;
}

function _getLegacyOPerfil(key, defaultValue, parseFn) {
    const val = Almacenamiento.getItem(key, null, true);
    if (val !== null) return parseFn ? parseFn(val) : val;
    const legacyVal = Almacenamiento.getItem(key, null, false);
    if (legacyVal !== null) {
        const parsed = parseFn ? parseFn(legacyVal) : legacyVal;
        Almacenamiento.setItem(key, parsed, true);
        Almacenamiento.removeItem(key, false);
        return parsed;
    }
    return defaultValue;
}

function getAnticipacionMin() {
    return _getLegacyOPerfil(STORAGE_KEYS.PUSH_ANTICIPACION_MIN, 0, v => {
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
    });
}
function setAnticipacionMin(minutos) {
    const n = Number(minutos);
    const seguro = Number.isFinite(n) ? Math.min(60, Math.max(0, n)) : 0;
    Almacenamiento.setItem(STORAGE_KEYS.PUSH_ANTICIPACION_MIN, seguro, true);
}
function getUsarBufferSemanal() {
    return _getLegacyOPerfil(STORAGE_KEYS.PUSH_USAR_BUFFER_SEMANAL, false, v => v === 'true');
}
function setUsarBufferSemanal(valor) {
    Almacenamiento.setItem(STORAGE_KEYS.PUSH_USAR_BUFFER_SEMANAL, !!valor, true);
}
function getBufferSoloUltimoDia() {
    return _getLegacyOPerfil(STORAGE_KEYS.PUSH_BUFFER_SOLO_ULTIMO_DIA, false, v => v === 'true');
}
function setBufferSoloUltimoDia(valor) {
    Almacenamiento.setItem(STORAGE_KEYS.PUSH_BUFFER_SOLO_ULTIMO_DIA, !!valor, true);
}
function getHabilitado() {
    return _getLegacyOPerfil(STORAGE_KEYS.PUSH_HABILITADO, false, v => v === 'true');
}
function setHabilitado(valor) {
    Almacenamiento.setItem(STORAGE_KEYS.PUSH_HABILITADO, !!valor, true);
}
const UMBRAL_REGISTROS_ACTIVACION = 15;
const AVISOS_INICIALES = 3;
function _soportaPush() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}
function puedeHabilitarse() {
    if (!_soportaPush()) return false;
    if (Notification.permission === 'denied') return false;
    const registros = EstadoApp.registros() || [];
    const regulares = registros.filter(r => !TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida));
    return regulares.length > UMBRAL_REGISTROS_ACTIVACION;
}
function _getAvisosRestantes() {
    return Almacenamiento.getNumber(STORAGE_KEYS.PUSH_AVISOS_RESTANTES, AVISOS_INICIALES, true);
}
function avisoPendiente() {
    const hayEleccion = [true, false].some(porPerfil => Almacenamiento.getItem(STORAGE_KEYS.PUSH_HABILITADO, null, porPerfil) !== null);
    return !hayEleccion && puedeHabilitarse() && _getAvisosRestantes() > 0;
}
function consumirAviso() {
    Almacenamiento.setItem(STORAGE_KEYS.PUSH_AVISOS_RESTANTES, Math.max(0, _getAvisosRestantes() - 1), true);
}

function _guardarInfoActiva(fechaISO, targetTimeMs) {
    Almacenamiento.setItem(STORAGE_KEYS.PUSH_INFO_ACTIVA, JSON.stringify({ fechaISO, targetTimeMs }), true);
}
function _borrarInfoActiva(perfilId) {
    try {
        if (perfilId) {
            Almacenamiento.removeItem(`${STORAGE_KEYS.PUSH_INFO_ACTIVA}_${perfilId}`);
        } else {
            Almacenamiento.removeItem(STORAGE_KEYS.PUSH_INFO_ACTIVA, true);
            Almacenamiento.removeItem(STORAGE_KEYS.PUSH_INFO_ACTIVA, false);
        }
    } catch { /* noop */ }
}
/** Vigente si es de hoy, o de ayer con el aviso todavía pendiente (jornada que cruza la medianoche). */
function _infoVigente(info) {
    const hoy = TiempoUtils.obtenerFechaHoy();
    if (info.fechaISO === hoy) return true;
    const ayer = TiempoUtils.parsearFechaLocal(hoy);
    ayer.setDate(ayer.getDate() - 1);
    return info.fechaISO === TiempoUtils.formatearFechaLocal(ayer) && Number(info.targetTimeMs) + MARGEN_CRON_MS >= Date.now();
}

function obtenerInfoActiva(perfilId) {
    const raw = perfilId
        ? Almacenamiento.getItem(`${STORAGE_KEYS.PUSH_INFO_ACTIVA}_${perfilId}`)
        : (Almacenamiento.getItem(STORAGE_KEYS.PUSH_INFO_ACTIVA, null, true)
            ?? Almacenamiento.getItem(STORAGE_KEYS.PUSH_INFO_ACTIVA, null, false));
    if (!raw) return null;
    try {
        const info = JSON.parse(raw, SeguridadYUtils.reviverJSONSeguro);
        if (!info || !_infoVigente(info)) return null;
        return info;
    } catch {
        return null;
    }
}
async function _asegurarSuscripcion() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith('PEGA_ACA')) return null;

    try {
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') return null;

        const reg = await navigator.serviceWorker.ready;
        const existente = await reg.pushManager.getSubscription();
        if (existente) return existente;

        return await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
    } catch (err) {
        console.error('No se pudo suscribir a push:', err);
        return null;
    }
}

/**
 * Momento (ms) en que corresponde avisar. La entrada se ubica en `fechaISO` (no en "hoy"),
 * así una jornada abierta ayer que cruza la medianoche se programa bien.
 */
function _calcularTarget(fechaISO, entradaHHMM, objetivoHoras, bufferSemanalHoras = 0, minutosTiempoFuera = 0) {
    if (!fechaISO || !entradaHHMM || !objetivoHoras) return null;
    const [h, m] = entradaHHMM.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;

    let objetivoAjustado = objetivoHoras;
    if (getUsarBufferSemanal() && Number.isFinite(bufferSemanalHoras)) {
        objetivoAjustado = Math.max(0, objetivoHoras - bufferSemanalHoras);
    }
    const anticipacionMin = getAnticipacionMin();
    const target = TiempoUtils.parsearFechaLocal(fechaISO);
    target.setHours(h, m, 0, 0);
    const extraMs = Number.isFinite(minutosTiempoFuera) ? minutosTiempoFuera * 60 * 1000 : 0;
    target.setTime(target.getTime() + objetivoAjustado * 60 * 60 * 1000 + extraMs - anticipacionMin * 60 * 1000 - MARGEN_CRON_MS);
    return target.getTime();
}

function _construirMensajeNotificacion(anticipacionMin, bufferSemanalHoras) {
    const usaBuffer = getUsarBufferSemanal() && Number.isFinite(bufferSemanalHoras) && Math.abs(bufferSemanalHoras * 60) >= 1;
    if (!usaBuffer) {
        return anticipacionMin > 0
            ? `Te faltan ${anticipacionMin} min para cumplir tu horario de hoy`
            : 'Se cumplió tu horario de hoy. ¡Podés irte!';
    }

    const tiempoTexto = TiempoUtils.horasATexto(Math.abs(bufferSemanalHoras));
    const debeTiempo = bufferSemanalHoras < 0;

    if (debeTiempo) {
        return anticipacionMin > 0
            ? `En ${anticipacionMin} min podés irte (incluye recuperar ${tiempoTexto} faltantes)`
            : `Podés irte. Ya recuperaste los ${tiempoTexto} faltantes de la semana`;
    } else {
        return anticipacionMin > 0
            ? `En ${anticipacionMin} min podés irte (salís ${tiempoTexto} antes por tiempo extra)`
            : `Podés irte ${tiempoTexto} antes por tu tiempo extra semanal`;
    }
}

async function programarFinDeJornada(fechaISO, entradaHHMM, objetivoHoras, bufferSemanalHoras = 0, minutosTiempoFuera = 0) {
    if (!getHabilitado()) return;
    const targetMs = _calcularTarget(fechaISO, entradaHHMM, objetivoHoras, bufferSemanalHoras, minutosTiempoFuera);
    if (targetMs == null) return;

    const generacion = ++_generacionProgramacion;
    const sub = await _asegurarSuscripcion();
    if (!sub || generacion !== _generacionProgramacion || !getHabilitado()) return;

    const anticipacionMin = getAnticipacionMin();
    const mensaje = _construirMensajeNotificacion(anticipacionMin, bufferSemanalHoras);

    const payload = {
        id: _claveRecordatorio(fechaISO),
        ownerToken: _ownerToken(),
        subscription: sub.toJSON(),
        targetTime: targetMs,
        title: 'Horarios',
        message: mensaje
    };

    for (let intento = 0; ; intento++) {
        let status = null;
        try {
            const res = await _postWorker('/api/schedule', payload);
            if (res.ok) {
                if (generacion === _generacionProgramacion) {
                    _guardarInfoActiva(fechaISO, targetMs);
                } else if (_generacionCancelada > generacion && _generacionCancelada === _generacionProgramacion) {
                    // Se canceló mientras este schedule estaba en vuelo: el cancel pudo llegar antes
                    _postWorker('/api/cancel', { id: payload.id, ownerToken: payload.ownerToken }, true).catch(() => { /* noop */ });
                }
                return;
            }
            status = res.status;
        } catch (err) {
            console.error('No se pudo programar el recordatorio:', err);
        }

        const reintentable = status == null || status === 429 || status >= 500;
        if (!reintentable || intento >= REINTENTOS_MAX) {
            _avisarFallo('programar', status);
            return;
        }
        await TiempoUtils.esperar(REINTENTO_ESPERA_MS);
        if (generacion !== _generacionProgramacion || !getHabilitado() || Date.now() >= targetMs) return;
    }
}

function limpiarNotificacionVisible() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
            if (reg && typeof reg.getNotifications === 'function') {
                reg.getNotifications({ tag: 'horarios-recordatorio' })
                    .then(notifs => notifs.forEach(n => n.close()))
                    .catch(() => { /* noop */ });
            }
        }).catch(() => { /* noop */ });
    }
}

function cancelarFinDeJornada(fechaISO, perfilId) {
    if (!fechaISO) return;
    const esPerfilActivo = !perfilId || perfilId === _perfilActivo();
    if (esPerfilActivo) limpiarNotificacionVisible();

    // "Jornada vigente": la de hoy o la de ayer que sigue programada (cruce de medianoche)
    const infoVigente = obtenerInfoActiva(perfilId);
    const esHoy = fechaISO === TiempoUtils.obtenerFechaHoy() || infoVigente?.fechaISO === fechaISO;
    if (esHoy && esPerfilActivo) _generacionCancelada = ++_generacionProgramacion;
    const activa = esHoy ? infoVigente : null;
    if (esHoy) _borrarInfoActiva(perfilId);

    // Sin info local igual se cancela: el Worker pudo guardar el aviso aunque la
    // respuesta del schedule nunca se procesó (app cerrada o congelada al fichar)
    if (!activa && !getHabilitado()) {
        return;
    }

    if (activa?.targetTimeMs && (Date.now() > activa.targetTimeMs + MARGEN_CRON_MS)) {
        return;
    }
    if (!esHoy && fechaISO < TiempoUtils.obtenerFechaHoy()) {
        return;
    }

    _postWorker('/api/cancel', { id: _claveRecordatorio(fechaISO, perfilId), ownerToken: _ownerToken() }, true)
        .then(res => { if (!res.ok && activa) _avisarFallo('cancelar', res.status); })
        .catch(err => {
            console.error('No se pudo cancelar el recordatorio:', err);
            if (activa) _avisarFallo('cancelar', null);
        });
}

function restablecer() {
    cancelarFinDeJornada(TiempoUtils.obtenerFechaHoy());
    [
        STORAGE_KEYS.PUSH_HABILITADO,
        STORAGE_KEYS.PUSH_ANTICIPACION_MIN,
        STORAGE_KEYS.PUSH_USAR_BUFFER_SEMANAL,
        STORAGE_KEYS.PUSH_BUFFER_SOLO_ULTIMO_DIA,
        STORAGE_KEYS.PUSH_INFO_ACTIVA
    ].forEach(k => {
        Almacenamiento.removeItem(k, true);
        Almacenamiento.removeItem(k, false);
    });
}

const USO_INTERVALO_MS = 30 * 60 * 1000;

function _idEstadisticas() {
    const KEY = STORAGE_KEYS.STATS_ID;
    const existente = Almacenamiento.getItem(KEY, null);
    if (existente) return existente;
    const nuevo = crypto.randomUUID ? crypto.randomUUID() : null;
    if (nuevo) Almacenamiento.setItem(KEY, nuevo);
    return nuevo;
}

async function _versionApp() {
    try {
        const claves = await caches.keys();
        return claves.find(k => k.startsWith('horarios-')) || 'desconocida';
    } catch {
        return 'desconocida';
    }
}

/**
 * Pide al Service Worker una notificación de prueba (la misma que usa el push real).
 * @param {number} [demoraMs] espera antes de mostrarla, para poder cerrar la app
 * @returns {Promise<'ok'|'denegado'|'no-soportado'>}
 */
async function enviarNotificacionPrueba(demoraMs = 10000) {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'no-soportado';
    if (Notification.permission === 'denied') return 'denegado';
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return 'denegado';
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return 'no-soportado';
    reg.active.postMessage({ tipo: 'notificacion-prueba', demoraMs });
    return 'ok';
}

async function registrarUso() {
    if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
    if (!Almacenamiento.getBoolean(STORAGE_KEYS.STATS_HABILITADO, true)) return;
    const KEY = STORAGE_KEYS.STATS_ULTIMO_PING;
    const ahora = Date.now();
    if (ahora - Number(Almacenamiento.getItem(KEY, 0)) < USO_INTERVALO_MS) return;
    const id = _idEstadisticas();
    if (!id) return;
    Almacenamiento.setItem(KEY, String(ahora));
    const pwa = window.matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (window.navigator).standalone === true;
    try {
        await _postWorker('/api/hola', { id, modo: pwa ? 'pwa' : 'navegador', version: await _versionApp() });
    } catch { /* sin estadística esta vez, no afecta a la app */ }
}

export const RecordatorioPush = {
    configurarNotificaciones, registrarUso, enviarNotificacionPrueba,
    programarFinDeJornada, cancelarFinDeJornada, limpiarNotificacionVisible,
    getAnticipacionMin, setAnticipacionMin, setBufferSoloUltimoDia,
    getUsarBufferSemanal, setUsarBufferSemanal, getHabilitado, setHabilitado, puedeHabilitarse, avisoPendiente, consumirAviso,
    getBufferSoloUltimoDia, calcularTarget: _calcularTarget,
    targetProgramadoParaHoy: () => obtenerInfoActiva()?.targetTimeMs ?? null,
    fechaProgramadaActiva: () => obtenerInfoActiva()?.fechaISO ?? null,
    restablecer,
};
