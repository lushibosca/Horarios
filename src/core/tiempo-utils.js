// ====================================================================
// TIME AND DATE UTILITIES MODULE (TiempoUtils)
// ====================================================================
const REGEX_PATTERNS = {
    FECHA: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    HORA: /^([01]\d|2[0-3]):([0-5]\d)$/
};

const NOMBRES_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const NOMBRES_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function nombreMesPorIndice(indice) {
    return NOMBRES_MESES[indice] || '';
}

function _pad2(n) {
    return String(n).padStart(2, '0');
}

function _hhmm(h, m) {
    return `${_pad2(h)}:${_pad2(m)}`;
}

function pluralizar(n) {
    return n !== 1 ? 's' : '';
}

function nombreDiaPorIndice(indice) {
    return NOMBRES_DIAS[indice] || '';
}

function validarFecha(f) {
    if (!f || !REGEX_PATTERNS.FECHA.test(f)) return false;
    try {
        const [y, m, d] = f.split('-').map(Number);
        const fecha = new Date(y, m - 1, d);
        if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return false;
        const ahora = new Date();
        const hace20Anos = new Date(ahora.getFullYear() - 20, 0, 1);
        const en2Anos = new Date(ahora.getFullYear() + 2, 11, 31);
        return fecha >= hace20Anos && fecha <= en2Anos && !isNaN(fecha.getTime());
    } catch (e) {
        return false;
    }
}

function validarHora(h) {
    return !!(h && REGEX_PATTERNS.HORA.test(h));
}

function normalizarMinutosSueltos(valor) {
    if (!valor) return valor;
    if (!/^\d{1,2}$/.test(valor)) return valor;
    const n = parseInt(valor, 10);
    if (n < 1 || n > 60) return valor;
    if (n === 60) return '01:00';
    return `00:${_pad2(n)}`;
}

function parsearFechaLocal(fechaStr) {
    return new Date(fechaStr.replace(/-/g, '/') + ' 00:00:00');
}

function formatearFechaLocal(date) {
    return `${date.getFullYear()}-${_pad2(date.getMonth() + 1)}-${_pad2(date.getDate())}`;
}

function obtenerHoraActual() {
    const d = new Date();
    return _hhmm(d.getHours(), d.getMinutes());
}

function minutosAHora(totalMinutos) {
    const h = Math.floor(Math.abs(totalMinutos) / 60);
    const m = Math.floor(Math.abs(totalMinutos) % 60);
    return _hhmm(h, m);
}

function obtenerFechaHoy() {
    return formatearFechaLocal(new Date());
}

function fechaLocalISOFull() {
    const d = new Date();
    return `${formatearFechaLocal(d)} ${_pad2(d.getHours())}:${_pad2(d.getMinutes())}:${_pad2(d.getSeconds())}`;
}

function horaAMinutos(h) {
    if (!validarHora(h)) return 0;
    const [hr, mn] = h.split(':').map(Number);
    return (hr * 60) + mn;
}

function sumarMinutosAHora(horaString, minutosASumar) {
    const totalMinutos = minutosASumar + horaAMinutos(horaString);
    return totalMinutos >= 24 * 60 ? '23:59' : minutosAHora(totalMinutos);
}

function obtenerNombreDia(f) {
    if (!f) return '';
    const date = parsearFechaLocal(f);
    return isNaN(date.getTime()) ? '' : NOMBRES_DIAS[date.getDay()];
}

function obtenerLunes(fechaInput = new Date()) {
    const date = typeof fechaInput === 'string' ? parsearFechaLocal(fechaInput) : new Date(fechaInput);
    const diaSemana = date.getDay();
    const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(date);
    lunes.setDate(date.getDate() + offsetLunes);
    return lunes;
}

function obtenerLunesSemanaISO(fechaStr) {
    return formatearFechaLocal(obtenerLunes(fechaStr));
}

function obtenerSemanaRangoActual() {
    const lunes = obtenerLunes();
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    return {
        inicio: formatearFechaLocal(lunes),
        fin: formatearFechaLocal(domingo)
    };
}

function descomponerHorasDecimales(totalHoras) {
    const abs = Math.abs(totalHoras);
    let h = Math.floor(abs);
    let m = Math.round((abs - h) * 60);
    if (m === 60) { h++; m = 0; }
    return { horas: h, minutos: m, esNegativo: totalHoras < 0 };
}

