import { TiempoUtils } from '../core/tiempo-utils.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { TiposRegistro } from './tipos-registro.js';

// ====================================================================
// CENTRAL APPLICATION STATE & BASE RECORD CALCULATIONS MODULE
// ====================================================================
/**
 * Formulario "Fichar": los servicios lo leen/escriben sin conocer el DOM (lo implementa ui/formularios.js).
 * Los valores de `leer` son crudos: el servicio los sanitiza.
 * @typedef {Object} FormularioRegistro
 * @property {() => { fecha: string, entrada: string, salida: string }} leer
 * @property {(campos: { fecha?: string, entrada?: string, salida?: string }) => void} escribir
 * @property {() => any} bloquearBoton deshabilita el botón de fichar y devuelve un handle opaco para notify.avisarFichaje/resetearBoton
 */

/**
 * Formulario del modal de edición de un registro (implementado en ui/formularios.js).
 * @typedef {Object} FormularioEdicion
 * @property {() => { fecha: string, entrada: string, salida: string, tiempoFuera: string, notas: string, objetivo: number, referencia: string, creditoActivo: boolean }} leer
 * @property {(datos: { fecha: string, entrada: string, salida: string, tiempoFuera: string, notas: string, objetivo: number, esCompensatorio: boolean, referencia: string, creditoActivo: boolean }) => void} poblar
 * @property {() => void} refrescarHintResumen
 * @property {() => boolean} tieneCampoReferencia
 * @property {(valor: string) => void} escribirReferencia
 * @property {() => any} bloquearGuardar devuelve handle opaco para notify.restaurarBotonGuardarEdicion
 * @property {() => any} bloquearEliminar
 * @property {(handle: any) => void} liberarEliminar
 */

/**
 * Puerto hacia la UI: lo que los servicios pueden pedirle (la UI lo implementa en orquestador.js).
 * @typedef {Object} Notificaciones
 * @property {(mensaje: string, tipo?: string, duracion?: number, detalle?: string|null, accion?: Function|null) => void} mostrarToast
 * @property {(texto: string, etiqueta?: string, icono?: string, opciones?: object) => Promise<boolean>} confirmarModal
 * @property {FormularioRegistro} formularioRegistro
 * @property {FormularioEdicion} formularioEdicion
 * @property {() => boolean} hayUIBloqueante
 * @property {() => number} leerObjetivoEdicion objetivo (horas) mostrado en el formulario de edición; NaN si no hay
 * @property {() => string} temaGuardado
 * @property {() => string} obtenerNombrePerfilSafe
 * @property {(vista: string, fn: () => any) => any} forzarVista
 * @property {(...args: any[]) => void} abrirModal
 * @property {(...args: any[]) => void} actualizarEstadoBotonTimerMain
 * @property {(...args: any[]) => void} actualizarHintGrupo
 * @property {(...args: any[]) => void} actualizarUI
 * @property {(...args: any[]) => void} animarExitoFichaje
 * @property {(...args: any[]) => void} aplicarFeedbackCampos
 * @property {(...args: any[]) => void} avisarFichaje
 * @property {(...args: any[]) => void} cerrarEdicion
 * @property {(...args: any[]) => void} cerrarEdicionGrupo
 * @property {(...args: any[]) => void} cerrarFiltros
 * @property {(...args: any[]) => void} cerrarImportar
 * @property {(...args: any[]) => void} cerrarTodosModales
 * @property {(...args: any[]) => void} descargarJSON
 * @property {(...args: any[]) => void} iniciarTimerAutoCierreBotones
 * @property {(...args: any[]) => void} limpiarError
 * @property {(...args: any[]) => void} mostrarError
 * @property {(...args: any[]) => void} prepararMostrarFaseAlRenderizar
 * @property {(...args: any[]) => void} refrescarConfigSiVisible
 * @property {(id: string | null) => void} retenerRegistroAyer
 * @property {(...args: any[]) => void} resetearBoton
 * @property {(...args: any[]) => void} restaurarBotonGuardarEdicion
 * @property {(...args: any[]) => void} setBloqueoEdicion
 * @property {(...args: any[]) => void} setBloqueoEdicionGrupo
 * @property {(...args: any[]) => void} verificarBloqueoCredito
 */

