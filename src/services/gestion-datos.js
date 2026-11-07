import { Compensatorios } from './compensatorios.js';
import { FiltrosYPeriodos } from './filtros-periodos.js';
import { EstadoApp } from './estado-app.js';
import { STORAGE_KEYS, CARDS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { RecordatorioPush } from './recordatorio-push.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { Recarga } from '../core/recarga.js';
import { GestorPerfiles } from './gestor-perfiles.js';
import { GestorHistorial } from './gestor-historial.js';
import { TiposRegistro } from './tipos-registro.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { AvisoJornada } from './aviso-jornada.js';

// ====================================================================
// DATA MANAGEMENT MODULE
// ====================================================================
const {
    ordenarRegistros, registroPorFecha, existeRegistroEnFecha,
    _hayEspacioParaRegistros, _fechaFuturaInvalida,
    _aplicarCalculoHoras, _recalcularHorasSiValido, _construirRegistro,
    guardarYActualizar, _guardarConCicloSiHoy
} = EstadoApp;

const { _esObjetivoValido, diasHabilesEnFecha, objetivoDeRegistro, _recalcularCreditoRegistro } = Compensatorios;

const { detenerYRegistrarTimer, detectarAyerAbierto } = FiltrosYPeriodos;

/** Preferencias de interfaz guardadas (los días y horas del perfil los carga cargarPerfilActivo). */
function cargarConfiguracion() {
    return {
        tema: EstadoApp._notify().temaGuardado(),
        vistaActual: Almacenamiento.getItem(STORAGE_KEYS.VISTA_ACTUAL, 'diaria'),
        ignorarTiempoFuera: Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_TF, false, true),
        modoEstadisticas: Almacenamiento.getItem(STORAGE_KEYS.MODO_ESTADISTICAS, 'mensual'),
        fondoCard: Almacenamiento.getItem(STORAGE_KEYS.FONDO_CARD, 'golden-gate', true)
    };
}

/** Historial de días hábiles del perfil; si trae tramos, los días vigentes pasan a ser los de hoy. */
function _setHistorialDiasHabiles(historial) {
    const arr = Array.isArray(historial) ? historial : [];
    EstadoApp._setHistorialDiasHabilesRaw(arr);
    if (arr.length > 0) EstadoApp.setDiasHabiles(diasHabilesEnFecha(TiempoUtils.obtenerFechaHoy()));
}

/** Recalcula horas de las jornadas cerradas; con `recalcularCreditos`, también la salida temprana según el objetivo. */
function recalcularTotalesEnMemoria(recalcularCreditos = false) {
    EstadoApp.registros().forEach(r => {
        if (r.entrada && r.salida && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) {
            if (recalcularCreditos && r.credito) _recalcularCreditoRegistro(r, objetivoDeRegistro(r));
            else _recalcularHorasSiValido(r);
        }
    });
}

/**
 * Carga en EstadoApp el perfil activo (configuración y registros) y, si sigue vigente, la pila de deshacer.
 * Lo guardado se repara antes de usarlo (ver SeguridadYUtils.repararRegistrosGuardados): un perfil corrupto
 * o editado a mano no llega tal cual a los cálculos.
 */
