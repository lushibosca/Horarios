import { $ } from '../core/dom.js';
import { CicloStats } from './tarjeta-ciclo-stats.js';
import { FocoHitos } from './foco-hitos.js';

// ====================================================================
//         HOVER SOBRE LA BARRA DE LA TARJETA DE ESTADO (solo escritorio)
// ====================================================================
// Con el hint integrado, al pasar el cursor por un hito de la vista diaria se muestra su texto con el mismo foco que le da el ciclo del número grande
// (ver tarjeta-ciclo-stats.js: `fijarFase`/`soltarFase`), y por el tramo de un día de la vista semanal, el total, la entrada y la salida de ese día
// (el tramo queda a plena opacidad y el resto atenuado). Solo con puntero que puede hacer hover (mouse o trackpad): en móviles no hace nada.

const _consultaHover = window.matchMedia('(hover: hover) and (pointer: fine)');

// Elementos de la vista diaria que enfocan cada hito (el primer tipo que exista: la salida es "salida" con el registro cerrado y "estimada" con él abierto;
// el remate final solo es hito cuando el registro está cerrado, abierto marca el "ahora")
const _TIPOS_POR_ID = {
    'linea-et-entrada': ['entrada'],
    'progress-punto-inicio': ['entrada'],
    'linea-et-salida': ['salida', 'salidaEstimada'],
    'linea-tick-salida': ['salida', 'salidaEstimada'],
    'progress-punto': ['salida'],
    'linea-et-buffer': ['banco'],
    'linea-tick-buffer': ['banco'],
};

/**
 * @typedef {{ stats: string | null, mensaje: string }} TextoHoverDia
 * @typedef {{ fecha: string, fraccion: number, hover?: TextoHoverDia }} HitoSemana
 */
/** @type {{ hitos: HitoSemana[], fin: number } | null} */
let _semana = null;
/** @type {{ mostrar: (stats: string | null, mensaje: string | null) => void, restaurar: () => void } | null} */
let _textos = null;
let _tipoDiario = '';
let _diaSemana = '';

/**
 * La tarjeta de fichaje avisa los datos de la vista semanal (o null en otra vista) en cada render, y cómo escribir y restaurar el número y el mensaje.
 * @param {{ hitos: HitoSemana[], fin: number } | null} semana
 */
function actualizarDatos(semana) {
    _semana = semana;
    if (!semana) { _salirDeDia(); return; }
    // un render (cada minuto) pisa el texto: si el cursor sigue sobre un día, se vuelve a escribir
    const hito = _diaSemana ? semana.hitos.find(h => h.fecha === _diaSemana) : null;
    if (hito?.hover) _textos?.mostrar(hito.hover.stats, hito.hover.mensaje);
}

/** @param {{ mostrar: (stats: string | null, mensaje: string | null) => void, restaurar: () => void }} textos */
function conectarTextos(textos) {
    _textos = textos;
}

function _salirDeHito() {
    if (!_tipoDiario) return;
    _tipoDiario = '';
    $('stats-card')?.classList.remove('hover-hito');
    CicloStats.soltarFase();
}

function _salirDeDia() {
    if (!_diaSemana) return;
    _diaSemana = '';
    FocoHitos.enfocarDia(null);
    _textos?.restaurar();
}

// Vista diaria: el hito bajo el cursor (por su etiqueta, marca o remate)
function _sobreDiaria(e) {
    const el = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target.closest('[id]') : null);
    const tipos = el ? _TIPOS_POR_ID[el.id] : undefined;
    if (!tipos) { _salirDeHito(); return; }
    const clave = tipos.join();
    if (clave === _tipoDiario) return;
    _salirDeHito();
    if (CicloStats.fijarFase(tipos)) { _tipoDiario = clave; $('stats-card')?.classList.add('hover-hito'); }
}

// Vista semanal: el día de la marca bajo el cursor o, si no hay, el del tramo que corresponde a su posición sobre la pista
function _sobreSemana(e, pista) {
    if (!_semana || !_textos) return;
    const marca = e.target instanceof Element ? e.target.closest('[data-fecha]') : null;
    const { hitos, fin } = _semana;
    let idx = -1;
    if (marca instanceof HTMLElement) {
        idx = hitos.findIndex(h => h.fecha === marca.dataset.fecha);
    } else {
        const r = pista.getBoundingClientRect();
        const f = (e.clientX - r.left) / r.width;
        idx = hitos.findIndex(h => f <= h.fraccion);
    }
    const hito = hitos[idx];
    if (!hito?.hover || (idx >= 0 && (idx === 0 ? 0 : hitos[idx - 1].fraccion) >= fin)) { _salirDeDia(); return; }
    if (hito.fecha === _diaSemana) return;
    _diaSemana = hito.fecha;
    const desde = idx === 0 ? 0 : hitos[idx - 1].fraccion;
    FocoHitos.enfocarDia(hito.fecha, { desde: desde / fin, hasta: Math.min(1, hito.fraccion / fin) });
    _textos.mostrar(hito.hover.stats, hito.hover.mensaje);
}

function _alMover(e) {
    if (!_consultaHover.matches) return;
    const pista = /** @type {HTMLElement | null} */ (e.currentTarget);
    if (!pista || !pista.classList.contains('con-linea')) return;
    if (pista.classList.contains('linea-semanal')) _sobreSemana(e, pista);
    else _sobreDiaria(e);
}

function _alSalir() {
    _salirDeHito();
    _salirDeDia();
}

function bindEventos() {
    const pista = $('progress-bar')?.closest('.progress-pista');
    if (!pista) return;
    pista.addEventListener('mouseover', _alMover);
    pista.addEventListener('mousemove', _alMover);
    pista.addEventListener('mouseleave', _alSalir);
}

export const HoverBarra = { bindEventos, actualizarDatos, conectarTextos };
