import { Preferencias } from '../core/preferencias.js';
import { EstadoApp } from './estado-app.js';
import { STORAGE_KEYS, CARDS, DESDE_SIEMPRE, DIAS_HABILES_DEFAULT, HORAS_DIARIAS_DEFAULT, CLAVES_AJUSTES_INSTALACION } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { RecordatorioPush } from './recordatorio-push.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { Recarga } from '../core/recarga.js';
import { GestorPerfiles } from './gestor-perfiles.js';
import { GestorHistorial } from './gestor-historial.js';
import { TiposRegistro } from './tipos-registro.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { AvisoJornada } from './aviso-jornada.js';
import { TiempoFuera } from './tiempo-fuera.js';
import { Cambios } from './cambios.js';
import { DiasHabiles } from './dias-habiles.js';
import { Objetivos } from './objetivos.js';
import { Jornada } from './jornada.js';

// ====================================================================
// DATA MANAGEMENT MODULE
// ====================================================================
const {
    ordenarRegistros, registroPorFecha, existeRegistroEnFecha,
    _hayEspacioParaRegistros, _fechaFuturaInvalida,
    _aplicarCalculoHoras, _recalcularHorasSiValido, _construirRegistro,
    guardarYActualizar
} = EstadoApp;

const { _esObjetivoValido, objetivoDeRegistro, _recalcularCreditoRegistro } = Objetivos;
const { diasHabilesEnFecha } = DiasHabiles;

const { detectarAyerAbierto } = Jornada;

