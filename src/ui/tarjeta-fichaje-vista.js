import { Preferencias } from '../core/preferencias.js';
import { ESTADO_DIA, CUMPLIMIENTO, horasGte, horasEq, MARGEN_HORAS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { SaldoSemanal } from '../services/saldo-semanal.js';
import { TarjetaTiempoFuera } from './tarjeta-tiempo-fuera.js';
import { TiempoFuera } from '../services/tiempo-fuera.js';
import { EstadoApp } from '../services/estado-app.js';
import { html, icono } from '../core/html.js';
import { Objetivos } from '../services/objetivos.js';
import { EstiloTarjeta } from '../core/estilo-tarjeta.js';
import { partesDuracion, duracionCompacta, duracionConSigno } from '../core/resumen-tarjeta.js';

// ====================================================================
//                     UI CLOCK-IN CARD VIEW MODEL (textos, hints y colores de la tarjeta)
// ====================================================================
const { _minutosAHoraWrap } = TarjetaTiempoFuera;

function _calcularProgreso(valor, objetivo) {
    return objetivo > 0 ? Math.min((valor / objetivo) * 100, 100) : 100;
}

function _estaCumplido(valor, objetivo) {
    return objetivo === 0 || horasGte(valor, objetivo);
}

let _formatoCortoStatsCache = false;

function _refrescarFormatoCortoStatsCache() {
    _formatoCortoStatsCache = Preferencias.FORMATO_CORTO_STATS.get();
}
EventosApp.on('config:formato-corto-stats', _refrescarFormatoCortoStatsCache);

// "Hint integrado" (estilo "Barra con hitos"): la salida estimada y la salida con buffer se dibujan sobre la barra en vez de en el texto inferior.
// Los estilos con diseño propio (anillo, línea de tiempo...) reemplazan la barra tanto en la vista diaria como en la semanal.
const _hintActivo = () => EstiloTarjeta.hintIntegrado();
/** ¿La tarjeta usa el diseño propio de un estilo (anillo, línea de tiempo o filas) en vez de la barra? */
const _estiloPropioActivo = () => EstiloTarjeta.propio();
// y su variante: el nombre del hito enfocado va en el número grande en vez de desplegarse en la barra
let _descHitosNumero = Preferencias.DESC_HITOS_NUMERO.get();
// y si el ciclo automático de fases (al tocar el número o al fichar) sigue activo con el hint integrado
let _cicloHintAuto = Preferencias.CICLO_HINT_AUTO.get();
EventosApp.on('config:hint-integrado', () => {
    _cicloHintAuto = Preferencias.CICLO_HINT_AUTO.get();
    _descHitosNumero = Preferencias.DESC_HITOS_NUMERO.get();
});

// Solo se activa mientras se deriva la variante corta del mensaje de la tarjeta (ver _conMensajeCorto): no toca la opción del usuario
let _forzarCorto = false;

function _modoTextoStats() {
    return _formatoCortoStatsCache || _forzarCorto ? 'short' : 'long';
}

// Igual que _cantidadHoras pero con el tiempo abreviado ("2h 48m"), sin depender de la opción del usuario
function _cantidadHorasCorta(horasDecimales) {
    if (_formatoCortoStatsCache) return _cantidadHoras(horasDecimales);
    _forzarCorto = true;
    try { return _cantidadHoras(horasDecimales); } finally { _forzarCorto = false; }
}

// Agrega vista.mensajeCorto y vista.statsCorto (el mismo mensaje y número grande con el tiempo abreviado: "2h 26m", "19h 59m") para que el render las use solo si
// la larga no entra en una línea. Con el formato corto ya activo ya son cortas y no hace falta variante.
function _conMensajeCorto(derivar) {
    return (est) => {
        const vista = derivar(est);
        if (_formatoCortoStatsCache) return vista;
        _forzarCorto = true;
        try {
            const corta = derivar(est);
            if (vista.mostrarMensaje) vista.mensajeCorto = corta.mensaje;
            if (corta.stats !== vista.stats) vista.statsCorto = corta.stats;
        } finally { _forzarCorto = false; }
        return vista;
    };
}

// Con la jornada recién abierta el reloj marca 0 minutos: se muestra un texto en lugar del cero
const _TEXTO_COMENZANDO = 'Comenzando...';
const _TEXTO_SEMANA_SIN_HORAS = 'Sin horas todavía';
const _sinMinutos = horasDecimales => TiempoUtils.horasAMinutosRedondeados(horasDecimales) === 0;

function _horasTextoStats(horasDecimales) {
    return TiempoUtils.horasATexto(horasDecimales, _modoTextoStats());
}

function _cantidadHoras(horasDecimales) {
    const { horas, minutos } = TiempoUtils.descomponerHorasDecimales(horasDecimales);
    const texto = _horasTextoStats(horasDecimales);
    const singular = horas === 1 || (horas === 0 && minutos === 1);
    return { texto, singular };
}

function _fraseCantidad(horasDecimales, singular, plural) {
    const { texto, singular: esSingular } = _cantidadHoras(horasDecimales);
    return `${esSingular ? singular : plural} ${texto}`;
}

function _fraseCantidadSufijo(horasDecimales, singular, plural) {
    const { texto, singular: esSingular } = _cantidadHoras(horasDecimales);
    return `${texto} ${esSingular ? singular : plural}`;
}

function _hintSalidaODefault(reg, objetivoAplica, bufferSemanal, diasHabiles, hintDefault, permiteEstimado) {
    if (permiteEstimado && reg && reg.entrada && objetivoAplica > 0 && !TiposRegistro.esRegistroEspecial(reg.entrada, reg.salida)) {
        return _calcularHintSalidaEstimada(reg, objetivoAplica, bufferSemanal, diasHabiles);
    }
    return { hint: hintDefault };
}

function _tituloDia(nombreDia) {
    return html`${icono('#icon-clock')}${nombreDia}`;
}

// objetivoCumplido: con el día abierto y la jornada ya cumplida, el badge "En curso" parpadea más rápido
function _badgeEstadoHoy(dayClosed, colorFinal, objetivoCumplido = false) {
    if (!dayClosed) {
        return html`<span class="estado-badge estado-badge--en-curso${objetivoCumplido ? ' estado-badge--cumplido' : ''}">En curso</span>`;
    }
    const color = colorFinal || 'green';
    return html`<span class="estado-badge estado-badge--finalizado estado-badge--${color}">Finalizado</span>`;
}

function _conAvisoAyer(vista, avisoAyerHint) {
    return avisoAyerHint ? { ...vista, ...avisoAyerHint } : vista;
}

const _SIGLAS_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];   // las que se ven en la barra y se leen en pantalla
const _INICIALES_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];   // versión angosta para móviles (la elige barra-hitos.js según el ancho)

