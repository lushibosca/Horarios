import { Movimiento } from '../core/movimiento.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { esHtmlSeguro, montar } from '../core/html.js';

// ====================================================================
//                     UI ANIMATIONS MODULE
// ====================================================================
function _aArray(valor) {
    if (valor === null || valor === undefined) return [];
    return Array.isArray(valor) ? valor : [valor];
}

function _estaColapsado(el) { return !!el.closest('.collapsible:not(.expanded)'); }

function _esperarAnim(extra = 50) { return TiempoUtils.esperar(DUR_ANIM() + extra); }

function _getCSSdur(varName) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return 300;
    return raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
}
/** @param {any} [el] */
function _durSiAnima(varName, el = null) {
    return (Movimiento.reducido() || (el && !el.offsetParent)) ? 0 : _getCSSdur(varName);
}
const DUR_ANIM = () => _getCSSdur('--dur-anim');
const DUR_CALENDARIO = () => _getCSSdur('--dur-calendario');
const DUR_FICHAJE_OK = () => _getCSSdur('--dur-fichaje-ok');
const DUR_FICHAJE_SALIDA = () => _getCSSdur('--dur-fichaje-salida');
const DUR_RECARGA = () => _getCSSdur('--dur-recarga');

function _fantasmaDe(el) {
    const rect = el.getBoundingClientRect();
    const clon = el.cloneNode(true);
    clon.classList.add('mutacion-saliente');
    // El destello de un botón recién fichado no se copia al fantasma: duplicaba el borde/halo
    clon.classList.remove(..._CLASES_FLASH);
    _quitarCapaDestello(clon);

    Object.assign(clon.style, {
        position: 'fixed',
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        margin: '0',
        pointerEvents: 'none',
        zIndex: '80'
    });

    const primerHijo = el.firstElementChild;
    if (primerHijo) {
        const childRect = primerHijo.getBoundingClientRect();
        if (Math.abs(rect.top - childRect.top) < 1) {
            clon.firstElementChild.style.marginTop = '0';
        }
    }

    document.body.appendChild(clon);
    return clon;
}

const _mutacionAnimEstado = new WeakMap();
const _CLASES_FLASH = ['campo-flash', 'campo-flash-color', 'mosaico-flash', 'destello-hoy', 'destello-instalar'];
/** Destellos que no animan el elemento sino una capa temporal propia (barrido + onda, solo transform/opacity); ver .destello-capa en responsivo-movimiento.css */
const _CLASES_CAPA = ['mosaico-flash', 'destello-hoy', 'destello-instalar'];

function _quitarCapaDestello(el) {
    el.querySelectorAll(':scope > .destello-capa').forEach(c => c.remove());
}

/**
 * Capa con el barrido de luz (si el día/mosaico tiene relleno) y el aro de la onda. Si el relleno se recorta al contenido (estilos del calendario con hueco)
 * la capa se achica al mismo tamaño, para que el barrido y el aro salgan del disco y no de la celda.
 * @param {HTMLElement} el @param {boolean} conBarrido
 */
function _crearCapaDestello(el, conBarrido) {
    _quitarCapaDestello(el);
    const capa = document.createElement('span');
    capa.className = 'destello-capa';
    capa.setAttribute('aria-hidden', 'true');
    const cs = getComputedStyle(el);
    if (cs.backgroundClip === 'content-box') capa.style.inset = cs.paddingTop;
    if (conBarrido) {
        const recorte = document.createElement('span');
        recorte.className = 'destello-recorte';
        const franja = document.createElement('span');
        franja.className = 'destello-franja';
        recorte.appendChild(franja);
        capa.appendChild(recorte);
    }
    const onda = document.createElement('span');
    onda.className = 'destello-onda';
    capa.appendChild(onda);
    el.appendChild(capa);
    return capa;
}

