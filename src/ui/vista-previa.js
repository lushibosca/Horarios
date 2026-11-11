import { $, setColapsable } from '../core/dom.js';
import { Movimiento } from '../core/movimiento.js';
import { PosicionHeader } from '../core/posicion-header.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
// VISTA PREVIA EN VIVO (ajustes de apariencia que se prueban sobre la propia tarjeta)
// ====================================================================
// Algunas opciones de Ajustes (el estilo de la tarjeta de estado, el del calendario) se entienden mejor viéndolas. Al tocarlas se cierra Ajustes, la tarjeta
// se lleva a la vista (con scroll si hace falta) sobre un velo que atenúa el resto de la página, y abajo queda un panel con los mismos controles para ir
// cambiando y ver el resultado al instante. "Listo" (o tocar el velo, Escape o el botón Atrás) cierra la vista previa y devuelve a Ajustes (tocar el velo también).
//
// Este módulo no conoce las opciones: quien lo llama pasa las filas del panel y, si la tarjeta necesita prepararse (p. ej. expandir el calendario del histórico),
// un preparador registrado con `registrarPreparador` que devuelve cómo dejar todo como estaba.
//
// Las vistas previas (tarjeta de estado, calendario y tema) están integradas: se registran con `registrarVista` y `definirOrden`, y desde el panel se pasa de una a otra
// tocando las flechas de los costados del título (la de la izquierda va a la anterior y la de la derecha a la siguiente) o, en pantallas táctiles, deslizando el panel hacia los costados y, con mouse, girando la rueda sobre el panel. El tema no tiene tarjeta ni velo (hay que ver los colores
// de toda la página) y en lugar de filas muestra círculos de color para elegir.
//
// La vista previa agrega una entrada al historial del navegador (como los modales): así el botón Atrás de un móvil la cierra en vez de salir de la app.
// Todo cierre pasa por history.back() y se completa en el popstate, para no pisarse con el historial de los modales (ver gestor-modales.js).

/** @typedef {{ etiqueta: string, descripcion?: string, icono?: string, valor: () => string, alTocar: () => void, visible?: () => boolean }} FilaVistaPrevia */
/** @typedef {{ id: string, etiqueta: string, fondo: string, acento: string }} OpcionCirculo */
/** @typedef {{ opciones: OpcionCirculo[], actual: () => string, alElegir: (id: string) => void }} CirculosVistaPrevia */
/** `idObjetivo` es la tarjeta que se lleva a la vista (sin él no hay tarjeta); `circulos` reemplaza a las filas; `sinVelo` deja la página sin atenuar. */
/** @typedef {{ id: string, titulo: string, idObjetivo?: string, filas: FilaVistaPrevia[], circulos?: CirculosVistaPrevia, sinVelo?: boolean, antes?: () => void, alCerrar?: () => void }} ConfigVistaPrevia */

const NS_SVG = 'http://www.w3.org/2000/svg';
/** Demora entre cerrar Ajustes y mostrar la vista previa: deja pasar el popstate del modal para que los dos historiales no se pisen. */
const DEMORA_APERTURA_MS = 160;
/** Demora entre el popstate de la vista previa y lo que sigue (reabrir Ajustes): el gestor de modales ignora los popstate durante unos ms. */
const DEMORA_CIERRE_MS = 90;
const MARGEN_PX = 12;
/** Atajo desde las tarjetas y el encabezado (mantener y soltar sin mover, ver orden-tarjetas.js y header-posicion.js): soltar sin mover el dedo dentro de este tiempo abre la vista previa. */
export const VENTANA_PERSONALIZAR_MS = 1000;
/** El aviso dura menos que la ventana para no pisarse con el panel, que aparece en el mismo lugar de la pantalla. */
export const AVISO_PERSONALIZAR_MS = 800;
/** Deslizamiento del contenido del panel al pasar de una vista a otra, y lo que hay que arrastrar (px) en el panel para que cuente como deslizar. */
const DESLIZ_MS = 130;
const DESLIZ_PX = 36;
/** Duración del desplazamiento que devuelve la página a su lugar al cerrar la vista previa. */
const DESLIZ_SALIDA_MS = 300;
const UMBRAL_DESLIZAR_PX = 50;
/** Rueda del mouse sobre el panel: lo que hay que girar (suma de un mismo giro) para pasar de vista, y la pausa después de pasar (una vuelta rápida o la inercia del trackpad no saltan varias). */
const UMBRAL_RUEDA = 40;
const PAUSA_RUEDA_MS = 400;
const REPOSO_RUEDA_MS = 150;
/** Si la tarjeta es más alta que el espacio libre pero su borde superior ya se ve, alinearla arriba solo vale la pena si hay que mover más que esto. */
const TOLERANCIA_ALINEAR_PX = 40;