// Color del tramo de un día, con el mismo criterio que la vista diaria: en curso azul; cerrado verde si cumplió, dorado si lo cubre el saldo, rojo si faltó
// (el resultado de cada día cerrado lo calcula el servicio: d.cumplimiento)
const _COLOR_CUMPLIMIENTO = { [CUMPLIMIENTO.CUMPLIDO]: 'green', [CUMPLIMIENTO.CUBIERTO]: 'gold', [CUMPLIMIENTO.FALTANTE]: 'red' };
function _colorEstadoDia(d) {
    if (d.activo) return 'blue';
    return _COLOR_CUMPLIMIENTO[d.cumplimiento] ?? 'red';
}

// Cómo se nombra el estado de un día para quien no ve la barra (lector de pantalla)
const _PALABRA_CUMPLIMIENTO = { [CUMPLIMIENTO.CUMPLIDO]: 'cumplido', [CUMPLIMIENTO.CUBIERTO]: 'cubierto por el saldo', [CUMPLIMIENTO.FALTANTE]: 'con faltante' };
function _palabraEstadoDia(d) {
    switch (d.estado) {
        case ESTADO_DIA.ACTIVO: return 'en curso';
        case ESTADO_DIA.ESPECIAL: return 'día especial';
        case ESTADO_DIA.SIN_SALIDA: return 'sin salida registrada';
        case ESTADO_DIA.SIN_REGISTRO: return 'sin registro';
        case ESTADO_DIA.FUTURO: return 'pendiente';
        default: return _PALABRA_CUMPLIMIENTO[d.cumplimiento] ?? '';
    }
}

// Barra semanal con hint integrado. La pista completa es el objetivo semanal y cada día ocupa un tramo proporcional a las horas que trabajó, relleno entero con el color de su estado:
// un día corto no deja hueco (queda más angosto) y lo que falta de la semana es el espacio vacío al final. Si se trabajó más que el objetivo, la pista se estira hasta lo trabajado (todo entra y la barra queda llena).
// Los días futuros no entran, salvo hoy aunque todavía no tenga registro. Los días sin horas (especial, sin salida, sin registro) ocupan un tramo fijo y chico para poder marcarlos;
// los seguidos del mismo tipo (sin registro o especiales del mismo color) se fusionan en un solo hito con rango (L–X). Hoy nunca se fusiona: lleva el badge.
// Cada hito trae su sigla (lun, mar...) y su inicial (L, M, X...) para que el dibujo use la que entre mejor.
// Texto que se ve al pasar el cursor por el tramo de un día (solo escritorio): con horas, el total en el número grande y "Lunes · 13:55 – 21:01" en el mensaje;
// sin horas (especial, sin registro...) solo el mensaje con su estado. `stats` null = el número no cambia.
function _textoHoverDia(d, esHoy, conRegistro) {
    const nombre = `${TiempoUtils.obtenerNombreDia(d.fecha)}${esHoy ? ' (hoy)' : ''}`;
    if (!conRegistro || !d.entrada) return { stats: null, mensaje: `${nombre}: ${_palabraEstadoDia(d)}` };
    const rango = d.salida ? `${d.entrada} – ${d.salida}` : `${d.entrada} – en curso`;
    return { stats: _horasTextoStats(d.total), mensaje: `${nombre} · ${rango}` };
}

