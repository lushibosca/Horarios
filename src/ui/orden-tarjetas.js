import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { Movimiento } from '../core/movimiento.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { UIBase } from './base.js';

// ====================================================================
// UI CARDS LAYOUT MODULE (visibilidad y orden de las tarjetas)
// ====================================================================
const { _crearToggleConfig, _setBtnActivo } = UIBase;

const { toggle: togglePersistirTarjetas, actualizarEstado: actualizarEstadoBotonPersistir } =
    _crearToggleConfig({
        getVal: () => Almacenamiento.getBoolean(STORAGE_KEYS.PERSISTIR_TARJETAS, true),
        setVal: (v) => Almacenamiento.setItem(STORAGE_KEYS.PERSISTIR_TARJETAS, v),
        btnId: 'btn-toggle-persistir-tarjetas',
    });

function toggleVisibilidadCard(cual) {
    const key = STORAGE_KEYS.CARD_VISIBLE(cual);
    const nuevo = !Almacenamiento.getBoolean(key, true, true);
    Almacenamiento.setItem(key, nuevo, true);
    aplicarVisibilidadCard(cual, nuevo);
    _setBtnActivo('btn-toggle-card-' + cual, nuevo);
}

function aplicarVisibilidadCard(cual, visible) {
    const card = $('card-' + cual);
    if (card) card.style.display = visible ? '' : 'none';
}

function aplicarVisibilidadCards() {
    ['registrar', 'estadisticas', 'historico'].forEach(cual => {
        const visible = Almacenamiento.getBoolean(STORAGE_KEYS.CARD_VISIBLE(cual), true, true);
        aplicarVisibilidadCard(cual, visible);
        _setBtnActivo('btn-toggle-card-' + cual, visible);
    });
}

function obtenerOrdenCards() {
    const guardado = Almacenamiento.getObject(STORAGE_KEYS.ORDEN_CARDS, null, true);
    const validos = ['registrar', 'estadisticas', 'historico'];
    if (Array.isArray(guardado) && guardado.length === 3 && validos.every(v => guardado.includes(v))) {
        return guardado;
    }
    return validos;
}

function aplicarOrdenCards(orden) {
    const statsCard = $('stats-card');
    const leftColumn = statsCard ? statsCard.parentElement : null;
    const container = leftColumn ? leftColumn.parentElement : null;
    if (!leftColumn || !container) return;

    const delays = [0.10, 0.15, 0.25];
    orden.forEach((cual, idx) => {
        const card = $('card-' + cual);
        if (!card) return;
        card.style.animationDelay = `${delays[idx] || 0.25}s`;
        const esUltima = idx === orden.length - 1;
        if (esUltima) {
            container.appendChild(card);
        } else {
            leftColumn.appendChild(card);
        }
    });

    const lista = $('lista-orden-cards');
    if (lista) {
        orden.forEach(cual => {
            const item = $('orden-item-' + cual);
            if (item) lista.appendChild(item);
        });
    }
}

const PULSACION_LARGA_MS = 300;
const REUBICACION_MS = 300;
const REUBICACION_TRANSICION = 'transform 0.28s cubic-bezier(0.2, 0, 0, 1)';

function obtenerCardsVisibles() {
    const statsCard = $('stats-card');
    const leftColumn = statsCard ? statsCard.parentElement : null;
    const container = leftColumn ? leftColumn.parentElement : null;
    const cards = [];
    if (leftColumn) {
        /** @type {HTMLElement[]} */ (Array.from(leftColumn.children)).forEach(el => {
            if (el.id && el.id.startsWith('card-') && el.style.display !== 'none' && !el.classList.contains('d-none')) {
                cards.push(el);
            }
        });
    }
    if (container) {
        /** @type {HTMLElement[]} */ (Array.from(container.children)).forEach(el => {
            if (el.id && el.id.startsWith('card-') && el.style.display !== 'none' && !el.classList.contains('d-none')) {
                cards.push(el);
            }
        });
    }
    return cards;
}

