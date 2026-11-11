import { $, superaUnaLinea } from '../core/dom.js';
import { uiAnimarReubicacion } from './arrastre.js';
import { Animaciones } from './animaciones.js';
import { EstiloTarjeta } from '../core/estilo-tarjeta.js';
import { duracionCompacta, hitosOrdenados, horaCorta, resumenesDeMedida } from '../core/resumen-tarjeta.js';

// ====================================================================
// DISEÑOS PROPIOS DE LA TARJETA DE ESTADO (vista diaria): anillo, línea de tiempo y lista de filas
// ====================================================================
// Cada diseño arma su DOM una sola vez dentro de #stats-estilo y después solo actualiza textos y variables CSS con el `resumen` que deriva
// tarjeta-fichaje-vista.js (tipo 'registro', 'espera' o 'especial'). El CSS (tarjetas-vistas.css, sección "ESTILOS DE LA TARJETA") hace el resto:
// colores por tono (data-tono) y por estado (data-color), y los avances por variables (--ring-offset, --avance, --banco).
// Todo se escribe con createElement/textContent: sin innerHTML (Trusted Types) y sin estilos en línea en el HTML (CSP).
const NS_SVG = 'http://www.w3.org/2000/svg';

/** @param {string} tag @param {string} [clase] @param {string} [texto] @returns {HTMLElement} */
function el(tag, clase = '', texto = '') {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto) n.textContent = texto;
    return n;
}

/** @param {string} clase @returns {SVGCircleElement} círculo de radio 44 con pathLength 100: el avance es un dashoffset de 0 a 100 */
function circulo(clase) {
    const c = /** @type {SVGCircleElement} */ (document.createElementNS(NS_SVG, 'circle'));
    c.setAttribute('class', clase);
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', '44');
    c.setAttribute('pathLength', '100');
    return c;
}

/** @param {Element} n @param {string} texto */
const fijar = (n, texto) => { if (n.textContent !== texto) n.textContent = texto; };
/** @param {Element} n @param {boolean} visible */
const mostrar = (n, visible) => n.classList.toggle('hidden', !visible);
/** @param {HTMLElement} n @param {string | undefined} tono 'neutro' | 'green' | 'red' | 'gold' */
const entonar = (n, tono) => { n.dataset.tono = tono || 'neutro'; };

/**
 * Pone en `n` el primer texto de `textos` que entra en una línea: el completo y, solo si se parte en dos, la siguiente versión (más corta).
 * Cada llamada parte del texto completo, así que vuelve solo cuando vuelve a entrar (ej. al girar el celular). Con un solo texto equivale a `fijar`.
 * Necesita el elemento en el documento y visible para medir; sin eso (alto 0) queda el completo.
 * @param {HTMLElement} n @param {string | string[] | undefined} textos
 */
/** Versiones de cada texto "que entre" (de la más completa a la más corta): hace falta recordarlas para volver a elegir cuando cambia el ancho del lugar donde está. @type {WeakMap<HTMLElement, string[]>} */
const _versionesQueEntre = new WeakMap();

function fijarQueEntre(n, textos) {
    const versiones = [textos ?? ''].flat();
    _versionesQueEntre.set(n, versiones);
    fijar(n, versiones[0]);
    for (let i = 1; i < versiones.length && superaUnaLinea(n, n.scrollHeight); i++) fijar(n, versiones[i]);
}
const _pad2 = n => String(n).padStart(2, '0');

/** Frase del banco de horas de la semana: "▲ 19 min extras esta semana". @param {{ minutos: number, positivo: boolean }} banco */
const fraseBanco = banco => `${banco.positivo ? '▲' : '▼'} ${duracionCompacta(Math.abs(banco.minutos))} ${banco.positivo ? 'extras' : 'faltantes'} esta semana`;
/**
 * Etiqueta del mosaico de balance (la comparten la línea de tiempo y el anillo): con el registro en curso y el objetivo del día cumplido, el extra es el de hoy
 * (cerrado o en la semana queda "Extra"). @param {any} d resumen
 */
const etiquetaBalance = d => (d.tipo === 'registro' && !d.cerrado && d.balance.etiqueta === 'Extra' ? 'Extra de hoy' : d.balance.etiqueta);
/** @param {{ positivo: boolean } | null} banco */
const tonoBanco = banco => (banco ? (banco.positivo ? 'green' : 'red') : 'neutro');

/** El avance vive en el contenedor del aro (lo leen el arco y el brillo). @param {HTMLElement} aro @param {any} arco @param {any} p avance de 0 a 100 */
function pintarAvance(aro, arco, p) {
    const v = Math.max(0, Math.min(100, p));
    aro.style.setProperty('--ring-offset', String(100 - v));
    arco.classList.toggle('vacio', v <= 0);
    aro.querySelector('.est-anillo-inicio')?.classList.toggle('vacio', v <= 0);
}

// ─── Piezas comunes ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Duración con unidades chicas ("7 h 45 min"): el número grande y la unidad en tipografías distintas. */
function crearDuracion(clase = '') {
    const raiz = el('span', `est-duracion ${clase}`.trim());
    const h = el('span', 'est-num');
    const hu = el('span', 'est-unidad', 'h');
    const m = el('span', 'est-num');
    const mu = el('span', 'est-unidad', 'min');
    raiz.append(h, hu, m, mu);
    return { raiz, h, hu, m, mu };
}

/** @param {ReturnType<typeof crearDuracion>} d @param {{ horas: number, minutos: number }} t */
function pintarDuracion(d, { horas, minutos }) {
    const conHoras = horas > 0;
    const conMinutos = !conHoras || minutos > 0;
    mostrar(d.h, conHoras); mostrar(d.hu, conHoras);
    mostrar(d.m, conMinutos); mostrar(d.mu, conMinutos);
    fijar(d.h, String(horas));
    fijar(d.m, String(minutos));
}

/** Etiqueta chica y valor (la unidad de la cuadrícula inferior del anillo y de los mosaicos de la línea de tiempo). */
function crearDato(etiqueta, clase = 'est-dato') {
    const raiz = el('div', clase);
    const e = el('span', 'est-dato-etiqueta', etiqueta);
    const valor = el('span', 'est-dato-valor');
    raiz.append(e, valor);
    return { raiz, etiqueta: e, valor };
}

/** @param {ReturnType<typeof crearDato>} d @param {string} etiqueta @param {string} valor @param {string} [tono] */
function pintarDato(d, etiqueta, valor, tono) {
    fijar(d.etiqueta, etiqueta);
    fijar(d.valor, valor);
    entonar(d.raiz, tono);
}

// ─── Días de la semana (compartido) ──────────────────────────────────────────────────────────────────────────────────────

