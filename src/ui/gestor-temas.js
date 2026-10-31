import { $ } from '../core/dom.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { Almacenamiento } from '../core/almacenamiento.js';

// ====================================================================
// THEME MANAGER MODULE
// ====================================================================
const TEMAS = ['light', 'dark', 'medianoche', 'pink', 'green', 'blue', 'lilac', 'crema'];

function temaGuardado() {
    const raw = Almacenamiento.getItem(STORAGE_KEYS.TEMA_OSCURO, null);
    if (raw === null) return 'dark';
    if (raw === 'true') return 'dark';
    if (raw === 'false') return 'light';
    return TEMAS.includes(raw) ? raw : 'dark';
}

function aplicarTema(tema) {
    document.documentElement.classList.toggle('dark-mode', tema === 'dark');
    if (tema === 'light' || tema === 'dark') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', tema);
    }
    const esClaro = tema === 'light';
    ['theme-toggle', 'theme-toggle-modal', 'theme-toggle-config', 'btn-tema-selector'].forEach(id => {
        const icon = $(id)?.querySelector('use');
        if (icon) icon.setAttribute('href', esClaro ? '#icon-moon' : '#icon-sun');
    });
    sincronizarBarraDelSistema();
}

function sincronizarBarraDelSistema() {
    const color = getComputedStyle(document.body).getPropertyValue('--bg-body').trim();
    if (!/^#[0-9a-f]{3,8}$/i.test(color)) return;
    /** @type {HTMLMetaElement|null} */
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', color);
}


function siguienteTema(temaActual) {
    const idx = TEMAS.indexOf(temaActual);
    return TEMAS[(idx + 1) % TEMAS.length];
}

export const GestorTemas = { TEMAS, temaGuardado, aplicarTema, siguienteTema };
