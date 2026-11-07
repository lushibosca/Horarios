// ====================================================================
// RECARGA — punto único para recargar la app
// ====================================================================
// Los servicios no pueden tocar el DOM, así que piden la recarga acá. Por defecto es un location.reload() directo;
// ui/recarga-gesto.js registra un manejador que primero desvanece la pantalla y recién después recarga.
/** @type {() => any} */
let _manejador = () => location.reload();

function solicitar() { return _manejador(); }
/** @param {() => any} fn */
function definirManejador(fn) { _manejador = fn; }

export const Recarga = { solicitar, definirManejador };
