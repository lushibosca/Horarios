import { Compensatorios } from './compensatorios.js';
import { FiltrosYPeriodos } from './filtros-periodos.js';
import { EstadoApp } from './estado-app.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { RecordatorioPush } from './recordatorio-push.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorPerfiles } from './gestor-perfiles.js';
import { GestorHistorial } from './gestor-historial.js';
import { TiposRegistro } from './tipos-registro.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';

// ====================================================================
// DATA MANAGEMENT MODULE
// ====================================================================
const {
    ordenarRegistros, registroPorFecha, registroPorId, existeRegistroEnFecha,
    _hayEspacioParaRegistros, _fechaFuturaInvalida, calcularHoras,
    _aplicarCalculoHoras, _recalcularHorasSiValido, _construirRegistro,
    guardarYActualizar, _guardarConCicloSiHoy
} = EstadoApp;

const {
    _esObjetivoValido, diasHabilesEnFecha, objetivoDeRegistro, calcularAsignacionesCompensatorio,
    _buscarAsignacionCompensatorio, objetivoEdicionEnVivo, _recalcularCreditoRegistro
} = Compensatorios;

const {
    detenerYRegistrarTimer, detectarAyerAbierto, registroParaTiempoFuera, calcularBufferPeriodo
} = FiltrosYPeriodos;

function cargarConfiguracion() {
    const perfilData = GestorPerfiles ? GestorPerfiles.obtenerDatosPerfil() : null;
    return {
        diasHabiles: (perfilData && Array.isArray(perfilData.diasHabiles))
            ? perfilData.diasHabiles
            : Almacenamiento.getObject(STORAGE_KEYS.DIAS_HABILES, [1, 2, 3, 4, 5]),
        horasDiarias: (perfilData && perfilData.horasDiarias !== undefined)
            ? perfilData.horasDiarias
            : Almacenamiento.getNumber(STORAGE_KEYS.HORAS_DIARIAS, 7),
        tema: EstadoApp._notify().temaGuardado(),
        vistaActual: Almacenamiento.getItem(STORAGE_KEYS.VISTA_ACTUAL, 'diaria'),
        ignorarTiempoFuera: Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_TF, false, true),
        modoEstadisticas: Almacenamiento.getItem(STORAGE_KEYS.MODO_ESTADISTICAS, 'mensual'),
        fondoCard: Almacenamiento.getItem(STORAGE_KEYS.FONDO_CARD, 'golden-gate', true)
    };
}

function validarFormulario() {
    let valido = true;
    const notify = EstadoApp._notify();
    const form = notify.formularioRegistro.leer();
    const fecha = S.sanitizeString(form.fecha, 10);
    const entrada = S.sanitizeString(form.entrada.trim(), 5);
    const salida = S.sanitizeString(form.salida.trim(), 5);

    notify.limpiarError('fecha', null);
    notify.limpiarError('entrada', null);
    notify.limpiarError('salida', null);

    if (!fecha || !TiempoUtils.validarFecha(fecha)) { notify.mostrarError('fecha', null); valido = false; }
    if (entrada && !TiempoUtils.validarHora(entrada)) { notify.mostrarError('entrada', null); valido = false; }
    if (salida && !TiempoUtils.validarHora(salida)) { notify.mostrarError('salida', null); valido = false; }
    return valido;
}

function _mensajeExitoSalida(reg, usaHoraActual, timerDetenido, s) {
    if (timerDetenido && usaHoraActual) {
        return `Salida registrada con hora actual \nTiempo fuera: +${reg.tiempoFuera || '00:00'} \n(entrada: ${reg.entrada})`;
    }
    return usaHoraActual
        ? `Salida registrada con hora actual \n(entrada: ${reg.entrada})`
        : `Salida ${s} agregada \n(entrada: ${reg.entrada})`;
}