const _PESO_DIA_SIN_HORAS = 1;   // en horas
function _franjasSemana(todosLosDias, horasDiarias, objetivoSemana, hoy) {
    const diasSemana = (todosLosDias ?? []).filter(d => d.estado !== ESTADO_DIA.FUTURO || d.fecha === hoy);
    if (!diasSemana.length || !(horasDiarias > 0)) return null;
    const diaSemana = d => TiempoUtils.parsearFechaLocal(d.fecha).getDay();
    const inicial = d => _INICIALES_DIA[diaSemana(d)];
    const nombre = d => _SIGLAS_DIA[diaSemana(d)];
    const conRegistro = d => d.estado === ESTADO_DIA.ACTIVO || d.estado === ESTADO_DIA.CERRADO;
    const conHoras = d => conRegistro(d) && d.total > 0;
    const esHoy = d => d.fecha === hoy;
    const tipoFusion = d => esHoy(d) ? null
        : d.estado === ESTADO_DIA.SIN_REGISTRO || d.estado === ESTADO_DIA.FUTURO ? d.estado
            : d.estado === ESTADO_DIA.ESPECIAL ? `${ESTADO_DIA.ESPECIAL}-${d.especial}` : null;
    const pesos = diasSemana.map(d => conHoras(d) ? d.total : _PESO_DIA_SIN_HORAS);
    const horasTrabajadas = diasSemana.reduce((acc, d, i) => acc + (conHoras(d) ? pesos[i] : 0), 0);
    const fijos = diasSemana.reduce((acc, d, i) => acc + (conHoras(d) ? 0 : pesos[i]), 0);
    const total = Math.max(objetivoSemana > 0 ? objetivoSemana : 0, horasTrabajadas) + fijos;

    const tramos = [];
    const hitos = [];
    let inicio = 0;
    let previo = null;
    let colorPrimera = 'vacio';
    diasSemana.forEach((d, i) => {
        const fin = inicio + pesos[i] / total;
        const color = d.estado === ESTADO_DIA.ESPECIAL ? d.especial : conHoras(d) ? (d.estado === ESTADO_DIA.ACTIVO ? 'blue' : _colorEstadoDia(d)) : null;
        if (color) tramos.push({ desde: inicio, hasta: fin, color });
        if (i === 0) colorPrimera = color ?? 'vacio';   // el remate del comienzo está sobre la primera franja, aunque esté vacía

        const tipo = tipoFusion(d);
        if (previo && tipo && previo.tipo === tipo) {
            // día seguido del mismo tipo: el hito anterior se extiende hasta el final de esta franja y su sigla pasa a rango
            previo.hito.fraccion = fin;
            previo.hito.sigla = `${previo.primera}–${nombre(d)}`;
            previo.hito.inicial = `${previo.inicialPrimera}–${inicial(d)}`;
            previo.hito.descripcion = `${previo.hito.sigla} ${_palabraEstadoDia(d)}`;
            previo.hito.hover = { stats: null, mensaje: `${previo.hito.sigla}: ${_palabraEstadoDia(d)}` };
        } else {
            const hito = {
                fecha: d.fecha, sigla: nombre(d), inicial: inicial(d), fraccion: fin, hoy: esHoy(d), futuro: !esHoy(d) && d.estado === ESTADO_DIA.FUTURO,   // futuro: su marca va hueca hasta que llegue el día
                descripcion: `${nombre(d)}${esHoy(d) ? ' (hoy)' : ''} ${_palabraEstadoDia(d)}`,
                hover: _textoHoverDia(d, esHoy(d), conRegistro(d)),
                prioridad: esHoy(d) ? 3 : conRegistro(d) ? 2 : d.estado === ESTADO_DIA.ESPECIAL || d.estado === ESTADO_DIA.SIN_SALIDA ? 1 : 0   // si no entran todas las siglas se conservan primero hoy y los días con horas
            };
            hitos.push(hito);
            previo = { tipo, hito, primera: hito.sigla, inicialPrimera: hito.inicial };
        }
        inicio = fin;
    });
    if (!tramos.length) return null;
    return { hitos, tramos, fin: tramos[tramos.length - 1].hasta, colorPrimera };
}

// Semana con 0 minutos: "Comenzando" si hay una jornada abierta (primer minuto), "Sin horas todavía" si la semana sigue abierta; ya terminada se muestra el 0 real
function _textoStatsSemana(total, est, semanaAbierta) {
    if (!_sinMinutos(total)) return _horasTextoStats(total);
    const hoy = est.regHoy;
    const jornadaAbierta = !!est.ayerAbierto || !!(hoy?.entrada && !hoy.salida && !est.tipoEspecialHoy);
    if (jornadaAbierta) return _TEXTO_COMENZANDO;
    return semanaAbierta ? _TEXTO_SEMANA_SIN_HORAS : _horasTextoStats(total);
}

/** Un día de la semana para los diseños propios: total en minutos, su color de estado y qué mostrar (horas, emoji del día especial o nada). */
function _resumenDiaSemana(d, hoy) {
    const conRegistro = d.estado === ESTADO_DIA.ACTIVO || d.estado === ESTADO_DIA.CERRADO;
    const totalMin = TiempoUtils.horasAMinutosRedondeados(d.total);
    const objetivoMin = TiempoUtils.horasAMinutosRedondeados(d.objetivo);
    const dow = TiempoUtils.parsearFechaLocal(d.fecha).getDay();
    /** @type {string | null} */
    let color = null;
    if (d.estado === ESTADO_DIA.ESPECIAL) color = d.especial ?? null;
    else if (conRegistro) color = _colorEstadoDia(d);
    else if (d.estado === ESTADO_DIA.SIN_SALIDA) color = 'red';
    return {
        fecha: d.fecha, sigla: _SIGLAS_DIA[dow], inicial: _INICIALES_DIA[dow], hoy: d.fecha === hoy,
        estado: d.estado, color, totalMin, objetivoMin,
        fraccion: objetivoMin > 0 ? Math.min(1, totalMin / objetivoMin) : (totalMin > 0 ? 1 : 0),
        emoji: d.emoji ?? '', etiqueta: d.etiqueta ?? '',
        especial: d.especial ?? null,   // color del día especial; también lo traen los que se cargaron por adelantado (su estado sigue siendo "futuro")
    };
}