/** Qué se escribe de un día en la semana: sus horas, el emoji del día especial o su estado cuando no hay horas. @param {any} dia */
function textoDia(dia) {
    if (dia.totalMin > 0) return duracionCompacta(dia.totalMin);
    if (dia.estado === 'especial') return `${dia.emoji} ${dia.etiqueta}`.trim();
    return { 'sin-salida': 'sin salida', 'sin-registro': 'sin registro', futuro: 'pendiente' }[/** @type {string} */ (dia.estado)] ?? '—';
}

/** Fila de celdas chicas (sigla y horas de cada día): el pie del anillo en la semana. */
function crearDias(max = 7) {
    const raiz = el('div', 'est-dias');
    const celdas = Array.from({ length: max }, () => {
        const c = el('div', 'est-dia');
        const sigla = el('span', 'est-dia-sigla');
        const valor = el('span', 'est-dia-valor');
        c.append(sigla, valor);
        raiz.append(c);
        return { raiz: c, sigla, valor };
    });
    return { raiz, celdas };
}

/** @param {ReturnType<typeof crearDias>} d @param {any[]} dias */
function pintarDias(d, dias) {
    d.celdas.forEach((c, i) => {
        const dia = dias[i];
        mostrar(c.raiz, !!dia);
        if (!dia) return;
        fijar(c.sigla, dia.sigla);
        fijar(c.valor, dia.estado === 'especial' && dia.emoji ? dia.emoji : horaCorta(dia.totalMin));
        c.raiz.dataset.color = dia.color ?? 'neutro';
        c.raiz.dataset.estado = dia.estado;
        c.raiz.classList.toggle('hoy', !!dia.hoy);
    });
}

// ─── B · Anillo ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const MAX_TRAMOS_ANILLO = 7;   // el día: azul, el color del banco y verde (`_anilloEnCurso`); la semana: un tramo por día (`_anilloSemana`)
let _anillosCreados = 0;       // cada aro tiene su propia máscara en el svg: el id no se puede repetir
function crearAnillo() {
    const raiz = el('div', 'est-anillo');
    const principal = el('div', 'est-anillo-principal');
    const aro = el('div', 'est-anillo-aro');
    const svg = document.createElementNS(NS_SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'est-anillo-svg');
    svg.setAttribute('aria-hidden', 'true');
    // El arco (blanco) es la máscara de los tramos de color: el avance lo anima él y los tramos quedan fijos debajo, así los colores se descubren en orden como en la barra
    const arco = circulo('est-anillo-arco');
    const idMascara = `est-anillo-mascara-${++_anillosCreados}`;
    const mascara = document.createElementNS(NS_SVG, 'mask');
    mascara.setAttribute('id', idMascara);
    mascara.setAttribute('maskUnits', 'userSpaceOnUse');
    ['x', 'y'].forEach(a => mascara.setAttribute(a, '0'));
    ['width', 'height'].forEach(a => mascara.setAttribute(a, '100'));
    mascara.append(arco);
    const tramos = document.createElementNS(NS_SVG, 'g');
    tramos.setAttribute('mask', `url(#${idMascara})`);
    const arcosTramo = Array.from({ length: MAX_TRAMOS_ANILLO }, () => {
        const t = circulo('est-anillo-tramo');
        tramos.append(t);
        return t;
    });
    // el comienzo redondeado del arco cae antes de los tramos (fuera del trazo): lo dibuja este punto, en el color y en el lugar del primer tramo
    const inicio = document.createElementNS(NS_SVG, 'circle');
    inicio.setAttribute('class', 'est-anillo-inicio');
    inicio.setAttribute('cx', '94');
    inicio.setAttribute('cy', '50');
    inicio.setAttribute('r', '4.5');
    // hitos: una marca radial en cada corte entre tramos (a lo ancho del trazo), que gira hasta su posición (ver pintarTramos)
    const hitos = Array.from({ length: MAX_TRAMOS_ANILLO - 1 }, () => {
        const h = document.createElementNS(NS_SVG, 'line');
        h.setAttribute('class', 'est-anillo-hito');
        h.setAttribute('x1', '88.5');
        h.setAttribute('x2', '99.5');
        h.setAttribute('y1', '50');
        h.setAttribute('y2', '50');
        return h;
    });
    svg.append(circulo('est-anillo-pista'), mascara, tramos, inicio, ...hitos);
    const centro = el('div', 'est-anillo-centro');
    const valor = el('span', 'est-anillo-valor');
    const unidad = el('span', 'est-anillo-unidad');
    centro.append(valor, unidad);
    const brillo = el('span', 'est-anillo-brillo');
    brillo.setAttribute('aria-hidden', 'true');
    aro.append(svg, brillo, centro);

    const datos = el('div', 'est-anillo-datos');
    const mensaje = el('div', 'est-anillo-mensaje');
    const sub = el('div', 'est-anillo-sub');
    const balance = crearDato('', 'est-dato est-mosaico');
    // tercera línea del mosaico (la misma de la línea de tiempo): "Cubierto", "Te podés ir", "Te podés ir, pero debés tiempo"...
    balance.raiz.append(el('span', 'est-dato-detalle'));
    const banco = crearDato('Banco de horas', 'est-dato est-mosaico');
    const fuera = crearDato('Tiempo fuera', 'est-dato est-mosaico');
    datos.append(mensaje, sub, balance.raiz, banco.raiz, fuera.raiz);
    principal.append(aro, datos);

    const pie = el('div', 'est-anillo-pie');
    const entrada = crearDato('Entrada');
    const salida = crearDato('Salida');
    const conBanco = crearDato('Con banco');
    pie.append(entrada.raiz, salida.raiz, conBanco.raiz);
    const dias = crearDias();
    raiz.append(principal, pie, dias.raiz);
    return { raiz, aro, arco, arcosTramo, inicio, hitos, valor, unidad, mensaje, sub, balance, banco, fuera, pie, entrada, salida, conBanco, dias };
}

/**
 * Colorea el aro por tramos (% del aro, ver `_anilloEnCurso` en tarjeta-fichaje-vista.js); sin tramos, nada. Cada tramo es un arco de su largo que arranca en su comienzo
 * y se mete un poco bajo el siguiente para que no quede una línea clara entre colores. En cada corte entre tramos va un hito (una marca a lo ancho del trazo),
 * hueco (más tenue) hasta que el avance lo alcanza; en el llenado inicial (`conteoMs`, lo que dura) se marca recién cuando el aro llega a él (el aro avanza con ease-out cúbico).
 * @param {any} r @param {{ desde: number, hasta: number, color: string }[]} tramos @param {number} progreso avance del aro, en % @param {number} [conteoMs]
 */