async function _completarSalidaRegistro(reg, s, usaHoraActual, btn) {
    const notify = EstadoApp._notify();
    const timerDetenido = detenerYRegistrarTimer(reg);
    const hoy = TiempoUtils.obtenerFechaHoy();
    // jornada de ayer que cruzó la medianoche: la tarjeta la sigue mostrando unos segundos antes de pasar a hoy
    const ayer = detectarAyerAbierto(hoy, EstadoApp.registros());
    const eraAyerAbierto = reg.fecha !== hoy && ayer.ayerAbierto && ayer.regAyer === reg;
    reg.salida = s;
    _aplicarCalculoHoras(reg, reg.entrada, s, reg.tiempoFuera || null);

    const esHoy = reg.fecha === hoy;
    GestorHistorial.saveState(EstadoApp.registros(), `salida ${s} (${TiempoUtils.fechaCorta(reg.fecha)})`);
    if (eraAyerAbierto) notify.retenerRegistroAyer(reg.id);
    const saved = await _guardarConCicloSiHoy(reg.id, esHoy || eraAyerAbierto, 'salida');
    if (!saved) {
        if (eraAyerAbierto) notify.retenerRegistroAyer(null);
        notify.avisarFichaje(null, 'error', { btn });
        return;
    }
    RecordatorioPush.cancelarFinDeJornada(reg.fecha);
    if (!usaHoraActual) {
        notify.aplicarFeedbackCampos([
            { id: 'entrada', fallback: 'Entrada', mostrar: false },
            { id: 'salida', fallback: 'Salida', mostrar: true }
        ]);
    }
    notify.avisarFichaje(_mensajeExitoSalida(reg, usaHoraActual, timerDetenido, s), 'success');
    notify.resetearBoton(btn);
    notify.animarExitoFichaje(btn);
    notify.formularioRegistro.escribir({ fecha: TiempoUtils.obtenerFechaHoy(), salida: '' });
}

/**
 * Registro cuya salida hay que avisar: el abierto de hoy, o el de ayer si sigue abierto
 * (jornada que cruza la medianoche) y hoy todavía no tiene registro. Debe caer en día hábil.
 */
function _registroAbiertoParaPush(hoy) {
    const regs = EstadoApp.registros();
    let candidato = regs.find(r => r.fecha === hoy && r.entrada && !r.salida) ?? null;
    if (!candidato && !existeRegistroEnFecha(hoy)) {
        const { regAyer, ayerAbierto } = detectarAyerAbierto(hoy, regs);
        if (ayerAbierto) candidato = regAyer;
    }
    if (!candidato) return null;
    return TiempoUtils.esFechaHabil(candidato.fecha, diasHabilesEnFecha(candidato.fecha)) ? candidato : null;
}

function _sincronizarPushHoy() {
    const hoy = TiempoUtils.obtenerFechaHoy();
    const abierto = _registroAbiertoParaPush(hoy);
    const habilitado = RecordatorioPush.getHabilitado();
    const minutosTF = abierto && !EstadoApp.getIgnorarTiempoFuera() && abierto.tiempoFuera ? TiempoUtils.horaAMinutos(abierto.tiempoFuera) : 0;
    const buffer = abierto ? _bufferSemanalParaPush(abierto.fecha) : 0;
    const nuevoTarget = (habilitado && abierto)
        ? RecordatorioPush.calcularTarget(abierto.fecha, abierto.entrada, objetivoDeRegistro(abierto), buffer, minutosTF)
        : null;
    const targetActual = RecordatorioPush.targetProgramadoParaHoy();
    if (nuevoTarget === targetActual) return;

    if (abierto && nuevoTarget != null) {
        RecordatorioPush.programarFinDeJornada(abierto.fecha, abierto.entrada, objetivoDeRegistro(abierto), buffer, minutosTF);
    } else if (targetActual != null) {
        RecordatorioPush.cancelarFinDeJornada(RecordatorioPush.fechaProgramadaActiva() ?? hoy);
    }
}

EstadoApp.setSincronizarPushHoyHook(_sincronizarPushHoy);

function _bufferSemanalActual() {
    const { inicio: iniSemana } = TiempoUtils.obtenerSemanaRangoActual();
    return calcularBufferPeriodo(iniSemana, TiempoUtils.obtenerFechaHoy(), false, 0, calcularAsignacionesCompensatorio());
}

function _ultimoDiaHabilEfectivoSemana() {
    const { fin } = TiempoUtils.obtenerSemanaRangoActual();
    let fecha = fin;
    for (let i = 0; i < 7; i++) {
        if (TiempoUtils.esFechaHabil(fecha, diasHabilesEnFecha(fecha))) {
            const reg = registroPorFecha(fecha);
            const esEspecial = reg && TiposRegistro.esRegistroEspecial(reg.entrada, reg.salida);
            if (!esEspecial) return fecha;
        }
        const d = TiempoUtils.parsearFechaLocal(fecha);
        d.setDate(d.getDate() - 1);
        fecha = TiempoUtils.formatearFechaLocal(d);
    }
    return null;
}

