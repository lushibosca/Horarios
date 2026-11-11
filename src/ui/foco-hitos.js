import { $ } from '../core/dom.js';
import { BarraHitos } from './barra-hitos.js';

// ====================================================================
//                FOCO DE HITOS (barra de progreso del día)
// ====================================================================
// Mientras el ciclo del número grande (tarjeta-ciclo-stats.js) muestra una fase, resalta en la barra el hito al que se refiere:
// su hora pasa a una píldora con la descripción desplegada, el resto se atenúa y el punto pulsa.
// Solo alterna clases (`foco` en la etiqueta y en la marca, `hay-foco` en la pista; en la semana, `foco-tramo` y el rango en el relleno). El dibujo es CSS (tarjetas-vistas.css) y
// qué versión de la descripción entra en cada etiqueta (y si conviene abrirla hacia la derecha de la hora mientras dura el foco) lo decide barra-hitos.js al medir;
// así este módulo no conoce geometría ni textos.

// Elementos de la barra que enfoca cada fase del ciclo (la entrada no tiene marca propia: usa el remate del comienzo; cerrada, la salida usa el remate del final)
const _HITOS_POR_FASE = {
    entrada: ['linea-et-entrada', 'progress-punto-inicio'],
    salida: ['linea-et-salida', 'progress-punto'],
    salidaEstimada: ['linea-et-salida', 'linea-tick-salida'],
    banco: ['linea-et-buffer', 'linea-tick-buffer'],
};

/** @type {HTMLElement[]} */
let _enfocados = [];

/**
 * Enfoca el hito de la fase `tipo`; cualquier otra fase (horas, tiempo fuera) o null quita el foco.
 * @param {string | null} tipo
 */
function enfocar(tipo) {
    _enfocados.forEach(el => { el.classList.remove('foco'); BarraHitos.desplegarADerecha(el, false); });
    _enfocados = [];
    const pista = $('progress-bar')?.closest('.progress-pista');
    const ids = tipo ? _HITOS_POR_FASE[tipo] : undefined;
    pista?.classList.toggle('hay-foco', !!ids);
    if (!ids) return;
    ids.forEach(id => {
        const el = $(id);
        if (!el) return;
        el.classList.add('foco');
        BarraHitos.desplegarADerecha(el, true);   // solo hace algo en las etiquetas cuya descripción no entra a la izquierda (ver barra-hitos.js)
        _enfocados.push(el);
    });
}

/** @type {HTMLElement[]} */
let _enfocadosDia = [];

/**
 * Vista semanal (cursor sobre el tramo de un día): enfoca las marcas de esa fecha, atenúa las demás y deja a plena opacidad solo ese tramo de la barra.
 * `rango` son las fracciones (0–1) del relleno donde empieza y termina el tramo; sin fecha (null) quita el foco.
 * @param {string | null} fecha
 * @param {{ desde: number, hasta: number } | null} [rango]
 */
function enfocarDia(fecha, rango = null) {
    _enfocadosDia.forEach(el => el.classList.remove('foco'));
    _enfocadosDia = [];
    const fill = $('progress-bar');
    const pista = fill?.closest('.progress-pista');
    pista?.classList.toggle('hay-foco', !!fecha);
    fill?.classList.toggle('foco-tramo', !!(fecha && rango));
    if (!fecha) return;
    if (fill && rango) {
        fill.style.setProperty('--foco-desde', `${(rango.desde * 100).toFixed(3)}%`);
        fill.style.setProperty('--foco-hasta', `${(rango.hasta * 100).toFixed(3)}%`);
    }
    $('linea-semana')?.querySelectorAll(`[data-fecha="${CSS.escape(fecha)}"]`).forEach(el => {
        el.classList.add('foco');
        _enfocadosDia.push(/** @type {HTMLElement} */ (el));
    });
}

export const FocoHitos = { enfocar, enfocarDia };
