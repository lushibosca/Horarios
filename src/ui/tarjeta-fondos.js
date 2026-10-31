import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { FONDOS_SVG } from '../data/fondos.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { EstadoApp } from '../services/estado-app.js';

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

function toggleFondoCard() {
    const ids = [...(FONDOS_SVG || []).map(f => f.id), 'ninguno'];
    const idx = ids.indexOf(_fondoCard);
    _fondoCard = ids[(idx + 1) % ids.length];
    Almacenamiento.setItem(STORAGE_KEYS.FONDO_CARD, _fondoCard, true);
    const btn = $('hint-fondo-label');
    if (btn) btn.textContent = _getLabelFondo(_fondoCard);
    const bg = $('stats-card-bg');
    if (bg && bg.dataset.estado) actualizarFondoCard(bg.dataset.estado);
}

function _getLabelFondo(id) {
    if (id === 'ninguno') return 'Sin fondo';
    const fondo = (FONDOS_SVG || []).find(f => f.id === id);
    return fondo ? fondo.label : id;
}

function _getSvgFondo(id, color) {
    const fondo = (FONDOS_SVG || []).find(f => f.id === id);
    if (!fondo) return '';
    return _sanitizarSVG(fondo.svg(color));
}

function _sanitizarSVG(svgStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, 'image/svg+xml');

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

    doc.querySelectorAll('[style]').forEach(el => {
        const safe = (el.getAttribute('style') || '').replace(/@import|url\s*\(/gi, '');
        el.setAttribute('style', safe);
    });

    const svgEl = doc.querySelector('svg');
    return svgEl ? svgEl.outerHTML : '';
}

/** @param {any} [colorOverride] */
function actualizarFondoCard(estado, colorOverride = null) {
    const bg = $('stats-card-bg');
    if (!bg) return;
    bg.dataset.estado = estado;
    bg.classList.toggle('stats-card-bg--zoom', EstadoApp.vistaActual() !== 'semana');

    const coloresVar = {
        blue: 'rgba(76,114,172,0.12)',
        green: 'rgba(76,172,140,0.12)',
        red: 'rgba(172,90,76,0.12)',
        purple: 'rgba(140,80,200,0.12)',
        gold: 'rgba(172,155,76,0.12)',
        orange: 'rgba(210, 120, 50, 0.12)',
    };

    const colores = {
        esperando: 'rgba(140,150,170,0.07)',
        en_curso: coloresVar.blue,
        finalizado_ok: coloresVar.green,
        finalizado_fail: coloresVar.red,
        especial: coloresVar.purple
    };

    const color = colorOverride
        ? (coloresVar[colorOverride] || colores.especial)
        : (colores[estado] || colores.esperando);

    const firma = `${_fondoCard}|${color}`;
    if (firma === _bgUltimaFirma) return;
    _bgUltimaFirma = firma;

    if (_fondoCard === 'ninguno') {
        bg.innerHTML = '';
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
    incoming.innerHTML = nuevoSVG;

    outgoing.style.zIndex = '1';
    outgoing.classList.remove('visible');

    if (_bgFadeTimer) { clearTimeout(_bgFadeTimer); _bgFadeTimer = null; }

    incoming.offsetHeight;
    incoming.classList.add('visible');

    _bgActiveLayer = _bgActiveLayer === 'a' ? 'b' : 'a';
    _bgFadeTimer = setTimeout(() => {
        outgoing.innerHTML = '';
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
    _getSvgFondo,
    _sanitizarSVG,
    actualizarFondoCard
};