function derivarVistaSemana(est) {
    const { totalSemana: tot, totalSemanaProgreso, objetivoSemana, semanaAbierta, horasDiarias, todosEspeciales, hoy } = est;
    const prog = totalSemanaProgreso ?? tot;

    const progreso = _calcularProgreso(prog, objetivoSemana);

    let colorBarra, colorBorde, estadoFondo, mensaje, mostrarMensaje;

    if (horasDiarias === 0) {
        colorBarra = 'blue'; colorBorde = 'transparent';
        estadoFondo = 'esperando';
        mensaje = `Total fichado: ${_horasTextoStats(tot)}`;
        mostrarMensaje = false;
    } else if (todosEspeciales) {
        colorBarra = 'blue'; colorBorde = 'transparent';
        estadoFondo = 'esperando';
        mensaje = 'Semana sin días laborables';
        mostrarMensaje = true;
    } else if (semanaAbierta) {
        estadoFondo = 'en_curso';
        if (horasGte(prog, objetivoSemana)) {
            colorBarra = 'green'; colorBorde = 'green';
            const dif = prog - objetivoSemana;
            mensaje = horasEq(dif, 0) ? 'Vas justo' : `Vas ${_horasTextoStats(dif)} de más`;
        } else {
            colorBarra = 'blue'; colorBorde = 'blue';
            mensaje = objetivoSemana === 0
                ? `${_horasTextoStats(prog)} (Sin objetivo)`
                : _fraseCantidad(objetivoSemana - prog, 'Falta', 'Faltan');
        }
        mostrarMensaje = true;
    } else if (horasGte(prog, objetivoSemana)) {
        colorBarra = 'green'; colorBorde = 'green';
        estadoFondo = 'finalizado_ok';
        const dif = prog - objetivoSemana;
        mensaje = horasEq(dif, 0) ? 'Perfecto' : `Hiciste ${_horasTextoStats(dif)} de más`;
        mostrarMensaje = true;
    } else {
        colorBarra = 'red'; colorBorde = 'red';
        estadoFondo = 'finalizado_fail';
        mensaje = _fraseCantidad(objetivoSemana - prog, 'Faltó', 'Faltaron');
        mostrarMensaje = true;
    }

    const cerrado = !semanaAbierta && !todosEspeciales && horasDiarias > 0;
    const franjasSemana = horasDiarias > 0 && !todosEspeciales ? _franjasSemana(est.diasSemana, horasDiarias, objetivoSemana, hoy) : null;
    const trabajadoMin = TiempoUtils.horasAMinutosRedondeados(tot);
    const resumen = todosEspeciales
        ? { tipo: 'espera', emoji: '🌞', mensaje, banco: null, libre: true }
        : {
            tipo: 'semana', abierta: semanaAbierta, color: colorBarra, mensaje: mostrarMensaje ? mensaje : '', progreso: progreso,
            trabajadoMin, trabajado: partesDuracion(trabajadoMin),
            objetivoMin: TiempoUtils.horasAMinutosRedondeados(objetivoSemana),
            balance: _resumenBalance(prog, objetivoSemana, !semanaAbierta, colorBarra),
            banco: _resumenBanco(est),
            anillo: _anilloSemana(franjasSemana),
            dias: (est.diasSemana ?? []).map(d => _resumenDiaSemana(d, hoy)),
        };
    const franjas = _hintActivo() ? franjasSemana : null;

    return {
        titulo: html`${icono('#icon-calendar-simple')} Esta Semana`,
        stats: todosEspeciales ? '🌞' : _textoStatsSemana(tot, est, semanaAbierta),
        mensaje, mostrarMensaje,
        colorBarra, anchoBarra: franjas ? franjas.fin * 100 : progreso,
        colorBorde, estadoFondo,
        colorCierre: colorBarra,
        cerrado,
        hint: 'Tocá para ver Hoy',
        resumen,
        ...(franjas ? {
            hitosSemana: franjas.hitos, tramosSemana: franjas.tramos,
            siglasCortas: _formatoCortoStatsCache,   // con el formato de tiempo corto, en móviles los días van con su inicial (L, M, X...)
            colorInicioSemana: franjas.colorPrimera, colorFinSemana: franjas.tramos[franjas.tramos.length - 1].color
        } : {}),
    };
}

function _calcularHintSalidaEstimada(reg, objetivoDiario, bufferSemanal, diasHabiles) {
    let minutosTotal = TiempoUtils.horaAMinutos(reg.entrada) + (objetivoDiario * 60);

    if (reg.tiempoFuera && !EstadoApp.getIgnorarTiempoFuera()) {
        minutosTotal += TiempoUtils.horaAMinutos(reg.tiempoFuera);
    }

    minutosTotal += TiempoFuera.minutosActivos();

    const horaSalida = _minutosAHoraWrap(minutosTotal);

    const esLaborable = TiempoUtils.esFechaHabil(reg.fecha, diasHabiles);
    const mostrarBuffer = Math.abs(bufferSemanal) > MARGEN_HORAS && esLaborable;

    if (mostrarBuffer) {
        const minutosConBuffer = minutosTotal - TiempoUtils.horasAMinutosRedondeados(bufferSemanal);
        const horaBuf = _minutosAHoraWrap(minutosConBuffer);
        const claseBuffer = bufferSemanal > 0 ? ' hint-buffer-color--green' : bufferSemanal < 0 ? ' hint-buffer-color--red' : '';
        return {
            hint: html`Salida estimada: <strong>${horaSalida}</strong> | <span class="hint-buffer-color${claseBuffer}"><strong>${horaBuf}</strong></span>`
        };
    }

    return {
        hint: html`Salida estimada: <strong>${horaSalida}</strong>`
    };
}

