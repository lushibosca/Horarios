import { $ } from '../core/dom.js';
import {
    geometriaConector, geometriaDiagonal, holguraHaciaDerecha, repartirLados, entradaDebeSubir, salidaDebeEspejarse,
    holguraDescripcion, nivelDescripcion, MARGEN_DESCRIPCION_DERECHA
} from '../core/geometria-etiquetas.js';
import { SaldoSemanal } from '../services/saldo-semanal.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
//   BARRA DE HITOS — marcas de la barra de progreso (línea del día y semana)
// ====================================================================
// Con el hint integrado la barra de la tarjeta de fichaje lleva marcas con flecha y hora (vista diaria) o con flecha y sigla (vista semanal).
// Este módulo solo dibuja: los datos ya vienen resueltos en la vista (tarjeta-fichaje-vista.js).
const { _durSiAnima } = Animaciones;

// En móviles (mismo corte que el CSS responsivo) y con el formato de tiempo corto activo (vista.siglasCortas), las etiquetas de los días usan la inicial, que es más angosta
const _consultaMovil = window.matchMedia('(max-width: 600px)');

// La última marca llega al final de la barra; el dominio se estira solo si "ahora" la supera, y ahí las marcas se corren hacia la izquierda.
function _escalaLinea(L) {
    const fin = Math.max(L.salidaRel, L.bufferRel ?? 0, L.ahoraRel, 60);
    return t => Math.min(100, Math.max(0, (t / fin) * 100));
}

function _colocarEtiquetaLinea(el, pct, ancho) {
    if (!el) return;
    const w = el.offsetWidth;
    el.style.left = `${Math.max(0, Math.min(ancho - w, (pct / 100) * ancho - w / 2))}px`;
}

// Posiciona la etiqueta de una marca en "T" (ver core/geometria-etiquetas.js): a la izquierda del conector o, si no entra, espejada a la derecha.
function _colocarEtiquetaConector(et, tick, pct, ancho, forzarEspejado = false) {
    if (!et) return;
    const { espejado, left } = geometriaConector((pct / 100) * ancho, et.offsetWidth, 0, forzarEspejado);
    tick.classList.toggle('espejado', espejado);
    et.classList.toggle('linea-etiqueta--espejada', espejado);   // la descripción del foco se despliega hacia el lado contrario
    et.style.left = `${left}px`;
}

// Cada etiqueta lleva su hora en .linea-et-hora y, aparte, su descripción (.linea-et-desc, absoluta: no cambia el ancho de la etiqueta ni su posición)
const _horaDe = et => /** @type {HTMLElement} */ (et.querySelector('.linea-et-hora'));

// Elige la versión de la descripción que entra en el lugar libre (completa, abreviada o ninguna) y deja en la etiqueta lo que necesita el CSS:
// el texto, data-desc y el ancho que ocupa desplegada (--desc-ancho). Sin descripción (ninguna) la píldora del foco queda solo alrededor de la hora.
function _elegirDescripcion(et, [larga, corta], holgura) {
    const desc = et.querySelector('.linea-et-desc');
    if (!desc) return null;
    const medir = texto => { desc.textContent = texto; return desc.scrollWidth + 1; };
    const anchoLarga = medir(larga);
    const anchoCorta = corta === larga ? Infinity : medir(corta);
    const nivel = nivelDescripcion(holgura, anchoLarga, anchoCorta);
    return {
        nivel,
        texto: nivel === 'corta' ? corta : larga,
        ancho: nivel === 'larga' ? anchoLarga : nivel === 'corta' ? anchoCorta : 0
    };
}

function _aplicarDescripcion(et, d) {
    const desc = et.querySelector('.linea-et-desc');
    if (!desc || !d) return;
    desc.textContent = d.texto;
    et.dataset.desc = d.nivel;
    et.style.setProperty('--desc-ancho', `${d.ancho}px`);
}

function _ponerDescripcion(et, textos, holgura) {
    _aplicarDescripcion(et, _elegirDescripcion(et, textos, holgura));
}