/** @type {Record<string, () => (() => void) | void>} */
const _preparadores = {};

/** Vistas registradas (id -> cómo armar su configuración) y el orden en que se pasa de una a otra. */
/** @type {Record<string, () => ConfigVistaPrevia>} */
const _vistas = {};
/** @type {string[]} */
let _orden = [];

/** @type {{ cfg: ConfigVistaPrevia, objetivo: HTMLElement | null, restaurar: (() => void) | null, filas: { def: FilaVistaPrevia, envoltorio: HTMLElement, btn: HTMLElement, valor: HTMLElement }[], circulos: { def: CirculosVistaPrevia, btns: { id: string, btn: HTMLElement }[], nombre: HTMLElement } | null, observer: ResizeObserver | null, timer: any } | null} */
let _activa = null;
let _cambiando = false;
let _iniciada = false;
let _cerrando = false;

/** Un preparador deja visible lo que se va a probar y devuelve cómo volver al estado anterior. @param {string} id @param {() => (() => void) | void} fn */
function registrarPreparador(id, fn) {
    _preparadores[id] = fn;
}

/** Registra una vista previa: `fabrica` arma su configuración cada vez que se la muestra. @param {string} id @param {() => ConfigVistaPrevia} fabrica */
function registrarVista(id, fabrica) {
    _vistas[id] = fabrica;
}

/** Orden en que se pasa de una vista a otra desde el panel (la última vuelve a la primera). @param {string[]} ids */
function definirOrden(ids) {
    _orden = ids;
}

function _icono(href) {
    const svg = document.createElementNS(NS_SVG, 'svg');
    svg.setAttribute('class', 'icon');
    const uso = document.createElementNS(NS_SVG, 'use');
    uso.setAttribute('href', href);
    svg.append(uso);
    return svg;
}

function _construirFilas(defs) {
    const cont = $('vista-previa-filas');
    if (!cont) return [];
    cont.replaceChildren();
    return defs.map(def => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const texto = document.createElement('span');
        texto.className = 'settings-list-text';
        const titulo = document.createElement('span');
        titulo.textContent = def.etiqueta;
        texto.append(titulo);
        if (def.descripcion) {
            const desc = document.createElement('span');
            desc.className = 'settings-list-desc';
            desc.textContent = def.descripcion;
            texto.append(desc);
        }
        const valor = document.createElement('span');
        btn.append(_icono(def.icono ?? '#icon-eye'), texto, valor);
        // cada fila va dentro de un colapsable: al aparecer o desaparecer una subopción se despliega o se pliega con la misma animación que en Ajustes
        const envoltorio = document.createElement('div');
        envoltorio.className = 'collapsible';
        const interior = document.createElement('div');
        interior.className = 'collapsible-inner';
        interior.append(btn);
        envoltorio.append(interior);
        btn.addEventListener('click', () => {
            def.alTocar();
            _refrescar();
            // la tarjeta puede cambiar de alto (se anima): se vuelve a encuadrar cuando termina
            clearTimeout(_activa?.timer);
            if (_activa) _activa.timer = setTimeout(_llevarAVista, 380);
        });
        cont.append(envoltorio);
        return { def, envoltorio, btn, valor };
    });
}

