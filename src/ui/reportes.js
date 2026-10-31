import { STORAGE_KEYS, horasGte } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorModales } from './gestor-modales.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { EstadisticasPeriodo } from '../services/estadisticas-periodo.js';
import { UIBase } from './base.js';
import { html, crudo, montar, icono } from '../core/html.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { mostrarToast } from './toast.js';

// ====================================================================
//                     UI REPORTS MODULE (HTML Report Generator)
// ====================================================================
const { descargarArchivo } = UIBase;

const { calcularEstadisticasMes, calcularEstadisticasAnio, sumarHorasEfectivas } = EstadisticasPeriodo;

let _modoReporte = 'mensual';

function _resolverPeriodoDatos(esAnual) {
    if (esAnual) {
        const anio = $('select-anio-stats')?.value;
        if (!anio) { mostrarToast('No hay año seleccionado', 'error'); return null; }
        const anioNum = parseInt(anio);
        const registrosPeriodo = EstadoApp.registros().filter(r => parseInt(r.fecha.substring(0, 4)) === anioNum);
        return {
            periodoLabel: anio,
            nombreArchivo: `reporte_${anio}.html`,
            registrosPeriodo,
            stats: calcularEstadisticasAnio(anio, registrosPeriodo),
            mesSeleccionado: null
        };
    }
    const selectMes = $('select-mes-stats');
    const mes = selectMes?.value;
    if (!mes) { mostrarToast('No hay mes seleccionado', 'error'); return null; }
    const [año, mesNum] = mes.split('-').map(Number);
    const registrosPeriodo = EstadoApp.registros().filter(r => {
        const [aReg, mReg] = r.fecha.split('-').map(Number);
        return aReg === año && mReg === mesNum;
    });
    return {
        periodoLabel: /** @type {HTMLSelectElement} */ (/** @type {unknown} */ (selectMes)).selectedOptions[0].text,
        nombreArchivo: `reporte_${mes}.html`,
        registrosPeriodo,
        stats: calcularEstadisticasMes(mes, registrosPeriodo),
        mesSeleccionado: mes
    };
}

function _seccionDetalleAnual(registrosPeriodo) {
    const mesesOrdenados = [...new Set(registrosPeriodo.map(r => r.fecha.substring(0, 7)))].sort();
    const filas = mesesOrdenados.map(claveMes => {
        const regsM = registrosPeriodo.filter(r => r.fecha.startsWith(claveMes));

        let jornadas = 0;
        const conteoPorTipo = {};
        regsM.forEach(r => {
            const tipo = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
            if (tipo) conteoPorTipo[tipo.id] = (conteoPorTipo[tipo.id] || 0) + 1;
            else if (r.entrada && r.salida) jornadas++;
        });

        const notas = [
            `${jornadas} ${jornadas === 1 ? 'jornada' : 'jornadas'}`,
            ...TiposRegistro.obtenerTodosLosTipos()
                .map(t => conteoPorTipo[t.id] ? `${conteoPorTipo[t.id]} ${TiposRegistro.labelSegunCantidad(t, conteoPorTipo[t.id])}` : null)
                .filter(Boolean)
        ];

        const nombreMes = TiempoUtils.formatoTituloMes(claveMes).split(' ')[0];
        return html`
        <tr>
            <td class="col-mes">${nombreMes}</td>
            <td class="col-horas">${TiempoUtils.horasATexto(sumarHorasEfectivas(regsM), 'short')}</td>
            <td class="col-notas">${notas.join(', ')}</td>
        </tr>`;
    });

    return html`
<section class="seccion">
    <h2>📅 Totales por mes</h2>
    <table class="tabla-mes">
        <thead>
            <tr><th>Mes</th><th>Horas</th><th>Notas</th></tr>
        </thead>
        <tbody>${filas.length ? filas : html`<tr><td colspan="3" class="vacio">Sin registros</td></tr>`}</tbody>
    </table>
</section>`;
}