function pintarTramos(r, tramos, progreso, conteoMs = 0) {
    r.arcosTramo.forEach((/** @type {SVGElement} */ arco, /** @type {number} */ i) => {
        const t = tramos[i];
        arco.style.display = t ? '' : 'none';
        if (!t) return;
        // el último sigue un poco más allá del avance: ahí se ve el extremo redondeado del arco (sin color debajo quedaría cortado en seco)
        const largo = t.hasta - t.desde + (i < tramos.length - 1 ? 0.3 : 2);
        arco.style.strokeDasharray = `${largo} 100`;
        arco.style.strokeDashoffset = String(-t.desde);
        arco.dataset.color = t.color;
    });
    const cortes = tramos.slice(0, -1).map(t => t.hasta);
    r.hitos.forEach((/** @type {SVGElement} */ h, /** @type {number} */ i) => {
        const corte = cortes[i];
        h.style.display = corte === undefined ? 'none' : '';
        if (corte === undefined) return;
        h.style.transform = `rotate(${(corte * 3.6).toFixed(2)}deg)`;
        h.classList.toggle('pendiente', progreso < corte);
        const llegada = conteoMs > 0 && progreso >= corte ? 1 - Math.pow(1 - corte / progreso, 1 / 3) : 0;
        h.style.setProperty('--retraso-hito', `${Math.round(llegada * conteoMs)}ms`);
    });
    r.inicio.style.display = tramos.length ? '' : 'none';
    if (tramos.length) {
        // el redondeo del comienzo va donde arranca el primer tramo (en la semana puede haber un hueco antes: un día sin horas)
        r.inicio.dataset.color = tramos[0].color;
        r.inicio.style.transform = `rotate(${(tramos[0].desde * 3.6).toFixed(2)}deg)`;
    }
}

/** El número del centro del aro: "7:45 horas" o "22 min". @param {any} r @param {{ horas: number, minutos: number }} t */
function pintarNumeroAnillo(r, { horas, minutos }) {
    fijar(r.valor, horas > 0 ? `${horas}:${_pad2(minutos)}` : String(minutos));
    fijar(r.unidad, horas > 0 ? 'horas' : 'min');
}

function pintarAnillo(r, d) {
    r.raiz.dataset.tipo = d.tipo;
    const conTotal = d.tipo === 'registro' || d.tipo === 'semana';
    mostrar(r.pie, d.tipo === 'registro' || d.tipo === 'espera');
    mostrar(r.dias.raiz, d.tipo === 'semana');
    mostrar(r.mensaje, !conTotal);
    mostrar(r.sub, !conTotal && (d.tipo === 'especial' || !!d.banco));
    mostrar(r.balance.raiz, conTotal && !!d.balance);
    mostrar(r.banco.raiz, conTotal && !!d.banco);
    mostrar(r.fuera.raiz, false);

    if (conTotal) {
        pintarNumeroAnillo(r, d.trabajado);
        r.aro.dataset.color = d.color;
        r.aro.classList.remove('espera');
        // con la jornada abierta el aro lleva los tramos de la barra con hitos y la semana uno por día; cerrado y lo demás van de un solo color
        const anillo = d.anillo ?? null;
        pintarTramos(r, anillo?.tramos ?? [{ desde: 0, hasta: 100, color: d.color }], anillo?.progreso ?? d.progreso, d.conteoMs);
        pintarAvance(r.aro, r.arco, anillo?.progreso ?? d.progreso);
        // con el registro (o la semana) en curso, el brillo recorre el arco lleno, como el de la barra
        r.aro.classList.toggle('en-curso', d.tipo === 'registro' ? !d.cerrado : !!d.abierta);
        if (d.balance) {
            pintarDato(r.balance, etiquetaBalance(d), d.balance.texto, d.balance.tono);
            fijarQueEntre(r.balance.raiz.querySelector('.est-dato-detalle'), d.balance.detalle);
        }
        if (d.banco) pintarDato(r.banco, 'Banco de horas', d.banco.texto, tonoBanco(d.banco));
        if (d.tipo === 'semana') { pintarDias(r.dias, d.dias); return; }
        pintarDato(r.entrada, 'Entrada', d.entrada);
        mostrar(r.salida.raiz, !!(d.salida || d.salidaEstimada));
        pintarDato(r.salida, 'Salida', d.salida || d.salidaEstimada);
        mostrar(r.conBanco.raiz, !!d.salidaBanco);
        pintarDato(r.conBanco, 'Con banco', d.salidaBanco, tonoBanco(d.banco));
        mostrar(r.fuera.raiz, !!d.tiempoFuera);
        if (d.tiempoFuera) pintarDato(r.fuera, d.tiempoFuera.corriendo ? 'Fuera (en curso)' : 'Tiempo fuera', d.tiempoFuera.texto);
        return;
    }

    fijar(r.valor, d.emoji);
    fijar(r.unidad, '');
    if (d.tipo === 'espera') {
        r.aro.dataset.color = 'blue';
        r.aro.classList.add('espera');
        pintarTramos(r, [], 0);
        pintarAvance(r.aro, r.arco, 0);
        r.aro.classList.remove('en-curso');
        fijar(r.mensaje, d.mensaje);
        if (d.banco) { fijar(r.sub, fraseBanco(d.banco)); entonar(r.sub, tonoBanco(d.banco)); }
        pintarDato(r.entrada, 'Entrada', '--:--');
        pintarDato(r.salida, 'Salida', '--:--');
        pintarDato(r.conBanco, 'Con banco', '--:--');
        mostrar(r.salida.raiz, true); mostrar(r.conBanco.raiz, true);
    } else {
        r.aro.dataset.color = d.color;
        r.aro.classList.remove('espera');
        pintarTramos(r, [{ desde: 0, hasta: 100, color: d.color }], 100);
        pintarAvance(r.aro, r.arco, 100);
        r.aro.classList.remove('en-curso');
        fijar(r.mensaje, d.etiqueta);
        fijar(r.sub, d.descripcion);
        entonar(r.sub, 'neutro');
    }
}

// ─── C · Línea de tiempo vertical ─────────────────────────────────────────────────────────────────────────────────────────
const ROTULOS_NODO = { entrada: 'Entrada', ahora: 'Ahora', salida: 'Salida', banco: 'Con banco' };