// ─── Destello (campo-flash / campo-flash-color) ─────────────────────────────
// Ambas clases fijan `animation` con más especificidad que .mutacion-entrante, así que
// si coinciden pisan el fundido de entrada del elemento (el texto nuevo "aparece de golpe")
// y además el fantasma saliente heredaba el borde. Mientras un elemento tiene una mutación
// en curso el destello se difiere y arranca recién cuando termina el cambio de texto.
const _flashDiferido = new WeakMap();

/** @param {any} [colorVar] */
function _aplicarFlash(el, clase, colorVar = null) {
    clearTimeout(el._flashTimeout);
    el.classList.remove(clase);
    if (colorVar) el.style.setProperty('--flash-color', colorVar);
    void el.offsetWidth;
    el.classList.add(clase);

    if (_CLASES_CAPA.includes(clase)) {
        const capa = _crearCapaDestello(el, !el.matches('.dia-sin-registro, .dia-filtrado'));
        const totalMs = _getCSSdur('--demora-onda') + _getCSSdur('--dur-onda') + 50;
        el._flashTimeout = setTimeout(() => { el.classList.remove(clase); capa.remove(); }, totalMs);
        return;
    }

    // puede haber varias animaciones a la vez (barrido y onda): se espera a la que termina última (duración + demora, por sus iteraciones)
    const cs = getComputedStyle(el);
    const lista = valor => valor.split(',').map(v => parseFloat(v) || 0);
    const duraciones = lista(cs.animationDuration), demoras = lista(cs.animationDelay), vueltas = lista(cs.animationIterationCount);
    const duracionMs = Math.max(0.5, ...duraciones.map((d, i) => (demoras[i % demoras.length] + d * (vueltas[i % vueltas.length] || 1)))) * 1000;
    const iteraciones = 1;
    el._flashTimeout = setTimeout(() => el.classList.remove(clase), duracionMs * iteraciones);
}

/** @param {any} [colorVar] */
function _flashElemento(el, clase, colorVar = null) {
    if (!el) return;
    if (_mutacionAnimEstado.has(el) || _flashDiferido.has(el)) { _diferirFlash(el, clase, colorVar); return; }
    _aplicarFlash(el, clase, colorVar);
}

function _diferirFlash(el, clase, colorVar) {
    clearTimeout(el._flashTimeout);
    el.classList.remove(clase);
    _quitarCapaDestello(el);
    const pendiente = _flashDiferido.get(el) ?? new Map();
    pendiente.set(clase, colorVar);
    _flashDiferido.set(el, pendiente);
}

// Saca del elemento el destello en curso (para que no se copie al fantasma ni pise el fundido)
function _pausarFlash(el) {
    _CLASES_FLASH.filter(c => el.classList.contains(c)).forEach(c => _diferirFlash(el, c, null));
}

function _reanudarFlash(el) {
    const pendiente = _flashDiferido.get(el);
    if (!pendiente || !el.isConnected) { _flashDiferido.delete(el); return; }
    _flashDiferido.delete(el);
    pendiente.forEach((colorVar, clase) => _aplicarFlash(el, clase, colorVar));
}


function _finalizarMutacionPendiente(el) {
    const estado = _mutacionAnimEstado.get(el);
    if (!estado) return;
    clearTimeout(estado.timeout);
    if (estado.fantasma && estado.fantasma.parentNode) {
        estado.fantasma.remove();
    }
    el.classList.remove('mutacion-entrante');
    _mutacionAnimEstado.delete(el);
}

/** @param {any} [duracion] */
function _animarMutacion(elementos, fn, duracion = null) {
    const els = _aArray(elementos).filter(Boolean);
    const dur = duracion ?? DUR_ANIM();

    els.forEach(_finalizarMutacionPendiente);
    if (els.length === 0 || Movimiento.reducido()) { return Promise.resolve(fn()); }

    els.forEach(_pausarFlash);
    const fantasmasMap = [];
    els.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            const f = _fantasmaDe(el);
            fantasmasMap.push({ el, fantasma: f });
        }
    });

    els.forEach(el => el.classList.remove('mutacion-entrante'));

    return Promise.resolve(fn()).then((resultado) => {
        els.forEach(el => {
            void el.offsetWidth;
            el.classList.add('mutacion-entrante');
        });

        const timeout = setTimeout(() => {
            fantasmasMap.forEach(({ fantasma }) => fantasma.remove());
            els.forEach(el => {
                el.classList.remove('mutacion-entrante');
                _mutacionAnimEstado.delete(el);
                _reanudarFlash(el);
            });
        }, dur);

        els.forEach(el => {
            const item = fantasmasMap.find(m => m.el === el);
            _mutacionAnimEstado.set(el, {
                timeout,
                fantasma: item ? item.fantasma : null
            });
        });

        return resultado;
    });
}