function _seccionDetalleDiario(registrosPeriodo) {
    const ordenados = [...registrosPeriodo].sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
    const filas = ordenados.map(r => {
        const tipoEspecial = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
        const fecha = TiempoUtils.fechaCorta(r.fecha, true);
        const dia = TiempoUtils.obtenerNombreDia(r.fecha);

        if (tipoEspecial) {
            return html`
        <tr class="fila-especial">
            <td class="col-fecha">${fecha}</td>
            <td class="col-dia">${dia}</td>
            <td class="col-especial" colspan="2">${tipoEspecial.emoji || ''} ${tipoEspecial.label.toUpperCase()}</td>
            <td class="col-tag"></td>
            <td class="col-linea2" aria-hidden="true">&nbsp;</td>
        </tr>`;
        }

        const entrada = r.entrada || '--:--';
        const salida = r.salida || '--:--';
        const total = r.salida ? TiempoUtils.horasATexto(r.total, 'short') : 'Incompleto';
        const tiempoFuera = (r.tiempoFuera && r.tiempoFuera !== '00:00')
            ? `${TiempoUtils.horasATexto(TiempoUtils.horaAMinutos(r.tiempoFuera) / 60, 'short')} fuera`
            : '';
        const salidaTemprano = (r.credito && r.credito !== '00:00') ? html` <span class="tag tag-info">Salida temprana</span>` : '';
        const cumplido = r.salida ? horasGte(r.total, Compensatorios.objetivoDeRegistro(r)) : null;
        const indicador = cumplido === null ? '' : (cumplido ? html`<span class="tag tag-ok">✓</span>` : html`<span class="tag tag-bad">✗</span>`);

        return html`
        <tr>
            <td class="col-fecha">${fecha}</td>
            <td class="col-dia">${dia}</td>
            <td class="col-horario">${entrada} → ${salida}</td>
            <td class="col-total">${total}${tiempoFuera ? html` <span class="detalle-sub">· ${tiempoFuera}</span>` : ''}</td>
            <td class="col-tag">${indicador}${salidaTemprano}</td>
        </tr>`;
    });

    return html`
<section class="seccion">
    <h2>📋 Detalle diario</h2>
    <table class="tabla-diario">
        <thead>
            <tr><th>Fecha</th><th>Día</th><th>Horario</th><th>Total</th><th></th></tr>
        </thead>
        <tbody>${filas.length ? filas : html`<tr><td colspan="5" class="vacio">Sin registros</td></tr>`}</tbody>
    </table>
</section>`;
}

function _agruparRegistrosPorSemana(registros) {
    const semanas = new Map();
    registros.forEach(r => {
        const lunes = TiempoUtils.obtenerLunesSemanaISO(r.fecha);
        if (!semanas.has(lunes)) {
            const base = { trabajados: [] };
            TiposRegistro.obtenerTodosLosTipos().forEach(t => { base[TiposRegistro.claveStat(t)] = []; });
            semanas.set(lunes, base);
        }
        const semana = semanas.get(lunes);
        const tipoEspecial = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
        if (tipoEspecial) {
            const cat = TiposRegistro.claveStat(tipoEspecial);
            if (semana[cat]) semana[cat].push(r);
        } else {
            semana.trabajados.push(r);
        }
    });
    return semanas;
}