/** En lugar de filas, círculos de color para elegir (el tema): cada uno muestra el fondo y el acento de su opción. @param {HTMLElement} cont @param {CirculosVistaPrevia} def */
function _construirCirculos(cont, def) {
    const grupo = document.createElement('div');
    grupo.className = 'vista-previa-circulos';
    grupo.setAttribute('role', 'group');
    const btns = def.opciones.map(op => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vista-previa-circulo';
        btn.style.setProperty('--muestra-fondo', op.fondo);
        btn.style.setProperty('--muestra-acento', op.acento);
        btn.setAttribute('aria-label', op.etiqueta);
        btn.title = op.etiqueta;
        btn.addEventListener('click', () => { def.alElegir(op.id); _refrescar(); });
        grupo.append(btn);
        return { id: op.id, btn };
    });
    const nombre = document.createElement('span');
    nombre.className = 'vista-previa-circulos-nombre';
    cont.append(grupo, nombre);
    if (_activa) _activa.circulos = { def, btns, nombre };
}

function _marcarCirculos() {
    const c = _activa?.circulos;
    if (!c) return;
    const actual = c.def.actual();
    c.btns.forEach(({ id, btn }) => {
        btn.classList.toggle('activo', id === actual);
        btn.setAttribute('aria-pressed', String(id === actual));
    });
    c.nombre.textContent = c.def.opciones.find(o => o.id === actual)?.etiqueta ?? '';
}

/** Arma el contenido del panel de la vista activa (título, filas o círculos), sin animar. */
function _poblar() {
    if (!_activa) return;
    const { cfg } = _activa;
    const titulo = $('vista-previa-titulo-texto');
    if (titulo) titulo.textContent = cfg.titulo;
    // las flechas de los costados del título solo se muestran si hay otra vista a dónde ir
    $('vista-previa-titulo')?.classList.toggle('con-otras', _orden.length > 1);
    document.body.classList.toggle('vista-previa-sin-velo', !!cfg.sinVelo);
    const cont = $('vista-previa-filas');
    _activa.circulos = null;
    if (cont) cont.classList.toggle('settings-list', !cfg.circulos);
    if (cfg.circulos && cont) {
        cont.replaceChildren();
        _activa.filas = [];
        _construirCirculos(cont, cfg.circulos);
    } else {
        _activa.filas = _construirFilas(cfg.filas);
    }
    _refrescar(false);
}

/** Ancho que tendría el valor con `texto` (se mide con una copia oculta que hereda la misma tipografía). @param {HTMLElement} el @param {string} texto */
function _anchoConTexto(el, texto) {
    const medidor = /** @type {HTMLElement} */ (el.cloneNode(false));
    medidor.removeAttribute('style');
    medidor.textContent = texto;
    Object.assign(medidor.style, { position: 'absolute', visibility: 'hidden', width: 'auto', pointerEvents: 'none' });
    el.parentElement?.append(medidor);
    const ancho = medidor.getBoundingClientRect().width;
    medidor.remove();
    return ancho;
}

/**
 * Cambia el valor de una fila con el desplazamiento vertical de siempre y, además, anima su ANCHO del anterior al nuevo: el texto de la izquierda (nombre y
 * descripción, que se recortan con puntos suspensivos) gana o pierde lugar de a poco en vez de mostrarse o recortarse de golpe cuando el valor es más corto o más largo.
 * @param {HTMLElement} el @param {string} texto
 */
function _cambiarValor(el, texto) {
    const dur = Animaciones._durSiAnima('--dur-valor', el);
    const antes = el.getBoundingClientRect().width;
    if (!(dur > 1) || !(antes > 0) || el.textContent === texto) { Animaciones._animarValor(el, texto, 1); return; }
    const despues = _anchoConTexto(el, texto);
    el.style.width = `${antes}px`;
    Animaciones._animarValor(el, texto, 1);
    if (Math.abs(despues - antes) < 1) { el.style.width = ''; return; }
    void el.offsetWidth;
    el.style.transition = `width ${dur}ms ease-out`;
    el.style.width = `${despues}px`;
    clearTimeout(/** @type {any} */ (el).__finAncho);
    /** @type {any} */ (el).__finAncho = setTimeout(() => { el.style.width = ''; el.style.transition = ''; }, dur + 60);
}