function _bufferSemanalParaPush(fecha) {
    const buffer = _bufferSemanalActual();
    if (!RecordatorioPush.getUsarBufferSemanal() || !RecordatorioPush.getBufferSoloUltimoDia()) return buffer;
    return fecha === _ultimoDiaHabilEfectivoSemana() ? buffer : 0;
}

async function _crearNuevoRegistro(f, e, s, usaHoraActual, btn) {
    const notify = EstadoApp._notify();
    if (!_hayEspacioParaRegistros(1)) {
        notify.avisarFichaje('Límite alcanzado', 'error', { btn }); return;
    }
    const nuevo = _construirRegistro(f, e, s);
    const registros = EstadoApp.registros();
    registros.push(nuevo);
    ordenarRegistros();
    const esHoy = e && f === TiempoUtils.obtenerFechaHoy();
    const detalleAccion = e && s ? `entrada ${e} y salida ${s}` : e ? `entrada ${e}` : `salida ${s}`;
    GestorHistorial.saveState(registros, `${detalleAccion} (${TiempoUtils.fechaCorta(f)})`);
    const saved = await _guardarConCicloSiHoy(nuevo.id, esHoy, 'entrada');
    if (!saved) {
        notify.avisarFichaje(null, 'error', { btn });
        return;
    }
    if (esHoy && !s && TiempoUtils.esFechaHabil(f, diasHabilesEnFecha(f))) {
        const bufferSemanal = _bufferSemanalParaPush(f);
        RecordatorioPush.programarFinDeJornada(nuevo.fecha, nuevo.entrada, nuevo.objetivoHoras, bufferSemanal);
    }
    const entradaManual = e && !usaHoraActual, salidaManual = s && !usaHoraActual;
    if (entradaManual || salidaManual) {
        notify.aplicarFeedbackCampos([
            { id: 'entrada', fallback: 'Entrada', mostrar: entradaManual },
            { id: 'salida', fallback: 'Salida', mostrar: salidaManual }
        ]);
    }
    notify.avisarFichaje(usaHoraActual ? 'Registro agregado con hora actual' : 'Registro agregado', 'success');
    notify.resetearBoton(btn);
    notify.animarExitoFichaje(btn);
    notify.formularioRegistro.escribir({ fecha: TiempoUtils.obtenerFechaHoy(), entrada: '', salida: '' });
}

async function agregarRegistro() {
    const notify = EstadoApp._notify();
    if (!validarFormulario()) { notify.avisarFichaje('Verificá los campos'); return; }

    const formulario = notify.formularioRegistro;
    const btn = formulario.bloquearBoton();
    let usaHoraActual = false;
    const campos = formulario.leer();
    let f = S.sanitizeString(campos.fecha, 10);
    let e = S.sanitizeString(campos.entrada.trim(), 5);
    let s = S.sanitizeString(campos.salida.trim(), 5);

    if (_fechaFuturaInvalida(f, e, s)) {
        notify.mostrarError('fecha', null);
        notify.avisarFichaje('Fecha futura no permitida en registro regular', 'warning', { btn }); return;
    }

    const hoy = TiempoUtils.obtenerFechaHoy();
    if (!e && f === hoy) {
        const { ayerStr: ayer, ayerAbierto } = detectarAyerAbierto(hoy, EstadoApp.registros());
        if (ayerAbierto && !existeRegistroEnFecha(hoy)) { f = ayer; formulario.escribir({ fecha: f }); }
    }

    const registroExistente = registroPorFecha(f);

    if (!e && !s) {
        const horaActual = TiempoUtils.obtenerHoraActual();
        if (registroExistente?.entrada && !registroExistente.salida) {
            s = horaActual; formulario.escribir({ salida: s });
        } else {
            e = horaActual; formulario.escribir({ entrada: e });
        }
        usaHoraActual = true;
    }

    if (!e && s) {
        if (registroExistente?.salida) { notify.avisarFichaje('Ya existe un registro completo para esta fecha', 'error', { btn }); return; }
        if (!registroExistente?.entrada) { notify.avisarFichaje('Debés fichar una entrada primero', 'error', { btn }); return; }
    }

    if (registroExistente?.entrada && !registroExistente.salida && !e && s) {
        await _completarSalidaRegistro(registroExistente, s, usaHoraActual, btn); return;
    }

    if (registroExistente) {
        if (usaHoraActual) formulario.escribir({ entrada: '' });
        notify.avisarFichaje('Ya existe un registro para esta fecha', 'error', { btn }); return;
    }

    await _crearNuevoRegistro(f, e, s, usaHoraActual, btn);
}

