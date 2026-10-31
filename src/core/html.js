import { SeguridadYUtils } from './seguridad.js';

// ====================================================================
// HTML SEGURO — plantillas con escape automático
// ====================================================================
// html`<b>${texto}</b>` escapa cada interpolación (válido también dentro de
// atributos entre comillas). Para insertar marcado ya confiable: anidar otro
// html`...` o envolverlo con crudo(). Un string común NUNCA se interpreta como HTML.

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

/** Reemplaza el contenido de `el` por un html`...` (único camino recomendado para innerHTML con datos). */
export function montar(el, contenido) {
    if (!esHtmlSeguro(contenido)) throw new TypeError('montar: el contenido debe ser un html`...`');
    el.innerHTML = contenido.valor;
}