function cargarPerfilActivo() {
    const perfil = GestorPerfiles.obtenerDatosPerfil() || {};
    EstadoApp.setDiasHabiles(S.sanitizarDiasHabiles(perfil.diasHabiles) ?? [1, 2, 3, 4, 5]);
    const horas = parseFloat(perfil.horasDiarias);
    EstadoApp.setHorasDiarias(Number.isFinite(horas) && horas >= 0 && horas <= 24 ? horas : 7);
    const historialDias = Compensatorios.sanitizarHistorialDiasHabiles(perfil.historialDiasHabiles);
    _setHistorialDiasHabiles(
        historialDias && historialDias.length > 0 ? historialDias : [{ desde: '0001-01-01', dias: EstadoApp.diasHabiles() }]
    );

    const guardados = Array.isArray(perfil.registros) ? perfil.registros : [];
    const registros = S.repararRegistrosGuardados(guardados);
    if (registros.length !== guardados.length) {
        console.warn(`Perfil: ${guardados.length - registros.length} registro(s) guardado(s) sin fecha válida, descartado(s).`);
    }
    EstadoApp._setRegistros(registros);

    const historialCargado = GestorHistorial.loadFromLocalStorage();
    if (historialCargado) {
        const estadoActual = GestorHistorial.getCurrentState();
        if (Array.isArray(estadoActual)) {
            EstadoApp._setRegistros(S.repararRegistrosGuardados(estadoActual));
        } else {
            console.warn('Historial corrupto, descartado. Usando registros del perfil.');
            GestorHistorial.clear();
        }
    }
    ordenarRegistros();
    recalcularTotalesEnMemoria();
    if (!historialCargado) GestorHistorial.saveState(EstadoApp.registros());

    const migrados = Compensatorios.migrarObjetivoHorasFaltante();
    if (migrados > 0) {
        console.info(`Migración: ${migrados} registro(s) sin objetivo estampado, asignado el valor global vigente (${EstadoApp.horasDiarias()}h).`);
        GestorHistorial.parchearRegistrosEnHistorial(r => {
            if (!_esObjetivoValido(r.objetivoHoras)) {
                r.objetivoHoras = EstadoApp.horasDiarias();
                return true;
            }
            return false;
        });
        GestorPerfiles.guardarDatosPerfilActual();
    }
}

/** Marca los campos inválidos del formulario de fichaje y devuelve si se puede continuar. */
function validarFormulario({ fecha, entrada, salida }) {
    let valido = true;
    const notify = EstadoApp._notify();

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
        const bufferSemanal = AvisoJornada.bufferSemanalPara(f);
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
    const formulario = notify.formularioRegistro;
    const campos = S.limpiarCamposHorario(formulario.leer());
    if (!validarFormulario(campos)) { notify.avisarFichaje('Verificá los campos'); return; }

    const btn = formulario.bloquearBoton();
    let usaHoraActual = false;
    let { fecha: f, entrada: e, salida: s } = campos;

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
    const keys = [STORAGE_KEYS.FONDO_CARD, STORAGE_KEYS.IGNORAR_TF, STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, ...CARDS.map(STORAGE_KEYS.CARD_VISIBLE), STORAGE_KEYS.ORDEN_CARDS, STORAGE_KEYS.ORDEN_CARDS_MOVIL, STORAGE_KEYS.COLUMNAS_CARDS, STORAGE_KEYS.BIENVENIDA_VISTA, STORAGE_KEYS.FERIADOS_PROCESADOS];
    keys.forEach(k => Almacenamiento.removeItem(k, true));

    const perfil = GestorPerfiles.obtenerDatosPerfil();
    if (perfil) GestorPerfiles.CAMPOS_SYNC_GIST.forEach(k => delete perfil[k]);

    GestorHistorial.saveState(registros, `restablecer perfil (${totalRegistros} registro${TiempoUtils.pluralizar(totalRegistros)})`);
    if (await guardarYActualizar()) Recarga.solicitar();
}

function _aplicarEstadoHistorial(resultado, mensaje) {
    if (!resultado?.estado) return;
    const registros = EstadoApp.registros();
    registros.splice(0, registros.length, ...resultado.estado);
    recalcularTotalesEnMemoria();
    AvisoJornada.sincronizarHoy();
    guardarYActualizar(null, true);
    const notify = EstadoApp._notify();
    notify.mostrarToast(mensaje, 'info', undefined, resultado.descripcion);
    notify.iniciarTimerAutoCierreBotones();
}

function deshacer() { _aplicarEstadoHistorial(GestorHistorial.undo(), 'Deshecho'); }
function rehacer() { _aplicarEstadoHistorial(GestorHistorial.redo(), 'Rehecho'); }

export const GestionDatos = {
    cargarConfiguracion,
    cargarPerfilActivo,
    agregarRegistro,
    recalcularTotalesEnMemoria,
    borrarTodoHistorial,
    undoAction: deshacer,
    redoAction: rehacer,
};