const REPORTE_ESTILOS = `
    :root {
        --r-bg: #f5f6fa; --r-card: #ffffff; --r-border: #dde3ea; --r-text: #1f1f1f;
        --r-muted: #666768; --r-green: #2f8f6b; --r-green-bg: #eaf7f1;
        --r-red: #b3493c; --r-red-bg: #fbeceA; --r-blue-bg: #eef1f8;
    }
    * { box-sizing: border-box; }
    body {
        margin: 0; padding: 2.5rem 1.5rem; background: var(--r-bg); color: var(--r-text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        font-size: 15px; line-height: 1.5;
    }
    .reporte { max-width: 780px; margin: 0 auto; }
    header.reporte-header { margin-bottom: 2rem; }
    header.reporte-header h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 .35rem; }
    header.reporte-header .periodo { font-size: 1rem; color: var(--r-muted); }
    header.reporte-header .generado { font-size: .8rem; color: var(--r-muted); margin-top: .15rem; }
    .seccion { background: var(--r-card); border: 1px solid var(--r-border); border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.25rem; }
    .seccion h2 { font-size: .95rem; font-weight: 600; margin: 0 0 1rem; }
    .lista-resumen { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; column-gap: 3rem; }
    .fila-resumen { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: .55rem 0; border-bottom: 1px solid var(--r-border); }
    .fila-resumen .label { color: var(--r-muted); font-size: .85rem; }
    .fila-resumen .valor { font-weight: 700; font-size: .95rem; text-align: right; }
    .fila-resumen .valor.valor-saldo-pos { color: var(--r-green); }
    .fila-resumen .valor.valor-saldo-neg { color: var(--r-red); }
    table { width: 100%; border-collapse: collapse; font-size: .88rem; }
    th, td { text-align: left; padding: .5rem .5rem; border-bottom: 1px solid var(--r-border); }
    th { font-size: .72rem; text-transform: uppercase; color: var(--r-muted); font-weight: 600; }
    tbody tr:last-child td { border-bottom: none; }
    .col-notas { color: var(--r-muted); }
    .col-linea2 { display: none; }
    .detalle-sub { font-size: .76rem; color: var(--r-muted); }
    .tag { display: inline-block; font-size: .72rem; padding: .1rem .45rem; border-radius: 999px; margin-left: .25rem; }
    .tag-ok { background: var(--r-green-bg); color: var(--r-green); }
    .tag-bad { background: var(--r-red-bg); color: var(--r-red); }
    .tag-info { background: var(--r-blue-bg); color: #3a5a99; }
    .vacio { text-align: center; color: var(--r-muted); padding: 1rem 0; }
    .nota-incompleta { font-size: .78rem; color: var(--r-muted); margin-top: .5rem; }
    .config-linea { font-size: .85rem; color: var(--r-muted); }
    .config-linea b { color: var(--r-text); font-weight: 600; }
    footer.reporte-footer { text-align: center; font-size: .78rem; color: var(--r-muted); margin-top: 1.5rem; }

    /* --- Responsive: 2-line-per-row tables on small screens --- */
    @media (max-width: 600px) {
        body { padding: 1.5rem 0.5rem; }
        .seccion { padding: 1rem 0.6rem; }
        .lista-resumen { grid-template-columns: 1fr; }

        .tabla-mes thead, .tabla-diario thead, .tabla-semana thead { display: none; }

        .tabla-mes tbody tr, .tabla-diario tbody tr, .tabla-semana tbody tr {
            display: grid; column-gap: .5rem; row-gap: .15rem;
            padding: .6rem 0; border-bottom: 1px solid var(--r-border);
        }
        .tabla-mes tbody tr:last-child, .tabla-diario tbody tr:last-child, .tabla-semana tbody tr:last-child { border-bottom: none; }
        .tabla-mes td, .tabla-diario td, .tabla-semana td { border-bottom: none; padding: 0; }

        /* Monthly totals: Month - Hours / Notes (includes shifts) */
        .tabla-mes tbody tr { grid-template-columns: 1fr auto; grid-template-areas: "mes horas" "notas notas"; }
        .tabla-mes .col-mes { grid-area: mes; }
        .tabla-mes .col-horas { grid-area: horas; text-align: right; }
        .tabla-mes .col-notas { grid-area: notas; }

        /* Weekly totals: Week - Range - Total / Notes */
        .tabla-semana tbody tr { grid-template-columns: auto 1fr; grid-template-areas: "semana rango" "total notas"; }
        .tabla-semana .col-semana { grid-area: semana; white-space: nowrap; }
        .tabla-semana .col-rango { grid-area: rango; text-align: right; }
        .tabla-semana .col-total { grid-area: total; white-space: nowrap; }
        .tabla-semana .col-notas { grid-area: notas; text-align: right; }

        /* Daily detail: Date - Day - Total (+ indicator) / Schedule */
        .tabla-diario tbody tr:not(.fila-especial) {
            grid-template-columns: auto 1fr auto auto;
            grid-template-areas: "fecha dia total tag" "horario horario horario horario";
        }
        .tabla-diario .col-fecha { grid-area: fecha; white-space: nowrap; }
        .tabla-diario .col-dia { grid-area: dia; color: var(--r-muted); }
        .tabla-diario .col-total { grid-area: total; text-align: right; white-space: nowrap; }
        .tabla-diario .col-tag { grid-area: tag; text-align: right; }
        .tabla-diario .col-horario { grid-area: horario; color: var(--r-muted); }

        .tabla-diario tbody tr.fila-especial {
            grid-template-columns: auto auto 1fr;
            grid-template-areas: "fecha dia especial" "linea2 linea2 linea2";
        }
        .tabla-diario .col-especial { grid-area: especial; text-align: right; }
        .tabla-diario .col-linea2 { display: block; grid-area: linea2; visibility: hidden; }
    }

    @media print {
        body { background: #fff; padding: 0; }
        .seccion { border: none; box-shadow: none; padding: 0 0 1rem; }
    }
`;

