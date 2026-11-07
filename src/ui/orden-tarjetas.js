import { STORAGE_KEYS, CARDS } from '../core/constantes.js';
import { normalizarOrdenCards, columnasDesdeOrden, prepararColumnas, moverCard, tamanosDeColumnas, MAX_COLUMNAS } from '../services/orden-cards.js';
import { $ } from '../core/dom.js';
import { EventosApp } from '../core/eventos.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { UIBase } from './base.js';
import { uiAnimarReubicacion, uiArrastreLargo, REUBICACION_MS } from './arrastre.js';

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
    aplicarOrdenCards(obtenerOrdenCards());   // una columna sin tarjetas visibles deja de ocupar lugar
    EventosApp.emit('tarjetas:visibilidad');
}

function aplicarVisibilidadCard(cual, visible) {
    const card = $('card-' + cual);
    if (card) card.classList.toggle('hidden', !visible);
}

function aplicarVisibilidadCards() {
    CARDS.forEach(cual => {
        const visible = Almacenamiento.getBoolean(STORAGE_KEYS.CARD_VISIBLE(cual), true, true);
        aplicarVisibilidadCard(cual, visible);
        _setBtnActivo('btn-toggle-card-' + cual, visible);
    });
    EventosApp.emit('tarjetas:visibilidad');
}

// Escritorio (hasta 3 columnas) y móvil (1 columna apilada) tienen cada uno su orden. Mismo corte que el CSS (@media min-width: 1024px).
// Mientras no se haya ordenado en móvil, se parte del orden de escritorio.
const _consultaEscritorio = window.matchMedia('(min-width: 1024px)');
const _consultaAncha = window.matchMedia('(min-width: 1200px)');   // con menos ancho no entran 3 columnas de 350px
const _esEscritorio = () => _consultaEscritorio.matches;
const _maxColumnas = () => (!_esEscritorio() ? 1 : _consultaAncha.matches ? MAX_COLUMNAS : 2);
const _claveOrden = () => (_esEscritorio() ? STORAGE_KEYS.ORDEN_CARDS : STORAGE_KEYS.ORDEN_CARDS_MOVIL);

function obtenerOrdenCards() {
    const guardado = Almacenamiento.getObject(_claveOrden(), null, true)
        ?? Almacenamiento.getObject(STORAGE_KEYS.ORDEN_CARDS, null, true);
    return normalizarOrdenCards(guardado);
}

function guardarOrdenCards(orden) {
    Almacenamiento.setItem(_claveOrden(), orden, true);
}

// La tarjeta de estado ('estado', id `stats-card`) se ubica como las demás pero no se puede ocultar
const _elCard = (cual) => (cual === 'estado' ? $('stats-card') : $('card-' + cual));
const _idDeCard = (el) => (el.id === 'stats-card' ? 'estado' : el.id.replace('card-', ''));
const _esCard = (el) => el.id === 'stats-card' || el.id.startsWith('card-');
const _tarjetasVisibles = () => new Set(['estado', ...CARDS.filter(c => Almacenamiento.getBoolean(STORAGE_KEYS.CARD_VISIBLE(c), true, true))]);

/** Columnas tal como se dibujan ahora: en móvil una sola; en escritorio el orden cortado según los tamaños guardados. */
function _columnasActuales(orden = obtenerOrdenCards()) {
    if (!_esEscritorio()) return [orden];
    const tamanos = Almacenamiento.getObject(STORAGE_KEYS.COLUMNAS_CARDS, null, true);
    return prepararColumnas(columnasDesdeOrden(orden, tamanos), _maxColumnas(), _tarjetasVisibles());
}

function _guardarColumnas(columnas) {
    guardarOrdenCards(columnas.flat());
    if (_esEscritorio()) Almacenamiento.setItem(STORAGE_KEYS.COLUMNAS_CARDS, tamanosDeColumnas(columnas), true);
}

// Contenedores de escritorio (hasta 3 columnas); en móvil todo se apila en el primero, en el orden elegido
function _contenedores() {
    const primero = $('columna-1');
    return [primero, $('right-column'), $('columna-3')];
}

/** Muestra solo las columnas que tienen tarjetas visibles y fija cuántas hay (el CSS ensancha la página con 3). */
function _actualizarColumnas() {
    const contenedores = _contenedores();
    const hayTarjetaVisible = (c) => /** @type {HTMLElement[]} */ (Array.from(c.children)).some(el => _esCard(el) && !el.classList.contains('hidden'));
    let n = 1;
    contenedores.forEach((c, i) => {
        if (!c || i === 0) return;
        const vacia = !hayTarjetaVisible(c);
        c.classList.toggle('columna-vacia', vacia);
        if (!vacia) n++;
    });
    const raiz = /** @type {HTMLElement | null} */ (document.querySelector('.container'));
    if (!raiz) return;
    raiz.dataset.columnas = String(n);
    raiz.style.setProperty('--columnas', String(n));
}

