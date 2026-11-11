import { CORTES_LAYOUT } from '../core/constantes.js';
import { Movimiento } from '../core/movimiento.js';
import { uiAnimarDesdePosiciones, REUBICACION_MS } from './arrastre.js';

// ====================================================================
// TRANSICIÓN DE DISEÑO (al cruzar un corte de ancho: celular <-> escritorio)
// ====================================================================
// Al achicar o agrandar la ventana (o girar el celular) y cruzar un corte de ancho, el CSS y el reparto de las tarjetas en columnas (orden-tarjetas.js) cambian de
// golpe: el encabezado y las tarjetas saltaban a su lugar nuevo. Acá se los desliza a él, con la misma animación que al reubicarlos arrastrando (FLIP).
//
// El problema es que cuando el navegador avisa del cruce el diseño nuevo ya está aplicado y no hay dónde medir "cómo estaba": por eso se guarda de antemano dónde está
// cada elemento (en cada cuadro de un redimensionado, al desplazar y cuando cambia el contenido) y, al cruzar, se compara con esa foto.

/** Los cortes de ancho que cambian el diseño (los mismos que el CSS y orden-tarjetas.js). */
const CORTES = [CORTES_LAYOUT.ESCRITORIO, CORTES_LAYOUT.ANCHO, '(max-width: 767px)', '(max-width: 600px)'];
/** Mientras se desliza no se guardan fotos: los elementos están a medio camino. */
const DURACION_MS = REUBICACION_MS + 100;
const REINTENTO_FOTO_MS = 250;

/** Lo que cambia de lugar con el diseño: el encabezado y las tarjetas visibles. */
export const elementosDelLayout = () => /** @type {HTMLElement[]} */ ([
    document.querySelector('.header'),
    ...document.querySelectorAll('.animated-card:not(.hidden)')
].filter(Boolean));
export const claveDelLayout = (/** @type {HTMLElement} */ el) => el.id || 'header';

/** @type {Map<string, DOMRect>} */
let _foto = new Map();
let _fotoPendiente = false;
let _cruzando = false;
let _hasta = 0;
let _iniciada = false;

function _medir() {
    return new Map(elementosDelLayout().map(el => [claveDelLayout(el), el.getBoundingClientRect()]));
}

/** Guarda dónde está cada elemento, en el próximo cuadro. Si algo se está animando (una tarjeta que se despliega, una reubicación) espera: mediría a medio camino. */
function _programarFoto() {
    if (_fotoPendiente) return;
    _fotoPendiente = true;
    requestAnimationFrame(() => {
        _fotoPendiente = false;
        if (_cruzando) return;
        if (performance.now() < _hasta || elementosDelLayout().some(el => el.getAnimations().length)) {
            setTimeout(_programarFoto, REINTENTO_FOTO_MS);
            return;
        }
        _foto = _medir();
    });
}

/** Para lo que cambia seguido (el reloj, el desplazamiento, el contenido): una foto como mucho cada tanto. Al redimensionar sí hace falta una por cuadro, porque el corte puede cruzarse en cualquier momento. */
const ESPERA_FOTO_LENTA_MS = 250;
let _timerFotoLenta = 0;
function _programarFotoLenta() {
    if (_timerFotoLenta) return;
    _timerFotoLenta = window.setTimeout(() => { _timerFotoLenta = 0; _programarFoto(); }, ESPERA_FOTO_LENTA_MS);
}

function _alCruzarCorte() {
    if (_cruzando) return;   // dos cortes en el mismo cuadro (1024 y 1400 a la vez): una sola animación
    _cruzando = true;
    const antes = _foto;   // la foto del último cuadro con el diseño anterior: todavía no la pisó nadie
    // el diseño nuevo ya está puesto, pero todavía no se pintó: en el próximo cuadro (después de que los demás oyentes del cambio, como el reparto en columnas, terminen)
    requestAnimationFrame(() => {
        _cruzando = false;
        // mover una tarjeta de columna la vuelve a crear para el navegador y repetiría su animación de entrada, que además pisaría el deslizamiento
        /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.animated-card')).forEach(c => { c.style.animation = 'none'; });
        const ahora = _medir();
        if (!Movimiento.reducido() && antes.size > 0) {
            _hasta = performance.now() + DURACION_MS;
            uiAnimarDesdePosiciones(elementosDelLayout, claveDelLayout, antes, { encima: document.querySelector('.header') });
        }
        _foto = ahora;
    });
}

function iniciar() {
    if (_iniciada) return;
    _iniciada = true;
    CORTES.forEach(q => window.matchMedia(q).addEventListener('change', _alCruzarCorte));
    window.addEventListener('resize', _programarFoto);
    window.addEventListener('scroll', _programarFotoLenta, { passive: true });
    // el contenido cambia el alto de las tarjetas (se despliegan, llegan registros, corre el reloj) y con eso la posición de las de abajo
    const raiz = document.querySelector('.container');
    if (raiz) new MutationObserver(_programarFotoLenta).observe(raiz, { childList: true, subtree: true, attributes: true, characterData: true });
    _programarFoto();
}

export const TransicionLayout = { iniciar };
