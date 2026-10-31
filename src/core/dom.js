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
