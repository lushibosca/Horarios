// ====================================================================
// DOM & COLLAPSIBLES — shared helpers
// ====================================================================
/**
 * getElementById tipado como input: casi todos los usos leen .value/.disabled/.checked.
 * Puede devolver null si el id no existe (por eso el código usa `?.` o `if (el)`).
 * @param {string} id
 * @returns {HTMLInputElement}
 */
export const $ = id => /** @type {HTMLInputElement} */ (document.getElementById(id));

// ====================================================================
// COLAPSABLES — shared helper
// ====================================================================
export function setColapsable(el, abierto, { animar = true } = {}) {
    if (!el) return;
    if (animar) {
        el.classList.toggle('expanded', abierto);
        return;
    }
    el.classList.add('sin-transicion');
    el.classList.toggle('expanded', abierto);
    void el.offsetHeight;
    el.classList.remove('sin-transicion');
}

/** ¿Esa altura ocupa más de una línea de texto del elemento? (necesita el elemento en el documento) */
export function superaUnaLinea(el, altura) {
    const estilo = getComputedStyle(el);
    const alto = parseFloat(estilo.lineHeight) || parseFloat(estilo.fontSize) * 1.2;
    return altura > alto * 1.5;
}

/**
 * Enlaza varios botones de una vez: `alClic({ 'btn-x': () => hacerAlgo() })`. Un id que no está en la página se ignora.
 * @param {Record<string, (e: MouseEvent) => any>} manejadores
 */
export function alClic(manejadores) {
    Object.entries(manejadores).forEach(([id, fn]) => $(id)?.addEventListener('click', fn));
}