async function eliminarRegistroActual() {
    const editandoId = EstadoApp.editandoId();
    if (editandoId) {
        const notify = EstadoApp._notify();
        const btnEliminar = notify.formularioEdicion.bloquearEliminar();
        const registroABorrar = registroPorId(editandoId);
        const hoy = TiempoUtils.obtenerFechaHoy();

        if (registroABorrar && registroABorrar === registroParaTiempoFuera(hoy)) {
            const perfilId = EstadoApp.obtenerPerfilIdActual();
            const storageKey = STORAGE_KEYS.BREAK_TIME(perfilId);
            if (Almacenamiento.getItem(storageKey)) {
                Almacenamiento.removeItem(storageKey);
                notify.mostrarToast('Timer detenido al borrar el registro', 'info');
            }
        }

        EstadoApp._setRegistros(EstadoApp.registros().filter(r => r.id !== editandoId));
        _sincronizarPushHoy();
        GestorHistorial.saveState(EstadoApp.registros(), `eliminar registro${registroABorrar ? ` (${TiempoUtils.fechaCorta(registroABorrar.fecha)})` : ''}`);

        const saved = await guardarYActualizar();
        notify.formularioEdicion.liberarEliminar(btnEliminar);

        if (saved) {
            notify.mostrarToast('Registro eliminado', 'success');
            notify.cerrarEdicion();
            notify.actualizarEstadoBotonTimerMain();
        }
    }
}

function editarRegistro(id) {
    if (EstadoApp.editandoId() !== null) return;
    const r = registroPorId(id);
    if (!r) return;

    const notify = EstadoApp._notify();
    const horasDiarias = EstadoApp.horasDiarias();
    EstadoApp.setEditandoId(id);
    const objetivoActual = (typeof r.objetivoHoras === 'number' && Number.isFinite(r.objetivoHoras)) ? r.objetivoHoras : horasDiarias;
    notify.formularioEdicion.poblar({
        fecha: r.fecha,
        entrada: r.entrada || '',
        salida: r.salida || '',
        tiempoFuera: r.tiempoFuera || '',
        notas: r.notas || '',
        objetivo: objetivoActual,
        esCompensatorio: TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida)?.id === 'compensatorio',
        referencia: r.referenciaCompensatorio || '',
        creditoActivo: !!(r.credito && r.credito !== '00:00'),
    });

    notify.setBloqueoEdicion(true);
    notify.abrirModal('modal-editar');

    requestAnimationFrame(() => {
        notify.verificarBloqueoCredito();
        notify.formularioEdicion.refrescarHintResumen();
    });
}

function pegarReferenciaAutomatica() {
    const editandoId = EstadoApp.editandoId();
    const form = EstadoApp._notify().formularioEdicion;
    if (!form.tieneCampoReferencia() || editandoId === null) return;

    const campos = form.leer();
    if (campos.referencia) {
        form.escribirReferencia('');
    } else {
        const f = S.sanitizeString(campos.fecha, 10);
        const e = S.sanitizeString(campos.entrada.trim(), 5);
        const s = S.sanitizeString(campos.salida.trim(), 5);
        const listaSinManual = EstadoApp.registros().map(x => x.id === editandoId
            ? { ...x, fecha: f, entrada: e || null, salida: s || null, referenciaCompensatorio: undefined }
            : x);
        const asignaciones = calcularAsignacionesCompensatorio(listaSinManual);
        const asignacion = asignaciones.find(a => a.compensatorioId === editandoId);
        form.escribirReferencia(asignacion?.referenciaFecha || '');
    }
}