function _seccionResumenGeneral(stats) {
    const bufferOk = stats.bufferPeriodo === null || stats.bufferPeriodo >= 0;
    /** @type {{ label: string, valor: any, esConteo?: boolean, clase?: string }[]} */
    const tarjetas = [
        { label: 'Total horas', valor: stats.tiempoTotal },
        { label: 'Banco de horas', valor: stats.bufferPeriodo !== null ? TiempoUtils.horasATexto(stats.bufferPeriodo, 'short') : 'N/A', clase: `valor-saldo-${bufferOk ? 'pos' : 'neg'}` },
        { label: 'Jornadas', valor: stats.diasTrabajados, esConteo: true },
        { label: 'Promedio diario', valor: stats.promedioDiario },
        { label: 'Entrada promedio', valor: stats.entradaPromedio },
        { label: 'Salida promedio', valor: stats.salidaPromedio },
        { label: 'Entrada regular', valor: stats.regularidadEntrada },
        { label: 'Jornada regular', valor: stats.regularidadJornada },
        { label: 'Tiempo fuera', valor: stats.tiempoFueraTotal },
        { label: 'Salidas tempranas', valor: stats.compensaciones, esConteo: true },
        ...TiposRegistro.obtenerTodosLosTipos().map(t => ({ label: t.labelPlural, valor: stats[TiposRegistro.claveStat(t)] || 0, esConteo: true })),
    ].filter(t => !(t.esConteo && t.valor === 0));

    const filasHtml = tarjetas.map(t => html`
        <li class="fila-resumen">
            <span class="label">${t.label}</span>
            <span class="valor ${t.clase || ''}">${String(t.valor)}</span>
        </li>`);

    return html`
<section class="seccion">
    <h2>📈 Resumen general</h2>
    <ul class="lista-resumen">${filasHtml}</ul>
</section>`;
}