function crearLinea() {
    const raiz = el('div', 'est-linea');
    const cabecera = el('div', 'est-linea-cabecera');
    const etiqueta = el('div', 'est-linea-etiqueta', 'Llevás trabajado');
    const duracion = crearDuracion('est-duracion--grande');
    const titulo = el('div', 'est-linea-titulo');
    const emoji = el('span', 'est-emoji');
    const texto = el('span', 'est-linea-texto');
    titulo.append(emoji, texto);
    cabecera.append(etiqueta, duracion.raiz, titulo);

    const nodos = el('ol', 'est-nodos');
    /** @type {Record<string, { raiz: HTMLElement, etiqueta: HTMLElement, hora: HTMLElement }>} */
    const hitos = {};
    for (const [tipo, rotulo] of Object.entries(ROTULOS_NODO)) {
        const li = el('li', `est-nodo est-nodo--${tipo}`);
        const e = el('span', 'est-nodo-etiqueta', rotulo);
        const hora = el('span', 'est-nodo-hora');
        li.append(el('span', 'est-nodo-punto'), e, hora);
        nodos.append(li);
        hitos[tipo] = { raiz: li, etiqueta: e, hora };
    }

    // la semana: un nodo por día
    const nodosDias = el('ol', 'est-nodos');
    const dias = Array.from({ length: 7 }, () => {
        const li = el('li', 'est-nodo est-nodo--dia');
        const e = el('span', 'est-nodo-etiqueta');
        const hora = el('span', 'est-nodo-hora');
        li.append(el('span', 'est-nodo-punto'), e, hora);
        nodosDias.append(li);
        return { raiz: li, etiqueta: e, hora };
    });

    const mosaicos = el('div', 'est-mosaicos');
    const balance = crearDato('Faltan', 'est-dato est-mosaico');
    // tercera línea del mosaico: "Cubierto" cuando el faltante de un día cerrado lo cubre el saldo
    balance.raiz.append(el('span', 'est-dato-detalle'));
    const banco = crearDato('Banco de horas', 'est-dato est-mosaico');
    const fuera = crearDato('Tiempo fuera', 'est-dato est-mosaico');
    // tercera línea del mosaico: si ese tiempo se descuenta o no del total (opción "No descontar tiempo fuera" de Ajustes)
    const fueraDetalle = el('span', 'est-dato-detalle');
    fuera.raiz.append(fueraDetalle);
    mosaicos.append(balance.raiz, banco.raiz, fuera.raiz);
    const nota = el('div', 'est-linea-nota');
    // cabecera (tiempo trabajado) y cuerpo (la línea): en una tarjeta ancha van lado a lado (ver la disposición en estilo-tarjeta.js);
    // los mosaicos y la nota quedan siempre abajo, a todo el ancho
    const cuerpo = el('div', 'est-linea-cuerpo');
    cuerpo.append(nodos, nodosDias);
    raiz.append(cabecera, cuerpo, mosaicos, nota);
    return { raiz, cabecera, cuerpo, etiqueta, duracion, titulo, emoji, texto, nodos, hitos, nodosDias, dias, mosaicos, balance, banco, fuera, nota };
}

/**
 * Esperando registro no tiene el número grande de arriba ("Llevás trabajado", "Total de la semana"): su cabecera es más baja y la línea de tiempo arrancaría más arriba que
 * en la semana. Se le reserva el alto de la cabecera de la semana (la de la capa de medida) para que, al alternar de vista, el comienzo de la línea no cambie de lugar.
 * @param {any} r @param {any} rSemana
 */
function alinearLinea(r, rSemana) {
    const espera = r.raiz.dataset.tipo === 'espera' && !r.cuerpo.classList.contains('hidden');
    r.cabecera.style.minHeight = espera ? `${rSemana.cabecera.offsetHeight}px` : '';
}

function pintarLinea(r, d) {
    r.raiz.dataset.tipo = d.tipo;
    const esRegistro = d.tipo === 'registro';
    const conTotal = esRegistro || d.tipo === 'semana';
    mostrar(r.etiqueta, conTotal);
    mostrar(r.duracion.raiz, conTotal);
    mostrar(r.titulo, !conTotal);
    mostrar(r.nota, d.tipo === 'especial');
    mostrar(r.nodosDias, d.tipo === 'semana');
    // sin línea que mostrar (día especial o sin registro: esperando, día libre o sin mensaje) la cabecera ocupa todo el ancho: no hay entrada ni salida que mostrar todavía
    const sinLinea = d.tipo === 'especial' || d.tipo === 'espera';
    mostrar(r.cuerpo, !sinLinea);
    r.raiz.classList.toggle('sin-cuerpo', sinLinea);

    if (conTotal) {
        if (esRegistro) fijar(r.etiqueta, d.cerrado ? 'Trabajaste' : 'Llevás trabajado');
        else fijar(r.etiqueta, d.abierta ? 'Llevás en la semana' : 'Total de la semana');
        pintarDuracion(r.duracion, d.trabajado);
        mostrar(r.nodos, esRegistro);
        if (esRegistro) pintarNodos(r, d); else pintarNodosDias(r, d.dias, d.abierta, d.entradaMs);
        mostrar(r.balance.raiz, !!d.balance);
        if (d.balance) {
            pintarDato(r.balance, etiquetaBalance(d), d.balance.texto, d.balance.tono);
        }
        mostrar(r.banco.raiz, !!d.banco);
        if (d.banco) pintarDato(r.banco, 'Banco de horas', d.banco.texto, tonoBanco(d.banco));
        mostrar(r.fuera.raiz, esRegistro && !!d.tiempoFuera);
        if (esRegistro && d.tiempoFuera) {
            pintarDato(r.fuera, d.tiempoFuera.corriendo ? 'Fuera (en curso)' : 'Tiempo fuera', d.tiempoFuera.texto);
        }
        mostrar(r.mosaicos, !!(d.balance || d.banco || (esRegistro && d.tiempoFuera)));
        // se mide con los mosaicos ya visibles y con su valor puesto: la tercera línea pasa a la versión corta solo si la completa se parte en dos
        if (d.balance) fijarQueEntre(r.balance.raiz.querySelector('.est-dato-detalle'), d.balance.detalle);
        if (esRegistro && d.tiempoFuera) {
            fijarQueEntre(r.fuera.raiz.querySelector('.est-dato-detalle'), d.tiempoFuera.descuenta ? ['Se descuenta', 'Descuenta'] : ['No se descuenta', 'No descuenta']);
        }
        return;
    }

    fijar(r.emoji, d.emoji);
    r.titulo.dataset.color = d.tipo === 'especial' ? d.color : 'neutro';
    if (d.tipo === 'espera') {
        fijar(r.texto, d.mensaje);
        mostrar(r.nodos, false);
        mostrar(r.banco.raiz, !!d.banco);
        if (d.banco) pintarDato(r.banco, 'Banco de horas', `${d.banco.texto} esta semana`, tonoBanco(d.banco));
        mostrar(r.balance.raiz, false); mostrar(r.fuera.raiz, false);
        mostrar(r.mosaicos, !!d.banco);
    } else {
        fijar(r.texto, d.etiqueta);
        fijar(r.nota, d.descripcion);
        r.nota.dataset.color = d.color;
        mostrar(r.nodos, false);
        mostrar(r.mosaicos, false);
    }
}