// Datos de la línea del día, en minutos relativos a la entrada (evita problemas con el cruce de medianoche).
// Con la jornada abierta incluye la salida estimada y la salida con buffer; cerrada, solo la salida real.
function _calcularLinea(reg, objetivoDiario, bufferSemanal, diasHabiles) {
    if (!reg || !reg.entrada || !(objetivoDiario > 0) || TiposRegistro.esRegistroEspecial(reg.entrada, reg.salida)) return null;
    const entrada = TiempoUtils.horaAMinutos(reg.entrada);
    const rel = minutos => TiempoUtils.normalizarMinutosDia(minutos - entrada);
    const cerrado = !!reg.salida;

    let salidaRel = objetivoDiario * 60;
    if (reg.tiempoFuera && !EstadoApp.getIgnorarTiempoFuera()) salidaRel += TiempoUtils.horaAMinutos(reg.tiempoFuera);
    salidaRel += TiempoFuera.minutosActivos();

    const ahoraRel = rel(TiempoUtils.horaAMinutos(cerrado ? reg.salida : TiempoUtils.obtenerHoraActual()));
    const hayBuffer = !cerrado && TiempoUtils.esFechaHabil(reg.fecha, diasHabiles) && Math.abs(bufferSemanal) > MARGEN_HORAS;
    // con un buffer mayor que la jornada la salida con buffer no puede quedar antes de la entrada
    const bufferRel = hayBuffer ? Math.max(0, salidaRel - TiempoUtils.horasAMinutosRedondeados(bufferSemanal)) : null;
    const hayBanda = bufferRel !== null && Math.abs(bufferRel - salidaRel) >= 1;

    return {
        entrada, cerrado, salidaRel, bufferRel,
        // cerrada, la marca de salida se mueve a donde cerró el registro (la escala de la barra no cambia)
        marcaSalidaRel: cerrado ? ahoraRel : salidaRel, ahoraRel, hayBanda,
        bufferPositivo: bufferSemanal > 0,
        horaEntrada: reg.entrada,
        horaSalida: cerrado ? reg.salida : _minutosAHoraWrap(entrada + salidaRel),
        horaBuffer: bufferRel !== null ? _minutosAHoraWrap(entrada + bufferRel) : '',
    };
}

// color que tendría la barra si el registro se cerrara ahora (mismo criterio que el día cerrado)
function _colorSiCerraraAhora(tiempoHoy, objetivo, bufferSemanal) {
    if (objetivo === 0 || horasGte(tiempoHoy, objetivo)) return 'green';
    return SaldoSemanal.logicaCubiertoActiva() && horasGte(bufferSemanal, objetivo - tiempoHoy) ? 'gold' : 'red';
}

/**
 * Lo que aclara de un día abierto el mensaje de `_mensajeProgreso` (para los mosaicos de la línea de tiempo), en una o dos versiones: el texto completo
 * y, si no entra en una línea, uno más corto (ver `fijarQueEntre` en tarjeta-estilos.js). Devuelve:
 * 'Pero te podés ir' (falta tiempo pero el saldo lo cubre; corta: 'Te podés ir'), 'Te podés ir, pero debés tiempo' (objetivo cumplido, pero el saldo semanal
 * sigue en deuda; corta: 'Debés tiempo'), 'Te podés ir' (objetivo cumplido) o ''.
 * @returns {string | string[]}
 */
function _aclaracionProgreso(cumplido, tiempoHoy, objetivoDiario, bufferSemanal) {
    if (objetivoDiario === 0) return '';
    if (cumplido) {
        const extra = tiempoHoy - objetivoDiario;
        // sin el "(+extra)" del mensaje: el mosaico "Extra" ya lo muestra
        return bufferSemanal < 0 && Math.abs(bufferSemanal) > extra ? ['Te podés ir, pero debés tiempo', 'Debés tiempo'] : 'Te podés ir';
    }
    return bufferSemanal >= objetivoDiario - tiempoHoy ? ['Pero te podés ir', 'Te podés ir'] : '';
}

function _mensajeProgreso(cumplido, tiempoHoy, objetivoDiario, bufferSemanal, labelCero = '') {
    if (objetivoDiario === 0) return labelCero;
    if (cumplido) {
        const extra = tiempoHoy - objetivoDiario;
        if (bufferSemanal < 0 && Math.abs(bufferSemanal) > extra) return 'Te podés ir, pero debés tiempo';
        return extra > 0 ? `Te podés ir (+${_horasTextoStats(extra)})` : 'Te podés ir';
    }
    const faltante = objetivoDiario - tiempoHoy;
    const faltanteTexto = _fraseCantidad(faltante, 'Falta', 'Faltan');

    return bufferSemanal >= faltante ? `${faltanteTexto}, pero te podés ir` : faltanteTexto;
}

// ─── Resumen del día para los diseños propios (anillo, línea de tiempo y filas) ─────────────────────────────────
/** Banco de horas de la semana (con signo) o null si no hay nada que mostrar; mismo criterio que el texto "extras esta semana". */
function _resumenBanco(est) {
    const { bufferSemanal, horasDiarias, semanaAbierta } = est;
    if (!(horasDiarias > 0 && Math.abs(bufferSemanal) > MARGEN_HORAS && semanaAbierta)) return null;
    const minutos = TiempoUtils.horasAMinutosRedondeados(bufferSemanal);
    return { minutos, positivo: bufferSemanal > 0, texto: duracionConSigno(minutos) };
}

/** Tiempo fuera del registro (más el que corre ahora) o null si no hay. */
function _resumenTiempoFuera(reg) {
    const registrado = reg && TiposRegistro.tieneTiempoFuera(reg) ? TiempoUtils.horaAMinutos(reg.tiempoFuera) : 0;
    const corriendo = TiempoFuera.corriendo();
    const minutos = registrado + (corriendo ? TiempoFuera.minutosActivos() : 0);
    return minutos > 0 || corriendo ? { minutos, corriendo, texto: duracionCompacta(minutos), descuenta: !EstadoApp.getIgnorarTiempoFuera() } : null;
}