function _seccionTotalesPorSemana(registrosPeriodo, mesSeleccionado) {
    if (!mesSeleccionado) return '';
    const [añoActual, mesActual] = mesSeleccionado.split('-').map(Number);
    const primerDiaMes = TiempoUtils.formatearFechaLocal(new Date(añoActual, mesActual - 1, 1));
    const ultimaDiaMes = TiempoUtils.formatearFechaLocal(new Date(añoActual, mesActual, 0));

    const semanas = _agruparRegistrosPorSemana(registrosPeriodo);
    const semanasOrdenadas = [...semanas.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    if (!semanasOrdenadas.length) return '';

    const semanasIncompletas = [];

    const filas = semanasOrdenadas.map(([lunesOriginal, datos], index) => {
        let totalSemanal = datos.trabajados.reduce((sum, r) => sum + r.total, 0);
        if (datos.remotos?.length) totalSemanal += datos.remotos.reduce((sum, r) => sum + Compensatorios.objetivoDeRegistro(r), 0);

        const fechaLunes = TiempoUtils.parsearFechaLocal(lunesOriginal);
        const fechaDomingo = new Date(fechaLunes);
        fechaDomingo.setDate(fechaLunes.getDate() + 6);
        const domingo = TiempoUtils.formatearFechaLocal(fechaDomingo);

        let lunes = lunesOriginal, fechaFin = domingo, esIncompleta = false, continuaEn = '';

        if (domingo > ultimaDiaMes) {
            fechaFin = ultimaDiaMes;
            esIncompleta = true;
            const mesSig = mesActual === 12 ? 1 : mesActual + 1;
            continuaEn = `continúa en ${TiempoUtils.nombreMesPorIndice(mesSig - 1)}`;
        }
        if (lunes < primerDiaMes) {
            lunes = primerDiaMes;
            esIncompleta = true;
            const mesAnt = mesActual === 1 ? 12 : mesActual - 1;
            continuaEn = `viene de ${TiempoUtils.nombreMesPorIndice(mesAnt - 1)}`;
        }

        const notasExtras = TiposRegistro.obtenerTodosLosTipos()
            .map(t => {
                const clave = TiposRegistro.claveStat(t);
                const cantidad = datos[clave]?.length || 0;
                return cantidad ? `${cantidad} ${TiposRegistro.labelSegunCantidad(t, cantidad)}` : null;
            })
            .filter(Boolean);

        if (esIncompleta && continuaEn) semanasIncompletas.push(`* Semana ${index + 1}: ${continuaEn}`);

        const rango = `${TiempoUtils.fechaCorta(lunes, true)} – ${TiempoUtils.fechaCorta(fechaFin, true)}${esIncompleta ? ' *' : ''}`;
        return html`
        <tr>
            <td class="col-semana">Semana ${index + 1}</td>
            <td class="col-rango">${rango}</td>
            <td class="col-total">${TiempoUtils.horasATexto(totalSemanal, 'short')}</td>
            <td class="col-notas">${notasExtras.length ? notasExtras.join(', ') : '—'}</td>
        </tr>`;
    });

    const notaIncompletas = semanasIncompletas.length
        ? html`<div class="nota-incompleta">${semanasIncompletas.map((s, i) => html`${i > 0 ? html`<br>` : ''}${s}`)}</div>`
        : '';

    return html`
<section class="seccion">
    <h2>📅 Totales por semana</h2>
    <table class="tabla-semana">
        <thead><tr><th>Semana</th><th>Rango</th><th>Total</th><th>Notas</th></tr></thead>
        <tbody>${filas}</tbody>
    </table>
    ${notaIncompletas}
</section>`;
}

function _seccionConfiguracion() {
    const objetivoTexto = Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true)
        ? '' : ' (objetivo estampado por registro)';
    const ignorarTF = Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_TF, false, true);
    const tiempoFueraTexto = ignorarTF ? 'No se descuenta del total' : 'Se descuenta del total';
    return html`
<section class="seccion">
    <h2>⚙️ Ajustes aplicados</h2>
    <p class="config-linea"><b>Horas diarias:</b> ${String(EstadoApp.horasDiarias())}${objetivoTexto}</p>
    <p class="config-linea"><b>Días hábiles:</b> ${EstadoApp.diasHabiles().map(d => TiempoUtils.nombreDiaPorIndice(d)).join(', ')}</p>
    <p class="config-linea"><b>Horas semanales:</b> ${String(EstadoApp.horasSemanales())}</p>
    <p class="config-linea"><b>Tiempo fuera:</b> ${tiempoFueraTexto}</p>
</section>`;
}