function _crearFantasmaSiVisible(el) {
    if (!el || Movimiento.reducido()) return null;
    if (_estaColapsado(el)) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    if (r.bottom < 0 || r.top > window.innerHeight) return null;

    const fantasma = _fantasmaDe(el);
    fantasma.classList.remove('nuevo-registro-animacion', 'mutacion-entrante');
    const limpiar = () => fantasma.remove();
    fantasma.addEventListener('animationend', limpiar, { once: true });
    _esperarAnim(150).then(limpiar);
    return fantasma;
}

/**
 * Aplica un cambio que modifica el alto de `el` (`mutarFn`) y lo anima, con el mismo ritmo que el colapsado de las otras tarjetas (--dur-collapse, ease-out).
 * Se mide el alto antes y después, se fija el de partida en px sin transición y se pasa al de llegada; al terminar se devuelve el control al CSS.
 * Mientras dura se recorta el contenido para que no se vea salirse de la tarjeta.
 * @param {HTMLElement | null} el @param {() => void} mutarFn
 */
function _animarAlturaCambio(el, mutarFn) {
    const dur = el ? _durSiAnima('--dur-collapse', el) : 0;
    if (!el || !(dur > 1) || !el.getClientRects().length) { mutarFn(); return; }
    const antes = el.offsetHeight;
    el.style.height = '';
    mutarFn();
    const despues = el.offsetHeight;
    if (Math.abs(despues - antes) < 2) return;
    el.style.overflow = 'hidden';
    el.style.transition = 'none';
    el.style.height = `${antes}px`;
    void el.offsetHeight;
    el.style.transition = `height ${dur}ms ease-out`;
    el.style.height = `${despues}px`;
    const terminar = () => { el.style.height = ''; el.style.transition = ''; el.style.overflow = ''; };
    el.addEventListener('transitionend', function alTerminar(e) {
        if (e.target !== el || e.propertyName !== 'height') return;
        el.removeEventListener('transitionend', alTerminar);
        terminar();
    });
    setTimeout(terminar, dur + 100);   // red de seguridad (pestaña en segundo plano: no hay transitionend)
}

const _valorAnimEstado = new WeakMap();

function _finalizarValorPendiente(el) {
    const est = _valorAnimEstado.get(el);
    if (!est) return;
    clearTimeout(est.timeout);
    est.anims.forEach(a => a.cancel());
    _valorAnimEstado.delete(el);
    if (el.querySelector(':scope > .valor-roll')) el.textContent = est.texto;
}

function _animarValor(el, texto, dir = 0) {
    if (!el) return;
    texto = String(texto);
    const previo = _valorAnimEstado.get(el);
    const actual = previo ? previo.texto : el.textContent;
    _finalizarValorPendiente(el);
    if (actual === texto) { if (el.textContent !== texto) el.textContent = texto; return; }

    const dur = _getCSSdur('--dur-valor');
    const sinMovimiento = Movimiento.reducido();
    if (!dir || sinMovimiento || !dur || !el.offsetParent) { el.textContent = texto; return; }

    const mk = t => { const s = document.createElement('span'); s.className = 'valor-roll-item'; s.textContent = t; return s; };
    const saliente = mk(actual), entrante = mk(texto);
    const roll = document.createElement('span');
    roll.className = 'valor-roll';
    roll.append(saliente, entrante);
    el.replaceChildren(roll);

    const opts = { duration: dur, easing: 'ease-out', fill: /** @type {FillMode} */ ('both') };
    const sgn = dir > 0 ? 1 : -1;
    const anims = [
        saliente.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-70 * sgn}%)`, opacity: 0 }], opts),
        entrante.animate([{ transform: `translateY(${70 * sgn}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], opts)
    ];
    _valorAnimEstado.set(el, { texto, anims, timeout: setTimeout(() => _finalizarValorPendiente(el), dur) });
}