/** Nodos de la jornada con registro, en el orden en que ocurren (el "Ahora" queda entre los demás según la hora). */
function pintarNodos(r, d) {
    const linea = d.linea;
    // con la jornada abierta el tramo azul (de la entrada hasta ahora) lleva el brillo de la barra de progreso
    r.nodos.classList.toggle('en-curso', !d.cerrado);
    for (const [tipo, h] of Object.entries(r.hitos)) {
        mostrar(h.raiz, false);
        h.raiz.classList.remove('pendiente');
        fijar(h.etiqueta, ROTULOS_NODO[tipo]);   // sin registro quedan como "Entrada · pendiente"
    }

    /** @type {{ tipo: string, rel: number }[]} */
    const orden = linea ? hitosOrdenados(linea) : [{ tipo: 'entrada', rel: 0 }, ...(d.salida ? [{ tipo: 'salida', rel: 1 }] : [])];
    const horas = { entrada: d.entrada, salida: d.salida || d.salidaEstimada, banco: d.salidaBanco, ahora: '' };
    const ahoraRel = linea ? linea.ahoraRel : Infinity;
    // color de cada conector (el tramo que llega a ese nodo) según la zona donde termina, como el anillo: azul hasta la primera salida, el color del banco entre ambas y verde después
    const zonas = linea && d.anillo && linea.hayBanda ? { lo: Math.min(linea.salidaRel, linea.bufferRel), hi: Math.max(linea.salidaRel, linea.bufferRel), medio: d.anillo.colorMedio } : null;
    const tramoDe = (/** @type {number} */ rel) => !linea || !d.anillo ? 'blue' : !zonas ? (rel <= linea.salidaRel ? 'blue' : 'green') : rel <= zonas.lo ? 'blue' : rel <= zonas.hi ? zonas.medio : 'green';
    // el brillo es uno solo y llega hasta "ahora": cuántos tramos de la línea (de nodo a nodo) hay hasta ese punto
    r.nodos.style.setProperty('--segmentos', String(Math.max(0, orden.findIndex(h => h.tipo === 'ahora'))));
    let primero = true;
    orden.forEach((hito, i) => {
        const nodo = r.hitos[hito.tipo];
        if (!nodo) return;
        mostrar(nodo.raiz, true);
        nodo.raiz.style.order = String(i);
        nodo.raiz.classList.toggle('primero', primero);
        nodo.raiz.classList.toggle('pasado', hito.tipo !== 'ahora' && hito.rel <= ahoraRel);
        primero = false;
        // cerrado no hay zonas: todo el tramo lleva el color del estado con que cerró
        if (!d.cerrado) nodo.raiz.dataset.tramo = tramoDe(hito.rel);
        else if (['green', 'gold', 'red'].includes(d.color)) nodo.raiz.dataset.tramo = d.color;
        else delete nodo.raiz.dataset.tramo;
        fijar(nodo.hora, horas[hito.tipo] ?? '');
        if (hito.tipo === 'salida') fijar(nodo.etiqueta, d.cerrado ? 'Salida' : 'Salida estimada');
        if (hito.tipo === 'banco') entonar(nodo.raiz, tonoBanco(d.banco));
        // el badge de "Ahora" lleva el color de la zona donde está, como el remate de la barra con hitos (azul antes de la primera salida, el color del banco entre ambas, verde después)
        if (hito.tipo === 'ahora') nodo.raiz.dataset.color = linea && d.anillo ? tramoDe(hito.rel) : (d.color ?? 'blue');
        // con el registro cerrado los hitos (entrada y salida) y el conector toman el color del estado con que cerró (el mismo del badge "Finalizado")
        nodo.raiz.classList.toggle('cerrado', !!d.cerrado);
        if (d.cerrado) { nodo.raiz.classList.add('pasado'); nodo.raiz.dataset.color = d.color ?? 'neutro'; }
        else if (hito.tipo !== 'ahora') delete nodo.raiz.dataset.color;
    });
    animarEntradaLinea(r, orden.map(h => r.hitos[h.tipo].raiz), d.entradaMs);
}

// La línea se llena más despacio que el número (con su curva ease-out el primer tramo se haría en una fracción de segundo y no se vería) y espera a que termine el fundido de un cambio de vista
const FACTOR_LINEA = 1.8;
const BASE_ENTRADA = 120;
/** Lo que tarda en llenarse la línea, dada la duración del conteo (ms). @param {number} duracion */
const duracionLinea = duracion => Math.round(duracion * FACTOR_LINEA);

/**
 * Entrada de la línea (del día o de la semana), como la de la barra con hitos: el tramo ya recorrido se llena de arriba abajo a ritmo parejo (un tramo detrás del otro) y los textos
 * de cada nodo suben desde abajo cuando la línea llega a él (los mosaicos, a mitad). Cada conector es un tramo (de nodo a nodo) y le toca la misma parte del recorrido total. La clase `entrando` (que activa las animaciones en CSS) se quita al terminar.
 * @param {any} r @param {HTMLElement[]} nodos los nodos visibles, en orden @param {number} [duracion] la del conteo en ms (ver `duracionLinea`); 0 / undefined: sin animación
 */
function animarEntradaLinea(r, nodos, duracion = 0) {
    const ms = duracionLinea(duracion);
    const base = BASE_ENTRADA;
    // un dibujo sin entrada (el reloj, un cambio de tamaño) no corta la que está en curso: la clase se quita sola al terminar
    if (!(duracion > 1)) return;
    clearTimeout(r.timerEntrada);
    r.raiz.classList.remove('entrando');
    // todos los nodos van en fila, coloreados o no: la línea avanza a ritmo parejo, un tramo detrás del otro (los que todavía no se alcanzaron en la vida real también se dibujan, apagados)
    const tramos = nodos.length - 1;
    nodos.forEach((raiz, i) => {
        raiz.style.setProperty('--ret', `${Math.round(base + (tramos > 0 ? (i / tramos) * ms : 0))}ms`);
        if (i > 0) {
            raiz.style.setProperty('--con-ret', `${Math.round(base + ((i - 1) / tramos) * ms)}ms`);
            raiz.style.setProperty('--con-dur', `${Math.max(1, Math.round(ms / tramos))}ms`);
        }
    });
    r.raiz.style.setProperty('--ret-mosaicos', `${Math.round(base + ms * 0.4)}ms`);
    void r.raiz.offsetWidth;
    r.raiz.classList.add('entrando');
    r.timerEntrada = setTimeout(() => r.raiz.classList.remove('entrando'), base + ms + 800);
}