/** @type {Notificaciones} */
let notify = {
    abrirModal: () => { },
    actualizarEstadoBotonTimerMain: () => { },
    actualizarHintGrupo: () => { },
    actualizarUI: () => { },
    animarExitoFichaje: () => { },
    aplicarFeedbackCampos: () => { },
    avisarFichaje: () => { },
    cerrarEdicion: () => { },
    cerrarEdicionGrupo: () => { },
    cerrarFiltros: () => { },
    cerrarImportar: () => { },
    cerrarTodosModales: () => { },
    confirmarModal: async () => false,
    descargarJSON: () => { },
    forzarVista: (vista, fn) => fn(),
    formularioRegistro: {
        leer: () => ({ fecha: '', entrada: '', salida: '' }),
        escribir: () => { },
        bloquearBoton: () => null,
    },
    formularioEdicion: {
        leer: () => ({ fecha: '', entrada: '', salida: '', tiempoFuera: '', notas: '', objetivo: NaN, referencia: '', creditoActivo: false }),
        poblar: () => { },
        refrescarHintResumen: () => { },
        tieneCampoReferencia: () => false,
        escribirReferencia: () => { },
        bloquearGuardar: () => null,
        bloquearEliminar: () => null,
        liberarEliminar: () => { },
    },
    hayUIBloqueante: () => false,
    leerObjetivoEdicion: () => NaN,
    iniciarTimerAutoCierreBotones: () => { },
    limpiarError: () => { },
    mostrarError: () => { },
    mostrarToast: () => { },
    obtenerNombrePerfilSafe: () => '',
    prepararMostrarFaseAlRenderizar: () => { },
    refrescarConfigSiVisible: () => { },
    retenerRegistroAyer: () => { },
    resetearBoton: () => { },
    restaurarBotonGuardarEdicion: () => { },
    setBloqueoEdicion: () => { },
    setBloqueoEdicionGrupo: () => { },
    temaGuardado: () => 'claro',
    verificarBloqueoCredito: () => { },
};

/** @param {Partial<Notificaciones>} handlers */
function configurarNotificaciones(handlers) {
    notify = { ...notify, ...handlers };
}

let registros = [];
let diasHabiles = [1, 2, 3, 4, 5];
let horasDiarias = 7;
let editandoId = null;
let vistaActual = 'diaria';
let ignorarTiempoFuera = false;
let historialDiasHabiles = [];
let filtroActivo = false;
let filtroDesde = null;
let filtroHasta = null;
let filtroTipo = null;
let grupoEnEdicion = null;

/** @type {{ obtenerPerfilActual: () => string, guardarDatosPerfilActual: (() => boolean) | null }} */
let _perfilHooks = {
    obtenerPerfilActual: () => 'default',
    guardarDatosPerfilActual: null
};
/** @type {(...args: any[]) => any} */
let _sincronizarPushHoyFn = () => { };

function setPerfilHooks(hooks) {
    _perfilHooks = { ..._perfilHooks, ...hooks };
}

function setSincronizarPushHoyHook(fn) {
    if (typeof fn === 'function') _sincronizarPushHoyFn = fn;
}

function obtenerPerfilIdActual() {
    return _perfilHooks.obtenerPerfilActual ? _perfilHooks.obtenerPerfilActual() : 'default';
}

function ordenarRegistros() {
    registros.sort((a, b) => {
        if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
        return (b.entrada || '').localeCompare(a.entrada || '');
    });
}

function registroPorFecha(fecha) { return registros.find(r => r.fecha === fecha); }
function registroPorId(id) { return registros.find(r => r.id === id); }
function existeRegistroEnFecha(fecha) { return registros.some(r => r.fecha === fecha); }

function _hayEspacioParaRegistros(cantidadAAgregar = 1) {
    return (registros.length + cantidadAAgregar) <= S.SECURITY_LIMITS.MAX_REGISTROS;
}

function _fechaFuturaInvalida(fecha, entrada, salida) {
    return fecha > TiempoUtils.obtenerFechaHoy() && !TiposRegistro.esRegistroEspecial(entrada, salida);
}

/** @param {any} [tf] @param {any} [cr] */
function calcularHoras(e, s, tf = null, cr = null, esCalculoTemporal = false) {
    const tfEfectivo = ignorarTiempoFuera ? null : tf;
    const tfMinutos = tfEfectivo ? TiempoUtils.horaAMinutos(tfEfectivo) : 0;
    const crMinutos = cr ? TiempoUtils.horaAMinutos(cr) : 0;

    if (!esCalculoTemporal) {
        const tipoEspecial = TiposRegistro.obtenerTipoPorCodigo(e, s);
        if (tipoEspecial) {
            const resultado = { horas: 0, minutos: 0, total: horasDiarias };
            resultado[`es${tipoEspecial.label}`] = true;
            return resultado;
        }
    }

    if (!e || !s || !e.includes(':') || !s.includes(':')) return null;
    const [hE, mE] = e.split(':').map(Number);
    const [hS, mS] = s.split(':').map(Number);

    if (!Number.isFinite(hE) || !Number.isFinite(mE) || !Number.isFinite(hS) || !Number.isFinite(mS)) return null;

    const minutosEntrada = hE * 60 + mE;
    const minutosSalida = hS * 60 + mS;
    let minTotal = minutosSalida - minutosEntrada;
    if (minTotal < 0) minTotal += 24 * 60;
    let minNeto = (minTotal - tfMinutos) + crMinutos;
    if (minNeto < 0) minNeto = 0;

    return { horas: Math.floor(minNeto / 60), minutos: minNeto % 60, total: minNeto / 60 };
}