/** Preferencias de interfaz guardadas (los días y horas del perfil los carga cargarPerfilActivo). */
function cargarConfiguracion() {
    return {
        tema: EstadoApp._notify().temaGuardado(),
        vistaActual: Almacenamiento.getItem(STORAGE_KEYS.VISTA_ACTUAL, 'diaria'),
        ignorarTiempoFuera: Preferencias.IGNORAR_TF.get(),
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

/** Para comparar listas de registros sin depender del orden (hay un registro por fecha). */
const _firmaRegistros = (lista) => JSON.stringify([...lista].sort((a, b) => a.fecha.localeCompare(b.fecha)));

/**
 * Carga en EstadoApp el perfil activo (configuración y registros) y, si sigue vigente, la pila de deshacer.
 * Lo guardado se repara antes de usarlo (ver SeguridadYUtils.repararRegistrosGuardados): un perfil corrupto
 * o editado a mano no llega tal cual a los cálculos.
 * Los registros siempre salen del perfil. La pila solo sirve para deshacer: si no coincide con el perfil (su última escritura
 * falló por cuota, o se guardó un cambio que no pasa por ella) se descarta; restaurarla revertiría datos ya guardados.
 */
function cargarPerfilActivo() {
    const perfil = GestorPerfiles.obtenerDatosPerfil() || {};
    EstadoApp.setDiasHabiles(S.sanitizarDiasHabiles(perfil.diasHabiles) ?? [...DIAS_HABILES_DEFAULT]);
    const horas = parseFloat(perfil.horasDiarias);
    EstadoApp.setHorasDiarias(Number.isFinite(horas) && horas >= 0 && horas <= 24 ? horas : HORAS_DIARIAS_DEFAULT);
    const historialDias = DiasHabiles.sanitizarHistorialDiasHabiles(perfil.historialDiasHabiles);
    _setHistorialDiasHabiles(
        historialDias && historialDias.length > 0 ? historialDias : [{ desde: DESDE_SIEMPRE, dias: EstadoApp.diasHabiles() }]
    );

    const guardados = Array.isArray(perfil.registros) ? perfil.registros : [];
    const registros = S.repararRegistrosGuardados(guardados);
    if (registros.length !== guardados.length) {
        console.warn(`Perfil: ${guardados.length - registros.length} registro(s) guardado(s) sin fecha válida, descartado(s).`);
    }
    EstadoApp._setRegistros(registros);

    const historialCargado = GestorHistorial.loadFromLocalStorage();
    const estadoPila = historialCargado ? GestorHistorial.getCurrentState() : null;
    const pilaVigente = Array.isArray(estadoPila)
        && _firmaRegistros(S.repararRegistrosGuardados(estadoPila)) === _firmaRegistros(registros);
    if (historialCargado && !pilaVigente) {
        console.warn('La pila de deshacer no coincide con el perfil: se descarta.');
        GestorHistorial.clear();
    }
    ordenarRegistros();
    recalcularTotalesEnMemoria();
    if (!pilaVigente) GestorHistorial.saveState(EstadoApp.registros());

    const migrados = Objetivos.migrarObjetivoHorasFaltante();
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
    const timerDetenido = TiempoFuera.volcarEnRegistro(reg) > 0;
    const hoy = TiempoUtils.obtenerFechaHoy();
    // jornada de ayer que cruzó la medianoche: la tarjeta la sigue mostrando unos segundos antes de pasar a hoy
    const ayer = detectarAyerAbierto(hoy, EstadoApp.registros());
    const eraAyerAbierto = reg.fecha !== hoy && ayer.ayerAbierto && ayer.regAyer === reg;
    reg.salida = s;
    _aplicarCalculoHoras(reg, reg.entrada, s, reg.tiempoFuera || null);

    const esHoy = reg.fecha === hoy;
    if (eraAyerAbierto) notify.retenerRegistroAyer(reg.id);
    const saved = await Cambios.confirmarEnTarjeta(`salida ${s} (${TiempoUtils.fechaCorta(reg.fecha)})`, reg.id, esHoy || eraAyerAbierto, 'salida');
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
    const saved = await Cambios.confirmarEnTarjeta(`${detalleAccion} (${TiempoUtils.fechaCorta(f)})`, nuevo.id, esHoy, 'entrada');
    if (!saved) {
        notify.avisarFichaje(null, 'error', { btn });
        return;
    }
    if (esHoy && !s && DiasHabiles.esDiaLaboral(f)) {
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
    const confirmar = await EstadoApp._notify().confirmarModal(`Esto restablecerá el perfil activo: se eliminarán ${TiempoUtils.contar(totalRegistros, 'registro')} y la configuración, incluida la apariencia de la app, volverá a los valores por defecto. Los demás perfiles conservan sus registros.`, 'Restablecer');
    if (!confirmar) return;

    EstadoApp.setDiasHabiles([...DIAS_HABILES_DEFAULT]);
    EstadoApp.setHorasDiarias(HORAS_DIARIAS_DEFAULT);
    EstadoApp._setHistorialDiasHabilesRaw([]);
    registros.splice(0, registros.length);
    EstadoApp.setIgnorarTiempoFuera(false);
    RecordatorioPush.restablecer();

    TiempoFuera.descartar();
    const keys = [STORAGE_KEYS.FONDO_CARD, STORAGE_KEYS.IGNORAR_TF, STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, ...CARDS.map(STORAGE_KEYS.CARD_VISIBLE), STORAGE_KEYS.ORDEN_CARDS, STORAGE_KEYS.ORDEN_CARDS_MOVIL, STORAGE_KEYS.COLUMNAS_CARDS, STORAGE_KEYS.ORDEN_CARDS_3, STORAGE_KEYS.COLUMNAS_CARDS_3, STORAGE_KEYS.BIENVENIDA_VISTA, STORAGE_KEYS.FERIADOS_PROCESADOS];
    keys.forEach(k => Almacenamiento.removeItem(k, true));
    CLAVES_AJUSTES_INSTALACION.forEach(k => Almacenamiento.removeItem(k));   // la apariencia no es de un perfil: vuelve a la de fábrica

    const perfil = GestorPerfiles.obtenerDatosPerfil();
    if (perfil) GestorPerfiles.CAMPOS_SYNC_GIST.forEach(k => delete perfil[k]);

    if (await Cambios.confirmar(`restablecer perfil (${TiempoUtils.contar(totalRegistros, 'registro')})`)) Recarga.solicitar();
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
