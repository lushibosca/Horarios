// ====================================================================
// GEOMETRÍA DE ETIQUETAS — posiciones de las horas y siglas que cuelgan de la barra de progreso (sin DOM)
// ====================================================================
// Cada marca de la barra es una "T" con flecha: sale hacia su lado y termina en el medio de su etiqueta.
// La etiqueta queda a la izquierda del conector; si no entra, se espeja a la derecha.
export const ANCHO_CONECTOR = 19;        // de la marca al final de la línea diagonal
export const SEPARACION_ETIQUETA = 2;    // del final de la línea a la etiqueta
export const MARGEN_HORAS = 12;          // separación mínima entre horas del mismo lado antes de reubicar la entrada
export const MARGEN_SIGLAS = 8;          // separación mínima entre siglas del mismo lado en la vista semanal
export const ANCHO_DIAGONAL = 16;        // de la marca al extremo de la sigla rotada (línea diagonal más separación)
export const ANCHO_PASO_DIAGONAL = 24;   // ancho de pista que ocupa cada sigla en diagonal (paralelas entre sí)
const MEDIO_ANCHO_MARCA = 3;

/**
 * Posición de una etiqueta de ancho `w` colgada de una marca ubicada en `x` (px desde el borde izquierdo de la pista).
 * `left` es donde va la etiqueta; `desde`/`hasta` es el tramo horizontal que ocupa el conector con su etiqueta
 * (más `margen / 2` a cada lado de la etiqueta), para detectar choques con otras marcas del mismo lado.
 * @param {number} x
 * @param {number} w
 * @param {number} [margen]
 */
export function geometriaConector(x, w, margen = 0) {
    const espejado = x - ANCHO_CONECTOR - SEPARACION_ETIQUETA - w < 0;
    const left = espejado ? x + ANCHO_CONECTOR + SEPARACION_ETIQUETA : x - ANCHO_CONECTOR - SEPARACION_ETIQUETA - w;
    return {
        espejado,
        left,
        desde: espejado ? x - MEDIO_ANCHO_MARCA : left - margen / 2,
        hasta: espejado ? left + w + margen / 2 : x + MEDIO_ANCHO_MARCA
    };
}

/**
 * Vista semanal con la sigla en diagonal: la línea sale de la marca a 45° (hacia abajo/arriba y a la izquierda) y la sigla, rotada a 45°,
 * sigue la misma recta con su extremo pegado al final de la línea. Si a la izquierda no hay lugar para la sigla rotada, todo se espeja a la derecha.
 * `left` es el borde izquierdo de la etiqueta sin rotar (el giro es sobre el extremo que toca la línea); `desde`/`hasta` es el tramo de pista que ocupa:
 * como las siglas quedan paralelas, dos del mismo lado no se pisan mientras sus marcas estén separadas lo que ocupa una (`ANCHO_PASO_DIAGONAL`).
 * @param {number} x
 * @param {number} w ancho de la etiqueta sin rotar
 * @param {number} h alto de la etiqueta sin rotar
 * @param {number} [margen]
 */
export function geometriaDiagonal(x, w, h, margen = 0) {
    const alcance = ANCHO_DIAGONAL + Math.SQRT1_2 * (w + h / 2);
    const espejado = x - alcance < 0;
    return {
        espejado,
        left: espejado ? x + ANCHO_DIAGONAL : x - ANCHO_DIAGONAL - w,
        desde: x - ANCHO_PASO_DIAGONAL / 2 - margen / 2,
        hasta: x + ANCHO_PASO_DIAGONAL / 2 + margen / 2
    };
}

/**
 * Reparte las etiquetas entre el lado de arriba y el de abajo de la barra: cada una prueba primero su lado preferido y después el otro;
 * si en ninguno entra sin pisar a otra ya ubicada, queda sin lado (`null`: se muestra solo el punto de anclaje).
 * Se ubican primero las de mayor prioridad (a igual prioridad, por orden).
 * @template {{ desde: number, hasta: number, preferido: 'arriba' | 'abajo', prioridad?: number, orden: number }} T
 * @param {T[]} items
 * @returns {Map<T, 'arriba' | 'abajo' | null>}
 */
export function repartirLados(items) {
    /** @type {Record<'arriba' | 'abajo', T[]>} */
    const ocupado = { arriba: [], abajo: [] };
    const libre = (lado, it) => ocupado[lado].every(o => it.hasta <= o.desde || it.desde >= o.hasta);
    const resultado = new Map();
    [...items].sort((a, b) => (b.prioridad ?? 2) - (a.prioridad ?? 2) || a.orden - b.orden).forEach(it => {
        const lado = it.preferido === 'arriba' ? (libre('arriba', it) ? 'arriba' : libre('abajo', it) ? 'abajo' : null)
            : (libre('abajo', it) ? 'abajo' : libre('arriba', it) ? 'arriba' : null);
        resultado.set(it, lado);
        if (lado) ocupado[lado].push(it);
    });
    return resultado;
}

/**
 * La hora de entrada pasa arriba de la barra si la de salida la pisa o queda pegada, salvo que arriba esté la etiqueta del buffer en ese mismo tramo.
 * Sin ancho medido (pista oculta, todo vale 0) no se decide nada: devuelve `false`.
 * @param {{ ancho: number, entradaLeft: number, entradaAncho: number, salidaLeft: number, bufferLeft?: number | null }} p
 */
export function entradaDebeSubir({ ancho, entradaLeft, entradaAncho, salidaLeft, bufferLeft = null }) {
    if (!(ancho > 0)) return false;
    const finEntrada = entradaLeft + entradaAncho + MARGEN_HORAS;
    const salidaChoca = salidaLeft < finEntrada;
    const arribaOcupado = bufferLeft !== null && bufferLeft < finEntrada;
    return salidaChoca && !arribaOcupado;
}