/**
 * @param {any} obtener
 * @param {any} clave
 * @param {any} cambiar
 * @param {{ encima?: Element|null }} [opciones]
 */
function uiAnimarReubicacion(obtener, clave, cambiar, { encima = null } = {}) {
    const antes = new Map();
    for (const el of obtener()) antes.set(clave(el), el.getBoundingClientRect());
    cambiar();
    if (antes.size === 0 || (typeof Movimiento !== 'undefined' && Movimiento.reducido())) return [];
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
function uiArrastreLargo(raiz, { elegir, capturar = (el) => el, alEmpezar = () => {}, alMover = () => {}, alTerminar = () => {} }) {
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
                try { targetCaptura.releasePointerCapture(pointerId); } catch (_) { }
            }
            try { capturar(arrastrado).releasePointerCapture(pointerId); } catch (_) { }
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
                try { targetCaptura.setPointerCapture(pointerId); } catch (_) { }
            }
            try { capturar(el).setPointerCapture(pointerId); } catch (_) { }
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate(35); } catch (_) { }
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

function evaluarNuevoOrdenCards(arrastrado, visibles, clientX, clientY) {
    const idxActual = visibles.indexOf(arrastrado);
    if (idxActual === -1 || visibles.length <= 1) return null;

    const rects = visibles.map(c => c.getBoundingClientRect());
    const esDosColumnas = visibles.length >= 2 && Math.abs(rects[0].left - rects[visibles.length - 1].left) > 50;

    let targetIdx = null;

    if (!esDosColumnas) {
        if (idxActual > 0) {
            const midArriba = rects[idxActual - 1].top + rects[idxActual - 1].height / 2;
            if (clientY < midArriba) targetIdx = idxActual - 1;
        }
        if (targetIdx === null && idxActual < visibles.length - 1) {
            const midAbajo = rects[idxActual + 1].top + rects[idxActual + 1].height / 2;
            if (clientY > midAbajo) targetIdx = idxActual + 1;
        }
    } else {
        if (visibles.length === 3) {
            const divisoriaX = (rects[0].right + rects[2].left) / 2;
            if (idxActual === 0 || idxActual === 1) {
                if (clientX >= divisoriaX) {
                    targetIdx = 2;
                } else {
                    if (idxActual === 0) {
                        const midAbajo = rects[1].top + rects[1].height / 2;
                        if (clientY > midAbajo) targetIdx = 1;
                    } else {
                        const midArriba = rects[0].top + rects[0].height / 2;
                        if (clientY < midArriba) targetIdx = 0;
                    }
                }
            } else if (idxActual === 2) {
                if (clientX < divisoriaX) {
                    const midCard0 = rects[0].top + rects[0].height / 2;
                    targetIdx = clientY < midCard0 ? 0 : 1;
                }
            }
        } else if (visibles.length === 2) {
            const divisoriaX = (rects[0].right + rects[1].left) / 2;
            if (idxActual === 0 && clientX >= divisoriaX) targetIdx = 1;
            else if (idxActual === 1 && clientX < divisoriaX) targetIdx = 0;
        }
    }

    if (targetIdx === null || targetIdx === idxActual) return null;

    const nuevaLista = [...visibles];
    const [removido] = nuevaLista.splice(idxActual, 1);
    nuevaLista.splice(targetIdx, 0, removido);

    const nuevoOrden = nuevaLista.map(c => c.id.replace('card-', ''));
    const validos = ['registrar', 'estadisticas', 'historico'];
    validos.forEach(c => {
        if (!nuevoOrden.includes(c)) nuevoOrden.push(c);
    });
    return nuevoOrden;
}

