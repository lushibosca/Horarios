import { Movimiento } from '../core/movimiento.js';
import { Animaciones } from './animaciones.js';
import { icono } from '../core/html.js';

const { DUR_FICHAJE_OK, DUR_FICHAJE_SALIDA } = Animaciones;

// ====================================================================
// BOTÓN FICHAR — reseteo e ícono con check de éxito
// ====================================================================

export function resetearBoton(btn) {
    btn.disabled = false;
    btn.classList.remove('btn-color-muted', 'btn-color-red');
    // Con el check de éxito en curso no se recrea el ícono: lo restaura su propia salida
    if (_exitoFichaje.has(btn)) return;
    btn.innerHTML = `${icono('#icon-clock')} <span id="btn-registrar-texto">Fichar</span>`;
}

// ─── Check de éxito en el botón Fichar ──────────────────────────────────────
// Reemplaza el ícono por icon-check-circle con entrada/salida (~2 s en total).
// Si mientras tanto se ficha de nuevo con error, el check sale enseguida.
const _exitoFichaje = new WeakMap();

function _limpiarAnimExito(svg) {
    svg.getAnimations?.().forEach(a => a.cancel());
    svg.style.animation = '';
    svg.classList.remove('fichaje-ok', 'fichaje-ok-vuelta');
}

function _finalizarExitoFichaje(btn, conVuelta = true) {
    const est = _exitoFichaje.get(btn);
    if (!est) return;
    clearTimeout(est.timer);
    _exitoFichaje.delete(btn);
    const { svg, use, original } = est;
    _limpiarAnimExito(svg);
    // Si otro flujo ya cambió el ícono (ej. modo lote), no se pisa
    if (use.getAttribute('href') !== '#icon-check-circle') return;
    use.setAttribute('href', original);
    if (conVuelta && !Movimiento.reducido()) {
        void svg.getBoundingClientRect();
        svg.classList.add('fichaje-ok-vuelta');
    }
}

export function animarExitoFichaje(btn) {
    if (!btn || !btn.offsetParent) return;
    const svg = btn.querySelector('svg.icon');
    const use = svg?.querySelector('use');
    if (!use) return;

    const previo = _exitoFichaje.get(btn);
    const original = (previo && previo.svg === svg) ? previo.original : use.getAttribute('href');
    if (previo) { clearTimeout(previo.timer); _limpiarAnimExito(previo.svg); }
    else _limpiarAnimExito(svg);

    use.setAttribute('href', '#icon-check-circle');
    void svg.getBoundingClientRect();
    svg.classList.add('fichaje-ok');

    const timer = setTimeout(() => _finalizarExitoFichaje(btn), DUR_FICHAJE_OK());
    _exitoFichaje.set(btn, { svg, use, original, timer });
}

export function salirExitoFichaje(btn) {
    const est = btn && _exitoFichaje.get(btn);
    if (!est || est.saliendo) return;
    est.saliendo = true;
    clearTimeout(est.timer);
    if (Movimiento.reducido() || !est.svg.isConnected) { _finalizarExitoFichaje(btn); return; }

    const cs = getComputedStyle(est.svg);
    const desde = { transform: cs.transform, opacity: cs.opacity };
    const dur = DUR_FICHAJE_SALIDA();
    est.svg.style.animation = 'none';
    est.svg.animate([desde, { transform: 'scale(0.4)', opacity: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' });
    est.timer = setTimeout(() => _finalizarExitoFichaje(btn), dur + 20);
}

export function cancelarExitoFichaje(btn) { _finalizarExitoFichaje(btn, false); }

// Ícono "real" del botón: ignora el check mientras dura la animación de éxito
export function obtenerIconoBtn(btn) {
    return _exitoFichaje.get(btn)?.original ?? btn.querySelector('svg use')?.getAttribute('href');
}

export function restaurarBotonGuardarEdicion(btnGuardar) {
    btnGuardar.disabled = false;
    btnGuardar.innerHTML = `${icono('#icon-check')} Guardar`;
}

export function setIconoBtn(btn, icono) {
    // Con el check de éxito en curso, el ícono nuevo pasa a ser el que se restaura al terminar
    const exito = _exitoFichaje.get(btn);
    if (exito) { exito.original = icono; return; }
    const use = btn.querySelector('svg use');
    if (use) use.setAttribute('href', icono);
}