/** @param {boolean} [animar] con false (la primera vez) las filas quedan en su estado sin transición */
function _refrescar(animar = true) {
    if (!_activa) return;
    _marcarCirculos();
    const filas = _activa.filas;
    const visibles = filas.map(f => (f.def.visible ? f.def.visible() : true));
    const aplicar = () => {
        filas.forEach((f, i) => {
            // el valor cambia con el mismo desplazamiento vertical que los valores de Ajustes (la primera vez, sin animar)
            if (animar) _cambiarValor(f.valor, f.def.valor());
            else Animaciones._animarValor(f.valor, f.def.valor(), 0);
            if (f.envoltorio.classList.contains('expanded') !== visibles[i]) setColapsable(f.envoltorio, visibles[i], { animar });
        });
    };
    // Si no aparece ni desaparece ninguna fila (eso ya lo anima su colapsable), un valor más largo o corto puede partir el texto en otra cantidad de líneas
    // y cambiar el alto del panel: ese cambio también se anima
    const cambiaVisibilidad = filas.some((f, i) => f.envoltorio.classList.contains('expanded') !== visibles[i]);
    const panel = $('vista-previa-panel');
    if (animar && !cambiaVisibilidad && panel) Animaciones._animarAlturaCambio(panel, aplicar);
    else aplicar();
}

/**
 * Deja la tarjeta entera entre el encabezado y el panel: si ya se ve entera no se mueve (ni unos píxeles); si es más alta que el espacio libre se alinea arriba,
 * salvo que su borde superior ya se vea y falten pocos píxeles (en una pantalla grande la página casi no se desplaza: el espacio que se reserva abajo para el
 * panel la hacía "saltar" unos píxeles, y al cerrar volvía sola cuando desaparecía esa reserva).
 */
function _llevarAVista() {
    if (!_activa?.objetivo) return;
    // el borde de arriba que deja libre el encabezado: solo cuenta si va arriba
    const bordeEncabezado = PosicionHeader.altoSuperior();
    const libreSup = bordeEncabezado + MARGEN_PX;
    const libreInf = window.innerHeight - _alturaReservada() - MARGEN_PX;
    const r = _activa.objetivo.getBoundingClientRect();
    // lo que se ve de verdad: entre el encabezado y el panel tal como está ahora (sin los márgenes ni la reserva del peor caso, que solo sirven para decidir cuánto
    // desplazar cuando hace falta). Si la tarjeta ya cae entera ahí, no hay nada que acercar: la página se queda donde está
    const panel = $('vista-previa-panel');
    const finVisible = window.innerHeight - (panel ? panel.offsetHeight : 0);
    if (r.top >= bordeEncabezado && r.bottom <= finVisible) return;
    let delta = 0;
    if (r.height > libreInf - libreSup || r.top < libreSup) {
        delta = r.top - libreSup;
        if (r.top >= bordeEncabezado && Math.abs(delta) <= TOLERANCIA_ALINEAR_PX) delta = 0;
    } else if (r.bottom > libreInf) delta = r.bottom - libreInf;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: Movimiento.scrollBehavior() });
}

/**
 * Lo que ocupa el panel en su peor caso: la cabecera, las filas fijas (la principal, la última, y las que no dependen de nada) y la subopción más alta (a la vez solo se muestra una). Es lo que se reserva
 * abajo de la página y lo que se descuenta al encuadrar la tarjeta: así, cuando una subopción aparece o desaparece y el panel crece o se achica, la página de
 * atrás no se corre ni hay que volver a desplazarla (esa era una segunda animación encima de la del panel).
 */
