import { SeguridadYUtils } from './seguridad.js';

// ====================================================================
// HTML SEGURO — plantillas con escape automático
// ====================================================================
// html`<b>${texto}</b>` escapa cada interpolación (válido también dentro de
// atributos entre comillas). Para insertar marcado ya confiable: anidar otro
// html`...` o envolverlo con crudo(). Un string común NUNCA se interpreta como HTML.

// Trusted Types: la CSP de index.html exige `require-trusted-types-for 'script'`, así que el navegador solo acepta
// TrustedHTML en innerHTML y TrustedScriptURL al registrar el Service Worker. La única política ('horarios') vive acá:
// createHTML solo se usa con el contenido de un HtmlSeguro (ya escapado por html`...`) y createScriptURL solo admite sw.js.
// Sin soporte (Node, navegadores viejos) se usan los strings tal cual.
const SCRIPTS_PERMITIDOS = ['./sw.js'];
const _politica = /** @type {any} */ (globalThis).trustedTypes?.createPolicy?.('horarios', {
    createHTML: (/** @type {string} */ s) => s,
    createScriptURL: (/** @type {string} */ url) => {
        if (!SCRIPTS_PERMITIDOS.includes(url)) throw new TypeError(`Script no permitido: ${url}`);
        return url;
    },
});

class HtmlSeguro {
    constructor(valor) { this.valor = valor; }
    toString() { return this.valor; }
}

function aTexto(v) {
    if (v == null || v === false) return '';
    if (v instanceof HtmlSeguro) return v.valor;
    if (Array.isArray(v)) return v.map(aTexto).join('');
    return SeguridadYUtils.escapeHtml(v);
}

export function html(literales, ...valores) {
    let out = literales[0];
    for (let i = 0; i < valores.length; i++) out += aTexto(valores[i]) + literales[i + 1];
    return new HtmlSeguro(out);
}

/** Marca un string como HTML ya confiable (constantes del código, nunca datos del usuario). */
export function crudo(s) { return new HtmlSeguro(String(s)); }

/** Ícono del sprite SVG de index.html (`href` = '#icon-…'); sirve dentro de html`...` y en strings comunes. */
export function icono(href, clase = '') {
    return html`<svg class="${clase ? `icon ${clase}` : 'icon'}"><use href="${href}"/></svg>`;
}

export function esHtmlSeguro(v) { return v instanceof HtmlSeguro; }

/**
 * Convierte un html`...` en lo que aceptan los sinks de HTML (TrustedHTML con Trusted Types activo, si no el string).
 * @returns {any}
 */
export function aHtmlConfiable(contenido) {
    if (!esHtmlSeguro(contenido)) throw new TypeError('aHtmlConfiable: el contenido debe ser un html`...`');
    return _politica ? _politica.createHTML(contenido.valor) : contenido.valor;
}

/** URL de script para APIs como serviceWorker.register (solo las de SCRIPTS_PERMITIDOS). @returns {any} */
export function urlScriptConfiable(url) {
    if (!SCRIPTS_PERMITIDOS.includes(url)) throw new TypeError(`Script no permitido: ${url}`);
    return _politica ? _politica.createScriptURL(url) : url;
}

/** Reemplaza el contenido de `el` por un html`...` (único lugar del código que asigna innerHTML). */
export function montar(el, contenido) {
    el.innerHTML = aHtmlConfiable(contenido);
}
