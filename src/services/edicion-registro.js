import { STORAGE_KEYS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp } from './estado-app.js';
import { Compensatorios } from './compensatorios.js';
import { FiltrosYPeriodos } from './filtros-periodos.js';
import { GestorHistorial } from './gestor-historial.js';
import { TiposRegistro } from './tipos-registro.js';
import { AvisoJornada } from './aviso-jornada.js';

// ====================================================================
//              RECORD EDITING (modal "Editar" de un registro)
// ====================================================================
// Abrir, guardar (con validaciones, salida temprana y referencia de compensatorio), eliminar y referencia automática.
// Lee y escribe el formulario solo por el puerto notify.formularioEdicion (lo implementa ui/formularios.js).
const {
    ordenarRegistros, registroPorId, _fechaFuturaInvalida, calcularHoras, _aplicarCalculoHoras, guardarYActualizar
} = EstadoApp;
const {
    _esObjetivoValido, objetivoGuardado, calcularAsignacionesCompensatorio, _buscarAsignacionCompensatorio, objetivoEdicionEnVivo
} = Compensatorios;
const { detenerYRegistrarTimer, registroParaTiempoFuera } = FiltrosYPeriodos;

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
        AvisoJornada.sincronizarHoy();
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
    EstadoApp.setEditandoId(id);
    const objetivoActual = objetivoGuardado(r);
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
        const { fecha: f, entrada: e, salida: s } = S.limpiarCamposHorario(campos);
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
    AvisoJornada.sincronizarHoy();
    GestorHistorial.saveState(EstadoApp.registros(), `eliminar registro vacío${reg ? ` (${TiempoUtils.fechaCorta(reg.fecha)})` : ''}`);
    const saved = await guardarYActualizar();
    notify.restaurarBotonGuardarEdicion(btnGuardar);
    if (saved) { notify.mostrarToast('Registro eliminado (vacío)', 'info'); notify.cerrarEdicion(); }
}

/** Valores del formulario de edición, limpios y normalizados (la referencia solo cuenta si el registro es un compensatorio). */
function _leerEdicion(campos) {
    const { fecha, entrada, salida } = S.limpiarCamposHorario(campos);
    const tiempoFuera = S.limpiarTexto(campos.tiempoFuera.trim(), 5) || null;
    const esCompensatorio = TiposRegistro.obtenerTipoPorCodigo(entrada, salida)?.id === 'compensatorio';
    const referencia = esCompensatorio ? S.limpiarTexto(campos.referencia, 10) : '';
    return {
        fecha, entrada, salida,
        tiempoFuera: tiempoFuera ? TiempoUtils.normalizarMinutosSueltos(tiempoFuera) : null,
        notas: S.normalizarNotas(campos.notas),
        objetivo: _esObjetivoValido(campos.objetivo) ? campos.objetivo : EstadoApp.horasDiarias(),
        referencia: TiempoUtils.validarFecha(referencia) ? referencia : undefined,
    };
}

/** Error del día a compensar elegido para un compensatorio (posterior, ya usado o sin excedente), o null. */
function _errorReferenciaCompensatorio(r, nuevo) {
    const ref = nuevo.referencia;
    if (!ref) return null;
    if (ref > nuevo.fecha) return 'El día a compensar no puede ser posterior al compensatorio';

    const yaUsadoPorOtro = calcularAsignacionesCompensatorio().find(a => a.compensatorioId !== r.id && a.referenciaFecha === ref);
    if (yaUsadoPorOtro) return `Ese día ya está asignado al compensatorio del ${TiempoUtils.fechaCorta(yaUsadoPorOtro.compensatorioFecha)}`;

    // Se simula la lista con el registro ya editado: la asignación cronológica decide si ese día todavía tiene excedente
    const listaSimulada = EstadoApp.registros().map(x => x.id === r.id
        ? { ...x, fecha: nuevo.fecha, entrada: nuevo.entrada || null, salida: nuevo.salida || null, referenciaCompensatorio: ref }
        : x);
    const resuelto = _buscarAsignacionCompensatorio(r.id, 'compensatorioId', calcularAsignacionesCompensatorio(listaSimulada));
    return resuelto?.referenciaFecha ? null : 'Ese día no tiene excedente disponible (o ya fue usado por otro compensatorio)';
}