function _alturaReservada() {
    const panel = $('vista-previa-panel');
    if (!panel) return 0;
    const filas = _activa ? _activa.filas : [];
    const alto = (/** @type {{ btn: HTMLElement }} */ f) => f.btn.offsetHeight;   // el alto natural del botón, aunque su colapsable esté plegado
    // lo fijo del panel (cabecera y márgenes) = su alto actual menos el de todas las filas tal como se ven ahora (plegadas, a medias o desplegadas)
    const base = panel.offsetHeight - filas.reduce((suma, f) => suma + f.envoltorio.offsetHeight, 0);
    // las filas sin `visible` están siempre (la principal y las fijas, como el fondo); las condicionales son subopciones y a la vez solo se muestra una
    const fijas = filas.filter(f => !f.def.visible).reduce((suma, f) => suma + alto(f), 0);
    const subopciones = Math.max(0, ...filas.filter(f => f.def.visible).map(alto));
    return Math.ceil(base + fijas + subopciones);
}

function _medirPanel() {
    const panel = $('vista-previa-panel');
    if (panel) document.body.style.setProperty('--vp-panel-h', `${_alturaReservada()}px`);
}

function _mostrar() {
    if (!_activa) return;
    const { objetivo } = _activa;
    const panel = $('vista-previa-panel');
    const velo = $('vista-previa-velo');
    if (!panel || !velo) return;

    _poblar();

    objetivo?.classList.add('vista-previa-objetivo');
    document.body.classList.add('vista-previa-activa');
    velo.classList.add('show');
    panel.classList.add('show');
    panel.inert = false;
    history.pushState({ vistaPrevia: true }, '');

    _medirPanel();
    // las filas que aparecen o desaparecen al cambiar de estilo cambian el alto del panel: el espacio de abajo y el encuadre lo siguen
    // la reserva ya cubre el peor caso: solo se mide de nuevo si cambia la cantidad de líneas de un texto (por ejemplo al girar el celular)
    _activa.observer = new ResizeObserver(() => { _medirPanel(); });
    _activa.observer.observe(panel);
    _activa.timer = setTimeout(_llevarAVista, 60);
    // el foco va a la primera fila fija (la principal): las subopciones, si las hay, quedan arriba
    _activa.filas.find(f => !f.def.visible)?.btn.focus({ preventScroll: true });
}

/**
 * Abre la vista previa: cierra Ajustes (`antes`), lleva la tarjeta a la vista y muestra el panel con `filas`.
 * Las filas se muestran en el orden dado y la ÚLTIMA es la principal: las subopciones van antes, porque el panel está anclado abajo y crece hacia arriba,
 * así la fila que se toca para cambiar el estilo no se mueve cuando aparece o desaparece una subopción.
 * @param {ConfigVistaPrevia} cfg
 */
function abrir(cfg) {
    if (_activa) return;
    const objetivo = cfg.idObjetivo ? $(cfg.idObjetivo) : null;
    if (cfg.idObjetivo && !objetivo) return;
    cancelAnimationFrame(_animSalida);
    _activa = { cfg, objetivo, restaurar: null, filas: [], circulos: null, observer: null, timer: null };
    _cerrando = false;
    cfg.antes?.();
    _activa.restaurar = _preparadores[cfg.id]?.() ?? null;
    setTimeout(_mostrar, DEMORA_APERTURA_MS);
}

/** Desliza el contenido del panel (título y filas) hacia un costado (saliendo) o desde él (entrando). Devuelve las animaciones, para cancelarlas cuando ya no hacen falta. */
async function _deslizar(dx, entrando) {
    if (Movimiento.reducido()) return [];
    const quieto = { transform: 'translateX(0)', opacity: 1 };
    const lejos = { transform: `translateX(${dx}px)`, opacity: 0 };
    const anims = [$('vista-previa-titulo-texto'), $('vista-previa-filas')]
        .filter(el => el)
        .map(el => /** @type {HTMLElement} */ (el).animate(entrando ? [lejos, quieto] : [quieto, lejos], { duration: DESLIZ_MS, easing: 'ease-out', fill: 'forwards' }));
    await Promise.all(anims.map(a => a.finished.catch(() => {})));
    return anims;
}