// Despliegue a la derecha: si la descripción no entra completa a la izquierda de la hora (lado natural) pero a la derecha sí (o entra una versión más completa),
// mientras dura el foco la hora no se mueve y la descripción se abre hacia la derecha; al terminar vuelve al lado natural.
// `_despliegues` guarda por etiqueta ambos estados ya resueltos al medir; `desplegarADerecha` solo los intercambia.
const _NIVELES = { ninguna: 0, corta: 1, larga: 2 };
/** @type {WeakMap<HTMLElement, { natural: any, derecha: any, activo: boolean, timer?: ReturnType<typeof setTimeout> }>} */
const _despliegues = new WeakMap();

function _prepararDespliegueDerecha(et, textos, holgura, descNatural) {
    clearTimeout(_despliegues.get(et)?.timer);
    _despliegues.delete(et);
    if (!descNatural || descNatural.nivel === 'larga' || et.classList.contains('linea-etiqueta--espejada')) return;
    const derecha = _elegirDescripcion(et, textos, holgura);
    _aplicarDescripcion(et, descNatural);   // _elegirDescripcion deja puesto el texto de la última medición
    if (derecha && _NIVELES[derecha.nivel] > _NIVELES[descNatural.nivel]) _despliegues.set(et, { natural: descNatural, derecha, activo: false });
}

/**
 * Abre la descripción hacia la derecha de la hora (`activo`) o la devuelve al lado natural; sin una versión mejor a la derecha no hace nada.
 * @param {HTMLElement} et
 * @param {boolean} activo
 */
function desplegarADerecha(et, activo) {
    const v = _despliegues.get(et);
    if (!v) return;
    clearTimeout(v.timer);
    if (v.activo === activo) return;
    const aplicar = () => {
        v.activo = activo;
        et.classList.toggle('linea-etiqueta--espejada', activo);   // el CSS despliega hacia la derecha las etiquetas espejadas
        _aplicarDescripcion(et, activo ? v.derecha : v.natural);
    };
    if (activo) { aplicar(); return; }
    // al volver, la píldora y la descripción primero se pliegan donde estaban; recién entonces la descripción cambia de lado
    // (si no, salta de lado al instante y la píldora, que sigue animándose, queda desacoplada del texto)
    v.timer = setTimeout(aplicar, _msPlegado(et));
}

// Lo que tarda en apagarse la píldora del foco (casi 0 con el movimiento reducido, que deja las transiciones en 1 ms)
function _msPlegado(et) {
    const [dur] = getComputedStyle(et, '::after').transitionDuration.split(',');
    return Math.ceil((parseFloat(dur) || 0) * 1000) + 30;
}

// La descripción de cada hora se despliega hacia la izquierda (hacia la derecha si la marca está espejada; la entrada, que está pegada al comienzo, siempre a la derecha).
// Solo cuenta el espacio de la pista: mientras una hora está enfocada las demás están atenuadas, así que su píldora puede tapar a las vecinas.
function _ajustarDescripciones(L, ancho, { etEntrada, etSalida, etBuffer, tickSalida, tickBuffer }) {
    const izq = et => parseFloat(et.style.left) || 0;
    const finEntrada = izq(etEntrada) + etEntrada.offsetWidth;
    const limiteDerecho = ancho + MARGEN_DESCRIPCION_DERECHA;

    // entrada: siempre hacia la derecha
    _ponerDescripcion(etEntrada, ['Entrada', 'Entrada'], holguraDescripcion('derecha', finEntrada, limiteDerecho));

    // salida y buffer: a la izquierda hasta el comienzo de la pista; espejadas, a la derecha hasta el final
    const hacia = (et, espejada, limiteIzquierdo) => espejada
        ? holguraDescripcion('derecha', izq(et) + et.offsetWidth, limiteDerecho)
        : holguraDescripcion('izquierda', izq(et), limiteIzquierdo);
    const espejadaSalida = !L.cerrado && tickSalida.classList.contains('espejado');
    /** @type {[string, string]} */
    const textosSalida = L.cerrado ? ['Salida', 'Salida'] : ['Salida estimada', 'S. estimada'];
    const descSalida = _elegirDescripcion(etSalida, textosSalida, hacia(etSalida, espejadaSalida, 0));
    _aplicarDescripcion(etSalida, descSalida);
    _prepararDespliegueDerecha(etSalida, textosSalida, holguraHaciaDerecha(izq(etSalida), etSalida.offsetWidth, ancho), descSalida);
    if (L.hayBanda) {
        /** @type {[string, string]} */
        const textosBuffer = ['Con banco', 'Con banco'];
        const descBuffer = _elegirDescripcion(etBuffer, textosBuffer, hacia(etBuffer, tickBuffer.classList.contains('espejado'), 0));
        _aplicarDescripcion(etBuffer, descBuffer);
        _prepararDespliegueDerecha(etBuffer, textosBuffer, holguraHaciaDerecha(izq(etBuffer), etBuffer.offsetWidth, ancho), descBuffer);
    } else {
        _despliegues.delete(etBuffer);
    }
}