function iniciarDragTarjetas() {
    let ordenInicial = null;
    let deslizandoHasta = 0;

    uiArrastreLargo(document, {
        elegir: (e) => {
            const el = e.target instanceof Element ? e.target : null;
            if (!el) return null;
            if (el.closest('#btn-timer-main')) return null;

            const header = el.closest('#card-registrar .card-registrar-header, #card-estadisticas .card-header-clickable, #card-historico .card-header-clickable');
            if (!header) return null;

            const card = header.closest('#card-registrar, #card-estadisticas, #card-historico');
            return card;
        },
        capturar: (card) => card.querySelector('.card-registrar-header, .card-header-clickable') || card,
        alEmpezar: (card) => {
            ordenInicial = obtenerOrdenCards();
            card.classList.add('reordenando');
            document.body.classList.add('tarjeta-arrastrando-activa');
            /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.animated-card')).forEach(c => c.style.animation = 'none');
        },
        alMover: (e, card) => {
            if (performance.now() < deslizandoHasta) return;
            const visibles = obtenerCardsVisibles();
            const nuevoOrden = evaluarNuevoOrdenCards(card, visibles, e.clientX, e.clientY);
            if (!nuevoOrden) return;

            const animo = uiAnimarReubicacion(
                () => obtenerCardsVisibles(),
                c => c.id,
                () => aplicarOrdenCards(nuevoOrden),
                { encima: card }
            );
            if (animo.length > 0) {
                deslizandoHasta = performance.now() + REUBICACION_MS;
            }
        },
        alTerminar: (card, confirmar) => {
            card.classList.remove('reordenando');
            document.body.classList.remove('tarjeta-arrastrando-activa');
            if (confirmar) {
                const visibles = obtenerCardsVisibles();
                const nuevoOrden = visibles.map(c => c.id.replace('card-', ''));
                const validos = ['registrar', 'estadisticas', 'historico'];
                validos.forEach(c => {
                    if (!nuevoOrden.includes(c)) nuevoOrden.push(c);
                });
                Almacenamiento.setItem(STORAGE_KEYS.ORDEN_CARDS, nuevoOrden, true);
                aplicarOrdenCards(nuevoOrden);
            } else if (ordenInicial) {
                uiAnimarReubicacion(
                    () => obtenerCardsVisibles(),
                    c => c.id,
                    () => aplicarOrdenCards(ordenInicial)
                );
                Almacenamiento.setItem(STORAGE_KEYS.ORDEN_CARDS, ordenInicial, true);
            }
            ordenInicial = null;
        }
    });

    // Con teclado (Alt + flechas sobre el encabezado), el mismo recorrido
    const headers = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#card-registrar .card-registrar-header, #card-estadisticas .card-header-clickable, #card-historico .card-header-clickable'));
    headers.forEach(header => {
        header.addEventListener('keydown', (e) => {
            if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            const card = header.closest('#card-registrar, #card-estadisticas, #card-historico');
            if (!card) return;

            const visibles = obtenerCardsVisibles();
            const idx = visibles.indexOf(card);
            if (idx === -1) return;

            const atras = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
            if (atras ? idx <= 0 : idx >= visibles.length - 1) return;

            e.preventDefault();
            const targetIdx = atras ? idx - 1 : idx + 1;
            const nuevaLista = [...visibles];
            const [removido] = nuevaLista.splice(idx, 1);
            nuevaLista.splice(targetIdx, 0, removido);

            const nuevoOrden = nuevaLista.map(c => c.id.replace('card-', ''));
            ['registrar', 'estadisticas', 'historico'].forEach(c => {
                if (!nuevoOrden.includes(c)) nuevoOrden.push(c);
            });

            uiAnimarReubicacion(
                () => obtenerCardsVisibles(),
                c => c.id,
                () => aplicarOrdenCards(nuevoOrden),
                { encima: card }
            );
            Almacenamiento.setItem(STORAGE_KEYS.ORDEN_CARDS, nuevoOrden, true);
            header.focus();
        });
    });
}