/** Pasa a la vista de al lado en el orden (`delta` 1 = la siguiente, -1 = la anterior). La vista previa sigue abierta: solo cambia lo que se prueba. @param {number} delta */
async function cambiar(delta) {
    if (!_activa || _cerrando || _cambiando || _orden.length < 2) return;
    const i = _orden.indexOf(_activa.cfg.id);
    if (i < 0) return;
    const nueva = _vistas[_orden[(i + delta + _orden.length) % _orden.length]]?.();
    if (!nueva) return;
    const objetivo = nueva.idObjetivo ? $(nueva.idObjetivo) : null;
    if (nueva.idObjetivo && !objetivo) return;
    _cambiando = true;
    try {
        const salida = await _deslizar(-delta * DESLIZ_PX, false);
        const activa = _activa;
        if (!activa || _cerrando) return;
        // sale lo anterior (lo que había preparado se deshace) y entra lo nuevo; Ajustes (alCerrar) sigue siendo a donde se vuelve al cerrar
        clearTimeout(activa.timer);
        activa.objetivo?.classList.remove('vista-previa-objetivo');
        activa.restaurar?.();
        activa.cfg = { ...nueva, antes: activa.cfg.antes, alCerrar: activa.cfg.alCerrar };
        activa.objetivo = objetivo;
        activa.restaurar = _preparadores[nueva.id]?.() ?? null;
        // la altura que se anima es la de la zona de opciones y no la del panel: el panel está anclado abajo y su cabecera (flechas y Listo) va después de las opciones,
        // así que la cabecera queda quieta mientras las opciones crecen o se achican hacia arriba
        Animaciones._animarAlturaCambio($('vista-previa-filas'), () => _poblar());
        objetivo?.classList.add('vista-previa-objetivo');
        _medirPanel();
        // el calendario o la tarjeta se anima al prepararse: se encuadra cuando termina
        activa.timer = setTimeout(_llevarAVista, 380);
        salida.forEach(a => a.cancel());
        const entrada = await _deslizar(delta * DESLIZ_PX, true);
        entrada.forEach(a => a.cancel());
    } finally {
        _cambiando = false;
    }
}

/** Deslizar el panel hacia los costados (pantallas táctiles) pasa a la vista de al lado: hacia la izquierda, la siguiente. */
function _bindDeslizar() {
    const panel = $('vista-previa-panel');
    if (!panel) return;
    let inicio = null;
    let tragarClic = false;
    panel.addEventListener('pointerdown', (e) => {
        inicio = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    });
    panel.addEventListener('pointerup', (e) => {
        if (!inicio || e.pointerId !== inicio.id) return;
        const dx = e.clientX - inicio.x;
        const dy = e.clientY - inicio.y;
        inicio = null;
        if (Math.abs(dx) < UMBRAL_DESLIZAR_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        // el dedo que se levanta sobre un botón no debe contar además como toque
        tragarClic = true;
        setTimeout(() => { tragarClic = false; }, 120);
        cambiar(dx < 0 ? 1 : -1);
    });
    panel.addEventListener('pointercancel', () => { inicio = null; });
    panel.addEventListener('click', (e) => {
        if (!tragarClic) return;
        e.stopPropagation();
        e.preventDefault();
    }, true);
}

/** La rueda del mouse (o el desplazamiento horizontal del trackpad) sobre el panel pasa de vista: hacia abajo la siguiente, hacia arriba la anterior. */
function _bindRueda() {
    const panel = $('vista-previa-panel');
    if (!panel) return;
    let acumulado = 0;
    let hastaPausa = 0;
    let timerReposo = null;
    panel.addEventListener('wheel', (e) => {
        if (!_activa || _cerrando) return;
        // el panel está fijo sobre la página: sin esto la rueda desplazaría lo que hay detrás
        e.preventDefault();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) < 4 || performance.now() < hastaPausa) return;
        clearTimeout(timerReposo);
        timerReposo = setTimeout(() => { acumulado = 0; }, REPOSO_RUEDA_MS);
        acumulado += delta;
        if (Math.abs(acumulado) < UMBRAL_RUEDA) return;
        const direccion = acumulado > 0 ? 1 : -1;
        acumulado = 0;
        hastaPausa = performance.now() + PAUSA_RUEDA_MS;
        cambiar(direccion);
    }, { passive: false });
}

