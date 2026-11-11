// ====================================================================
// RESUMEN DEL DÍA PARA LOS ESTILOS DE LA TARJETA DE ESTADO (funciones puras, sin DOM)
// ====================================================================
// Los diseños propios de la tarjeta (anillo, línea de tiempo y lista de filas) dibujan los mismos datos con distinta forma:
// acá se calculan una sola vez, en minutos y con textos compactos ("6 h 38 min").

/** @param {number} minutos entero (se redondea; lo negativo cuenta como 0) */
export function partesDuracion(minutos) {
    const total = Math.max(0, Math.round(minutos));
    return { horas: Math.floor(total / 60), minutos: total % 60 };
}

/** "22 min", "7 h", "7 h 45 min". @param {number} minutos */
export function duracionCompacta(minutos) {
    const { horas, minutos: m } = partesDuracion(minutos);
    if (horas === 0) return `${m} min`;
    return m === 0 ? `${horas} h` : `${horas} h ${m} min`;
}

/** Con signo explícito: "+19 min", "−35 min" (menos tipográfico). @param {number} minutos */
export function duracionConSigno(minutos) {
    return `${minutos < 0 ? '−' : '+'}${duracionCompacta(Math.abs(minutos))}`;
}

/**
 * Hitos de la jornada abierta o cerrada en orden de aparición (minutos relativos a la entrada), para la línea de tiempo vertical.
 * "Ahora" se ordena entre los demás por su hora; con la jornada cerrada solo quedan la entrada y la salida real.
 * @param {{ cerrado: boolean, ahoraRel: number, salidaRel: number, bufferRel: number | null, hayBanda: boolean }} linea
 * @returns {{ tipo: 'entrada' | 'ahora' | 'salida' | 'banco', rel: number }[]}
 */
export function hitosOrdenados(linea) {
    /** @type {{ tipo: 'entrada' | 'ahora' | 'salida' | 'banco', rel: number }[]} */
    const hitos = [{ tipo: 'entrada', rel: 0 }];
    if (linea.cerrado) {
        hitos.push({ tipo: 'salida', rel: linea.salidaRel });
        return hitos;
    }
    hitos.push({ tipo: 'ahora', rel: linea.ahoraRel }, { tipo: 'salida', rel: linea.salidaRel });
    if (linea.hayBanda && linea.bufferRel !== null) hitos.push({ tipo: 'banco', rel: linea.bufferRel });
    // orden estable: ante un empate "ahora" va primero (es lo que ya pasó), la salida y luego el banco
    const prioridad = { entrada: 0, ahora: 1, salida: 2, banco: 3 };
    return hitos.sort((a, b) => a.rel - b.rel || prioridad[a.tipo] - prioridad[b.tipo]);
}

/** Horas del día en formato corto para las celdas de la semana: "7:30"; sin tiempo, "—". @param {number} minutos */
export function horaCorta(minutos) {
    const { horas, minutos: m } = partesDuracion(minutos);
    return horas === 0 && m === 0 ? '—' : `${horas}:${String(m).padStart(2, '0')}`;
}

/**
 * Resúmenes de ejemplo con TODOS los datos posibles (el peor caso de cada estado): el diseño de alto fijo (el anillo) los dibujan ocultos
 * para que la tarjeta reserve el alto del más alto y no cambie de tamaño al pasar del día a la semana ni entre registro, sin registro y día especial.
 */
export function resumenesDeMedida() {
    const banco = { minutos: -15, positivo: false, texto: '−15 min' };
    const balance = { etiqueta: 'Faltan', texto: '8 h 5 min', tono: 'neutro', detalle: 'Te podés ir' };   // con la tercera línea (la del peor caso)
    const dias = Array.from({ length: 7 }, (_, i) => ({
        fecha: '', sigla: 'lun', inicial: 'L', hoy: i === 0, estado: 'cerrado', color: 'green',
        totalMin: 485, objetivoMin: 480, fraccion: 1, emoji: '🏖️', etiqueta: 'Vacaciones'
    }));
    return [
        {
            tipo: 'registro', cerrado: false, color: 'blue', progreso: 50, mensaje: '',
            trabajadoMin: 485, trabajado: partesDuracion(485), entrada: '00:00', salida: '', salidaEstimada: '00:00', salidaBanco: '00:00',
            linea: { cerrado: false, ahoraRel: 60, salidaRel: 480, bufferRel: 420, hayBanda: true },
            balance, banco, tiempoFuera: { minutos: 5, corriendo: false, texto: '5 min' }
        },
        { tipo: 'espera', emoji: '🎒', mensaje: 'Esperando registro…', banco },
        { tipo: 'especial', emoji: '🏖️', etiqueta: 'Vacaciones', descripcion: '¡Vacaciones!', color: 'orange' },
        {
            tipo: 'semana', abierta: true, color: 'blue', mensaje: '', progreso: 50,
            trabajadoMin: 2405, trabajado: partesDuracion(2405), objetivoMin: 2400, balance, banco, dias
        }
    ];
}