/** Un nodo por día de la semana: hoy en azul, los pasados con el color de su estado y los que faltan punteados. */
function pintarNodosDias(r, dias, enCurso, entradaMs = 0) {
    r.nodosDias.classList.toggle('en-curso', !!enCurso);   // con la semana abierta, el tramo hasta hoy brilla igual
    // un solo brillo que va desde el primer día hasta hoy: cuántos tramos hay hasta el nodo de hoy
    r.nodosDias.style.setProperty('--segmentos', String(Math.max(0, dias.findIndex(dia => dia.hoy))));
    r.dias.forEach((n, i) => {
        const dia = dias[i];
        mostrar(n.raiz, !!dia);
        if (!dia) return;
        const futuro = dia.estado === 'futuro' && !dia.hoy;
        // un feriado, asueto, vacaciones... cargado por adelantado se ve desde ya (con su color y su emoji), aunque el día todavía no haya llegado
        const especialFuturo = futuro && !!dia.especial;
        const pendiente = futuro && !especialFuturo;
        n.raiz.classList.toggle('primero', i === 0);
        n.raiz.classList.toggle('hoy', !!dia.hoy);
        n.raiz.classList.toggle('pendiente', pendiente);
        n.raiz.classList.toggle('pasado', !futuro);   // el conector azul llega hasta hoy, también con días especiales más adelante
        n.raiz.classList.toggle('lleno', !futuro);   // el punto se rellena cuando el día ya pasó (hoy lo resuelve el CSS); un día por adelantado queda hueco, aunque sea especial
        n.raiz.dataset.color = (especialFuturo ? dia.especial : dia.color) ?? 'neutro';
        fijar(n.etiqueta, dia.hoy ? 'Hoy' : dia.sigla);
        // los días que faltan llevan un "-" (el "pendiente" queda para hoy, que es el que espera su registro)
        fijar(n.hora, especialFuturo ? `${dia.emoji} ${dia.etiqueta}`.trim() : pendiente ? '-' : textoDia(dia));
    });
    animarEntradaLinea(r, r.dias.slice(0, dias.length).map(n => n.raiz), entradaMs);
}

// ─── E · Lista de filas ───────────────────────────────────────────────────────────────────────────────────────────────────
function crearFilas() {
    const raiz = el('div', 'est-filas');
    const cabecera = el('div', 'est-fila est-fila--cabecera');
    const etiqueta = el('span', 'est-fila-etiqueta est-fila-etiqueta--chica', 'Llevás trabajado');
    const grande = el('span', 'est-fila-grande');
    const duracion = crearDuracion('est-duracion--media');
    const emoji = el('span', 'est-emoji');
    const texto = el('span', 'est-fila-texto');
    grande.append(emoji, texto, duracion.raiz);
    cabecera.append(etiqueta, grande);
    raiz.append(cabecera);

    /** @type {Record<string, ReturnType<typeof crearDato>>} */
    const filas = {};
    const nueva = (id, rotulo) => {
        const f = crearDato(rotulo, 'est-fila');
        f.etiqueta.className = 'est-fila-etiqueta';
        f.valor.className = 'est-fila-valor';
        raiz.append(f.raiz);
        filas[id] = f;
        return f;
    };
    for (const [id, rotulo] of [['entrada', 'Entrada'], ['salida', 'Salida estimada'], ['conBanco', 'Salida con banco'], ['fuera', 'Tiempo fuera']]) nueva(id, rotulo);
    const dias = Array.from({ length: 7 }, (_, i) => nueva(`dia${i}`, ''));
    for (const [id, rotulo] of [['balance', 'Faltan'], ['banco', 'Banco de horas'], ['estado', 'Estado'], ['nota', 'Nota']]) nueva(id, rotulo);
    return { raiz, cabecera, etiqueta, emoji, texto, duracion, filas, dias };
}

function pintarFilas(r, d) {
    r.raiz.dataset.tipo = d.tipo;
    const f = r.filas;
    for (const fila of Object.values(f)) mostrar(fila.raiz, false);
    const conTotal = d.tipo === 'registro' || d.tipo === 'semana';
    mostrar(r.duracion.raiz, conTotal);
    mostrar(r.emoji, d.tipo === 'especial');
    mostrar(r.texto, !conTotal);
    r.cabecera.dataset.color = d.tipo === 'especial' ? d.color : 'neutro';
    entonar(r.texto, d.tipo === 'espera' ? 'apagado' : 'neutro');

    const fila = (id, etiqueta, valor, tono) => { mostrar(f[id].raiz, true); pintarDato(f[id], etiqueta, valor, tono); };

    if (d.tipo === 'registro') {
        fijar(r.etiqueta, d.cerrado ? 'Trabajaste' : 'Llevás trabajado');
        pintarDuracion(r.duracion, d.trabajado);
        fila('entrada', 'Entrada', d.entrada);
        if (d.cerrado) fila('salida', 'Salida', d.salida);
        else if (d.salidaEstimada) fila('salida', 'Salida estimada', d.salidaEstimada);
        if (d.salidaBanco) fila('conBanco', 'Salida con banco', d.salidaBanco, tonoBanco(d.banco));
        if (d.tiempoFuera) fila('fuera', d.tiempoFuera.corriendo ? 'Tiempo fuera (en curso)' : 'Tiempo fuera', d.tiempoFuera.texto);
        if (d.balance) fila('balance', d.balance.etiqueta, d.balance.texto, d.balance.tono);
        if (d.banco) fila('banco', 'Banco de horas', d.banco.texto, tonoBanco(d.banco));
    } else if (d.tipo === 'semana') {
        fijar(r.etiqueta, d.abierta ? 'Llevás en la semana' : 'Total de la semana');
        pintarDuracion(r.duracion, d.trabajado);
        d.dias.forEach((dia, i) => {
            if (i >= r.dias.length) return;
            fila(`dia${i}`, dia.hoy ? `${dia.sigla} (hoy)` : dia.sigla, textoDia(dia));
            r.dias[i].valor.dataset.color = dia.color ?? 'neutro';
            r.dias[i].etiqueta.classList.add('est-fila-etiqueta--dia');
        });
        if (d.balance) fila('balance', d.balance.etiqueta, d.balance.texto, d.balance.tono);
        if (d.banco) fila('banco', 'Banco de horas', d.banco.texto, tonoBanco(d.banco));
    } else if (d.tipo === 'espera') {
        fijar(r.etiqueta, 'Llevás trabajado');
        fijar(r.texto, d.mensaje || '—');
        fila('entrada', 'Entrada', '--:--', 'apagado');
        fila('salida', 'Salida estimada', '--:--', 'apagado');
        fila('conBanco', 'Salida con banco', '--:--', 'apagado');
        if (d.banco) fila('banco', 'Banco de horas', d.banco.texto, tonoBanco(d.banco));
    } else {
        fijar(r.etiqueta, 'Hoy');
        fijar(r.emoji, d.emoji);
        fijar(r.texto, d.etiqueta);
        fila('estado', 'Estado', d.etiqueta);
        f.estado.valor.dataset.color = d.color;
        fila('nota', 'Nota', d.descripcion);
    }
}