function generarReporte(opciones = {}) {
    const esAnual = _modoReporte === 'anual';
    const incluir = { resumen: true, totalesMes: true, detalleDiario: true, totalesSemana: true, configuracion: true, ...opciones };
    const periodo = _resolverPeriodoDatos(esAnual);
    if (!periodo) return;
    const { periodoLabel, registrosPeriodo, stats, nombreArchivo, mesSeleccionado } = periodo;

    const generadoEl = `${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR')}`;

    const documento = html`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Reporte de horas — ${periodoLabel}</title>
<style>${crudo(REPORTE_ESTILOS)}</style>
</head>
<body>
    <div class="reporte">
<header class="reporte-header">
    <h1>Reporte de horas trabajadas</h1>
    <div class="periodo">Período: ${periodoLabel}</div>
    <div class="generado">Generado el ${generadoEl}</div>
</header>

${incluir.resumen ? _seccionResumenGeneral(stats) : ''}
${esAnual && incluir.totalesMes ? _seccionDetalleAnual(registrosPeriodo) : ''}
${incluir.detalleDiario ? _seccionDetalleDiario(registrosPeriodo) : ''}
${!esAnual && incluir.totalesSemana ? _seccionTotalesPorSemana(registrosPeriodo, mesSeleccionado) : ''}
${incluir.configuracion ? _seccionConfiguracion() : ''}

<footer class="reporte-footer">Generado por Sistema Horarios</footer>
    </div>
</body>
</html>`;

    try {
        descargarArchivo(String(documento), nombreArchivo, 'text/html;charset=utf-8');
        mostrarToast(esAnual ? 'Reporte anual generado' : 'Reporte generado', 'success');
    } catch (e) {
        console.error('Error generando reporte:', e);
        mostrarToast('Error al generar reporte', 'error');
    }
}

const SECCIONES_REPORTE = [
    { id: 'resumen', label: 'Resumen general', icono: '#icon-stats' },
    { id: 'totalesMes', label: 'Totales por mes', icono: '#icon-calendar-simple', soloModo: 'anual' },
    { id: 'detalleDiario', label: 'Detalle diario', icono: '#icon-clock' },
    { id: 'totalesSemana', label: 'Totales por semana', icono: '#icon-calendar-simple', soloModo: 'mensual' },
    { id: 'configuracion', label: 'Ajustes aplicados', icono: '#icon-settings' }
];

function _renderSeccionesReporte() {
    const cont = $('reporte-secciones-lista');
    if (!cont) return;
    const modo = _modoReporte === 'anual' ? 'anual' : 'mensual';
    montar(cont, html`${SECCIONES_REPORTE
        .filter(sec => !sec.soloModo || sec.soloModo === modo)
        .map(sec => html`
        <button type="button" class="btn-seccion-reporte btn-activo" data-seccion="${sec.id}">
            ${icono(sec.icono)}
            <span>${sec.label}</span>
            <span class="toggle-switch" aria-hidden="true"></span>
        </button>`)}`);
}

function abrirModalReporteSecciones(modoEstadisticas = 'mensual') {
    _modoReporte = modoEstadisticas;
    _renderSeccionesReporte();
    GestorModales.abrir('modal-reporte-secciones');
}

function cerrarModalReporteSecciones() {
    GestorModales.cerrar('modal-reporte-secciones');
}

function toggleSeccionReporte(boton) {
    boton.classList.toggle('btn-activo');
}

function confirmarGenerarReporte() {
    const cont = $('reporte-secciones-lista');
    const opciones = {};
    /** @type {NodeListOf<HTMLElement>} */ (cont?.querySelectorAll('.btn-seccion-reporte')).forEach(btn => {
        opciones[btn.dataset.seccion] = btn.classList.contains('btn-activo');
    });
    if (!Object.values(opciones).some(Boolean)) {
        mostrarToast('Seleccioná al menos una sección', 'error');
        return;
    }
    cerrarModalReporteSecciones();
    generarReporte(opciones);
}


export const Reportes = {
    generarReporte,
    abrirModalReporteSecciones,
    cerrarModalReporteSecciones,
    toggleSeccionReporte,
    confirmarGenerarReporte
};