/** @param {string[]} orden @param {string[][] | null} [columnas] columnas ya preparadas (si no, salen de lo guardado) */
function aplicarOrdenCards(orden, columnas = null) {
    const contenedores = _contenedores();
    if (contenedores.some(c => !c)) return;

    const cols = columnas ?? _columnasActuales(orden);
    const delays = [0.10, 0.15, 0.20, 0.25];
    let idx = 0;
    cols.forEach((col, ci) => col.forEach(cual => {
        const card = _elCard(cual);
        if (!card) return;
        card.style.animationDelay = `${delays[idx++] ?? 0.25}s`;
        contenedores[Math.min(ci, contenedores.length - 1)]?.appendChild(card);
    }));
    _actualizarColumnas();

    const etiqueta = $('label-orden-cards');
    if (etiqueta) etiqueta.textContent = `Tarjetas y posición (${_esEscritorio() ? 'PC' : 'celular'})`;

    const lista = $('lista-orden-cards');
    if (lista) {
        cols.flat().forEach(cual => {
            const item = $('orden-item-' + cual);
            if (item) lista.appendChild(item);
        });
    }
}

// Al restaurar un respaldo o bajar de Gist cambian el orden y las tarjetas visibles: se redibuja el diseño
EventosApp.on('config:tarjetas', () => {
    aplicarVisibilidadCards();
    aplicarOrdenCards(obtenerOrdenCards());
});

// Al pasar de escritorio a móvil (o al revés, ej. girar la pantalla o redimensionar) se arma el diseño del modo nuevo
_consultaEscritorio.addEventListener('change', () => aplicarOrdenCards(obtenerOrdenCards()));
_consultaAncha.addEventListener('change', () => aplicarOrdenCards(obtenerOrdenCards()));


function obtenerCardsVisibles() {
    const cards = [];
    _contenedores().forEach(columna => {
        if (!columna) return;
        /** @type {HTMLElement[]} */ (Array.from(columna.children)).forEach(el => {
            if (el.id && _esCard(el) && !el.classList.contains('hidden')) {
                cards.push(el);
            }
        });
    });
    return cards;
}

/**
 * Dónde cae la tarjeta arrastrada según el puntero: la columna sobre la que está (si llegó al borde derecho y todavía entra otra columna,
 * una columna nueva) y delante de qué tarjeta visible de esa columna. Devuelve las columnas nuevas, o null si no cambia nada.
 */
function evaluarNuevasColumnas(arrastrado, columnas, clientX, clientY) {
    const contenedores = _contenedores();
    /** @type {{ indice: number, el: HTMLElement }[]} */
    const zonas = [];
    contenedores.forEach((c, i) => {
        if (c && (i === 0 || !c.classList.contains('columna-vacia'))) zonas.push({ indice: i, el: c });
    });
    if (!zonas.length) return null;

    const opciones = { max: _maxColumnas(), visibles: _tarjetasVisibles(), exigirDosColumnas: _esEscritorio() };
    const id = _idDeCard(arrastrado);

    // Pegada al borde derecho (o más allá): abre una columna nueva. No se muestra nada; la columna aparece al mover la tarjeta
    const raiz = document.querySelector('.container');
    if (raiz && _esEscritorio() && columnas.length < _maxColumnas()) {
        const r = raiz.getBoundingClientRect();
        if (clientX > r.right - Math.min(100, r.width * 0.08)) return moverCard(columnas, id, columnas.length, null, opciones);
    }

    // La columna cuyo ancho contiene al puntero, o la más cercana en horizontal
    const distancia = (z) => { const r = z.el.getBoundingClientRect(); return clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0; };
    const zona = zonas.reduce((mejor, z) => (distancia(z) < distancia(mejor) ? z : mejor), zonas[0]);

    // Delante de la primera tarjeta visible de la columna (sin contar la arrastrada) cuya mitad quede por debajo del puntero
    const antes = /** @type {HTMLElement[]} */ (Array.from(zona.el.children))
        .filter(el => _esCard(el) && el !== arrastrado && !el.classList.contains('hidden'))
        .find(el => { const r = el.getBoundingClientRect(); return clientY < r.top + r.height / 2; });

    return moverCard(columnas, id, zona.indice, antes ? _idDeCard(antes) : null, opciones);
}

// Desde dónde se arrastra cada tarjeta: su encabezado
// (la tarjeta de estado no tiene encabezado: se mantiene presionada la tarjeta entera)
const _SELECTOR_ENCABEZADOS = '#stats-card, #card-registrar .card-registrar-header, #card-estadisticas .card-header-clickable, #card-historico .card-header-clickable';
const _SELECTOR_CARDS = '#stats-card, #card-registrar, #card-estadisticas, #card-historico';

