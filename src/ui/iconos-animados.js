import { Movimiento } from '../core/movimiento.js';

// ====================================================================
//     ICONOS ANIMADOS (flechas de subir/bajar y giro de deshacer/rehacer)
// ====================================================================
// Al activar un botón su ícono se anima: la flecha de subir sale por arriba y vuelve a entrar por abajo (la de bajar, al revés) y el ícono de
// deshacer/rehacer da una vuelta. Para mover solo la flecha, estos botones dibujan la base (nube o bandeja) y la flecha como dos <use> separados
// del sprite. Con "reducir animaciones" no se anima nada.

const _SVG_NS = 'http://www.w3.org/2000/svg';
const _DURACION_FLECHA_MS = 600;
const _DURACION_GIRO_MS = 500;
const _DURACION_REBOTE_MS = 700;

const _BASES = { nube: '#icon-nube', bandeja: '#icon-bandeja', pantalla: '#icon-pantalla' };
const _FLECHAS = {
    'nube-subir': '#icon-flecha-nube-subir',
    'nube-bajar': '#icon-flecha-nube-bajar',
    'bandeja-subir': '#icon-flecha-bandeja-subir',
    'bandeja-bajar': '#icon-flecha-bandeja-bajar',
    'pantalla-bajar': '#icon-flecha-pantalla-bajar',
};

/** @param {string} href @param {string} [clase] */
function _usar(href, clase = '') {
    const use = document.createElementNS(_SVG_NS, 'use');
    use.setAttribute('href', href);
    if (clase) use.setAttribute('class', clase);
    return use;
}

/**
 * Dibuja en el botón la base y la flecha del sentido pedido.
 * @param {Element | null} btn
 * @param {'nube' | 'bandeja' | 'pantalla'} base
 * @param {'subir' | 'bajar'} sentido
 */
function ponerIconoFlecha(btn, base, sentido) {
    const svg = btn?.querySelector('svg');
    if (!svg) return;
    svg.replaceChildren(_usar(_BASES[base]), _usar(_FLECHAS[`${base}-${sentido}`], 'icon-flecha'));
}

/**
 * La flecha sale del ícono en su sentido y vuelve a entrar por el lado opuesto.
 * @param {Element | null} btn
 * @param {'subir' | 'bajar'} sentido
 */
function animarFlecha(btn, sentido) {
    const flecha = btn?.querySelector('.icon-flecha');
    if (!flecha || Movimiento.reducido() || typeof flecha.animate !== 'function') return;
    const sale = sentido === 'subir' ? -10 : 10;
    flecha.animate([
        { transform: 'translateY(0)', opacity: 1 },
        { transform: `translateY(${sale}px)`, opacity: 0, offset: 0.45 },
        { transform: `translateY(${-sale}px)`, opacity: 0, offset: 0.46 },
        { transform: 'translateY(0)', opacity: 1 }
    ], { duration: _DURACION_FLECHA_MS, easing: 'ease-in-out' });
}

/**
 * El ícono da una vuelta completa (hacia la izquierda para deshacer, hacia la derecha para rehacer).
 * @param {Element | null} btn
 * @param {1 | -1} sentido 1 = horario, -1 = antihorario
 */
function girarIcono(btn, sentido) {
    const svg = btn?.querySelector('svg');
    if (!svg || Movimiento.reducido() || typeof svg.animate !== 'function') return;
    svg.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${360 * sentido}deg)` }], { duration: _DURACION_GIRO_MS, easing: 'ease-in-out' });
}

/**
 * La flecha baja un poco y rebota al subir (llamado de atención del botón de instalar).
 * @param {Element | null} btn
 */
function rebotarFlecha(btn) {
    const flecha = btn?.querySelector('.icon-flecha');
    if (!flecha || Movimiento.reducido() || typeof flecha.animate !== 'function') return;
    flecha.animate([
        { transform: 'translateY(0)' },
        { transform: 'translateY(3px)', offset: 0.35 },
        { transform: 'translateY(-1.5px)', offset: 0.65 },
        { transform: 'translateY(0)' }
    ], { duration: _DURACION_REBOTE_MS, easing: 'ease-out' });
}

export const IconosAnimados = { ponerIconoFlecha, animarFlecha, girarIcono, rebotarFlecha };
