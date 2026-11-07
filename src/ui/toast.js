import { $ } from '../core/dom.js';
import { TOAST_MS } from '../core/constantes.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { Animaciones } from './animaciones.js';
import { registrarSwipe } from './gestos.js';

const { _esperarAnim } = Animaciones;

// ====================================================================
// TOAST — cola de avisos
// ====================================================================

let toastTimeout = null;
let _toastQueue = [];
let _toastRunning = false;
let _toastAccionActual = null;
const MAX_TOAST_QUEUE = 4;

// Toast con barra de progreso (p. ej. descarga de una actualización): entra en la cola como cualquier otro y se queda en pantalla hasta que
// termina (tocarlo o deslizarlo no lo cierra); los toasts que lleguen mientras tanto esperan su turno detrás. Si algo se cuelga, se retira solo pasado un tiempo.
const PROGRESO_MAX_MS = 45000;
let _timerProgreso = null;
/** @type {{ mensaje: string, porcentaje: number | null } | null} */
let _progreso = null;
let _progresoVisible = false;

/** @param {string} mensaje @param {string} [tipo] @param {number} [duracion] @param {any} [detalle] @param {any} [accion] */
export function mostrarToast(mensaje, tipo = 'info', duracion = TOAST_MS.NORMAL, detalle = null, accion = null) {
    const texto = detalle ? `${mensaje}, ${detalle}` : mensaje;
    const textoLimpio = S.limpiarTexto(texto, 200, { saltos: true });
    const ultimo = _toastQueue[_toastQueue.length - 1];
    const actual = _toastRunning ? $('toast')?.textContent : null;
    if ((ultimo && ultimo.mensaje === textoLimpio) || actual === textoLimpio) return;
    _toastQueue.push({ mensaje: textoLimpio, tipo, duracionBase: duracion, accion });
    if (_toastQueue.length > MAX_TOAST_QUEUE) {
        _toastQueue.splice(0, _toastQueue.length - MAX_TOAST_QUEUE);
    }
    if (!_toastRunning) _procesarToastQueue();
}

function _procesarToastQueue() {
    if (_toastQueue.length === 0) {
        _toastRunning = false;
        _toastAccionActual = null;
        if (_progreso) _mostrarProgreso();
        return;
    }

    _toastRunning = true;
    const actual = _toastQueue.shift();
    _toastAccionActual = actual.accion || null;
    const toast = $('toast');
    toast.classList.remove('show');
    toast.textContent = actual.mensaje;
    toast.className = `toast ${actual.tipo}`;
    toast.classList.toggle('toast-accionable', !!actual.accion);
    let duracionFinal = actual.duracionBase || 3000;
    if (_toastQueue.length >= 1) {
        duracionFinal = Math.floor(duracionFinal / 2);
    }

    setTimeout(() => {
        toast.classList.add('show');
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            toastTimeout = null;
            _esperarAnim().then(() => _procesarToastQueue());
        }, duracionFinal);
    }, 10);
}

function _pintarProgreso() {
    const toast = $('toast');
    if (!toast || !_progreso) return;
    const texto = toast.querySelector('.toast-texto');
    const barra = /** @type {HTMLProgressElement | null} */ (/** @type {unknown} */ (toast.querySelector('.toast-progreso')));
    const { mensaje, porcentaje } = _progreso;
    if (texto) texto.textContent = porcentaje === null ? mensaje : `${mensaje} ${porcentaje} %`;
    if (barra) { if (porcentaje === null) barra.removeAttribute('value'); else barra.value = porcentaje; }
}

function _mostrarProgreso() {
    const toast = $('toast');
    if (!toast || !_progreso) return;
    _toastRunning = true;
    _progresoVisible = true;
    _toastAccionActual = null;
    toast.className = 'toast info toast-con-progreso';
    toast.replaceChildren();
    const texto = document.createElement('span');
    texto.className = 'toast-texto';
    const barra = document.createElement('progress');
    barra.className = 'toast-progreso';
    barra.max = 100;
    toast.append(texto, barra);
    _pintarProgreso();
    requestAnimationFrame(() => { if (_progresoVisible) toast.classList.add('show'); });
    // seguro contra una descarga que nunca termina: no deja la cola bloqueada
    clearTimeout(_timerProgreso);
    _timerProgreso = setTimeout(_descartarProgreso, PROGRESO_MAX_MS);
}

function _descartarProgreso() {
    if (!_progresoVisible) return;
    _progreso = null;
    _ocultarProgreso();
    _esperarAnim().then(() => _procesarToastQueue());
}

function _ocultarProgreso() {
    clearTimeout(_timerProgreso);
    _progresoVisible = false;
    $('toast')?.classList.remove('show');
}

/** Muestra un toast con barra de progreso (indeterminada hasta que se informe un porcentaje). @param {string} mensaje */
export function iniciarToastProgreso(mensaje) {
    _progreso = { mensaje: S.limpiarTexto(mensaje, 200, { saltos: true }), porcentaje: null };
    if (!_toastRunning) _mostrarProgreso();
}

/** @param {number} porcentaje entero de 0 a 100 */
export function actualizarToastProgreso(porcentaje) {
    if (!_progreso) return;   // ya terminó o la persona lo cerró
    _progreso.porcentaje = porcentaje;
    if (_progresoVisible) _pintarProgreso();
}

/** Retira el toast de progreso (si estaba a la vista). Lo que siga se muestra con `mostrarToast`. */
export function finalizarToastProgreso() {
    _progreso = null;
    if (!_progresoVisible) return;
    _ocultarProgreso();
    _esperarAnim().then(() => _procesarToastQueue());
}

export function _cerrarToastActual() {
    // el toast de progreso (descarga de una actualización) no se cierra al tocarlo ni al deslizarlo: se retira solo al terminar
    if (_progresoVisible) return;
    if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }
    const toast = $('toast');
    if (!toast || !toast.classList.contains('show')) return;
    toast.classList.remove('show');
    _esperarAnim().then(() => _procesarToastQueue());
}

export function _habilitarCierreToast() {
    const toast = $('toast');
    if (!toast || toast.dataset.cierreInit) return;
    toast.dataset.cierreInit = '1';
    toast.addEventListener('click', () => {
        const accion = _toastAccionActual;
        _cerrarToastActual();
        if (accion) accion();
    });
    registrarSwipe(toast, () => _cerrarToastActual(), { minX: 40 });
}