function _validarCamposEdicion(f, e, s, tf) {
    if (_fechaFuturaInvalida(f, e, s))
        return { msg: 'Fecha futura no permitida en registro regular', tipo: 'warning' };

    if (!TiempoUtils.validarFecha(f))
        return { msg: 'Fecha inválida', tipo: 'error' };
    if (e && !TiempoUtils.validarHora(e))
        return { msg: 'Hora de entrada inválida', tipo: 'error' };
    if (s && !TiempoUtils.validarHora(s))
        return { msg: 'Hora de salida inválida', tipo: 'error' };
    if (tf && !TiempoUtils.validarHora(tf))
        return { msg: 'Tiempo fuera inválido', tipo: 'error' };
    if (!e && s)
        return { msg: 'Debés fichar una entrada', tipo: 'error' };

    const editandoId = EstadoApp.editandoId();
    if (EstadoApp.registros().some(reg => reg.fecha === f && reg.id !== editandoId))
        return { msg: 'Ya existe otro registro para esa fecha', tipo: 'error' };

    if (e && tf) {
        const minutosEntrada = TiempoUtils.horaAMinutos(e);
        const minutosFuera = TiempoUtils.horaAMinutos(tf);
        const minutosLimite = s
            ? TiempoUtils.horaAMinutos(s)
            : TiempoUtils.horaAMinutos(TiempoUtils.obtenerHoraActual());
        let tiempoTranscurrido = minutosLimite - minutosEntrada;
        if (tiempoTranscurrido < 0) tiempoTranscurrido += 24 * 60;
        if (minutosFuera > tiempoTranscurrido)
            return {
                msg: s
                    ? 'El tiempo fuera no puede superar el tiempo efectivo'
                    : 'El tiempo fuera no puede superar el tiempo transcurrido desde la entrada',
                tipo: 'error'
            };
    }

    return null;
}

function _calcularCredito(e, s, tf, objetivo = EstadoApp.horasDiarias()) {
    if (!EstadoApp._notify().formularioEdicion.leer().creditoActivo) return null;
    const calc = calcularHoras(e, s, tf, null);
    if (!calc) return null;
    const diferencia = objetivo - calc.total;
    if (diferencia <= 0.01) return null;
    const { horas: h, minutos: m } = TiempoUtils.descomponerHorasDecimales(diferencia);
    return TiempoUtils.minutosAHora(h * 60 + m);
}

async function _eliminarRegistroVacioDesdeEdicion(btnGuardar) {
    const editandoId = EstadoApp.editandoId();
    const notify = EstadoApp._notify();
    const reg = registroPorId(editandoId);
    if (reg?.fecha === TiempoUtils.obtenerFechaHoy()) {
        const perfilId = EstadoApp.obtenerPerfilIdActual();
        Almacenamiento.removeItem(STORAGE_KEYS.BREAK_TIME(perfilId));
        notify.actualizarEstadoBotonTimerMain();
    }
    EstadoApp._setRegistros(EstadoApp.registros().filter(r => r.id !== editandoId));
    _sincronizarPushHoy();
    GestorHistorial.saveState(EstadoApp.registros(), `eliminar registro vacío${reg ? ` (${TiempoUtils.fechaCorta(reg.fecha)})` : ''}`);
    const saved = await guardarYActualizar();
    notify.restaurarBotonGuardarEdicion(btnGuardar);
    if (saved) { notify.mostrarToast('Registro eliminado (vacío)', 'info'); notify.cerrarEdicion(); }
}