/** @param {any} [tf] @param {any} [cr] */
function _aplicarCalculoHoras(r, e, s, tf = null, cr = null, calcularFn = calcularHoras) {
    const t = calcularFn(e, s, tf, cr);
    r.horas = t?.horas || 0; r.minutos = t?.minutos || 0; r.total = t?.total || 0;
    return t;
}

function _recalcularHorasSiValido(r, e = r.entrada, s = r.salida, tf = r.tiempoFuera || null, cr = r.credito || null) {
    const t = calcularHoras(e, s, tf, cr);
    if (t) { r.horas = t.horas; r.minutos = t.minutos; r.total = t.total; }
    return t;
}

function _construirRegistro(fecha, entrada, salida) {
    const e = entrada || null, s = salida || null;
    const t = calcularHoras(e, s, null);
    return {
        id: S.generarIDSeguro(), fecha, entrada: e, salida: s, tiempoFuera: null,
        horas: t?.horas || 0, minutos: t?.minutos || 0, total: t?.total || 0, objetivoHoras: horasDiarias
    };
}

/** @param {any} [idNuevo] */
async function guardarYActualizar(idNuevo = null, animarCard = false) {
    let saveSuccessful = false;
    try {
        if (typeof _perfilHooks.guardarDatosPerfilActual === 'function') {
            saveSuccessful = _perfilHooks.guardarDatosPerfilActual();
        } else {
            saveSuccessful = true;
        }
    } catch (e) {
        console.error('Error crítico al guardar:', e);
        saveSuccessful = false;
    }
    if (saveSuccessful) { notify.actualizarUI(idNuevo, false, animarCard); }
    else { notify.mostrarToast('Error al guardar. Almacenamiento lleno o bloqueado.', 'error'); }
    return saveSuccessful;
}

/** @param {any} [fase] */
async function _guardarConCicloSiHoy(idOrIds, esHoy, fase = null) {
    const ejecutar = async () => {
        if (esHoy && fase) notify.prepararMostrarFaseAlRenderizar(fase);
        const ok = await guardarYActualizar(idOrIds);
        if (!ok && esHoy && fase) notify.prepararMostrarFaseAlRenderizar(null);
        return ok;
    };
    return esHoy && vistaActual === 'semana'
        ? notify.forzarVista('diaria', ejecutar)
        : ejecutar();
}

export const EstadoApp = {
    configurarNotificaciones,
    _notify: () => notify,
    setPerfilHooks,
    setSincronizarPushHoyHook,
    sincronizarPushHoy: (...args) => _sincronizarPushHoyFn(...args),
    obtenerPerfilIdActual,
    registros: () => registros,
    _setRegistros: (v) => { registros = v; },
    diasHabiles: () => diasHabiles,
    setDiasHabiles: (v) => { diasHabiles = v; },
    horasDiarias: () => horasDiarias,
    setHorasDiarias: (v) => { horasDiarias = v; },
    horasSemanales: () => (horasDiarias * diasHabiles.length),
    historialDiasHabiles: () => historialDiasHabiles,
    _setHistorialDiasHabilesRaw: (v) => { historialDiasHabiles = v; },
    editandoId: () => editandoId,
    setEditandoId: (id) => { editandoId = id; },
    vistaActual: () => vistaActual,
    setVistaActual: (v) => { vistaActual = v; },
    getIgnorarTiempoFuera: () => ignorarTiempoFuera,
    setIgnorarTiempoFuera: (v) => { ignorarTiempoFuera = v; },
    getFiltroState: () => ({ filtroActivo, filtroDesde, filtroHasta, filtroTipo }),
    setFiltroState: ({ activo, desde, hasta, tipo }) => {
        filtroActivo = !!activo;
        filtroDesde = desde ?? null;
        filtroHasta = hasta ?? null;
        filtroTipo = tipo ?? null;
    },
    getGrupoEnEdicion: () => grupoEnEdicion,
    setGrupoEnEdicion: (val) => { grupoEnEdicion = val; },
    ordenarRegistros,
    _ordenarRegistros: ordenarRegistros,
    registroPorFecha,
    registroPorId,
    existeRegistroEnFecha,
    _hayEspacioParaRegistros,
    _fechaFuturaInvalida,
    calcularHoras,
    _aplicarCalculoHoras,
    _recalcularHorasSiValido,
    _construirRegistro,
    guardarYActualizar,
    _guardarConCicloSiHoy
};