// Cambia la hora de entrada de lado (abajo/arriba de la barra): la copia sale en el lugar anterior y la etiqueta real reaparece en el nuevo
// con la misma animación y retardo con que aparecen las etiquetas al crear el registro (linea-etiqueta-aparece), así espera a que terminen de irse las líneas estimadas.
// No usa las clases compartidas de la mutación: al quitarlas, la animación de aparición propia de las etiquetas se reinicia y la hora parpadea.
function _ponerEntradaArriba(et, arriba) {
    const previo = et.dataset.arriba;
    et.dataset.arriba = String(arriba);
    if (previo === undefined || previo === String(arriba)) {
        et.classList.toggle('linea-etiqueta--entrada-arriba', arriba);
        return;
    }
    const durSalida = _durSiAnima('--dur-fast', et);
    const dur = _durSiAnima('--dur-slow', et);
    if (dur <= 0) { et.classList.toggle('linea-etiqueta--entrada-arriba', arriba); return; }
    const fantasma = /** @type {HTMLElement} */ (et.cloneNode(true));
    fantasma.removeAttribute('id');
    Object.assign(fantasma.style, { pointerEvents: 'none', animation: 'none', transition: 'none' });
    et.parentNode.appendChild(fantasma);
    et.classList.toggle('linea-etiqueta--entrada-arriba', arriba);
    const salida = fantasma.animate([{ opacity: 1 }, { opacity: 0 }], { duration: durSalida, easing: 'ease', fill: 'forwards' });
    salida.onfinish = () => fantasma.remove();
    const curva = getComputedStyle(document.documentElement).getPropertyValue('--ease-conteo').trim() || 'ease';
    et.animate([{ opacity: 0, translate: '0 0.35rem' }, { opacity: 1, translate: '0 0' }], {
        duration: dur, easing: curva, delay: arriba ? 450 : 300, fill: 'backwards'
    });
}