async function guardarEdicion() {
    const editandoId = EstadoApp.editandoId();
    const r = registroPorId(editandoId);
    if (!r) return;
    const notify = EstadoApp._notify();
    const horasDiarias = EstadoApp.horasDiarias();
    const btnGuardar = notify.formularioEdicion.bloquearGuardar();

    const campos = notify.formularioEdicion.leer();
    const f = S.sanitizeString(campos.fecha, 10);
    const e = S.sanitizeString(campos.entrada.trim(), 5);
    const s = S.sanitizeString(campos.salida.trim(), 5);
    let tf = S.sanitizeString(campos.tiempoFuera.trim(), 5) || null;
    tf = tf ? TiempoUtils.normalizarMinutosSueltos(tf) : tf;
    /** @type {string|null} */
    let notas = S.sanitizeString(campos.notas.trim(), S.SECURITY_LIMITS.MAX_NOTAS_LENGTH);
    if (notas) notas = S.sanitizeNotas(notas, true) || null;
    if (notas === '') notas = null;

    let objetivoNuevo = campos.objetivo;
    if (!_esObjetivoValido(objetivoNuevo)) objetivoNuevo = horasDiarias;
    const objetivoPrevio = (typeof r.objetivoHoras === 'number' && Number.isFinite(r.objetivoHoras)) ? r.objetivoHoras : horasDiarias;

    const esCompensatorioNuevo = TiposRegistro.obtenerTipoPorCodigo(e, s)?.id === 'compensatorio';
    let referenciaCompensatorioNueva;
    if (esCompensatorioNuevo) {
        const refInput = S.sanitizeString(campos.referencia, 10);
        referenciaCompensatorioNueva = TiempoUtils.validarFecha(refInput) ? refInput : undefined;

        if (referenciaCompensatorioNueva) {
            if (referenciaCompensatorioNueva > f) {
                notify.restaurarBotonGuardarEdicion(btnGuardar);
                notify.mostrarToast('El día a compensar no puede ser posterior al compensatorio', 'error');
                return;
            }
            const asignacionesActuales = calcularAsignacionesCompensatorio();
            const yaUsadoPorOtro = asignacionesActuales.find(a => a.compensatorioId !== r.id && a.referenciaFecha === referenciaCompensatorioNueva);
            if (yaUsadoPorOtro) {
                notify.restaurarBotonGuardarEdicion(btnGuardar);
                notify.mostrarToast(`Ese día ya está asignado al compensatorio del ${TiempoUtils.fechaCorta(yaUsadoPorOtro.compensatorioFecha)}`, 'error');
                return;
            }
            const listaSimulada = EstadoApp.registros().map(x => x.id === r.id
                ? { ...x, fecha: f, entrada: e || null, salida: s || null, referenciaCompensatorio: referenciaCompensatorioNueva }
                : x);
            const asigTest = calcularAsignacionesCompensatorio(listaSimulada);
            const resuelto = _buscarAsignacionCompensatorio(r.id, 'compensatorioId', asigTest);
            if (!resuelto?.referenciaFecha) {
                notify.restaurarBotonGuardarEdicion(btnGuardar);
                notify.mostrarToast('Ese día no tiene excedente disponible (o ya fue usado por otro compensatorio)', 'error');
                return;
            }
        }
    }

    let cr = _calcularCredito(e, s, tf, objetivoEdicionEnVivo());

    if (r.fecha === f && (r.entrada || '') === (e || '') && (r.salida || '') === (s || '') &&
        (r.tiempoFuera || '') === (tf || '') && (r.credito || '') === (cr || '') && (r.notas || '') === (notas || '') &&
        objetivoNuevo === objetivoPrevio && (r.referenciaCompensatorio || '') === (referenciaCompensatorioNueva || '')) {
        notify.mostrarToast('Sin cambios', 'info');
        notify.restaurarBotonGuardarEdicion(btnGuardar);
        notify.cerrarEdicion();
        return;
    }

    if (!e && !s) { await _eliminarRegistroVacioDesdeEdicion(btnGuardar); return; }

    const camposError = _validarCamposEdicion(f, e, s, tf);
    if (camposError) {
        notify.restaurarBotonGuardarEdicion(btnGuardar);
        notify.mostrarToast(camposError.msg, camposError.tipo);
        return;
    }

    r.fecha = f; r.entrada = e || null;
    if (s && !(r.salida || '')) {
        const timerDetenido = detenerYRegistrarTimer(r);
        if (timerDetenido) {
            tf = r.tiempoFuera;
            cr = _calcularCredito(e, s, tf, objetivoEdicionEnVivo());
        }
    }
    r.salida = s || null; r.tiempoFuera = tf; r.credito = cr; r.notas = notas; r.objetivoHoras = objetivoNuevo;
    if (referenciaCompensatorioNueva) r.referenciaCompensatorio = referenciaCompensatorioNueva;
    else delete r.referenciaCompensatorio;

    _aplicarCalculoHoras(r, r.entrada, r.salida, r.tiempoFuera, r.credito);

    ordenarRegistros();
    GestorHistorial.saveState(EstadoApp.registros(), `editar registro (${TiempoUtils.fechaCorta(f)})`);
    const saved = await guardarYActualizar(r.id, true);
    notify.restaurarBotonGuardarEdicion(btnGuardar);
    if (saved) {
        _sincronizarPushHoy();
        notify.mostrarToast(cr ? `Guardado con Salida Temprana (+${cr})` : 'Registro actualizado', 'success');
        notify.cerrarEdicion();
    }
}