const _conteoEstado = new WeakMap();

function _conteoEnCurso(el) {
    const est = _conteoEstado.get(el);
    return est ? est.textoFinal : null;
}

function _cancelarConteo(el) {
    const est = _conteoEstado.get(el);
    if (!est) return;
    est.cancelado = true;
    _conteoEstado.delete(el);
}

function _animarConteo(el, texto, { duracion = _durSiAnima('--dur-conteo', el) } = {}) {
    if (!el) return false;
    _cancelarConteo(el);
    const textoFinal = texto(1);
    if (duracion <= 1) {
        el.textContent = textoFinal;
        return false;
    }
    const estado = { textoFinal, cancelado: false };
    _conteoEstado.set(el, estado);
    let ultimo = texto(0);
    el.textContent = ultimo;
    const inicio = performance.now();
    const paso = ahora => {
        if (estado.cancelado) return;
        if (el.textContent !== ultimo) { _cancelarConteo(el); return; }
        const t = Math.min(1, Math.max(0, (ahora - inicio) / duracion));
        const actual = t >= 1 ? textoFinal : texto(1 - Math.pow(1 - t, 3));
        if (actual !== ultimo) { el.textContent = actual; ultimo = actual; }
        if (t < 1) requestAnimationFrame(paso); else _conteoEstado.delete(el);
    };
    requestAnimationFrame(paso);
    return true;
}

function _animarFadeSwap(el, fn) {
    if (!el) { return Promise.resolve(fn()); }
    return _animarMutacion(el, fn);
}

const _slideAnimEstado = new WeakMap();

function _limpiarClonVisual(clon) {
    clon.removeAttribute('id');
    clon.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    return clon;
}

function _finalizarSlidePendiente(el) {
    const estado = _slideAnimEstado.get(el);
    if (!estado) return;
    clearTimeout(estado.timeout);
    el.style.display = '';
    estado.wrapper.parentNode?.insertBefore(el, estado.wrapper);
    estado.wrapper.remove();
    _slideAnimEstado.delete(el);
}

function _animarSlideElemento(el, delta, mutarFn) {
    if (!el) { mutarFn(); return; }

    _finalizarSlidePendiente(el);
    if (Movimiento.reducido()) { mutarFn(); return; }

    const rectViejo = el.getBoundingClientRect();
    const anchoViejo = rectViejo.width;
    const altoViejo = rectViejo.height;
    const margenTop = getComputedStyle(el).marginTop;

    const snapViejo = _limpiarClonVisual(el.cloneNode(true));
    snapViejo.style.cssText = 'position:absolute;top:0;left:0;width:' + anchoViejo + 'px;pointer-events:none;';

    el.style.visibility = 'hidden';
    mutarFn();

    const rectNuevo = el.getBoundingClientRect();
    const anchoNuevo = rectNuevo.width;
    const altoNuevo = rectNuevo.height;

    const snapNuevo = _limpiarClonVisual(el.cloneNode(true));
    snapNuevo.style.cssText = 'position:absolute;top:0;width:' + anchoNuevo + 'px;pointer-events:none;left:' + (delta > 0 ? anchoViejo : -anchoNuevo) + 'px;';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;overflow:hidden;pointer-events:none;width:' + anchoViejo + 'px;height:calc(' + altoViejo + 'px + ' + margenTop + ');';
    wrapper.appendChild(snapViejo);
    wrapper.appendChild(snapNuevo);

    el.parentNode.insertBefore(wrapper, el);
    el.style.display = 'none';
    el.style.visibility = '';

    wrapper.offsetHeight;
    const dur = DUR_CALENDARIO();
    const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
    snapViejo.style.transition = 'transform ' + dur + 'ms ' + easing;
    snapNuevo.style.transition = 'transform ' + dur + 'ms ' + easing;
    if (Math.abs(altoNuevo - altoViejo) > 0.5) {
        wrapper.style.transition = 'height ' + dur + 'ms ' + easing;
        wrapper.style.height = 'calc(' + altoNuevo + 'px + ' + margenTop + ')';
    }
    const tx = (delta > 0 ? -anchoViejo : anchoViejo) + 'px';
    snapViejo.style.transform = 'translateX(' + tx + ')';
    snapNuevo.style.transform = 'translateX(' + tx + ')';

    const timeout = setTimeout(() => {
        el.style.display = '';
        wrapper.parentNode?.insertBefore(el, wrapper);
        wrapper.remove();
        _slideAnimEstado.delete(el);
    }, dur + 20);

    _slideAnimEstado.set(el, { timeout, wrapper });
}