function _renderLinea(vista, pista, fill) {
    const L = vista.linea;
    const ancho = pista.clientWidth;
    pista.style.setProperty('--ancho-pista', ancho ? `${ancho}px` : '100%');

    const pct = _escalaLinea(L);
    const pSalida = pct(L.salidaRel);
    const pBuffer = L.bufferRel !== null ? pct(L.bufferRel) : null;
    const lo = pBuffer !== null && L.hayBanda ? Math.min(pSalida, pBuffer) : pSalida;
    const hi = pBuffer !== null && L.hayBanda ? Math.max(pSalida, pBuffer) : pSalida;
    const colorMedio = L.bufferPositivo ? (SaldoSemanal.logicaCubiertoActiva() ? 'gold' : 'green') : 'red';

    const banda = $('linea-banda');
    banda.style.left = `${lo}%`;
    banda.style.width = L.hayBanda ? `${hi - lo}%` : '0%';
    banda.style.setProperty('--banda-color', `var(--c-${colorMedio})`);

    const pMarca = pct(L.marcaSalidaRel);
    const tickSalida = $('linea-tick-salida');
    const tickBuffer = $('linea-tick-buffer');
    tickSalida.style.left = `${pMarca}%`;
    // cerrada, el remate del final ya marca la salida: queda solo la etiqueta con la hora
    tickSalida.style.opacity = L.cerrado ? '0' : '';
    tickBuffer.style.left = `${pBuffer ?? pSalida}%`;
    tickBuffer.style.opacity = L.hayBanda ? '1' : '0';
    tickBuffer.classList.toggle('positivo', L.bufferPositivo);
    tickBuffer.classList.toggle('negativo', !L.bufferPositivo);
    // hueco hasta que "ahora" llega a su posición (la entrada ya pasó siempre: su remate va relleno)
    tickSalida.classList.toggle('pendiente', L.ahoraRel < L.salidaRel);
    tickBuffer.classList.toggle('pendiente', L.bufferRel !== null && L.ahoraRel < L.bufferRel);

    const etEntrada = $('linea-et-entrada');
    const etSalida = $('linea-et-salida');
    const etBuffer = $('linea-et-buffer');
    _horaDe(etEntrada).textContent = L.horaEntrada;
    _horaDe(etSalida).textContent = L.horaSalida;
    _horaDe(etBuffer).textContent = L.horaBuffer;
    etBuffer.style.opacity = L.hayBanda ? '1' : '0';
    etBuffer.classList.toggle('positivo', L.bufferPositivo);
    etBuffer.classList.toggle('negativo', !L.bufferPositivo);
    _colocarEtiquetaLinea(etEntrada, 0, ancho);
    // cerrada no hay conector (queda solo la hora, centrada bajo el remate)
    if (L.cerrado) {
        _colocarEtiquetaLinea(etSalida, pMarca, ancho);
        etSalida.classList.remove('linea-etiqueta--espejada');
    } else {
        _colocarEtiquetaConector(etSalida, tickSalida, pMarca, ancho);
    }
    _colocarEtiquetaConector(etBuffer, tickBuffer, pBuffer ?? pSalida, ancho);
    // si la entrada no puede subir (arriba está la etiqueta del buffer en ese tramo) y la salida la pisa, la salida pasa a la derecha de su conector
    // (solo si ahí entra completa en la pista)
    if (!L.cerrado && salidaDebeEspejarse({
        ancho,
        entradaLeft: parseFloat(etEntrada.style.left),
        entradaAncho: etEntrada.offsetWidth,
        salidaLeft: parseFloat(etSalida.style.left),
        bufferLeft: L.hayBanda ? parseFloat(etBuffer.style.left) : null
    }) && geometriaConector((pMarca / 100) * ancho, etSalida.offsetWidth, 0, true).left + etSalida.offsetWidth <= ancho) {
        _colocarEtiquetaConector(etSalida, tickSalida, pMarca, ancho, true);
    }
    // si la hora de salida (abierta o cerrada) pisa o queda pegada a la de entrada, esta pasa arriba de la barra,
    // salvo que arriba esté la etiqueta del buffer en ese mismo tramo (sin ancho medido no se decide nada)
    const entradaArriba = entradaDebeSubir({
        ancho,
        entradaLeft: parseFloat(etEntrada.style.left),
        entradaAncho: etEntrada.offsetWidth,
        salidaLeft: parseFloat(etSalida.style.left),
        bufferLeft: L.hayBanda ? parseFloat(etBuffer.style.left) : null
    });
    _ponerEntradaArriba(etEntrada, entradaArriba);
    // sin ancho medido (pista oculta) no hay con qué decidir qué versión de la descripción entra
    if (ancho > 0) _ajustarDescripciones(L, ancho, { etEntrada, etSalida, etBuffer, tickSalida, tickBuffer });
    // un re-render con el foco activo recalcula todo en su lado natural: se vuelve a desplegar a la derecha lo que corresponda
    if (ancho > 0) [etSalida, etBuffer].forEach(et => { if (et.classList.contains('foco')) desplegarADerecha(et, true); });

    // relleno: azul hasta la primera salida, color del tramo entre ambas y verde al superar la última
    if (!L.cerrado) {
        fill.classList.add('segmentado');
        fill.style.setProperty('--seg-1', 'var(--c-blue)');
        fill.style.setProperty('--seg-2', `var(--c-${colorMedio})`);
        fill.style.setProperty('--seg-3', 'var(--c-green)');
        fill.style.setProperty('--seg-a', `${lo}%`);
        fill.style.setProperty('--seg-b', `${hi}%`);
    }
    // color del tramo que corresponde a una posición (%) de la barra
    return x => (x < lo ? 'blue' : (x < hi ? colorMedio : 'green'));
}

