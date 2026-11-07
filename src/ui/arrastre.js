import { Movimiento } from '../core/movimiento.js';

// ====================================================================
//              UI DRAG HELPERS (arrastre con pulsación larga y reubicación animada)
// ====================================================================
// Genéricos: no saben qué se arrastra. Los usa orden-tarjetas.js para mover tarjetas y reordenar la lista de visibles.
const PULSACION_LARGA_MS = 300;
export const REUBICACION_MS = 300;
const REUBICACION_TRANSICION = 'transform 0.28s cubic-bezier(0.2, 0, 0, 1)';

/**
 * Técnica FLIP: mide `obtener()` antes y después de `cambiar()` y anima cada elemento (identificado por `clave`)
 * desde su posición vieja. Devuelve los elementos animados. Con movimiento reducido solo aplica el cambio.
 * @param {any} obtener
 * @param {any} clave
 * @param {any} cambiar
 * @param {{ encima?: Element|null }} [opciones]
 */
export function uiAnimarReubicacion(obtener, clave, cambiar, { encima = null } = {}) {
    const antes = new Map();
    for (const el of obtener()) antes.set(clave(el), el.getBoundingClientRect());
    cambiar();
    if (antes.size === 0 || Movimiento.reducido()) return [];
    const animables = [];
    for (const el of obtener()) {
        const r0 = antes.get(clave(el));
        if (!r0) continue;
        el.style.transition = 'none';
        el.style.transform = '';
        const r1 = el.getBoundingClientRect();
        const dx = r0.left - r1.left;
        const dy = r0.top - r1.top;
        if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) {
            el.style.transition = '';
            continue;
        }
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.zIndex = el === encima ? '10' : '2';
        animables.push(el);
    }
    if (!animables.length) return [];
    void animables[0].offsetHeight;
    requestAnimationFrame(() => {
        for (const el of animables) {
            el.style.transition = REUBICACION_TRANSICION;
            el.style.transform = '';
            const limpiar = (e) => {
                if (e.propertyName !== 'transform') return;
                el.style.transition = '';
                el.style.zIndex = '';
                el.removeEventListener('transitionend', limpiar);
                el.removeEventListener('transitioncancel', limpiar);
            };
            el.addEventListener('transitionend', limpiar);
            el.addEventListener('transitioncancel', limpiar);
        }
    });
    return animables;
}

/**
 * @param {Document|HTMLElement} raiz
 * @param {{ elegir: any, capturar?: (el: any) => any,
 *           alEmpezar?: (el: any, inicio: any) => void, alMover?: (e: any, el: any) => void,
 *           alTerminar?: (el: any, confirmar: any) => void }} cfg
 */
export function uiArrastreLargo(raiz, { elegir, capturar = (el) => el, alEmpezar = () => {}, alMover = () => {}, alTerminar = () => {} }) {
    let timer = null;
    let arrastrando = false;
    let el = null;
    let pointerId = null;
    let targetCaptura = null;
    let inicio = null;
    let tragarClic = false;

    function terminar(confirmar) {
        clearTimeout(timer);
        timer = null;
        window.removeEventListener('pointermove', alMoverPuntero);
        window.removeEventListener('pointerup', alSoltar);
        window.removeEventListener('pointercancel', alCancelar);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        const arrastrado = arrastrando ? el : null;
        arrastrando = false;
        el = null;
        if (arrastrado) {
            if (targetCaptura) {
                try { targetCaptura.releasePointerCapture(pointerId); } catch (_) { /* la captura ya se liberó */ }
            }
            try { capturar(arrastrado).releasePointerCapture(pointerId); } catch (_) { /* la captura ya se liberó */ }
            tragarClic = true;
            setTimeout(() => { tragarClic = false; }, 120);
            alTerminar(arrastrado, confirmar);
        }
        pointerId = null;
        targetCaptura = null;
    }

    function onTouchMove(e) {
        if (arrastrando) {
            e.preventDefault();
        }
    }

    function onTouchEnd() {
        if (arrastrando) {
            terminar(true);
        }
    }

    function alMoverPuntero(e) {
        if (e.pointerId !== pointerId) return;
        if (!arrastrando) {
            const dist = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y);
            if (timer && dist > 8) {
                clearTimeout(timer);
                timer = null;
            }
            // El scroll (y el pull-to-refresh) lo maneja el navegador de forma nativa
            // gracias a touch-action: pan-y; al empezar el pan llega pointercancel.
            return;
        }
        e.preventDefault();

        // Auto-scroll en móviles si se arrastra cerca de los bordes
        if (e.pointerType === 'touch') {
            if (e.clientY < 70) window.scrollBy(0, -7);
            else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 7);
        }

        alMover(e, el);
    }

    function alSoltar(e) {
        if (e.pointerId === pointerId) terminar(true);
    }

    function alCancelar(e) {
        if (e.pointerId === pointerId) {
            // En móviles, no cancelar si ya se inició el arrastre
            if (arrastrando) return;
            terminar(false);
        }
    }

    raiz.addEventListener('click', (e) => {
        if (!tragarClic) return;
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
    }, true);

    raiz.addEventListener('contextmenu', (e) => {
        if (arrastrando || timer !== null) {
            e.preventDefault();
        }
    }, true);

    raiz.addEventListener('pointerdown', (/** @type {PointerEvent} */ e) => {
        if (e.button !== 0 || el) return;
        const elegido = elegir(e);
        if (!elegido) return;
        el = elegido;
        pointerId = e.pointerId;
        targetCaptura = e.target;
        inicio = { x: e.clientX, y: e.clientY };

        timer = setTimeout(() => {
            timer = null;
            arrastrando = true;
            if (targetCaptura) {
                try { targetCaptura.setPointerCapture(pointerId); } catch (_) { /* el puntero ya no está activo */ }
            }
            try { capturar(el).setPointerCapture(pointerId); } catch (_) { /* el puntero ya no está activo */ }
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate(35); } catch (_) { /* la vibración es opcional */ }
            }
            alEmpezar(el, inicio);
        }, PULSACION_LARGA_MS);

        window.addEventListener('pointermove', alMoverPuntero, { passive: false });
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('pointerup', alSoltar);
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('pointercancel', alCancelar);
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && arrastrando) terminar(false);
    });

    return { activo: () => arrastrando };
}