function partesATexto(horas, minutos, modo = 'long', ref = { horas, minutos }) {
    const corto = modo === 'short', partes = [];
    if (ref.horas > 0) partes.push(corto ? `${horas}h` : `${horas} hora${pluralizar(ref.horas)}`);
    if (ref.minutos > 0 || !partes.length) partes.push(corto ? `${minutos}m` : `${minutos} minuto${pluralizar(ref.minutos)}`);
    return partes.join(' ');
}

function horasATexto(totalHoras, modo = 'long') {
    const { horas, minutos, esNegativo } = descomponerHorasDecimales(totalHoras);
    return (esNegativo ? '-' : '') + partesATexto(horas, minutos, modo);
}

function formatoDiferencia(totalHoras, horasDiariasObjetivo) {
    const diffMinutos = Math.round(totalHoras * 60) - (horasDiariasObjetivo * 60);
    if (diffMinutos === 0) return '';
    const abs = Math.abs(diffMinutos);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return (diffMinutos > 0 ? '+' : '-') + (h > 0 ? `${h}h` : '') + (h > 0 && m > 0 ? ' ' : '') + (m > 0 || h === 0 ? `${m}m` : '');
}

function formatoTituloMes(claveMes) {
    const [año, mes] = claveMes.split('-');
    const nombre = nombreMesPorIndice(mes - 1);
    return nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + año;
}

function generarRangoFechas(desde, hasta) {
    const resultado = [];
    const cur = parsearFechaLocal(desde);
    const fin = parsearFechaLocal(hasta);
    while (cur <= fin) {
        resultado.push(formatearFechaLocal(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return resultado;
}

function segundosAMinutosRedondeado(segundos) {
    return Math.floor(segundos / 60) + (segundos % 60 >= 30 ? 1 : 0);
}

function fechaCorta(f, anioCompleto = false) {
    if (!f || f.length < 10) return f || '';
    const [y, m, d] = f.split('-');
    return `${d}/${m}/${anioCompleto ? y : y.slice(2)}`;
}

function formatearRangoSemana(lunesISO) {
    const lunes = parsearFechaLocal(lunesISO);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    const dL = lunes.getDate();
    const dD = domingo.getDate();
    const mL = nombreMesPorIndice(lunes.getMonth());
    const mD = nombreMesPorIndice(domingo.getMonth());
    if (lunes.getMonth() === domingo.getMonth()) return `${dL} al ${dD} de ${mD}`;
    return `${dL} ${mL} al ${dD} ${mD}`;
}

function esFechaHabil(fecha, diasHabiles) {
    const diaSemana = parsearFechaLocal(fecha).getDay();
    if (Array.isArray(diasHabiles)) return diasHabiles.includes(diaSemana);
    return diaSemana === 0 ? (diasHabiles === 7) : (diaSemana <= diasHabiles);
}

function esDiaAnterior(fecha, anterior) {
    const d = parsearFechaLocal(fecha);
    d.setDate(d.getDate() - 1);
    return formatearFechaLocal(d) === anterior;
}

function agruparMesesPorAnio(mesesOrdenados) {
    const map = new Map();
    mesesOrdenados.forEach(mesAnio => {
        const anio = mesAnio.substring(0, 4);
        if (!map.has(anio)) map.set(anio, []);
        map.get(anio).push(mesAnio);
    });
    return map;
}

function nombreMesCapitalizado(mesAnio) {
    const [, m] = mesAnio.split('-');
    const nombre = nombreMesPorIndice(m - 1);
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export const TiempoUtils = {
    esFechaHabil, esDiaAnterior, agruparMesesPorAnio, nombreMesCapitalizado,
    validarFecha, validarHora, normalizarMinutosSueltos, parsearFechaLocal, formatearFechaLocal,
    obtenerFechaHoy, obtenerHoraActual, minutosAHora, fechaLocalISOFull,
    horaAMinutos, sumarMinutosAHora, descomponerHorasDecimales,
    obtenerNombreDia, nombreDiaPorIndice, nombreMesPorIndice, obtenerLunes, obtenerLunesSemanaISO, obtenerSemanaRangoActual,
    horasATexto, partesATexto, formatoDiferencia, formatearRangoSemana, formatoTituloMes, pluralizar,
    generarRangoFechas, fechaCorta, segundosAMinutosRedondeado, _pad2, esperar
};