// Marca de cada día en la vista semanal: punto de anclaje y una línea fina a 45° (hacia abajo/arriba y a la izquierda) sobre la que sigue la sigla, también a 45°.
// Mismo svg de 26 x 20 que la vista diaria (punto en x=24); la línea arranca a unos 4 px del punto y termina en (10.2, 10.8).
const _SVG_NS = 'http://www.w3.org/2000/svg';
function _crearMarcaSemana() {
    const svg = document.createElementNS(_SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 26 20');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('focusable', 'false');
    const diagonal = document.createElementNS(_SVG_NS, 'path');
    diagonal.setAttribute('class', 'hito-diagonal');
    diagonal.setAttribute('d', 'M19 2 10.2 10.8');
    const ancla = document.createElementNS(_SVG_NS, 'use');
    ancla.setAttribute('href', '#hito-ancla');
    svg.append(diagonal, ancla);
    return svg;
}

// Vista semanal con hint integrado: un hito por día, al final de su franja, con su flecha y la inicial (L, M, X...); los días seguidos sin registro o especiales del mismo color se fusionan y hoy lleva un badge.
// Los elementos se reutilizan por fecha: así no se reinicia su animación de aparición en cada actualización.
// Cada sigla va del lado que tenga lugar (primero el que le toca por orden, luego el otro); si en ninguno entra, queda solo el punto sobre la barra.
function _renderSemana(vista, pista) {
    const cont = $('linea-semana');
    const ancho = pista.clientWidth;
    if (!cont || !(ancho > 0)) return;   // pista oculta: sin medidas no se puede ubicar nada (el resize vuelve a dibujar)
    const hitos = vista.hitosSemana ?? [];
    /** @type {Map<string, HTMLElement>} */
    const existentes = new Map();
    cont.querySelectorAll('span[data-fecha]').forEach(el => {
        const nodo = /** @type {HTMLElement} */ (el);
        existentes.set(`${nodo.dataset.fecha}${nodo.dataset.tipo}`, nodo);
    });
    const vigentes = new Set();
    const items = hitos.map((h, i) => {
        let tick = existentes.get(h.fecha + 'tick');
        let et = /** @type {HTMLElement} */ (existentes.get(h.fecha + 'et'));
        if (!tick) {
            tick = document.createElement('span');
            tick.dataset.fecha = h.fecha; tick.dataset.tipo = 'tick';
            tick.appendChild(_crearMarcaSemana());
            et = document.createElement('span');
            et.dataset.fecha = h.fecha; et.dataset.tipo = 'et';
            tick.className = 'linea-tick dia';
            et.className = 'linea-etiqueta dia linea-etiqueta--abajo';
            cont.append(tick, et);
        }
        et.classList.remove('linea-etiqueta--oculta');   // si estaba oculta hay que volver a medirla
        et.classList.toggle('linea-etiqueta--hoy', !!h.hoy);   // el badge cambia el ancho: tiene que estar antes de medir
        et.textContent = _consultaMovil.matches && vista.siglasCortas ? h.inicial : h.sigla;
        vigentes.add(h.fecha + 'tick'); vigentes.add(h.fecha + 'et');
        const pct = h.fraccion * 100;   // las franjas se miden sobre toda la pista, no sobre la parte llena
        const { desde, hasta, left, espejado } = geometriaDiagonal((pct / 100) * ancho, et.offsetWidth, et.offsetHeight);
        return { h, orden: i, prioridad: h.prioridad, tick, et, pct, desde, hasta, left, espejado, preferido: /** @type {'arriba' | 'abajo'} */ (i % 2 === 1 ? 'arriba' : 'abajo') };
    });

    const lados = repartirLados(items);

    items.forEach(it => {
        const lado = lados.get(it) ?? null;
        const arriba = (lado ?? it.preferido) === 'arriba';
        it.tick.className = `linea-tick dia${arriba ? ' linea-tick--buffer' : ''}${it.espejado ? ' espejado' : ''}${lado ? '' : ' solo-punto'}${it.h.futuro ? ' pendiente' : ''}`;
        it.et.className = `linea-etiqueta dia linea-etiqueta--${arriba ? 'arriba' : 'abajo'}${it.h.hoy ? ' linea-etiqueta--hoy' : ''}${it.espejado ? ' linea-etiqueta--espejada' : ''}${lado ? '' : ' linea-etiqueta--oculta'}`;
        it.tick.style.left = `${it.pct}%`;
        it.et.style.left = `${it.left}px`;
    });
    existentes.forEach((el, clave) => { if (!vigentes.has(clave)) el.remove(); });
}

// Los tramos vienen como fracciones de la pista; el relleno mide hasta el final del último, así que se reescalan a ese ancho
function _gradienteSemana(tramos, fin) {
    const pct = f => `${((f / fin) * 100).toFixed(3)}%`;
    const paradas = [];
    let cursor = 0;
    tramos.forEach(t => {
        if (t.desde > cursor + 1e-6) paradas.push(`transparent ${pct(cursor)} ${pct(t.desde)}`);
        paradas.push(`var(--c-${t.color}) ${pct(t.desde)} ${pct(t.hasta)}`);
        cursor = t.hasta;
    });
    return `linear-gradient(90deg, ${paradas.join(', ')})`;
}

// Texto para quien no ve la barra (lector de pantalla): lo que muestran las marcas, que ya no está en el texto de abajo
function _escribirResumen(texto) {
    const el = $('linea-resumen-sr');
    if (el && el.textContent !== texto) el.textContent = texto;
}

function _resumenLinea(L) {
    const salida = `Salida ${L.cerrado ? '' : 'estimada '}${L.horaSalida}.`;
    return `Entrada ${L.horaEntrada}. ${salida}${L.hayBanda ? ` Salida con buffer ${L.horaBuffer}.` : ''}`;
}

// Al salir de la vista diaria la hora de entrada pierde su lado: la próxima vez se coloca sin animar
function _reiniciarEntrada() {
    const et = $('linea-et-entrada');
    if (!et) return;
    delete et.dataset.arriba;
    et.classList.remove('linea-etiqueta--entrada-arriba');
}

/** @type {{ vista: any, pista: HTMLElement, fill: HTMLElement, conLinea: boolean, conSemana: boolean } | null} */
let _ultimo = null;

function _dibujar({ vista, pista, fill, conLinea, conSemana }) {
    if (!conLinea) _reiniciarEntrada();
    if (conSemana) _renderSemana(vista, pista);
    /** @type {((x: number) => string) | null} */
    let colorTramo = null;
    if (conLinea) colorTramo = _renderLinea(vista, pista, fill);
    _escribirResumen(conLinea ? _resumenLinea(vista.linea)
        : conSemana ? `Semana: ${(vista.hitosSemana ?? []).map(h => h.descripcion).join(', ')}.` : '');
    return colorTramo;
}

/**
 * Dibuja las marcas que correspondan (línea del día, semana o ninguna) y recuerda los argumentos para poder redibujar al cambiar el tamaño.
 * Devuelve, con la línea del día, la función que da el color del tramo según la posición (%) de la barra.
 * @param {{ vista: any, pista: HTMLElement, fill: HTMLElement, conLinea: boolean, conSemana: boolean }} args
 */
function render(args) {
    _ultimo = args.conLinea || args.conSemana ? args : null;
    return _dibujar(args);
}

function redibujar() {
    if (_ultimo) _dibujar(_ultimo);
}

export const BarraHitos = {
    desplegarADerecha,
    render,
    redibujar,
    escalaLinea: _escalaLinea,
    gradienteSemana: _gradienteSemana
};