/** Lo que falta (o sobra) del objetivo del día: etiqueta, texto y tono ('neutro', 'green', 'red' o 'gold'). null sin objetivo. */
function _resumenBalance(tiempoHoy, objetivo, cerrado, colorCierre, aclaracion = /** @type {string | string[]} */ ('')) {
    if (!(objetivo > 0)) return null;
    const falta = TiempoUtils.horasAMinutosRedondeados(objetivo - tiempoHoy);
    // en un día abierto, `aclaracion` es el "pero te podés ir" / "te podés ir, pero debés tiempo" del mensaje, como tercera línea (una o varias versiones, de la más completa a la más corta)
    const detalle = !cerrado && aclaracion ? { detalle: aclaracion } : {};
    if (falta > 0) {
        return cerrado
            ? { etiqueta: 'Faltó', texto: duracionCompacta(falta), tono: colorCierre === 'gold' ? 'gold' : 'red', ...(colorCierre === 'gold' && { detalle: 'Cubierto' }) }
            // con faltante en un día abierto la única aclaración posible es "pero te podés ir" (el saldo lo cubre): el mosaico lleva el color de "cubierto", como el de un día cerrado
            : { etiqueta: 'Faltan', texto: duracionCompacta(falta), tono: detalle.detalle ? 'gold' : 'neutro', ...detalle };
    }
    return falta === 0
        ? { etiqueta: 'Objetivo', texto: 'Cumplido', tono: 'green', ...detalle }
        : { etiqueta: 'Extra', texto: duracionConSigno(-falta), tono: 'green', ...detalle };
}

/**
 * Tramos de estado del anillo con la jornada abierta, con el mismo criterio que la barra con hitos: azul hasta la primera salida (con banco o estimada), el color del banco
 * entre ambas (dorado si lo cubre el saldo, verde si no, rojo si se debe tiempo) y verde al superar la última. Se miden en tiempo trabajado (el tiempo fuera no cuenta, y
 * por eso no mueve las marcas): el aro llega al 100 % en la última marca, o en lo trabajado si ya la superó (las marcas se corren como en la barra). Sin línea (sin objetivo) no hay tramos.
 * Devuelve `{ progreso, tramos: [{ desde, hasta, color }] }` con todo en % del aro.
 * @param {any} linea @param {number} tiempoHoy horas @param {number} objetivo horas
 */
function _anilloEnCurso(linea, tiempoHoy, objetivo) {
    if (!linea || linea.cerrado || !(objetivo > 0)) return null;
    const objetivoMin = objetivo * 60;
    const trabajadoMin = Math.max(0, tiempoHoy * 60);
    const distancia = linea.hayBanda ? Math.abs(linea.salidaRel - linea.bufferRel) : 0;
    const lo = linea.hayBanda && linea.bufferPositivo ? Math.max(0, objetivoMin - distancia) : objetivoMin;
    const hi = linea.hayBanda && !linea.bufferPositivo ? objetivoMin + distancia : objetivoMin;
    const fin = Math.max(hi, trabajadoMin);
    const pct = min => (min / fin) * 100;
    const colorMedio = linea.bufferPositivo ? (SaldoSemanal.logicaCubiertoActiva() ? 'gold' : 'green') : 'red';
    const tramos = [
        { desde: 0, hasta: pct(lo), color: 'blue' },
        { desde: pct(lo), hasta: pct(hi), color: colorMedio },
        { desde: pct(hi), hasta: 100, color: 'green' }
    ].filter(t => t.hasta - t.desde > 1e-6);
    return { progreso: pct(trabajadoMin), tramos, colorMedio };
}

/**
 * Tramos del anillo en la vista semanal: los mismos de la barra semanal (`_franjasSemana`), un tramo por día con el color de su estado, uno tras otro y proporcionales a lo trabajado.
 * El aro completo es el objetivo semanal (se estira si se trabajó más) y los días sin horas ocupan un tramo fijo y chico: los especiales (feriado, licencia...) con su color
 * y los demás como hueco. El aro se llena hasta el final del último tramo, como la barra. Devuelve `{ progreso, tramos }` en % del aro, o null sin franjas.
 * @param {any} franjas
 */
function _anilloSemana(franjas) {
    if (!franjas) return null;
    return {
        progreso: franjas.fin * 100,
        tramos: franjas.tramos.map((/** @type {any} */ t) => ({ desde: t.desde * 100, hasta: t.hasta * 100, color: t.color }))
    };
}

/** Resumen de un registro con entrada (abierto o cerrado). `linea` puede ser null (sin objetivo): entonces no hay salida estimada. */
function _resumenRegistro({ reg, linea, tiempoHoy, objetivo, progreso, cerrado, color, colorCierre, mensaje, est, aclaracion = /** @type {string | string[]} */ ('') }) {
    const trabajadoMin = TiempoUtils.horasAMinutosRedondeados(tiempoHoy);
    return {
        tipo: 'registro', cerrado, color, mensaje, progreso,
        anillo: _anilloEnCurso(linea, tiempoHoy, objetivo),
        trabajadoMin, trabajado: partesDuracion(trabajadoMin),
        entrada: reg.entrada,
        salida: cerrado ? reg.salida : '',
        salidaEstimada: !cerrado && linea ? linea.horaSalida : '',
        salidaBanco: !cerrado && linea?.hayBanda ? linea.horaBuffer : '',
        linea,
        balance: _resumenBalance(tiempoHoy, objetivo, cerrado, colorCierre, aclaracion),
        banco: _resumenBanco(est),
        tiempoFuera: _resumenTiempoFuera(reg),
    };
}

