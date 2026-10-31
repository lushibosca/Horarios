import { $ } from '../core/dom.js';
import { RecordatorioPush } from '../services/recordatorio-push.js';
import { UIBase } from './base.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { debounce } from './gestos.js';
import { mostrarToast } from './toast.js';

// ====================================================================
// UI NOTIFICATIONS MODULE (push y permisos de notificaciones)
// ====================================================================
const {
    _abrirModalConPadre, _cerrarModalConPadre, _crearToggleConfig, _setBtnActivo, _setBtnDisabled
} = UIBase;

function _actualizarDisponibilidadBotonesPush() {
    const habilitado = RecordatorioPush.getHabilitado();
    const usaBufferSemanal = RecordatorioPush.getUsarBufferSemanal();
    _setBtnDisabled('btn-toggle-push-buffer', !habilitado);
    _setBtnDisabled('btn-toggle-push-buffer-ultimo-dia', !habilitado || !usaBufferSemanal);
}

function actualizarEstadoBotonNotificaciones() {
    _setBtnActivo('btn-toggle-notification', RecordatorioPush.getHabilitado());
}

const _sincronizarPushHoyDebounced = debounce(() => GestionDatos.sincronizarPushHoy(), 400);

const { toggle: togglePushBuffer, actualizarEstado: actualizarEstadoBotonPushBuffer } =
    _crearToggleConfig({
        getVal: () => RecordatorioPush.getUsarBufferSemanal(),
        setVal: (v) => RecordatorioPush.setUsarBufferSemanal(v),
        btnId: 'btn-toggle-push-buffer',
        onAfterToggle: () => {
            actualizarEstadoBotonPushBufferUltimoDia();
            _actualizarDisponibilidadBotonesPush();
            _sincronizarPushHoyDebounced();
        },
    });

const { toggle: togglePushBufferUltimoDia, actualizarEstado: actualizarEstadoBotonPushBufferUltimoDia } =
    _crearToggleConfig({
        getVal: () => RecordatorioPush.getBufferSoloUltimoDia(),
        setVal: (v) => RecordatorioPush.setBufferSoloUltimoDia(v),
        btnId: 'btn-toggle-push-buffer-ultimo-dia',
        onAfterToggle: () => _sincronizarPushHoyDebounced(),
    });

const { toggle: togglePushHabilitado, actualizarEstado: actualizarEstadoBotonPushHabilitado } =
    _crearToggleConfig({
        getVal: () => RecordatorioPush.getHabilitado(),
        setVal: (v) => RecordatorioPush.setHabilitado(v),
        btnId: 'btn-toggle-push-habilitado',
        puedeActivar: () => RecordatorioPush.puedeHabilitarse(),
        onAfterToggle: () => {
            _actualizarDisponibilidadBotonesPush();
            actualizarEstadoBotonNotificaciones();
            _sincronizarPushHoyDebounced();
        },
    });

function actualizarSelectPushAnticipacion() {
    const select = $('config-push-anticipacion');
    if (select) select.value = String(RecordatorioPush.getAnticipacionMin());
}

function cambiarPushAnticipacion(minutos) {
    RecordatorioPush.setAnticipacionMin(minutos);
    _sincronizarPushHoyDebounced();
}

let _permisoNotifStatus = null;

async function _suscribirCambiosPermisoNotificaciones() {
    if (_permisoNotifStatus || !navigator.permissions?.query) return;
    try {
        _permisoNotifStatus = await navigator.permissions.query({ name: 'notifications' });
        _permisoNotifStatus.onchange = () => actualizarEstadoPermisoNotificaciones();
    } catch {
    }
}

function actualizarEstadoPermisoNotificaciones() {
    const el = $('push-permiso-estado');
    if (!el) return;
    el.innerHTML = '';

    if (!('Notification' in window)) return;

    const permiso = Notification.permission;
    let claseColor, texto;
    if (permiso === 'denied') {
        claseColor = 'negativo';
        texto = 'Permisos de notificaciones bloqueados en el navegador';
    } else if (!RecordatorioPush.getHabilitado() && !RecordatorioPush.puedeHabilitarse()) {
        claseColor = 'neutral';
        texto = 'Usá la app para activar tus notificaciones en este perfil';
    } else if (permiso === 'granted') {
        claseColor = 'positivo';
        texto = 'Permisos de notificaciones aceptados';
    } else {
        claseColor = 'neutral';
        texto = 'Todavía no se pidió permiso al navegador';
    }

    const punto = document.createElement('span');
    punto.className = `buffer-semanal-punto ${claseColor}`;
    const span = document.createElement('span');
    span.className = `buffer-semanal-texto ${claseColor}`;
    span.textContent = texto;
    span.insertBefore(punto, span.firstChild);
    el.appendChild(span);
}

async function enviarNotificacionPrueba() {
    const mensajes = {
        ok: ['Cerrá la app: la notificación llega en 10 segundos', 'info'],
        denegado: ['El permiso de notificaciones está bloqueado', 'error'],
        'no-soportado': ['Este navegador no admite notificaciones', 'error'],
    };
    const [texto, tipo] = mensajes[await RecordatorioPush.enviarNotificacionPrueba(10000)];
    mostrarToast(texto, tipo, 5000);
    actualizarEstadoPermisoNotificaciones();
}

function abrirModalNotificaciones() {
    _abrirModalConPadre('modal-notificaciones', () => {
        actualizarEstadoBotonPushHabilitado();
        actualizarEstadoBotonPushBuffer();
        actualizarEstadoBotonPushBufferUltimoDia();
        _actualizarDisponibilidadBotonesPush();
        actualizarEstadoBotonNotificaciones();
        actualizarSelectPushAnticipacion();
        actualizarEstadoPermisoNotificaciones();
    });
}

function cerrarModalNotificaciones() {
    _cerrarModalConPadre('modal-notificaciones');
}

function bindEventos() {
    $('btn-toggle-push-buffer')?.addEventListener('click', () => togglePushBuffer());
    $('btn-toggle-push-buffer-ultimo-dia')?.addEventListener('click', () => togglePushBufferUltimoDia());
    $('btn-toggle-push-habilitado')?.addEventListener('click', () => togglePushHabilitado());
    $('config-push-anticipacion')?.addEventListener('change', (e) => cambiarPushAnticipacion(/** @type {HTMLInputElement} */ (e.target).value));
    $('btn-probar-notificacion')?.addEventListener('click', () => enviarNotificacionPrueba());
    $('btn-toggle-notification')?.addEventListener('click', () => abrirModalNotificaciones());
    document.querySelector('#modal-notificaciones .btn-cancel')?.addEventListener('click', () => cerrarModalNotificaciones());
}

export const Notificaciones = {
    actualizarEstadoBotonNotificaciones, actualizarEstadoBotonPushBuffer,
    actualizarEstadoBotonPushHabilitado, actualizarSelectPushAnticipacion,
    _suscribirCambiosPermisoNotificaciones, abrirModalNotificaciones, cerrarModalNotificaciones,
    bindEventos
};
