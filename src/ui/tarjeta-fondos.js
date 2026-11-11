import { STORAGE_KEYS, FONDO_CARD_POR_DEFECTO } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { EventosApp } from '../core/eventos.js';
import { FONDOS_SVG } from '../data/fondos.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { EstadoApp } from '../services/estado-app.js';
import { aHtmlConfiable, crudo, montar } from '../core/html.js';

// ====================================================================
//           UI CARD BACKGROUNDS & PROGRESS BAR COLOR MODULE
// ====================================================================
function setProgressBarColor(progressEl, status, headerColor, forzarShimmer = false) {
    if (!progressEl) return;
    progressEl.className = 'progress-fill';
    progressEl.classList.add(status);
    if (status === 'blue' || forzarShimmer) progressEl.classList.add('shimmer');

    const header = document.querySelector('.header');
    if (header) {
        header.classList.remove('progress-green', 'progress-red', 'progress-purple', 'progress-orange', 'progress-gold', 'progress-blue');
        const colorHeader = headerColor || status;
        if (colorHeader !== 'transparent') {
            header.classList.add('progress-' + colorHeader);
        }
    }
}

let _fondoCard = 'golden-gate';
let _bgFadeTimer = null;
let _bgActiveLayer = 'a';
let _bgUltimaFirma = null;

function setFondoCard(valor) {
    _fondoCard = valor;
}

// Al restaurar un respaldo el fondo cambia desde el servicio: se relee del almacenamiento y se redibuja
EventosApp.on('config:fondo-card', () => {
    _fondoCard = Almacenamiento.getItem(STORAGE_KEYS.FONDO_CARD, FONDO_CARD_POR_DEFECTO, true);
    const bg = $('stats-card-bg');
    if (bg && bg.dataset.estado) actualizarFondoCard(bg.dataset.estado);
});

function toggleFondoCard() {
    const ids = [...FONDOS_SVG.map(f => f.id), 'ninguno'];
    const idx = ids.indexOf(_fondoCard);
    _fondoCard = ids[(idx + 1) % ids.length];
    Almacenamiento.setItem(STORAGE_KEYS.FONDO_CARD, _fondoCard, true);
    const bg = $('stats-card-bg');
    if (bg && bg.dataset.estado) actualizarFondoCard(bg.dataset.estado);
}

const _buscarFondo = (id) => FONDOS_SVG.find(f => f.id === id);

function _getLabelFondo(id) {
    if (id === 'ninguno') return 'Sin fondo';
    const fondo = _buscarFondo(id);
    return fondo ? fondo.label : id;
}

// Los fondos son estáticos: cada combinación fondo|color se sanea una sola vez (hay pocas: ~10 fondos × 6 colores)
const _svgSaneados = new Map();

function _getSvgFondo(id, color) {
    const fondo = _buscarFondo(id);
    if (!fondo) return '';
    const clave = `${id}|${color}`;
    if (!_svgSaneados.has(clave)) _svgSaneados.set(clave, _sanitizarSVG(fondo.svg(color)));
    return _svgSaneados.get(clave);
}

function _sanitizarSVG(svgStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(aHtmlConfiable(crudo(svgStr)), 'image/svg+xml');   // SVG del catálogo propio (data/fondos.js)

    const TAGS_BLOQUEADOS = ['script', 'foreignObject', 'use', 'iframe', 'object', 'embed', 'link'];
    TAGS_BLOQUEADOS.forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
    });

    const ATTRS_BLOQUEADOS = /^on|^xlink:href$|^href$/i;
    doc.querySelectorAll('*').forEach(el => {
        [...el.attributes].forEach(attr => {
            if (ATTRS_BLOQUEADOS.test(attr.name)) el.removeAttribute(attr.name);
        });
    });

    // los estilos en línea los bloquea la CSP (style-src 'self'): se quitan en vez de limpiarlos
    doc.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));

    const svgEl = doc.querySelector('svg');
    return svgEl ? svgEl.outerHTML : '';
}

// Colores del fondo por estado. Van como valor literal porque se escriben en el atributo fill del SVG, que no resuelve var(--token)
const COLORES_FONDO = {
    blue: 'rgba(76,114,172,0.12)',
    green: 'rgba(76,172,140,0.12)',
    red: 'rgba(172,90,76,0.12)',
    purple: 'rgba(140,80,200,0.12)',
    gold: 'rgba(172,155,76,0.12)',
    orange: 'rgba(210, 120, 50, 0.12)',
};

/** @param {any} [colorOverride] */
function actualizarFondoCard(estado, colorOverride = null) {
    const bg = $('stats-card-bg');
    if (!bg) return;
    bg.dataset.estado = estado;
    bg.classList.toggle('stats-card-bg--zoom', EstadoApp.vistaActual() !== 'semana');

    const colores = {
        esperando: 'rgba(140,150,170,0.07)',
        en_curso: COLORES_FONDO.blue,
        finalizado_ok: COLORES_FONDO.green,
        finalizado_fail: COLORES_FONDO.red,
        especial: COLORES_FONDO.purple
    };

    const color = colorOverride
        ? (COLORES_FONDO[colorOverride] || colores.especial)
        : (colores[estado] || colores.esperando);

    const firma = `${_fondoCard}|${color}`;
    if (firma === _bgUltimaFirma) return;
    _bgUltimaFirma = firma;

    if (_fondoCard === 'ninguno') {
        bg.replaceChildren();
        return;
    }

    let layerA = /** @type {HTMLElement} */ (bg.querySelector('.stats-card-bg__layer[data-layer="a"]'));
    let layerB = /** @type {HTMLElement} */ (bg.querySelector('.stats-card-bg__layer[data-layer="b"]'));
    if (!layerA) {
        layerA = document.createElement('div');
        layerA.className = 'stats-card-bg__layer';
        layerA.dataset.layer = 'a';
        bg.appendChild(layerA);
    }
    if (!layerB) {
        layerB = document.createElement('div');
        layerB.className = 'stats-card-bg__layer';
        layerB.dataset.layer = 'b';
        bg.appendChild(layerB);
    }

    const nuevoSVG = _getSvgFondo(_fondoCard, color);
    const incoming = _bgActiveLayer === 'a' ? layerB : layerA;
    const outgoing = _bgActiveLayer === 'a' ? layerA : layerB;

    incoming.style.zIndex = '2';
    incoming.classList.remove('visible');
    montar(incoming, crudo(nuevoSVG));   // SVG del catálogo propio, ya pasado por _sanitizarSVG

    outgoing.style.zIndex = '1';
    outgoing.classList.remove('visible');

    if (_bgFadeTimer) { clearTimeout(_bgFadeTimer); _bgFadeTimer = null; }

    incoming.offsetHeight;
    incoming.classList.add('visible');

    _bgActiveLayer = _bgActiveLayer === 'a' ? 'b' : 'a';
    _bgFadeTimer = setTimeout(() => {
        outgoing.replaceChildren();
        outgoing.classList.remove('visible');
        _bgFadeTimer = null;
    }, 650);
}


export const TarjetaFondos = {
    setProgressBarColor,
    getFondoCard: () => _fondoCard,
    setFondoCard,
    toggleFondoCard,
    _getLabelFondo,
    actualizarFondoCard
};
