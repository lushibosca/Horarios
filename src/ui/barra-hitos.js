import { $ } from '../core/dom.js';
import { geometriaConector, repartirLados, entradaDebeSubir, MARGEN_SIGLAS } from '../core/geometria-etiquetas.js';
import { SaldoSemanal } from '../services/saldo-semanal.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
//   BARRA DE HITOS — marcas de la barra de progreso (línea del día y semana)
// ====================================================================
// Con el hint integrado la barra de la tarjeta de fichaje lleva marcas con flecha y hora (vista diaria) o con flecha y sigla (vista semanal).
// Este módulo solo dibuja: los datos ya vienen resueltos en la vista (tarjeta-fichaje-vista.js).
const { _durSiAnima } = Animaciones;

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
function _colocarEtiquetaConector(et, tick, pct, ancho) {
    if (!et) return;
    const { espejado, left } = geometriaConector((pct / 100) * ancho, et.offsetWidth);
    tick.classList.toggle('espejado', espejado);
    et.style.left = `${left}px`;
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

    const etEntrada = $('linea-et-entrada');
    const etSalida = $('linea-et-salida');
    const etBuffer = $('linea-et-buffer');
    etEntrada.textContent = L.horaEntrada;
    etSalida.textContent = L.horaSalida;
    etBuffer.textContent = L.horaBuffer;
    etBuffer.style.opacity = L.hayBanda ? '1' : '0';
    etBuffer.classList.toggle('positivo', L.bufferPositivo);
    etBuffer.classList.toggle('negativo', !L.bufferPositivo);
    _colocarEtiquetaLinea(etEntrada, 0, ancho);
    // cerrada no hay conector (queda solo la hora, centrada bajo el remate)
    if (L.cerrado) _colocarEtiquetaLinea(etSalida, pMarca, ancho);
    else _colocarEtiquetaConector(etSalida, tickSalida, pMarca, ancho);
    _colocarEtiquetaConector(etBuffer, tickBuffer, pBuffer ?? pSalida, ancho);
    // si la hora de salida (abierta o cerrada) pisa o queda pegada a la de entrada, esta pasa arriba de la barra,
    // salvo que arriba esté la etiqueta del buffer en ese mismo tramo (sin ancho medido no se decide nada)
    _ponerEntradaArriba(etEntrada, entradaDebeSubir({
        ancho,
        entradaLeft: parseFloat(etEntrada.style.left),
        entradaAncho: etEntrada.offsetWidth,
        salidaLeft: parseFloat(etSalida.style.left),
        bufferLeft: L.hayBanda ? parseFloat(etBuffer.style.left) : null
    }));

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

// Vista semanal con hint integrado: un hito por día con horas (los días seguidos sin registro, futuros o especiales del mismo color se fusionan), al final de su franja, con su flecha y la sigla (lun, mar...).
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
    const svgBase = $('linea-tick-salida')?.firstElementChild;

    const items = hitos.map((h, i) => {
        let tick = existentes.get(h.fecha + 'tick');
        let et = /** @type {HTMLElement} */ (existentes.get(h.fecha + 'et'));
        if (!tick) {
            tick = document.createElement('span');
            tick.dataset.fecha = h.fecha; tick.dataset.tipo = 'tick';
            if (svgBase) tick.appendChild(svgBase.cloneNode(true));
            et = document.createElement('span');
            et.dataset.fecha = h.fecha; et.dataset.tipo = 'et';
            tick.className = 'linea-tick dia';
            et.className = 'linea-etiqueta dia linea-etiqueta--abajo';
            cont.append(tick, et);
        }
        et.classList.remove('linea-etiqueta--oculta');   // si estaba oculta hay que volver a medirla
        et.textContent = h.sigla;
        vigentes.add(h.fecha + 'tick'); vigentes.add(h.fecha + 'et');
        const pct = h.fraccion * 100;   // las franjas se miden sobre toda la pista, no sobre la parte llena
        const { desde, hasta } = geometriaConector((pct / 100) * ancho, et.offsetWidth, MARGEN_SIGLAS);
        return { h, orden: i, prioridad: h.prioridad, tick, et, pct, desde, hasta, preferido: /** @type {'arriba' | 'abajo'} */ (i % 2 === 1 ? 'arriba' : 'abajo') };
    });

    const lados = repartirLados(items);

    items.forEach(it => {
        const lado = lados.get(it) ?? null;
        const arriba = (lado ?? it.preferido) === 'arriba';
        it.tick.className = `linea-tick dia${arriba ? ' linea-tick--buffer' : ''}${lado ? '' : ' solo-punto'}`;
        it.et.className = `linea-etiqueta dia linea-etiqueta--${arriba ? 'arriba' : 'abajo'}${lado ? '' : ' linea-etiqueta--oculta'}`;
        it.tick.style.left = `${it.pct}%`;
        _colocarEtiquetaConector(it.et, it.tick, it.pct, ancho);
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
    render,
    redibujar,
    escalaLinea: _escalaLinea,
    gradienteSemana: _gradienteSemana
};