/** Pide cerrar: la vuelta atrás del historial dispara el popstate, que termina el cierre. */
function cerrar() {
    if (!_activa || _cerrando) return;
    _cerrando = true;
    history.back();
    // red de seguridad: si por algo no llega el popstate, se termina igual
    setTimeout(() => { if (_activa && _cerrando) _finalizar(); }, 600);
}

/** Animación en curso del desplazamiento de salida (ver `_soltarEspacioInferior`). */
let _animSalida = 0;

function _quitarEspacioInferior() {
    document.body.classList.remove('vista-previa-activa');
    document.body.style.removeProperty('--vp-panel-h');
}

/**
 * Al cerrar, el espacio que se reservó abajo para el panel se quita; si la página estaba desplazada hacia ese espacio, el navegador la acomoda de golpe (salta arriba).
 * Para que sea suave se lleva primero el desplazamiento hasta donde queda sin ese espacio y recién entonces se lo quita.
 */
function _soltarEspacioInferior() {
    cancelAnimationFrame(_animSalida);
    const reservado = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    const maximo = Math.max(0, document.documentElement.scrollHeight - reservado - window.innerHeight);
    const desde = window.scrollY;
    if (desde <= maximo + 1 || Movimiento.reducido()) { _quitarEspacioInferior(); return; }
    const inicio = performance.now();
    const paso = (/** @type {number} */ ahora) => {
        // otra vista previa abierta mientras tanto se queda con el espacio
        if (_activa) return;
        const t = Math.min(1, (ahora - inicio) / DESLIZ_SALIDA_MS);
        window.scrollTo(0, desde + (maximo - desde) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) _animSalida = requestAnimationFrame(paso);
        else _quitarEspacioInferior();
    };
    _animSalida = requestAnimationFrame(paso);
}

function _finalizar() {
    const activa = _activa;
    if (!activa) return;
    _activa = null;
    _cerrando = false;
    clearTimeout(activa.timer);
    activa.observer?.disconnect();
    activa.objetivo?.classList.remove('vista-previa-objetivo');
    document.body.classList.remove('vista-previa-sin-velo');
    _soltarEspacioInferior();
    $('vista-previa-velo')?.classList.remove('show');
    const panel = $('vista-previa-panel');
    // el foco sale del panel antes de ocultarlo (un elemento oculto a los lectores de pantalla no puede conservarlo) y `inert` lo saca del orden de Tab
    if (panel && document.activeElement instanceof HTMLElement && panel.contains(document.activeElement)) document.activeElement.blur();
    panel?.classList.remove('show');
    if (panel) panel.inert = true;
    activa.restaurar?.();
    if (activa.cfg.alCerrar) setTimeout(() => activa.cfg.alCerrar?.(), DEMORA_CIERRE_MS);
}

function bindEventos() {
    if (_iniciada) return;
    _iniciada = true;
    $('vista-previa-listo')?.addEventListener('click', () => cerrar());
    // las flechas de los costados del título pasan a la vista anterior o a la siguiente; el deslizamiento táctil, a la de al lado
    $('vista-previa-anterior')?.addEventListener('click', () => cambiar(-1));
    $('vista-previa-siguiente')?.addEventListener('click', () => cambiar(1));
    _bindDeslizar();
    _bindRueda();
    // tocar el velo (fuera de la tarjeta y del panel) cierra igual que Listo: el estilo elegido queda como está
    $('vista-previa-velo')?.addEventListener('click', () => cerrar());
    window.addEventListener('popstate', () => { if (_activa && document.body.classList.contains('vista-previa-activa')) _finalizar(); });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _activa && document.body.classList.contains('vista-previa-activa')) { e.preventDefault(); cerrar(); }
    });
    window.addEventListener('resize', () => { _medirPanel(); });
}

export const VistaPrevia = { abrir, cerrar, cambiar, bindEventos, registrarPreparador, registrarVista, definirOrden, activa: () => !!_activa };