function iniciarDragOrdenCards() {
    const lista = $('lista-orden-cards');
    if (!lista) return;

    let draggingEl = null;
    let dragClone = null;
    let startY = 0;
    let initialYOffset = 0;
    let dragTimer = null;
    const DRAG_DELAY = 150;

    function getCardFromItem(el) {
        const handle = el?.classList?.contains('drag-handle') ? el : el?.querySelector('.drag-handle');
        return handle?.dataset?.card;
    }

    function initDrag(item, clientY) {
        draggingEl = item;
        const rect = item.getBoundingClientRect();
        initialYOffset = clientY - rect.top;
        dragClone = item.cloneNode(true);
        dragClone.classList.add('drag-clone');
        Object.assign(dragClone.style, {
            top: `${rect.top}px`, left: `${rect.left}px`,
            width: `${rect.width}px`, height: `${rect.height}px`
        });
        document.body.appendChild(dragClone);
        draggingEl.classList.add('arrastrando');
        if (navigator.vibrate) navigator.vibrate(30);
    }

    function moveDrag(clientY) {
        if (!dragClone || !draggingEl) return;

        dragClone.style.top = `${clientY - initialYOffset}px`;

        const target = [...lista.querySelectorAll('.orden-card-item')].find(item => {
            if (item === draggingEl) return false;
            const r = item.getBoundingClientRect();
            return clientY >= r.top && clientY <= r.bottom;
        });

        if (target) {
            const targetRect = target.getBoundingClientRect();
            const targetMiddle = targetRect.top + targetRect.height / 2;

            if (clientY < targetMiddle) {
                lista.insertBefore(draggingEl, target);
            } else {
                lista.insertBefore(draggingEl, target.nextSibling);
            }
        }
    }

    function endDrag() {
        clearTimeout(dragTimer);
        if (!draggingEl) return;

        if (dragClone) {
            dragClone.remove();
            dragClone = null;
        }
        draggingEl.classList.remove('arrastrando');

        const itemsDOM = Array.from(lista.querySelectorAll('.orden-card-item'));
        const nuevoOrden = itemsDOM.map(i => getCardFromItem(i)).filter(Boolean);

        Almacenamiento.setItem(STORAGE_KEYS.ORDEN_CARDS, nuevoOrden, true);

        if (typeof aplicarOrdenCards === 'function') {
            aplicarOrdenCards(nuevoOrden);
        }

        draggingEl = null;
    }

    const bindStart = (eventType, getY, opts) => lista.addEventListener(eventType, (e) => {
        const item = e.target.closest('.drag-handle')?.closest('.orden-card-item');
        if (!item) return;
        startY = getY(e);
        dragTimer = setTimeout(() => initDrag(item, startY), DRAG_DELAY);
    }, opts);

    const bindMove = (target, eventType, getY, opts) => target.addEventListener(eventType, (e) => {
        if (!draggingEl) { if (Math.abs(getY(e) - startY) > 10) clearTimeout(dragTimer); return; }
        e.preventDefault();
        moveDrag(getY(e));
    }, opts);

    bindStart('touchstart', e => e.touches[0].clientY, { passive: true });
    bindStart('mousedown', e => e.clientY);
    bindMove(lista, 'touchmove', e => e.touches[0].clientY, { passive: false });
    bindMove(document, 'mousemove', e => e.clientY);
    lista.addEventListener('touchend', endDrag);
    lista.addEventListener('touchcancel', endDrag);
    document.addEventListener('mouseup', endDrag);
}

function bindEventos() {
    $('btn-toggle-persistir-tarjetas')?.addEventListener('click', () => togglePersistirTarjetas());
    $('btn-toggle-card-registrar')?.addEventListener('click', () => toggleVisibilidadCard('registrar'));
    $('btn-toggle-card-estadisticas')?.addEventListener('click', () => toggleVisibilidadCard('estadisticas'));
    $('btn-toggle-card-historico')?.addEventListener('click', () => toggleVisibilidadCard('historico'));
}

export const OrdenTarjetas = {
    actualizarEstadoBotonPersistir, aplicarVisibilidadCards, obtenerOrdenCards, aplicarOrdenCards,
    iniciarDragOrdenCards, iniciarDragTarjetas, bindEventos
};