/** Vista de hoy cuando todavía no hay entrada pero ayer quedó una jornada abierta que cruza la medianoche. */
function _vistaAyerAbierto(est) {
    const { tiempoHoy, bufferSemanalBase, diasHabiles, horasDiarias, regHoy } = est;
    const objetivoDiario = regHoy ? Objetivos.objetivoDeRegistro(regHoy) : horasDiarias;
    const objetivoDiarioAyerAplica = TiempoUtils.esFechaHabil(est.ayerStr, diasHabiles)
        ? (est.regAyer ? Objetivos.objetivoDeRegistro(est.regAyer) : objetivoDiario)
        : 0;
    const prog = _calcularProgreso(tiempoHoy, objetivoDiarioAyerAplica);
    const cumplido = _estaCumplido(tiempoHoy, objetivoDiarioAyerAplica);
    const colorBarra = objetivoDiarioAyerAplica === 0 ? 'blue' : (cumplido ? 'green' : 'blue');
    const mensaje = _mensajeProgreso(cumplido, tiempoHoy, objetivoDiarioAyerAplica, bufferSemanalBase, 'En curso (cruce de medianoche)');

    const nombreDiaAyer = TiempoUtils.obtenerNombreDia(est.ayerStr);
    const linea = _calcularLinea(est.regAyer, objetivoDiarioAyerAplica, bufferSemanalBase, diasHabiles);
    const { hint } = _hintSalidaODefault(est.regAyer, objetivoDiarioAyerAplica, bufferSemanalBase, diasHabiles, 'Tocá Fichar para registrar salida', true);

    return {
        titulo: html`${_tituloDia(nombreDiaAyer)} (ayer)${_badgeEstadoHoy(false, undefined, objetivoDiarioAyerAplica > 0 && cumplido)}`,
        stats: _sinMinutos(tiempoHoy) ? _TEXTO_COMENZANDO : _horasTextoStats(tiempoHoy),
        mensaje, mostrarMensaje: true,
        colorBarra, anchoBarra: prog,
        colorBorde: colorBarra, estadoFondo: 'en_curso', estadoFondoColor: null,
        colorCierre: _colorSiCerraraAhora(tiempoHoy, objetivoDiarioAyerAplica, bufferSemanalBase),
        cerrado: false,
        hint,
        linea,
        resumen: est.regAyer ? _resumenRegistro({
            reg: est.regAyer, linea, tiempoHoy, objetivo: objetivoDiarioAyerAplica, progreso: prog, cerrado: false,
            color: colorBarra, colorCierre: colorBarra, mensaje, est,
            aclaracion: _aclaracionProgreso(cumplido, tiempoHoy, objetivoDiarioAyerAplica, bufferSemanalBase)
        }) : null,
    };
}

/** Vista de hoy sin ningún registro (ni jornada de ayer abierta). */
function _vistaSinRegistro(est) {
    const { horasDiarias, esDiaHabil } = est;
    return {
        titulo: _tituloDia(TiempoUtils.obtenerNombreDia(TiempoUtils.obtenerFechaHoy())),
        stats: esDiaHabil ? '🎒' : '🌞',
        mensaje: esDiaHabil
            ? (horasDiarias === 0 ? '' : 'Esperando registro...')
            : (horasDiarias === 0 ? '' : 'Día libre'),
        mostrarMensaje: horasDiarias > 0,
        colorBarra: 'blue', anchoBarra: 0,
        colorBorde: 'transparent', estadoFondo: 'esperando',
        cerrado: false,
        hint: 'Tocá para ver la Semana',
        resumen: {
            tipo: 'espera', emoji: esDiaHabil ? '🎒' : '🌞',
            mensaje: esDiaHabil ? (horasDiarias === 0 ? '' : 'Esperando registro…') : (horasDiarias === 0 ? '' : 'Día libre'),
            libre: !esDiaHabil,   // día no laborable: no hay entrada ni salida que esperar
            banco: _resumenBanco(est),
        },
    };
}

/** Vista de hoy cuando el registro es un día especial (licencia, feriado...). */
function _vistaEspecial(tipoEspecialHoy) {
    return {
        titulo: _tituloDia(TiempoUtils.obtenerNombreDia(TiempoUtils.obtenerFechaHoy())),
        stats: `${tipoEspecialHoy.emoji} ${tipoEspecialHoy.label}`,
        mensaje: `¡${tipoEspecialHoy.descripcion}!`,
        mostrarMensaje: true,
        colorBarra: tipoEspecialHoy.color, anchoBarra: 100,
        colorBorde: tipoEspecialHoy.color,
        estadoFondo: 'especial', estadoFondoColor: tipoEspecialHoy.color,
        cerrado: false,
        hint: 'Tocá para ver la Semana',
        resumen: {
            tipo: 'especial', emoji: tipoEspecialHoy.emoji, etiqueta: tipoEspecialHoy.label,
            descripcion: `¡${tipoEspecialHoy.descripcion}!`, color: tipoEspecialHoy.color,
        },
    };
}

