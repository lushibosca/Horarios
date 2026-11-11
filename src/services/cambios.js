import { GestorHistorial } from './gestor-historial.js';
import { EstadoApp } from './estado-app.js';

// ====================================================================
// CIERRE DE UN CAMBIO EN LOS REGISTROS
// ====================================================================
// Todo cambio en los registros termina igual: se anota en la pila de deshacer, se guarda en el perfil y se actualiza la UI.

/**
 * @param {string} descripcion lo que se muestra al deshacerlo
 * @param {{ ids?: any, animarCard?: boolean }} [opciones] ids: registros a resaltar
 * @returns {Promise<boolean>} si se pudo guardar
 */
async function confirmar(descripcion, { ids = null, animarCard = false } = {}) {
    GestorHistorial.saveState(EstadoApp.registros(), descripcion);
    return EstadoApp.guardarYActualizar(ids, animarCard);
}

/**
 * Igual que confirmar, para un cambio hecho desde la tarjeta de fichaje: si afecta a hoy, la tarjeta pasa a la vista diaria
 * y muestra `fase` en el ciclo del número grande.
 * @param {string} descripcion
 * @param {any} ids
 * @param {boolean} esHoy
 * @param {string | null} [fase]
 * @returns {Promise<boolean>}
 */
async function confirmarEnTarjeta(descripcion, ids, esHoy, fase = null) {
    GestorHistorial.saveState(EstadoApp.registros(), descripcion);
    return EstadoApp._guardarConCicloSiHoy(ids, esHoy, fase);
}

export const Cambios = { confirmar, confirmarEnTarjeta };