function _sinCambios(r, nuevo, credito) {
    const igual = (a, b) => (a || '') === (b || '');
    return r.fecha === nuevo.fecha && igual(r.entrada, nuevo.entrada) && igual(r.salida, nuevo.salida)
        && igual(r.tiempoFuera, nuevo.tiempoFuera) && igual(r.credito, credito) && igual(r.notas, nuevo.notas)
        && nuevo.objetivo === objetivoGuardado(r) && igual(r.referenciaCompensatorio, nuevo.referencia);
}

/** Escribe lo editado en el registro y recalcula sus horas. Devuelve el crédito final (puede cambiar al detener el timer). */
function _aplicarEdicion(r, nuevo, credito) {
    let { tiempoFuera } = nuevo;
    let creditoFinal = credito;
    r.fecha = nuevo.fecha;
    r.entrada = nuevo.entrada || null;
    // Se cierra una jornada abierta: si había un timer de tiempo fuera corriendo, se detiene y se suma
    if (nuevo.salida && !(r.salida || '') && detenerYRegistrarTimer(r)) {
        tiempoFuera = r.tiempoFuera;
        creditoFinal = _calcularCredito(nuevo.entrada, nuevo.salida, tiempoFuera, objetivoEdicionEnVivo());
    }
    r.salida = nuevo.salida || null;
    r.tiempoFuera = tiempoFuera;
    r.credito = creditoFinal;
    r.notas = nuevo.notas;
    r.objetivoHoras = nuevo.objetivo;
    if (nuevo.referencia) r.referenciaCompensatorio = nuevo.referencia;
    else delete r.referenciaCompensatorio;
    _aplicarCalculoHoras(r, r.entrada, r.salida, r.tiempoFuera, r.credito);
    return creditoFinal;
}

async function guardarEdicion() {
    const r = registroPorId(EstadoApp.editandoId());
    if (!r) return;
    const notify = EstadoApp._notify();
    const btnGuardar = notify.formularioEdicion.bloquearGuardar();
    const rechazar = (msg, tipo = 'error') => { notify.restaurarBotonGuardarEdicion(btnGuardar); notify.mostrarToast(msg, tipo); };

    const nuevo = _leerEdicion(notify.formularioEdicion.leer());
    const errorReferencia = _errorReferenciaCompensatorio(r, nuevo);
    if (errorReferencia) { rechazar(errorReferencia); return; }

    const credito = _calcularCredito(nuevo.entrada, nuevo.salida, nuevo.tiempoFuera, objetivoEdicionEnVivo());
    if (_sinCambios(r, nuevo, credito)) {
        notify.mostrarToast('Sin cambios', 'info');
        notify.restaurarBotonGuardarEdicion(btnGuardar);
        notify.cerrarEdicion();
        return;
    }
    if (!nuevo.entrada && !nuevo.salida) { await _eliminarRegistroVacioDesdeEdicion(btnGuardar); return; }

    const error = _validarCamposEdicion(nuevo.fecha, nuevo.entrada, nuevo.salida, nuevo.tiempoFuera);
    if (error) { rechazar(error.msg, error.tipo); return; }

    const creditoFinal = _aplicarEdicion(r, nuevo, credito);
    ordenarRegistros();
    GestorHistorial.saveState(EstadoApp.registros(), `editar registro (${TiempoUtils.fechaCorta(nuevo.fecha)})`);
    const saved = await guardarYActualizar(r.id, true);
    notify.restaurarBotonGuardarEdicion(btnGuardar);
    if (saved) {
        AvisoJornada.sincronizarHoy();
        notify.mostrarToast(creditoFinal ? `Guardado con Salida Temprana (+${creditoFinal})` : 'Registro actualizado', 'success');
        notify.cerrarEdicion();
    }
}

export const EdicionRegistro = {
    editar: editarRegistro,
    guardar: guardarEdicion,
    eliminar: eliminarRegistroActual,
    pegarReferencia: pegarReferenciaAutomatica,
};