// Mientras está activa (p. ej. al cambiar de vista la tarjeta), _renderConFirma reemplaza sin animar.
let _rendersSinAnimar = false;

async function _conRendersSinAnimar(fn) {
    _rendersSinAnimar = true;
    try {
        return await fn();
    } finally {
        _rendersSinAnimar = false;
    }
}

function _rendersSinAnimarActivos() { return _rendersSinAnimar; }

/**
 * Reemplaza el contenido de `el` por un html`...` solo si cambió (dataset.firma) y lo anima; `forzar` lo aplica siempre sin animar.
 * Como montar(), rechaza strings comunes.
 * @param {(() => void) | null} [alAplicar]
 */
function _renderConFirma(el, contenido, alAplicar = null, { forzar = false } = {}) {
    if (!esHtmlSeguro(contenido)) throw new TypeError('_renderConFirma: el contenido debe ser un html`...` (core/html.js)');
    if (!el) { if (alAplicar) alAplicar(); return; }
    const nuevoHTML = String(contenido);
    const aplicar = () => {
        montar(el, contenido);
        el.dataset.firma = nuevoHTML;
        if (alAplicar) alAplicar();
    };
    if (forzar) { aplicar(); return; }
    if (el.dataset.firma === nuevoHTML) { if (alAplicar) alAplicar(); return; }
    if (_rendersSinAnimar) { aplicar(); return; }
    _animarMutacion(el, aplicar);
}

/**
 * Cambio de texto de hover (hitos de la tarjeta de estado): como _animarMutacion pero rápido (--dur-valor) y sin animar si el texto no cambia.
 * `fn` escribe el texto; `el` es el elemento cuyo contenido cambia.
 * @param {HTMLElement | null} el @param {() => void} fn
 */
function _animarTextoHover(el, fn) {
    if (!el) { fn(); return; }
    const antes = el.textContent;
    // se prueba primero sin animar: si el texto no cambia (p. ej. los hitos en la barra dejan el número de horas) no hay nada que animar y la mutación parpadearía
    fn();
    if (el.textContent === antes) return;
    el.textContent = antes;
    const dur = _getCSSdur('--dur-valor');
    el.classList.add('mutacion-rapida');
    const p = _animarMutacion(el, fn, dur);
    setTimeout(() => el.classList.remove('mutacion-rapida'), dur + 30);
    return p;
}

export const Animaciones = {
    _animarTextoHover,
    _durSiAnima,
    DUR_ANIM,
    DUR_CALENDARIO,
    DUR_FICHAJE_OK,
    DUR_FICHAJE_SALIDA,
    DUR_RECARGA,
    _aArray,
    _estaColapsado,
    _esperarAnim,
    _animarSlideElemento,
    _animarFadeSwap,
    _animarMutacion,
    _conRendersSinAnimar,
    _rendersSinAnimarActivos,
    _renderConFirma,
    _flashElemento,
    _crearFantasmaSiVisible,
    _animarValor,
    _animarAlturaCambio,
    _animarConteo,
    _conteoEnCurso,
    _cancelarConteo
};
