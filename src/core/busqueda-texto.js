// ====================================================================
// BÚSQUEDA DE TEXTO — coincidencias sin distinguir mayúsculas ni acentos (sin DOM)
// ====================================================================

/**
 * Texto normalizado (minúsculas y sin acentos) junto con la posición de cada carácter en el original,
 * para poder volver de una coincidencia a su lugar en el texto que se ve.
 * @param {string} texto
 * @returns {{ normal: string, indices: number[] }}
 */
function normalizarConMapa(texto) {
    let normal = '';
    /** @type {number[]} */
    const indices = [];
    for (let i = 0; i < texto.length; i++) {
        const base = texto[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        for (const c of base) { normal += c; indices.push(i); }
    }
    return { normal, indices };
}

/** @param {string} texto */
export function normalizarBusqueda(texto) {
    return normalizarConMapa(texto).normal;
}

/**
 * Palabras de la consulta, normalizadas. Las de un solo carácter se ignoran (coinciden con casi todo).
 * @param {string} consulta
 * @returns {string[]}
 */
export function terminosDeBusqueda(consulta) {
    return normalizarBusqueda(consulta).split(/\s+/).filter(t => t.length >= 2);
}

/**
 * Un texto coincide si contiene todas las palabras de la consulta (en cualquier orden).
 * @param {string} texto
 * @param {string[]} terminos
 */
export function textoCoincide(texto, terminos) {
    if (!terminos.length) return false;
    const normal = normalizarBusqueda(texto);
    return terminos.every(t => normal.includes(t));
}

/**
 * Tramos `[inicio, fin)` del texto original donde aparece alguna de las palabras (sin superposiciones, en orden).
 * @param {string} texto
 * @param {string[]} terminos
 * @returns {[number, number][]}
 */
export function rangosCoincidencia(texto, terminos) {
    const { normal, indices } = normalizarConMapa(texto);
    /** @type {[number, number][]} */
    const crudos = [];
    for (const t of terminos) {
        if (!t) continue;
        let desde = 0;
        for (let pos = normal.indexOf(t, desde); pos !== -1; pos = normal.indexOf(t, desde)) {
            crudos.push([indices[pos], indices[pos + t.length - 1] + 1]);
            desde = pos + t.length;
        }
    }
    crudos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    /** @type {[number, number][]} */
    const unidos = [];
    for (const r of crudos) {
        const ultimo = unidos[unidos.length - 1];
        if (ultimo && r[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], r[1]);
        else unidos.push([r[0], r[1]]);
    }
    return unidos;
}

/**
 * Una tecla inicia la búsqueda si es una letra suelta (sin Ctrl, Meta ni Alt) y el foco no está ya en un campo de texto.
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} evento
 * @param {boolean} focoEnCampo
 */
export function teclaIniciaBusqueda({ key, ctrlKey = false, metaKey = false, altKey = false }, focoEnCampo) {
    if (focoEnCampo || ctrlKey || metaKey || altKey) return false;
    return key.length === 1 && /^\p{L}$/u.test(key);
}