// ─── Montaje ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// `fija`: el alto de la tarjeta no varía casi nada entre estados (el anillo), así que se reserva el del más alto. `reservaSemana` (la línea de tiempo): se reserva
// el alto de la vista semanal (con la semana real, no un peor caso) para que alternar entre el día y la semana no mueva lo de abajo; los estados del día más altos
// que la semana (si los hay) siguen ampliando la tarjeta. En los demás (lista de filas) el alto sigue al contenido y se anima (ver _animarAlturaCard en tarjeta-fichaje.js).
const DISENOS = {
    anillo: { crear: crearAnillo, pintar: pintarAnillo, fija: true, reservaSemana: false, alinear: null },
    linea: { crear: crearLinea, pintar: pintarLinea, fija: false, reservaSemana: true, alinear: alinearLinea },
    filas: { crear: crearFilas, pintar: pintarFilas, fija: false, reservaSemana: false, alinear: null }
};

/** @type {{ id: string, refs: any, refsSemana: any } | null} */
let _montado = null;

// Número grande de cada diseño (lo que cuenta de 0 al valor en la primera carga, como el número de la barra en los estilos clásicos)
const NUMEROS = {
    anillo: pintarNumeroAnillo,
    linea: (/** @type {any} */ r, /** @type {any} */ t) => pintarDuracion(r.duracion, t),
    filas: (/** @type {any} */ r, /** @type {any} */ t) => pintarDuracion(r.duracion, t)
};

/** @type {{ cancelado: boolean } | null} */
let _conteo = null;

function _cancelarConteo() {
    if (_conteo) _conteo.cancelado = true;
    _conteo = null;
}

/**
 * Cuenta el número de 0 al valor con la misma curva que el de las barras (ease-out cúbico, horas y minutos por separado). Cualquier otro dibujo lo corta.
 * @param {string} id @param {any} refs @param {{ horas: number, minutos: number }} total @param {number} duracion
 */
function _contar(id, refs, total, duracion) {
    const pintarNumero = NUMEROS[/** @type {keyof typeof NUMEROS} */ (id)];
    const estado = { cancelado: false };
    _conteo = estado;
    const inicio = performance.now();
    pintarNumero(refs, { horas: 0, minutos: 0 });
    const paso = (/** @type {number} */ ahora) => {
        if (estado.cancelado) return;
        const t = Math.min(1, Math.max(0, (ahora - inicio) / duracion));
        const e = t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
        pintarNumero(refs, t >= 1 ? total : { horas: Math.round(total.horas * e), minutos: Math.round(total.minutos * e) });
        if (t < 1) requestAnimationFrame(paso); else if (_conteo === estado) _conteo = null;
    };
    requestAnimationFrame(paso);
}

/** El mismo resumen sin avance (aro, regla y segmentos vacíos): de ahí parten las transiciones del primer dibujo. @param {any} d */
function _sinAvance(d) {
    return {
        ...d, progreso: 0,
        anillo: d.anillo ? { ...d.anillo, progreso: 0 } : d.anillo,   // el aro toma su avance de aquí cuando hay tramos: sin esto aparecería lleno de entrada
        linea: d.linea ? { ...d.linea, ahoraRel: 0 } : d.linea,
        dias: d.dias ? d.dias.map((/** @type {any} */ x) => ({ ...x, fraccion: 0 })) : d.dias
    };
}

/**
 * Arma el diseño dentro de #stats-estilo. Los de alto fijo suman capas de medida: copias ocultas del mismo diseño dibujadas con el peor caso de cada estado
 * (registro, sin registro, día especial y semana). Todas ocupan la misma celda de una cuadrícula, así la tarjeta mide siempre lo que el más alto.
 * Los de `reservaSemana` suman una sola capa de medida, con la semana real (la dibuja `actualizar`): la tarjeta nunca es más baja que la vista semanal.
 * @param {HTMLElement} host @param {string} id @param {{ crear: () => any, pintar: (r: any, d: any) => void, fija: boolean, reservaSemana: boolean }} diseno
 */
function _montar(host, id, diseno) {
    host.replaceChildren();
    const refs = diseno.crear();
    let refsSemana = null;
    if (!diseno.fija && !diseno.reservaSemana) {
        host.append(refs.raiz);
    } else {
        const capas = el('div', 'est-capas');
        const visible = el('div', 'est-capa');
        visible.append(refs.raiz);
        capas.append(visible);
        const capaMedida = () => {
            const capa = el('div', 'est-capa est-capa--medida');
            capa.setAttribute('aria-hidden', 'true');
            capa.setAttribute('inert', '');
            return capa;
        };
        if (diseno.fija) {
            for (const medida of resumenesDeMedida()) {
                const capa = capaMedida();
                const r = diseno.crear();
                diseno.pintar(r, medida);
                capa.append(r.raiz);
                capas.append(capa);
            }
        }
        if (diseno.reservaSemana) {
            const capa = capaMedida();
            refsSemana = diseno.crear();
            capa.append(refsSemana.raiz);
            capas.append(capa);
        }
        host.append(capas);
    }
    _montado = { id, refs, refsSemana };
    _anchoObservado = 0;
    _observadorAncho?.disconnect();
    _observadorAncho?.observe(host);
}

/**
 * Dibuja el resumen del día o de la semana con el diseño del estilo elegido. Al cambiar de estilo se reconstruye el DOM; si el estilo no es propio
 * (o no hay resumen) deja el contenedor vacío y devuelve false: la tarjeta usa entonces la barra de siempre.
 * Con `conteoInicial` (la carga de la página, igual que en los estilos clásicos) el aro, la regla y los segmentos crecen de cero y el número cuenta de 0 a su valor.
 * `resumenSemana` (solo lo pide el diseño con `reservaSemana`): el resumen de la vista semanal, para que la capa de medida reserve su alto.
 * @param {any} resumen @param {{ conteoInicial?: boolean, cargaInicial?: boolean, duracion?: number, resumenSemana?: () => any }} [opciones] duracion: la del conteo en ms
 */