async function borrarTodoHistorial() {
    const registros = EstadoApp.registros();
    const totalRegistros = registros.length;
    const confirmar = await EstadoApp._notify().confirmarModal(`Esto restablecerá el perfil activo: se eliminarán ${totalRegistros} registro${TiempoUtils.pluralizar(totalRegistros)} y la configuración volverá a los valores por defecto. No afecta otros perfiles.`, 'Restablecer');
    if (!confirmar) return;

    EstadoApp.setDiasHabiles([1, 2, 3, 4, 5]);
    EstadoApp.setHorasDiarias(7);
    EstadoApp._setHistorialDiasHabilesRaw([]);
    registros.splice(0, registros.length);
    EstadoApp.setIgnorarTiempoFuera(false);
    RecordatorioPush.restablecer();

    const perfilId = EstadoApp.obtenerPerfilIdActual();
    Almacenamiento.removeItem(STORAGE_KEYS.BREAK_TIME(perfilId));
    const keys = [STORAGE_KEYS.FONDO_CARD, STORAGE_KEYS.IGNORAR_TF, STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, 'cardVisible_registrar', 'cardVisible_estadisticas', 'cardVisible_historico', STORAGE_KEYS.ORDEN_CARDS, STORAGE_KEYS.BIENVENIDA_VISTA, STORAGE_KEYS.FERIADOS_PROCESADOS];
    keys.forEach(k => Almacenamiento.removeItem(k, true));

    if (GestorPerfiles) {
        const perfil = GestorPerfiles.obtenerDatosPerfil();
        if (perfil) {
            ['gistLastSync', 'gistAutoSync', 'gistRangoDesde', 'gistRangoHasta', 'gistSyncFecha_subir', 'gistSyncCount_subir', 'gistSyncFecha_bajar', 'gistSyncCount_bajar', 'gistMergeBehavior'].forEach(k => delete perfil[k]);
        }
    }

    GestorHistorial.saveState(registros, `restablecer perfil (${totalRegistros} registro${TiempoUtils.pluralizar(totalRegistros)})`);
    if (await guardarYActualizar()) location.reload();
}

function _aplicarEstadoHistorial(resultado, mensaje) {
    if (!resultado?.estado) return;
    const registros = EstadoApp.registros();
    registros.splice(0, registros.length, ...resultado.estado);
    registros.forEach(r => {
        if (r.entrada && r.salida && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) {
            _recalcularHorasSiValido(r);
        }
    });
    _sincronizarPushHoy();
    guardarYActualizar(null, true);
    const notify = EstadoApp._notify();
    notify.mostrarToast(mensaje, 'info', undefined, resultado.descripcion);
    notify.iniciarTimerAutoCierreBotones();
}

export const GestionDatos = {
    setHistorialDiasHabiles: (v) => {
        const arr = Array.isArray(v) ? v : [];
        EstadoApp._setHistorialDiasHabilesRaw(arr);
        if (arr.length > 0) EstadoApp.setDiasHabiles(diasHabilesEnFecha(TiempoUtils.obtenerFechaHoy()));
    },
    recalcularTotalesEnMemoria: function (recalcularCreditos = false) {
        EstadoApp.registros().forEach(r => {
            if (r.entrada && r.salida && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) {
                if (recalcularCreditos && r.credito) _recalcularCreditoRegistro(r, objetivoDeRegistro(r));
                else _recalcularHorasSiValido(r);
            }
        });
    },
    cargarConfiguracion,
    agregarRegistro,
    eliminarRegistroActual,
    editarRegistro,
    guardarEdicion,
    pegarReferenciaAutomatica,
    borrarTodoHistorial,
    sincronizarPushHoy: _sincronizarPushHoy,
    _registroAbiertoParaPush,
    undoAction: function () { _aplicarEstadoHistorial(GestorHistorial.undo(), 'Deshecho'); },
    redoAction: function () { _aplicarEstadoHistorial(GestorHistorial.redo(), 'Rehecho'); }
};
