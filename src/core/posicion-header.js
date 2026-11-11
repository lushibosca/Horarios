import { STORAGE_KEYS, CORTES_LAYOUT } from './constantes.js';
import { Almacenamiento } from './almacenamiento.js';
import { EventosApp } from './eventos.js';

// ====================================================================
// POSICIÓN DEL ENCABEZADO
// ====================================================================
// Dónde va el encabezado: el CSS solo mira <html data-header-pos="top|bottom|left|right"> (lo pone tema-inicial.js antes del primer pintado y lo mantiene este módulo).
// En PC puede ir arriba, abajo o a un costado; en móvil solo arriba o abajo. Cada modo guarda la suya (como el orden de las tarjetas) y se avisa
// con 'header:posicion' cada vez que la posición que se ve cambia, para que se vuelvan a medir los desplazamientos (ver ui/base.js).
// Mientras se lo arrastra (ver ui/header-posicion.js) la posición se muestra en vivo sin guardarla: `previsualizar` la pone y `restaurar` vuelve a la guardada.
export const POSICIONES_HEADER = Object.freeze([
    { id: 'top', label: 'Arriba' },
    { id: 'bottom', label: 'Abajo' },
    { id: 'left', label: 'Izquierda' },
    { id: 'right', label: 'Derecha' }
]);

const ID_POR_DEFECTO = 'top';
const _IDS_MOVIL = Object.freeze(['top', 'bottom']);

/** Mismo corte que el CSS y que el orden de las tarjetas (@media min-width: 1024px). */
const _consulta = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(CORTES_LAYOUT.ESCRITORIO) : null;
const _esEscritorio = () => !!_consulta && _consulta.matches;

/** Ids de posición que valen en PC (todas) o en móvil (arriba y abajo). */
export function posicionesPermitidas(escritorio) {
    return escritorio ? POSICIONES_HEADER.map(p => p.id) : [..._IDS_MOVIL];
}

/** El `id` si vale en ese modo; si no (desconocido o un costado en móvil), la posición por defecto. */
export function normalizarPosicion(id, escritorio) {
    return posicionesPermitidas(escritorio).includes(id) ? id : ID_POR_DEFECTO;
}

export function etiquetaPosicion(id) {
    return (POSICIONES_HEADER.find(p => p.id === id) ?? POSICIONES_HEADER[0]).label;
}

const _clave = (escritorio) => (escritorio ? STORAGE_KEYS.POSICION_HEADER : STORAGE_KEYS.POSICION_HEADER_MOVIL);

/** Lo guardado para PC (`true`) o para móvil (`false`), ya normalizado. */
function guardada(escritorio) {
    return normalizarPosicion(Almacenamiento.getItem(_clave(escritorio), ID_POR_DEFECTO), escritorio);
}

/** Posición que se ve mientras se arrastra el encabezado; null cuando no se está arrastrando (vale la guardada). */
let _previa = null;

/** La posición que se ve ahora: la que se está arrastrando o, si no, la guardada para la pantalla de ahora. */
function actual() {
    if (_previa && !posicionesPermitidas(_esEscritorio()).includes(_previa)) _previa = null;   // se cruzó el corte arrastrando
    return _previa ?? guardada(_esEscritorio());
}

function _aplicar() {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-header-pos', actual());
    EventosApp.emit('header:posicion', { posicion: actual() });
}

/** Guarda la posición de un modo; si es el de la pantalla de ahora, se ve en el acto. Un id que no vale en ese modo se ignora. */
function fijar(escritorio, id) {
    if (!posicionesPermitidas(escritorio).includes(id)) return;
    Almacenamiento.setItem(_clave(escritorio), id);
    if (escritorio === _esEscritorio()) _aplicar();
}

function setPosicion(id) {
    _previa = null;
    fijar(_esEscritorio(), id);
}

/** Muestra el encabezado en esa posición sin guardarla (arrastre en vivo). Un id que no vale en este modo se ignora. */
function previsualizar(id) {
    if (!posicionesPermitidas(_esEscritorio()).includes(id)) return;
    _previa = id;
    _aplicar();
}

/** Deja de previsualizar: vuelve a verse la posición guardada. */
function restaurar() {
    _previa = null;
    _aplicar();
}

/** Alto que el encabezado le saca a la parte de arriba de la ventana: su altura si va arriba, 0 en cualquier otra posición. */
function altoSuperior() {
    if (typeof document === 'undefined' || actual() !== 'top') return 0;
    const header = /** @type {HTMLElement | null} */ (document.querySelector('.header'));
    return header ? header.offsetHeight : 0;
}

function init() {
    _aplicar();
    // Al cruzar el corte (girar la pantalla, redimensionar) vale la posición del otro modo
    if (_consulta) _consulta.addEventListener('change', _aplicar);
}

export const PosicionHeader = { init, actual, guardada, fijar, setPosicion, previsualizar, restaurar, altoSuperior };
