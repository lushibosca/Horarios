import { Recarga } from '../core/recarga.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
// RECARGA POR GESTO — "tirar para recargar" propio, con fundido de las tarjetas
// ====================================================================
// El pull-to-refresh nativo de Chrome Android recarga de golpe y no deja animar nada antes.
// CSS (html { overscroll-behavior-y: contain }) lo desactiva y este módulo lo reemplaza:
//   · mientras se tira, las tarjetas se van desvaneciendo (var --recarga-progreso)
//   · al soltar pasado el umbral, terminan de desvanecerse y recién entonces se recarga
//   · si se suelta antes del umbral, vuelven a aparecer
// Cualquier otra recarga de la app (cambio de perfil, etc.) pasa por core/recarga.js y usa el mismo fundido.
// Al cargar la página, las tarjetas aparecen con un fundido de entrada (entrar()).

const UMBRAL_PX = 90;          // distancia (ya amortiguada) a partir de la cual se recarga
const AMORTIGUACION = 0.5;     // el dedo recorre el doble que el progreso visual
const MARGEN_INICIO_PX = 10;   // movimiento mínimo hacia abajo antes de reaccionar
const MAX_ESPERA_GESTO_MS = 350; // un pulsado largo (arrastre de tarjetas) no es un gesto de recarga
const LIMPIEZA_ENTRADA_MS = 1500; // red de seguridad para quitar la clase de entrada si no llega animationend
const CLASE_ANIMANDO = 'recarga-animando';
const CLASE_RECARGANDO = 'recargando';
const CLASE_ENTRADA = 'entrada-pagina';

const raiz = () => document.documentElement;

/** @type {{ y: number, x: number, t: number, activo: boolean } | null} */
let _gesto = null;
let _recargando = false;
let _iniciado = false;

function _setProgreso(valor) {
    raiz().style.setProperty('--recarga-progreso', valor.toFixed(3));
}

/** El gesto solo vale si la página está arriba del todo y el toque no es dentro de algo que hace scroll por su cuenta. */
function _puedeIniciar(/** @type {EventTarget | null} */ destino) {
    if (_recargando || window.scrollY > 0) return false;
    if (document.body.classList.contains('modal-open')) return false;
    for (let el = /** @type {HTMLElement | null} */ (destino); el && el !== document.body; el = el.parentElement) {
        if (el.scrollTop > 0) return false;
    }
    return true;
}

function _alTocar(/** @type {TouchEvent} */ e) {
    _gesto = null;
    if (e.touches.length !== 1 || !_puedeIniciar(e.target)) return;
    const t = e.touches[0];
    _gesto = { y: t.clientY, x: t.clientX, t: performance.now(), activo: false };
}

function _alMover(/** @type {TouchEvent} */ e) {
    if (!_gesto || e.touches.length !== 1) return;
    if (e.defaultPrevented || window.scrollY > 0) return _cancelar();

    const t = e.touches[0];
    const dy = t.clientY - _gesto.y;
    const dx = Math.abs(t.clientX - _gesto.x);

    if (!_gesto.activo) {
        if (dy < -MARGEN_INICIO_PX || dx > Math.abs(dy)) { _gesto = null; return; } // scroll hacia arriba o swipe lateral
        if (dy < MARGEN_INICIO_PX) return;
        if (performance.now() - _gesto.t > MAX_ESPERA_GESTO_MS) { _gesto = null; return; }
        _gesto.activo = true;
        raiz().classList.remove(CLASE_ANIMANDO);
    }
    _setProgreso(Math.min(Math.max(dy, 0) * AMORTIGUACION / UMBRAL_PX, 1));
}

function _alSoltar() {
    if (!_gesto) return;
    const { activo } = _gesto;
    _gesto = null;
    if (!activo) return;

    const progreso = parseFloat(raiz().style.getPropertyValue('--recarga-progreso')) || 0;
    if (progreso >= 1) _recargar();
    else _restaurar();
}

function _cancelar() {
    const activo = _gesto?.activo;
    _gesto = null;
    if (activo) _restaurar();
}

function _restaurar() {
    raiz().classList.add(CLASE_ANIMANDO);
    _setProgreso(0);
}

/** Desvanece las tarjetas del todo y, cuando terminó el fundido, recarga. */
async function _recargar() {
    if (_recargando) return;
    _recargando = true;
    raiz().classList.add(CLASE_ANIMANDO, CLASE_RECARGANDO);
    await TiempoUtils.esperar(Animaciones.DUR_RECARGA() + 50);
    location.reload();
}

/** Fundido de entrada de las tarjetas al terminar la pantalla de carga (se llama justo al quitar html.cargando). */
function entrar() {
    const html = raiz();
    html.classList.add(CLASE_ENTRADA);
    const limpiar = () => html.classList.remove(CLASE_ENTRADA);
    document.querySelector('.container')?.addEventListener('animationend', limpiar, { once: true });
    setTimeout(limpiar, LIMPIEZA_ENTRADA_MS); // red de seguridad (pestaña en segundo plano, sin animationend)
}

function bindEventos() {
    if (_iniciado) return;
    _iniciado = true;
    Recarga.definirManejador(_recargar); // cambio de perfil, restablecer, actualizar: todos recargan con fundido
    window.addEventListener('touchstart', _alTocar, { passive: true });
    window.addEventListener('touchmove', _alMover, { passive: true });
    window.addEventListener('touchend', _alSoltar, { passive: true });
    window.addEventListener('touchcancel', _cancelar, { passive: true });
    // Si la página vuelve del caché de ida y vuelta (bfcache) no debe quedar atenuada
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        _recargando = false;
        raiz().classList.remove(CLASE_RECARGANDO);
        _setProgreso(0);
    });
}

export const RecargaGesto = { bindEventos, entrar };
