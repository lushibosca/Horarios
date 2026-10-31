import { STORAGE_KEYS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { GestorHistorial } from './gestor-historial.js';
import { TiposRegistro } from './tipos-registro.js';
import { EstadoApp } from './estado-app.js';
import { Compensatorios } from './compensatorios.js';

// ====================================================================
//    FILTERS, PERIOD CALCULATIONS & BATCH/GROUP OPERATIONS SERVICE
// ====================================================================
function editarGrupo(grupo) {
    if (EstadoApp.getGrupoEnEdicion() !== null) return;
    const grupoEnEdicion = {
        registros: grupo.registros,
        subtipo: grupo.subtipo,
        fechaDesde: grupo.registros[grupo.registros.length - 1].fecha,
        fechaHasta: grupo.registros[0].fecha
    };
    EstadoApp.setGrupoEnEdicion(grupoEnEdicion);
    EventosApp.emit('grupo:editar', { subtipo: grupo.subtipo, desde: grupoEnEdicion.fechaDesde, hasta: grupoEnEdicion.fechaHasta });
    const notify = EstadoApp._notify();
    notify.actualizarHintGrupo();
    notify.setBloqueoEdicionGrupo(true);
    notify.abrirModal('modal-editar-grupo');
}

function _validarRangoGrupo(nuevoTipo, nuevaDesde, nuevaHasta) {
    if (!nuevaDesde || !nuevaHasta) return 'Verificá ambas fechas';
    if (!TiempoUtils.validarFecha(nuevaDesde)) return 'Fecha "Desde" inválida';
    if (!TiempoUtils.validarFecha(nuevaHasta)) return 'Fecha "Hasta" inválida';
    if (nuevaDesde > nuevaHasta) return 'La fecha inicial debe ser inferior a la final';
    const hoy = new Date();
    const dosPasado = new Date(hoy); dosPasado.setFullYear(hoy.getFullYear() - 2);
    const dosFuturo = new Date(hoy); dosFuturo.setFullYear(hoy.getFullYear() + 2);
    const ini = TiempoUtils.parsearFechaLocal(nuevaDesde), fin = TiempoUtils.parsearFechaLocal(nuevaHasta);
    if (ini < dosPasado || fin > dosFuturo) return 'El rango debe estar entre 2 años atrás y 2 años adelante';
    if (!TiposRegistro.validarTipoPermitido(nuevoTipo)) return 'Tipo de registro inválido';
    const dias = Math.ceil(Math.abs(fin.getTime() - ini.getTime()) / 864e5) + 1;
    if (dias > S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION) return `El rango contiene ${dias} días.\n Máximo: ${S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION} días por operación.`;
    return null;
}

/** @param {{ tipo: string, desde: string, hasta: string }} datos valores crudos del formulario de edición de grupo */
async function guardarEdicionGrupo({ tipo, desde, hasta }) {
    const grupoEnEdicion = EstadoApp.getGrupoEnEdicion();
    if (!grupoEnEdicion) return;
    const notify = EstadoApp._notify();
    const nuevoTipo = S.sanitizeString((tipo ?? '').trim(), 20);
    const nuevaDesde = S.sanitizeString((desde ?? '').trim(), 10);
    const nuevaHasta = S.sanitizeString((hasta ?? '').trim(), 10);

    const error = _validarRangoGrupo(nuevoTipo, nuevaDesde, nuevaHasta);
    if (error) { notify.mostrarToast(error, 'error'); return; }

    if (nuevoTipo === grupoEnEdicion.subtipo && nuevaDesde === grupoEnEdicion.fechaDesde && nuevaHasta === grupoEnEdicion.fechaHasta) {
        notify.mostrarToast('Sin cambios', 'info'); notify.cerrarEdicionGrupo(); return;
    }

    const fechasNuevas = TiempoUtils.generarRangoFechas(nuevaDesde, nuevaHasta);
    const idsDelGrupo = new Set(grupoEnEdicion.registros.map(r => r.id));
    const fechasSet = new Set(fechasNuevas);
    const registros = EstadoApp.registros();
    const conflictos = registros.filter(r => fechasSet.has(r.fecha) && !idsDelGrupo.has(r.id));
    if (conflictos.length > 0) {
        const dias = conflictos.map(r => r.fecha.substring(8, 10)).sort((a, b) => a - b).join(', ');
        notify.mostrarToast(`Conflicto en día(s): ${dias}\n Ya existen registros en esas fechas.`, 'error'); return;
    }

    const deltaRegistros = fechasNuevas.length - idsDelGrupo.size;
    if (deltaRegistros > 0 && !EstadoApp._hayEspacioParaRegistros(deltaRegistros)) {
        notify.mostrarToast('Límite de registros alcanzado', 'error'); return;
    }
    const notaPrevia = TiposRegistro.notaDeGrupo(grupoEnEdicion) || null;
    const objetivoPorFecha = new Map(grupoEnEdicion.registros.map(r => [r.fecha, r.objetivoHoras]));
    const filtrados = registros.filter(r => !idsDelGrupo.has(r.id));
    const { entrada, salida } = /** @type {{ entrada: string, salida: string }} */ (TiposRegistro.obtenerCodigosPorTipo(nuevoTipo));
    const nuevosRegistros = fechasNuevas.map((fechaISO, idx) => {
        const reg = EstadoApp._construirRegistro(fechaISO, entrada, salida);
        if (Compensatorios._esObjetivoValido(objetivoPorFecha.get(fechaISO))) reg.objetivoHoras = objetivoPorFecha.get(fechaISO);
        if (idx === 0 && notaPrevia) reg.notas = notaPrevia;
        return reg;
    });
    filtrados.push(...nuevosRegistros);
    EstadoApp._setRegistros(filtrados);
    EstadoApp.ordenarRegistros();
    EstadoApp.sincronizarPushHoy();
    GestorHistorial.saveState(EstadoApp.registros(), `editar grupo (${nuevosRegistros.length} día${TiempoUtils.pluralizar(nuevosRegistros.length)})`);
    const saved = await EstadoApp.guardarYActualizar(nuevosRegistros.map(r => r.id));
    if (saved) { notify.mostrarToast('Grupo actualizado', 'success'); notify.cerrarEdicionGrupo(); }
}

async function eliminarGrupoActual() {
    const grupoEnEdicion = EstadoApp.getGrupoEnEdicion();
    if (!grupoEnEdicion) return;
    const notify = EstadoApp._notify();
    if (grupoEnEdicion.registros.length > S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION) {
        notify.mostrarToast(`Este grupo contiene ${grupoEnEdicion.registros.length} registros.\nMáximo permitido: ${S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION} registros por operación.`, 'error', 4000);
        return;
    }
    const idsAEliminar = grupoEnEdicion.registros.map(r => r.id);
    EstadoApp._setRegistros(EstadoApp.registros().filter(r => !idsAEliminar.includes(r.id)));
    EstadoApp.sincronizarPushHoy();
    GestorHistorial.saveState(EstadoApp.registros(), `eliminar grupo (${idsAEliminar.length} registro${TiempoUtils.pluralizar(idsAEliminar.length)})`);
    const saved = await EstadoApp.guardarYActualizar();
    if (saved) { notify.mostrarToast('Grupo eliminado', 'success'); notify.cerrarEdicionGrupo(); }
}

async function registrarDiaEspecial(fecha, tipo) {
    const notify = EstadoApp._notify();
    const registroExistente = EstadoApp.registroPorFecha(fecha);
    if (registroExistente) { notify.mostrarToast('Ya existe un registro para hoy', 'warning'); throw new Error('Registro ya existe'); }

    const tipoConfig = TiposRegistro.obtenerTipoPorId(tipo);
    if (!tipoConfig) { notify.avisarFichaje('Tipo inválido'); throw new Error('Tipo inválido'); }

    const entrada = tipoConfig.codigo;
    const salida = tipoConfig.codigo;
    const tipoTexto = `${tipoConfig.emoji} ${tipoConfig.label}`;

    if (!EstadoApp._hayEspacioParaRegistros(1)) { notify.avisarFichaje('Límite de registros alcanzado'); throw new Error('Límite alcanzado'); }

    const nuevo = EstadoApp._construirRegistro(fecha, entrada, salida);
    EstadoApp.registros().push(nuevo);

    EstadoApp.ordenarRegistros();
    const esHoy = fecha === TiempoUtils.obtenerFechaHoy();
    GestorHistorial.saveState(EstadoApp.registros(), `agregar ${tipoConfig.label} (${TiempoUtils.fechaCorta(fecha)})`);
    const saved = await EstadoApp._guardarConCicloSiHoy(nuevo.id, esHoy);
    if (saved) {
        notify.avisarFichaje(`Registro agregado como ${tipoTexto}`, 'success');
    } else {
        throw new Error('Error al guardar');
    }
}

function detenerYRegistrarTimer(registro) {
    const perfilId = EstadoApp.obtenerPerfilIdActual();
    const storageKey = STORAGE_KEYS.BREAK_TIME(perfilId);
    const storedStart = Almacenamiento.getItem(storageKey);
    if (!storedStart) return false;

    const diffMs = Date.now() - parseInt(storedStart);
    const segundosTranscurridos = Math.floor(diffMs / 1000);
    if (segundosTranscurridos < 30) { Almacenamiento.removeItem(storageKey); return false; }

    const minutosTranscurridos = TiempoUtils.segundosAMinutosRedondeado(segundosTranscurridos);
    const tiempoActual = registro.tiempoFuera || '00:00';
    registro.tiempoFuera = TiempoUtils.sumarMinutosAHora(tiempoActual, minutosTranscurridos);
    Almacenamiento.removeItem(storageKey);
    return true;
}

function detectarAyerAbierto(fechaHoy, regs) {
    const ayerObj = TiempoUtils.parsearFechaLocal(fechaHoy);
    ayerObj.setDate(ayerObj.getDate() - 1);
    const ayerStr = TiempoUtils.formatearFechaLocal(ayerObj);
    const regAyer = regs instanceof Map ? (regs.get(ayerStr) ?? null) : (regs.find(r => r.fecha === ayerStr) ?? null);

    let ayerAbierto = false;
    if (regAyer?.entrada && !regAyer.salida) {
        const [hE, mE] = regAyer.entrada.split(':').map(Number);
        const fechaEntrada = TiempoUtils.parsearFechaLocal(ayerStr);
        fechaEntrada.setHours(hE, mE, 0, 0);
        ayerAbierto = (Date.now() - fechaEntrada.getTime()) <= 86400000;
    }
    return { ayerStr, regAyer, ayerAbierto };
}

function registroParaTiempoFuera(fechaHoy = TiempoUtils.obtenerFechaHoy()) {
    const regHoy = EstadoApp.registroPorFecha(fechaHoy) ?? null;
    if (regHoy?.entrada) return regHoy;
    const { regAyer, ayerAbierto } = detectarAyerAbierto(fechaHoy, EstadoApp.registros());
    return ayerAbierto ? regAyer : regHoy;
}

/** @param {any} [asignacionesPrecalculadas] */
function calcularBufferPeriodo(desde, hasta, incluirActivoEnVivo = true, minutosBreakActivo = 0, asignacionesPrecalculadas = null) {
    const hoy = TiempoUtils.obtenerFechaHoy();
    const registros = EstadoApp.registros();
    const registrosRango = registros.filter(r => r.fecha >= desde && r.fecha <= hasta);
    const regsPorFecha = new Map(registrosRango.map(r => [r.fecha, r]));
    const { ayerStr, ayerAbierto } = detectarAyerAbierto(hoy, regsPorFecha);
    const asignacionesCompensatorio = asignacionesPrecalculadas || Compensatorios.calcularAsignacionesCompensatorio();

    const regHoy = regsPorFecha.get(hoy) ?? null;
    const tipoEspecialHoy = TiposRegistro.obtenerTipoPorCodigo(regHoy?.entrada, regHoy?.salida);
    const regActivo = (ayerAbierto && !regHoy?.entrada) ? (regsPorFecha.get(ayerStr) ?? null)
        : (!tipoEspecialHoy && regHoy?.entrada && !regHoy.salida) ? regHoy : null;

    let objetivo = 0, hechas = 0;
    const horasDiarias = EstadoApp.horasDiarias();
    for (const iso of TiempoUtils.generarRangoFechas(desde, hasta)) {
        if (iso > hoy) continue;
        const esDiaHabil = Compensatorios.diasHabilesEnFecha(iso).includes(TiempoUtils.parsearFechaLocal(iso).getDay());
        const r = regsPorFecha.get(iso);
        const esEspecial = r && TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
        const esRemoto = esEspecial && Compensatorios.esTipoRemoto(r);
        const diaTerminado = iso === hoy ? !!(r && r.salida) : !(ayerAbierto && iso === ayerStr);
        const objetivoDia = r ? Compensatorios.objetivoDeRegistro(r) : horasDiarias;

        if (esDiaHabil && (!esEspecial || esRemoto) && diaTerminado) objetivo += objetivoDia;
        if (r && r.salida && !esEspecial && diaTerminado) {
            hechas += r.total;
            hechas -= Compensatorios.montoCompensadoDeReferencia(r, asignacionesCompensatorio);
        }
        if (esRemoto && esDiaHabil && diaTerminado) hechas += objetivoDia;

        if (incluirActivoEnVivo && !diaTerminado && esDiaHabil && !esEspecial && r && r === regActivo) {
            const t = EstadoApp.calcularHoras(regActivo.entrada, TiempoUtils.obtenerHoraActual(), regActivo.tiempoFuera || null, null, true);
            const transcurrido = Math.max(0, (t ? t.total : 0) - (minutosBreakActivo / 60));
            if (transcurrido > objetivoDia) {
                objetivo += objetivoDia;
                hechas += transcurrido;
            }
        }
    }
    return Math.round((hechas - objetivo) * 1e6) / 1e6;
}

function limpiarFiltros() {
    EstadoApp.setFiltroState({ activo: false, desde: null, hasta: null, tipo: null });
    EstadoApp.guardarYActualizar();
    const notify = EstadoApp._notify();
    notify.cerrarFiltros();
    notify.mostrarToast('Filtro eliminado', 'info');
    EventosApp.emit('filtros:cambio', { activo: false });
}

function aplicarFiltrosInmediato(desde, hasta, tipo) {
    if (!desde && !hasta && !tipo) {
        EstadoApp.setFiltroState({ activo: false, desde: null, hasta: null, tipo: null });
        EventosApp.emit('filtros:cambio', { activo: false });
    } else {
        EstadoApp.setFiltroState({ activo: true, desde: desde || null, hasta: hasta || null, tipo: tipo || null });
        EventosApp.emit('filtros:cambio', { activo: true });
    }
    EstadoApp.guardarYActualizar();
}

function obtenerRegistrosFiltrados() {
    const { filtroActivo, filtroDesde, filtroHasta, filtroTipo } = EstadoApp.getFiltroState();
    const registros = EstadoApp.registros();
    if (!filtroActivo) return registros;
    return registros.filter(r => {
        if (filtroDesde && r.fecha < filtroDesde) return false;
        if (filtroHasta && r.fecha > filtroHasta) return false;
        if (filtroTipo) {
            const tipoRegistro = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
            if (filtroTipo === 'normal') { if (tipoRegistro) return false; }
            else { if (!tipoRegistro || tipoRegistro.id !== filtroTipo) return false; }
        }
        return true;
    });
}

async function registrarVacacionesDirecto(desde, hasta, tipo) {
    const notify = EstadoApp._notify();
    const tipoConfig = TiposRegistro.obtenerTipoPorId(tipo);
    if (!tipoConfig) { notify.avisarFichaje('Tipo inválido'); throw new Error('Tipo inválido'); }
    const entrada = tipoConfig.codigo;
    const salida = tipoConfig.codigo;

    const fechasARegistrar = TiempoUtils.generarRangoFechas(desde, hasta);

    if (fechasARegistrar.length > S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION) {
        notify.avisarFichaje(`El rango seleccionado contiene ${fechasARegistrar.length} días.\n Máximo permitido: ${S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION} días por operación.`, 'error', { duracion: 4000 });
        throw new Error('Límite de días excedido');
    }

    const nuevosRegistros = fechasARegistrar.filter(f => !EstadoApp.existeRegistroEnFecha(f));
    if (nuevosRegistros.length === 0) { notify.avisarFichaje('Todas las fechas ya están registradas', 'warning'); throw new Error('Sin fechas nuevas'); }
    if (!EstadoApp._hayEspacioParaRegistros(nuevosRegistros.length)) { notify.avisarFichaje('Límite de registros alcanzado', 'error'); throw new Error('Límite alcanzado'); }

    const idsNuevosParaAnimar = [];
    const registros = EstadoApp.registros();
    nuevosRegistros.forEach(fecha => {
        const nuevo = EstadoApp._construirRegistro(fecha, entrada, salida);
        idsNuevosParaAnimar.push(nuevo.id);
        registros.push(nuevo);
    });

    EstadoApp.ordenarRegistros();
    const incluyeHoy = nuevosRegistros.includes(TiempoUtils.obtenerFechaHoy());
    GestorHistorial.saveState(registros, `agregar ${tipoConfig.label} (${nuevosRegistros.length} día${TiempoUtils.pluralizar(nuevosRegistros.length)})`);
    const saved = await EstadoApp._guardarConCicloSiHoy(idsNuevosParaAnimar, incluyeHoy);
    if (saved) {
        notify.avisarFichaje(nuevosRegistros.length === 1 ? '1 día registrado' : `${nuevosRegistros.length} días registrados`, 'success');
    } else {
        throw new Error('Error al guardar');
    }
}

async function borrarPeriodoDirecto(desde, hasta) {
    const notify = EstadoApp._notify();
    const registros = EstadoApp.registros();
    const registrosAEliminar = registros.filter(r => {
        if (r.fecha < desde || r.fecha > hasta) return false;
        return !TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
    });
    if (registrosAEliminar.length > S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION) {
        notify.avisarFichaje(`Máximo ${S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION} registros por operación. Encontrados: ${registrosAEliminar.length}`);
        throw new Error('Límite excedido');
    }
    if (registrosAEliminar.length === 0) {
        notify.avisarFichaje('No hay registros de jornadas en ese período', 'info');
        throw new Error('Sin registros');
    }

    EstadoApp._setRegistros(registros.filter(r => !registrosAEliminar.includes(r)));
    EstadoApp.sincronizarPushHoy();
    GestorHistorial.saveState(EstadoApp.registros(), `eliminar período (${registrosAEliminar.length} registro${TiempoUtils.pluralizar(registrosAEliminar.length)})`);
    const saved = await EstadoApp.guardarYActualizar();
    if (saved) {
        notify.avisarFichaje(registrosAEliminar.length === 1 ? '1 registro eliminado' : `${registrosAEliminar.length} registros eliminados`, 'success');
    } else {
        throw new Error('Error al guardar');
    }
}

export const FiltrosYPeriodos = {
    editarGrupo,
    guardarEdicionGrupo,
    eliminarGrupoActual,
    registrarDiaEspecial,
    detenerYRegistrarTimer,
    detectarAyerAbierto,
    registroParaTiempoFuera,
    calcularBufferPeriodo,
    limpiarFiltros,
    aplicarFiltrosInmediato,
    obtenerRegistrosFiltrados,
    registrarVacacionesDirecto,
    borrarPeriodoDirecto
};