function derivarVistaHoy(est) {
    const { regHoy, tiempoHoy, horasDiarias, esDiaHabil, tipoEspecialHoy, bufferSemanalBase, diasHabiles } = est;
    const objetivoDiario = regHoy ? Objetivos.objetivoDeRegistro(regHoy) : horasDiarias;

    if (!regHoy || !regHoy.entrada) {

        if (est.ayerAbierto) return _vistaAyerAbierto(est);

        return _vistaSinRegistro(est);
    }

    const avisoAyerHint = est.ayerAbierto
        ? { hint: `⚠️ Ayer (${TiempoUtils.obtenerNombreDia(est.ayerStr)}) quedó un fichaje sin cerrar`, aviso: `⚠️ Ayer (${TiempoUtils.obtenerNombreDia(est.ayerStr)}) quedó un fichaje sin cerrar` }
        : null;

    if (tipoEspecialHoy) return _conAvisoAyer(_vistaEspecial(tipoEspecialHoy), avisoAyerHint);

    const dayClosed = !!regHoy.salida;
    const objetivoDiarioAplica = esDiaHabil ? objetivoDiario : 0;
    const prog = _calcularProgreso(tiempoHoy, objetivoDiarioAplica);
    const cumplido = _estaCumplido(tiempoHoy, objetivoDiarioAplica);
    let colorBarra, colorBorde, estadoFondo, estadoFondoColor = null, mensaje, mostrarMensaje;

    if (objetivoDiarioAplica === 0) {
        colorBarra = dayClosed ? 'green' : 'blue';
        colorBorde = dayClosed ? 'green' : 'blue';
        estadoFondo = dayClosed ? 'finalizado_ok' : 'en_curso';
        // en un día no laborable se aclara por qué no hay objetivo; sin objetivo configurado (horasDiarias 0) o con objetivo 0 en un día hábil no hay nada que decir
        const noLaborable = !esDiaHabil && horasDiarias > 0;
        mensaje = noLaborable ? 'Día libre' : ''; mostrarMensaje = noLaborable;
    } else if (dayClosed) {
        const dif = tiempoHoy - objetivoDiarioAplica;

        if (horasGte(dif, 0)) {
            colorBarra = 'green'; colorBorde = 'green';
            estadoFondo = 'finalizado_ok';
            mensaje = horasEq(dif, 0) ? 'Perfecto' : _fraseCantidadSufijo(dif, 'extra', 'extras');
        } else {
            const faltoTexto = _fraseCantidad(Math.abs(dif), 'Faltó', 'Faltaron');

            if (SaldoSemanal.cubiertoPorSaldo(est.hoy)) {
                colorBarra = 'gold'; colorBorde = 'gold';
                estadoFondo = 'especial';
                estadoFondoColor = 'gold';
                mensaje = `${faltoTexto} (Cubierto)`;
            } else {
                colorBarra = 'red'; colorBorde = 'red';
                estadoFondo = 'finalizado_fail';
                mensaje = faltoTexto;
            }
        }
        mostrarMensaje = true;
    } else {
        colorBarra = cumplido ? 'green' : 'blue';
        colorBorde = cumplido ? 'green' : 'blue';
        estadoFondo = 'en_curso';
        mostrarMensaje = true;
        mensaje = _mensajeProgreso(cumplido, tiempoHoy, objetivoDiarioAplica, bufferSemanalBase);
    }

    const linea = _calcularLinea(regHoy, objetivoDiarioAplica, bufferSemanalBase, diasHabiles);
    const { hint } = _hintSalidaODefault(regHoy, objetivoDiarioAplica, bufferSemanalBase, diasHabiles, 'Tocá para ver la Semana', !dayClosed);

    const colorFinal = estadoFondoColor || (estadoFondo === 'finalizado_fail' ? 'red' : 'green');

    return _conAvisoAyer({
        titulo: html`${est.esRetenido ? html`${_tituloDia(TiempoUtils.obtenerNombreDia(regHoy.fecha))} (ayer)` : _tituloDia(TiempoUtils.obtenerNombreDia(TiempoUtils.obtenerFechaHoy()))}${_badgeEstadoHoy(dayClosed, colorFinal, objetivoDiarioAplica > 0 && cumplido)}`,
        stats: !dayClosed && _sinMinutos(tiempoHoy) ? _TEXTO_COMENZANDO : _horasTextoStats(tiempoHoy),
        mensaje, mostrarMensaje,
        colorBarra, anchoBarra: prog,
        colorBorde, estadoFondo, estadoFondoColor,
        colorCierre: dayClosed ? colorBarra : _colorSiCerraraAhora(tiempoHoy, objetivoDiarioAplica, bufferSemanalBase),
        cerrado: dayClosed,
        hint,
        linea,
        resumen: _resumenRegistro({
            reg: regHoy, linea, tiempoHoy, objetivo: objetivoDiarioAplica, progreso: prog, cerrado: dayClosed,
            color: colorBarra, colorCierre: colorBarra, mensaje: mostrarMensaje ? mensaje : '', est,
            aclaracion: dayClosed ? '' : _aclaracionProgreso(cumplido, tiempoHoy, objetivoDiarioAplica, bufferSemanalBase)
        }),
    }, avisoAyerHint);
}

export const TarjetaFichajeVista = {
    derivarVistaSemana: _conMensajeCorto(derivarVistaSemana),
    derivarVistaHoy: _conMensajeCorto(derivarVistaHoy),
    _cantidadHoras,
    _cantidadHorasCorta,
    _modoTextoStats,
    _hintIntegradoActivo: _hintActivo,
    _estiloPropioActivo,
    // Desactivado (sin ciclo automático) se comporta como Barra al pasar el cursor: la descripción se despliega en la barra y el número queda con las horas
    _descHitosEnNumero: () => EstiloTarjeta.hintIntegrado() && _cicloHintAuto && _descHitosNumero,
    // los diseños propios no tienen fases que ciclar: todo el registro está a la vista
    _cicloAutoActivo: () => !_estiloPropioActivo() && (!EstiloTarjeta.hintIntegrado() || _cicloHintAuto),
    _refrescarFormatoCortoStatsCache
};