/**
 * Columnas nuevas al mover una tarjeta con Alt + flecha: arriba/abajo cambia de lugar dentro de la columna; izquierda/derecha pasa a la columna
 * de al lado (a la derecha de la última abre una columna nueva si todavía entra). En móvil, con una sola columna, las cuatro flechas recorren la pila.
 * Devuelve null si no hay movimiento posible.
 * @param {string} id
 * @param {string} tecla
 */
function columnasTrasTecla(id, tecla) {
    const columnas = _columnasActuales();
    const visibles = _tarjetasVisibles();
    const colActual = columnas.findIndex(c => c.includes(id));
    if (colActual === -1) return null;
    const enColumna = (i) => columnas[i].filter(c => visibles.has(c));
    const pos = enColumna(colActual).indexOf(id);
    const opciones = { max: _maxColumnas(), visibles, exigirDosColumnas: _esEscritorio() };

    const vertical = tecla === 'ArrowUp' || tecla === 'ArrowDown' || _maxColumnas() === 1;
    const atras = tecla === 'ArrowLeft' || tecla === 'ArrowUp';

    if (vertical) {
        const propias = enColumna(colActual);
        if (atras ? pos <= 0 : pos >= propias.length - 1) return null;
        return moverCard(columnas, id, colActual, atras ? propias[pos - 1] : (propias[pos + 2] ?? null), opciones);
    }
    const destino = colActual + (atras ? -1 : 1);
    if (destino < 0) return null;
    return moverCard(columnas, id, destino, destino < columnas.length ? (enColumna(destino)[pos] ?? null) : null, opciones);
}

function iniciarDragTarjetas() {
    let columnasInicial = null;
    let columnasEnCurso = null;
    let deslizandoHasta = 0;

    // Dibuja las columnas nuevas con la animación de deslizamiento (las tarjetas ocultas viajan con su columna)
    const reubicar = (columnas, encima) => {
        columnasEnCurso = columnas;
        return uiAnimarReubicacion(
            () => obtenerCardsVisibles(),
            c => c.id,
            () => aplicarOrdenCards(columnas.flat(), columnas),
            { encima }
        );
    };

    uiArrastreLargo(document, {
        elegir: (e) => {
            const el = e.target instanceof Element ? e.target : null;
            if (!el) return null;
            if (el.closest('#btn-timer-main')) return null;

            const header = el.closest(_SELECTOR_ENCABEZADOS);
            if (!header) return null;

            return header.closest(_SELECTOR_CARDS);
        },
        capturar: (card) => card.querySelector('.card-registrar-header, .card-header-clickable') || card,
        alEmpezar: (card) => {
            columnasInicial = _columnasActuales();
            columnasEnCurso = columnasInicial;
            card.classList.add('reordenando');
            document.body.classList.add('tarjeta-arrastrando-activa');
            /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.animated-card')).forEach(c => c.style.animation = 'none');
        },
        alMover: (e, card) => {
            if (performance.now() < deslizandoHasta || !columnasEnCurso) return;
            const nuevas = evaluarNuevasColumnas(card, columnasEnCurso, e.clientX, e.clientY);
            if (!nuevas) return;

            if (reubicar(nuevas, card).length > 0) {
                deslizandoHasta = performance.now() + REUBICACION_MS;
            }
        },
        alTerminar: (card, confirmar) => {
            card.classList.remove('reordenando');
            document.body.classList.remove('tarjeta-arrastrando-activa');
            const destino = confirmar ? columnasEnCurso : columnasInicial;
            if (destino) {
                // Sin columnas que hayan quedado vacías, y guardando el diseño elegido
                uiAnimarReubicacion(
                    () => obtenerCardsVisibles(),
                    c => c.id,
                    () => aplicarOrdenCards(destino.flat(), prepararColumnas(destino, _maxColumnas(), _tarjetasVisibles()))
                );
                if (confirmar) _guardarColumnas(destino);
            } else {
                _actualizarColumnas();
            }
            columnasInicial = null;
            columnasEnCurso = null;
        }
    });

    // Con teclado (Alt + flechas sobre el encabezado), ver columnasTrasTecla
    const headers = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(_SELECTOR_ENCABEZADOS));
    headers.forEach(header => {
        header.addEventListener('keydown', (e) => {
            if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            const card = header.closest(_SELECTOR_CARDS);
            if (!card) return;

            const nuevas = columnasTrasTecla(_idDeCard(card), e.key);
            if (!nuevas) return;

            e.preventDefault();
            reubicar(nuevas, card);
            _guardarColumnas(nuevas);
            columnasEnCurso = null;
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

        // El clon no sale del área de la lista: se frena en el borde de arriba y de abajo
        const area = lista.getBoundingClientRect();
        const alto = dragClone.getBoundingClientRect().height;
        const top = Math.min(Math.max(clientY - initialYOffset, area.top), Math.max(area.top, area.bottom - alto));
        dragClone.style.top = `${top}px`;

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

        guardarOrdenCards(nuevoOrden);

        aplicarOrdenCards(nuevoOrden);

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