function actualizar(resumen, { conteoInicial = false, cargaInicial = false, duracion = 0, resumenSemana } = {}) {
    const host = $('stats-estilo');
    _cancelarConteo();
    if (!host) return false;
    const id = EstiloTarjeta.actual();
    const diseno = DISENOS[/** @type {keyof typeof DISENOS} */ (id)];
    if (!diseno || !resumen) {
        if (_montado) { host.replaceChildren(); _montado = null; }
        return false;
    }
    if (!_montado || _montado.id !== id || !host.firstChild) _montar(host, id, diseno);
    const refs = _montado?.refs;
    // la carga de la página y el paso automático de semana a día (aviso de pedirDestelloBalance) hacen la misma entrada: número que cuenta, línea que se llena, textos que suben y destello
    const pendiente = (id === 'linea' || id === 'anillo') && resumen.tipo === 'registro' && _destelloPendiente > performance.now();
    const carga = conteoInicial || pendiente;   // `cargaInicial`: la carga de la página aunque el número no cuente (sin horas, día especial...): la línea entra igual
    const contar = carga && duracion > 1 && !!resumen.trabajado && resumen.trabajadoMin > 0;
    if (contar) {
        diseno.pintar(refs, _sinAvance(resumen));
        void host.offsetWidth;   // el estado vacío tiene que estar aplicado para que el siguiente dibujo transicione hacia el real
    }
    // entrada de la línea de tiempo: la línea se llena y los textos suben, como en la barra con hitos (también en la semana, pero solo en la carga)
    const entra = id === 'linea' && duracion > 1 && (resumen.tipo === 'semana' ? conteoInicial || cargaInicial : resumen.tipo === 'registro' && (carga || cargaInicial));
    diseno.pintar(refs, {
        ...resumen,
        ...(contar && { conteoMs: duracion }),   // conteoMs: lo que dura el llenado, para que cada hito se marque cuando el aro llega a él
        ...(entra && { entradaMs: duracion })
    });
    // la capa que reserva el alto de la semana se dibuja con los datos reales de la semana (en la vista semanal son los mismos que los de la capa visible)
    const refsSemana = _montado?.refsSemana;
    const semana = refsSemana && resumenSemana ? resumenSemana() : null;
    if (refsSemana && semana) {
        diseno.pintar(refsSemana, semana);
        diseno.alinear?.(refs, refsSemana);
    }
    if (contar) _contar(id, refs, resumen.trabajado, duracion);
    if ((id === 'linea' || id === 'anillo') && resumen.tipo === 'registro') {
        // la línea espera a que termine su entrada; el anillo, a que el aro y el número terminen de contar
        if (carga) destellarBalance(refs, resumen, entra ? BASE_ENTRADA + duracionLinea(duracion) : (contar ? duracion : 0));
        _destelloPendiente = 0;
    }
    return true;
}

// La carga con la vista semanal pasa sola a la diaria: esa vista tiene que entrar igual que en la carga directa (el aviso vence si la diaria no llega a dibujarse)
let _destelloPendiente = 0;

/** El próximo dibujo del registro del día (el cambio automático de semana a día en la carga) hace la misma entrada que la carga directa en la vista diaria. */
function pedirDestelloBalance() {
    _destelloPendiente = performance.now() + 5000;
}

/**
 * En la carga de la página, con el registro en curso, el mosaico de balance (de la línea de tiempo y del anillo) destella (como el día de hoy del calendario) si hay buenas noticias:
 * el faltante lo cubre el saldo (dorado) o el objetivo ya está cumplido / hay extra (verde). Con el registro cerrado no tiene sentido.
 * Espera a que termine el conteo para que no pase desapercibido.
 * @param {any} refs @param {any} resumen @param {number} espera ms
 */
function destellarBalance(refs, resumen, espera) {
    if (resumen.tipo !== 'registro' || resumen.cerrado || !resumen.balance) return;
    if (resumen.balance.tono !== 'gold' && resumen.balance.tono !== 'green') return;
    const nodo = refs.balance.raiz;
    setTimeout(() => {
        if (nodo.isConnected && _montado?.refs === refs) Animaciones._flashElemento(nodo, 'mosaico-flash');
    }, espera + 20);
}

/**
 * Vuelve a elegir qué versión de cada tercera línea ("Pero te podés ir" / "Te podés ir", "No se descuenta" / "No descuenta") entra en su mosaico.
 * Se usa cuando cambia el ancho del lugar donde están sin que se redibuje la tarjeta: al cambiar la disposición o al rotar/redimensionar.
 */
function reajustarDetalles() {
    const raiz = _montado?.id === 'linea' || _montado?.id === 'anillo' ? _montado.refs?.raiz : null;
    if (!raiz) return;
    raiz.querySelectorAll('.est-dato-detalle').forEach((/** @type {HTMLElement} */ n) => {
        const versiones = _versionesQueEntre.get(n);
        if (versiones && versiones.length > 1 && n.offsetParent !== null) fijarQueEntre(n, versiones);
    });
}

// Girar el teléfono o redimensionar cambia el ancho de los mosaicos sin redibujar nada: se reeligen las versiones (solo si cambió el ancho; el texto solo cambia el alto)
let _anchoObservado = 0;
const _observadorAncho = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entradas => {
    const ancho = Math.round(entradas[entradas.length - 1].contentRect.width);
    if (ancho === _anchoObservado) return;
    _anchoObservado = ancho;
    reajustarDetalles();
});

/**
 * Aplica un cambio de disposición de la línea de tiempo o del anillo (`cambiar`, que solo cambia un atributo de <html>) animando lo que se mueve: el tiempo trabajado, la línea,
 * los mosaicos y la nota (o el aro, sus datos y la fila de abajo) viajan desde su lugar anterior al nuevo (la misma técnica con que se mueven las tarjetas al reubicarlas) y la tarjeta acompaña el cambio de alto.
 * @param {() => void} cambiar
 */
function reubicar(cambiar) {
    const host = $('stats-estilo');
    // sin las copias de la capa de medida (ocultas): solo viaja lo que se ve
    const obtener = () => host ? [.../** @type {NodeListOf<HTMLElement>} */ (host.querySelectorAll('.est-linea-cabecera, .est-linea-cuerpo, .est-mosaicos, .est-linea-nota, .est-anillo-aro, .est-anillo-datos, .est-anillo-pie, .est-dias'))].filter(n => !n.closest('.est-capa--medida')) : [];
    Animaciones._animarAlturaCambio($('stats-card'), () => uiAnimarReubicacion(obtener, (/** @type {HTMLElement} */ el) => el.className.split(' ')[0], () => { cambiar(); reajustarDetalles(); }));
}

export const TarjetaEstilos = { actualizar, reubicar, pedirDestelloBalance };
