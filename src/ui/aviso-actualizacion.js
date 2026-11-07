import { Recarga } from '../core/recarga.js';
import { mostrarToast, iniciarToastProgreso, actualizarToastProgreso, finalizarToastProgreso } from './toast.js';

// ====================================================================
// AVISO DE ACTUALIZACIÓN — toast con barra de progreso mientras se descarga la versión nueva
// ====================================================================
// Aparece en cuanto el navegador detecta una versión nueva (no al terminar de descargarla): así se sabe que conviene
// dejar la app abierta unos segundos. Usa el toast normal, con una barra de progreso dentro (ver toast.js).
const DURACION_LISTO_MS = 10000;
const DURACION_ERROR_MS = 6000;

let _descargando = false;

/** Porcentaje entero válido (0 a 100) o `null` si el valor no es un número. @param {any} valor */
export function porcentajeValido(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
}

/** Se detectó una versión nueva y empieza la descarga. */
function iniciar() {
    if (_descargando) return;
    _descargando = true;
    iniciarToastProgreso('Descargando actualización…');
}

/** @param {any} porcentaje avance de la descarga, de 0 a 100 */
function progreso(porcentaje) {
    const p = porcentajeValido(porcentaje);
    if (p === null) return;
    iniciar();
    actualizarToastProgreso(p);
}

/** La versión nueva quedó descargada e instalada: se aplica al recargar (tocar el toast recarga). */
function listo() {
    _descargando = false;
    finalizarToastProgreso();
    mostrarToast('Actualización lista. Tocá para recargar', 'success', DURACION_LISTO_MS, null, () => Recarga.solicitar());
}

/** La descarga falló: se conserva la versión actual y se vuelve a intentar en la próxima apertura. */
function error() {
    _descargando = false;
    finalizarToastProgreso();
    mostrarToast('No se pudo descargar la actualización', 'error', DURACION_ERROR_MS);
}

export const AvisoActualizacion = { iniciar, progreso, listo, error };
