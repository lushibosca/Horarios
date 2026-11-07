import { STORAGE_KEYS, DEFAULTS } from '../core/constantes.js';
import { $, setColapsable } from '../core/dom.js';
import { Movimiento } from '../core/movimiento.js';
import { EstiloCalendario } from '../core/estilo-calendario.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorTemas } from './gestor-temas.js';
import { GestorModales } from './gestor-modales.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { UIBase } from './base.js';
import { TarjetaFondos } from './tarjeta-fondos.js';
import { OrdenTarjetas } from './orden-tarjetas.js';
import { Notificaciones } from './notificaciones.js';
import { EventosApp } from '../core/eventos.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { _crearPressHold, debounce } from './gestos.js';
import { _scrollHastaVisible, _scrollA } from './scroll.js';
import { mostrarToast } from './toast.js';
import { Animaciones } from './animaciones.js';
import { AyudaBuscador } from './ayuda-buscador.js';
import { AvisoJornada } from '../services/aviso-jornada.js';

// ====================================================================
// UI CONFIG MODULE (configuración, ayuda, tema y steppers)
// ====================================================================
const {
    _abrirModalConPadre, _cerrarModalConPadre, _crearToggleConfig, _setBtnDisabled, _setBtnActivo, _flashCampo
} = UIBase;
const { _esperarAnim, _animarValor } = Animaciones;

const _reprogramarPushDebounced = debounce(() => AvisoJornada.sincronizarHoy(), 400);

const verificarBloqueoCredito = (...args) => EstadoApp._notify().verificarBloqueoCredito(...args);
const actualizarUI = (...args) => EstadoApp._notify().actualizarUI(...args);
const { getFondoCard, _getLabelFondo } = TarjetaFondos;
const _refrescarFormatoCortoStatsCache = () => EventosApp.emit('config:formato-corto-stats');
const { actualizarEstadoBotonPersistir } = OrdenTarjetas;
const { actualizarEstadoBotonNotificaciones } = Notificaciones;

function alternarTema() {
    const temaActual = GestorTemas.temaGuardado();
    const temaSiguiente = GestorTemas.siguienteTema(temaActual);
    Almacenamiento.setItem(STORAGE_KEYS.TEMA_OSCURO, temaSiguiente);
    GestorTemas.aplicarTema(temaSiguiente);
}

const { toggle: toggleIgnorarTiempoFuera, actualizarEstado: actualizarEstadoBotonIgnorarTF } =
    _crearToggleConfig({
        getVal: () => EstadoApp.getIgnorarTiempoFuera(),
        setVal: (v) => { EstadoApp.setIgnorarTiempoFuera(v); Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_TF, v, true); },
        btnId: 'btn-toggle-ignorar-tf',
        onAfterToggle: () => { GestionDatos.recalcularTotalesEnMemoria(true); EstadoApp.guardarYActualizar(); AvisoJornada.sincronizarHoy(); },
    });

const { toggle: toggleHoverPopupCalendario, actualizarEstado: actualizarEstadoBotonHoverPopup } =
    _crearToggleConfig({
        getVal: () => Almacenamiento.getBoolean(STORAGE_KEYS.HOVER_POPUP, false),
        setVal: (v) => Almacenamiento.setItem(STORAGE_KEYS.HOVER_POPUP, v),
        btnId: 'btn-toggle-hover-popup',
    });

const { toggle: toggleLogicaCubierto, actualizarEstado: actualizarEstadoBotonLogicaCubierto } =
    _crearToggleConfig({
        getVal: () => Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, false, true),
        setVal: (v) => Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, v, true),
        btnId: 'btn-toggle-logica-cubierto',
        onAfterToggle: () => { actualizarUI(); }
    });

const { toggle: toggleObjetivoPorRegistro, actualizarEstado: actualizarEstadoBotonObjetivoPorRegistro } =
    _crearToggleConfig({
        getVal: () => Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true),
        setVal: (v) => Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, v, true),
        btnId: 'btn-toggle-objetivo-registro',
        onAfterToggle: () => { actualizarUI(); actualizarEstadoBotonAplicarHoras(); _reprogramarPushDebounced(); }
    });

const { toggle: toggleFormatoCortoStats, actualizarEstado: actualizarEstadoBotonFormatoCortoStats } =
    _crearToggleConfig({
        getVal: () => Almacenamiento.getBoolean(STORAGE_KEYS.FORMATO_CORTO_STATS, false),
        setVal: (v) => Almacenamiento.setItem(STORAGE_KEYS.FORMATO_CORTO_STATS, v),
        btnId: 'btn-toggle-formato-corto-stats',
        onAfterToggle: () => { _refrescarFormatoCortoStatsCache(); actualizarUI(); }
    });

const { toggle: toggleRuedaCalendario, actualizarEstado: actualizarEstadoBotonRuedaCalendario } =
    _crearToggleConfig({
        getVal: () => Almacenamiento.getBoolean(STORAGE_KEYS.RUEDA_CALENDARIO, DEFAULTS.RUEDA_CALENDARIO),
        setVal: (v) => Almacenamiento.setItem(STORAGE_KEYS.RUEDA_CALENDARIO, v),
        btnId: 'btn-toggle-rueda-calendario',
        onAfterToggle: () => { EventosApp.emit('config:rueda-calendario'); }
    });

// "Hint integrado" es un interruptor (HINT_INTEGRADO). Con él activo aparece la opción de animación de los hitos, con tres estados en un solo botón:
// Desactivado (sin ciclo automático del número grande), Barra (cada hito con su descripción desplegada en la barra) y Texto (el nombre del hito en el número grande, el predeterminado).
// Se guardan en CICLO_HINT_AUTO (false = desactivado) y DESC_HITOS_NUMERO (barra o texto).
const _MODOS_ANIM_HINT = ['off', 'barra', 'texto'];
const _ETIQUETAS_ANIM_HINT = { off: 'Desactivado', barra: 'Barra', texto: 'Texto' };

function _modoAnimHint() {
    if (!Almacenamiento.getBoolean(STORAGE_KEYS.CICLO_HINT_AUTO, DEFAULTS.CICLO_HINT_AUTO)) return 'off';
    return Almacenamiento.getBoolean(STORAGE_KEYS.DESC_HITOS_NUMERO, DEFAULTS.DESC_HITOS_NUMERO) ? 'texto' : 'barra';
}

function actualizarEstadoBotonHintIntegrado(animar = false) {
    const activo = Almacenamiento.getBoolean(STORAGE_KEYS.HINT_INTEGRADO, DEFAULTS.HINT_INTEGRADO);
    _setBtnActivo('btn-toggle-hint-integrado', activo);
    // la animación solo tiene sentido con el hint integrado: sin él, la opción se pliega (sin animar al cargar o al restaurar un respaldo)
    // si ya está en ese estado no se toca: el evento 'config:hint-integrado' que emite el toggle vuelve acá sin animar y cortaría la transición en curso
    const colapsable = $('hint-animacion-colapsable');
    if (colapsable && colapsable.classList.contains('expanded') !== activo) setColapsable(colapsable, activo, { animar });
    const lbl = $('hint-animacion-label');
    if (lbl) lbl.textContent = _ETIQUETAS_ANIM_HINT[_modoAnimHint()];
}

// Al restaurar un respaldo o bajar de Gist cambia la opción: se actualiza la etiqueta
EventosApp.on('config:hint-integrado', () => actualizarEstadoBotonHintIntegrado());

function toggleHintIntegrado() {
    Almacenamiento.setItem(STORAGE_KEYS.HINT_INTEGRADO, !Almacenamiento.getBoolean(STORAGE_KEYS.HINT_INTEGRADO, DEFAULTS.HINT_INTEGRADO));
    actualizarEstadoBotonHintIntegrado(true);
    EventosApp.emit('config:hint-integrado');
    actualizarUI();
}

function toggleAnimacionHint() {
    const siguiente = _MODOS_ANIM_HINT[(_MODOS_ANIM_HINT.indexOf(_modoAnimHint()) + 1) % _MODOS_ANIM_HINT.length];
    Almacenamiento.setItem(STORAGE_KEYS.CICLO_HINT_AUTO, siguiente !== 'off');
    if (siguiente !== 'off') Almacenamiento.setItem(STORAGE_KEYS.DESC_HITOS_NUMERO, siguiente === 'texto');
    actualizarEstadoBotonHintIntegrado();
    EventosApp.emit('config:hint-integrado');
    actualizarUI();
}

const { toggle: toggleMetricaUso, actualizarEstado: actualizarEstadoBotonMetricaUso } =
    _crearToggleConfig({
        getVal: () => Almacenamiento.getBoolean(STORAGE_KEYS.STATS_HABILITADO, true),
        setVal: (v) => Almacenamiento.setItem(STORAGE_KEYS.STATS_HABILITADO, v),
        btnId: 'btn-toggle-metrica-uso',
    });

function actualizarEstadoBotonAplicarHoras() {
    const modoGlobal = Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true);
    _setBtnDisabled('btn-aplicar-horas-todos', modoGlobal);
}

async function aplicarHorasConfiguradasATodos() {
    const btn = $('btn-aplicar-horas-todos');
    if (btn && btn.disabled) return;

    const horas = EstadoApp.horasDiarias();
    const totalRegistros = EstadoApp.registros().length;
    if (totalRegistros === 0) {
        mostrarToast('No hay registros para actualizar', 'info');
        return;
    }

    const confirmado = await GestorModales.confirmar(
        `Se va a reemplazar el objetivo horario de ${totalRegistros} registro${TiempoUtils.pluralizar(totalRegistros)} existente${TiempoUtils.pluralizar(totalRegistros)} por ${TiempoUtils.horasATexto(horas, 'short')}.`,
        'Aplicar',
        '#icon-aplicar-horas'
    );
    if (!confirmado) return;

    const { aplicados, creditosRecalculados } = Compensatorios.aplicarHorasATodosLosRegistros();
    const guardado = await EstadoApp.guardarYActualizar();
    if (guardado) {
        actualizarUI();
        _reprogramarPushDebounced();
        let mensaje = aplicados > 0
            ? `Objetivo actualizado en ${aplicados} registro${TiempoUtils.pluralizar(aplicados)}`
            : 'Los registros ya tenían este objetivo';
        if (creditosRecalculados > 0) {
            mensaje += ` (${creditosRecalculados} con Salida Temprana recalculada)`;
        }
        mostrarToast(mensaje, 'success');
    }
}

let _resolverOnboarding = null;

function cerrarConfig() {
    if (document.body.classList.contains('config-onboarding')) {
        _esperarAnim().then(() => document.body.classList.remove('config-onboarding'));
        Almacenamiento.setItem(STORAGE_KEYS.BIENVENIDA_VISTA, true, true);
        if (_resolverOnboarding) {
            _resolverOnboarding();
            _resolverOnboarding = null;
        }
    }
    const padre = GestorModales.getPadre('modal-config');
    if (padre) {
        GestorModales.alternar('modal-config', padre);
    } else {
        GestorModales.cerrar('modal-config');
    }
}

function abrirModalAyuda() {
    AyudaBuscador.limpiar();
    _abrirModalConPadre('modal-ayuda');
}

function cerrarModalAyuda() {
    _cerrarModalConPadre('modal-ayuda');
}

const _ETIQUETAS_ANIMACIONES = { auto: 'Auto', on: 'Sí', off: 'No' };

function actualizarHintAnimaciones() {
    const lbl = $('hint-animaciones-label');
    if (lbl) lbl.textContent = _ETIQUETAS_ANIMACIONES[Movimiento.modo()];
}

function toggleReducirAnimaciones() {
    Movimiento.siguienteModo();
    actualizarHintAnimaciones();
}

function actualizarHintEstiloCalendario() {
    const lbl = $('hint-estilo-calendario-label');
    if (lbl) lbl.textContent = EstiloCalendario.etiqueta();
}

// Cada toque pasa al estilo siguiente; el CSS reacciona solo al atributo de <html>, así que el calendario cambia al instante
function toggleEstiloCalendario() {
    EstiloCalendario.siguiente();
    actualizarHintEstiloCalendario();
}

function _refrescarTogglesConfig() {
    actualizarEstadoBotonIgnorarTF();
    actualizarEstadoBotonLogicaCubierto();
    actualizarEstadoBotonObjetivoPorRegistro();
    actualizarEstadoBotonAplicarHoras();
    actualizarHintAnimaciones();
    actualizarHintEstiloCalendario();
}

function _precargarCamposConfig() {
    const elHoras = $('config-horas-diarias');
    elHoras.dataset.valor = String(EstadoApp.horasDiarias());
    elHoras.textContent = TiempoUtils.horasATexto(EstadoApp.horasDiarias(), 'short');

    const diasActivos = EstadoApp.diasHabiles();
    const checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="dia-habil"]'));
    checkboxes.forEach(cb => {
        cb.checked = diasActivos.includes(parseInt(cb.value));
        cb.onchange = actualizarFeedbackConfig;
    });

    actualizarFeedbackConfig();
    _refrescarTogglesConfig();
    actualizarEstadoBotonNotificaciones();
    const lbl = $('hint-fondo-label');
    if (lbl) lbl.textContent = _getLabelFondo(getFondoCard());
}

// Abre los ajustes directamente (sin pasar por el selector de perfiles)
function abrirConfig() {
    GestorModales.abrir('modal-config', _precargarCamposConfig);
}

function mostrarconfig() {
    GestorModales.alternar('modal-selector-perfiles', 'modal-config', null, _precargarCamposConfig);
}

function mostrarConfigEnAjuste(id) {
    GestorModales.abrir('modal-config', _precargarCamposConfig);
    setTimeout(async () => {
        const el = $(id);
        const cuerpo = /** @type {HTMLElement|null} */ (el?.closest('.modal-panel-body'));
        if (!el || !cuerpo) return;
        await _scrollHastaVisible(el, { contenedor: cuerpo });
        _flashCampo(id);
    }, 500);
}

function refrescarConfigSiVisible() {
    _refrescarTogglesConfig();
    if ($('modal-config')?.classList.contains('show')) {
        _precargarCamposConfig();
    }
}

function mostrarConfigOnboarding() {
    document.body.classList.add('config-onboarding');
    GestorModales.abrir('modal-config', _precargarCamposConfig);
    return new Promise(resolve => { _resolverOnboarding = resolve; });
}

function actualizarFeedbackConfig() {
    let checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="dia-habil"]:checked'));
    if (checkboxes.length === 0) {
        const vigentes = EstadoApp.diasHabiles();
        /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="dia-habil"]')).forEach(cb => { cb.checked = vigentes.includes(parseInt(cb.value)); });
        mostrarToast('Seleccioná al menos un día', 'error');
        checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="dia-habil"]:checked'));
    }
    const seleccionados = checkboxes.length;
    const horas = parseFloat($('config-horas-diarias').dataset.valor ?? '') || 0;
    const total = seleccionados * horas;

    const el = $('config-total-feedback');
    if (el) {
        if (horas === 0) el.textContent = 'Registro libre sin objetivos';
        else el.textContent = `Total semanal: ${TiempoUtils.horasATexto(total, 'short')}`;
    }

    if (seleccionados > 0) {
        const nuevosDias = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => a - b);
        const diasVigentes = [...EstadoApp.diasHabiles()].sort((a, b) => a - b);
        const huboCambio = nuevosDias.length !== diasVigentes.length
            || nuevosDias.some((d, i) => d !== diasVigentes[i]);
        if (huboCambio) Compensatorios.registrarCambioDiasHabiles(nuevosDias);
        EstadoApp.guardarYActualizar();
        if (huboCambio) _reprogramarPushDebounced();
    }
    actualizarEstadoBotonPersistir();
}

function _ajustarStepperHoras(el, incremento) {
    let valorActual = parseFloat(el.dataset.valor);
    if (isNaN(valorActual)) valorActual = EstadoApp.horasDiarias();
    const nuevoValor = Math.min(24, Math.max(0, valorActual + incremento));
    if (isNaN(nuevoValor)) return nuevoValor;
    el.dataset.valor = nuevoValor;
    _animarValor(el, TiempoUtils.horasATexto(nuevoValor, 'short'), Math.sign(nuevoValor - valorActual));
    return nuevoValor;
}

const pressHoldHoras = _crearPressHold(incremento => cambiarHorasDiarias(incremento));

function cambiarHorasDiarias(incremento) {
    const nuevoValor = _ajustarStepperHoras($('config-horas-diarias'), incremento);
    if (isNaN(nuevoValor)) return;

    EstadoApp.setHorasDiarias(nuevoValor);
    actualizarFeedbackConfig();
    _reprogramarPushDebounced();
}

const pressHoldObjetivoEdicion = _crearPressHold(incremento => cambiarObjetivoEdicion(incremento));

function cambiarObjetivoEdicion(incremento) {
    const el = $('edit-objetivo');
    if (!el) return;
    _ajustarStepperHoras(el, incremento);
    verificarBloqueoCredito();
}

function formatearInput(e) {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 4) v = v.substring(0, 4);
    if (v.length > 2) {
        e.target.value = v.substring(0, 2) + ':' + v.substring(2);
    } else {
        e.target.value = v;
    }
}

function bindEventos() {
    $('btn-toggle-ignorar-tf')?.addEventListener('click', () => toggleIgnorarTiempoFuera());
    $('btn-toggle-hover-popup')?.addEventListener('click', () => toggleHoverPopupCalendario());
    $('btn-toggle-animaciones')?.addEventListener('click', () => toggleReducirAnimaciones());
    $('btn-estilo-calendario')?.addEventListener('click', () => toggleEstiloCalendario());
    $('btn-toggle-logica-cubierto')?.addEventListener('click', () => toggleLogicaCubierto());
    $('btn-toggle-objetivo-registro')?.addEventListener('click', () => toggleObjetivoPorRegistro());
    $('btn-toggle-rueda-calendario')?.addEventListener('click', () => toggleRuedaCalendario());
    $('btn-toggle-hint-integrado')?.addEventListener('click', () => toggleHintIntegrado());
    $('btn-toggle-hint-animacion')?.addEventListener('click', () => toggleAnimacionHint());
    $('btn-toggle-metrica-uso')?.addEventListener('click', () => toggleMetricaUso());
    $('btn-toggle-formato-corto-stats')?.addEventListener('click', () => toggleFormatoCortoStats());
    $('btn-aplicar-horas-todos')?.addEventListener('click', () => aplicarHorasConfiguradasATodos());
    $('btn-ayuda-perfiles')?.addEventListener('click', () => abrirModalAyuda());
    $('btn-ayuda-config')?.addEventListener('click', () => abrirModalAyuda());
    document.querySelector('#modal-ayuda .btn-cancel')?.addEventListener('click', () => cerrarModalAyuda());
    AyudaBuscador.bindEventos();
    $('ayuda-indice')?.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest('.ayuda-indice-item'));
        if (!btn) return;
        _scrollA($(btn.dataset.target ?? ''), 'start');
    });
    document.querySelector('.config-actions .btn-delete')?.addEventListener('click', () => GestionDatos.borrarTodoHistorial());
    document.querySelector('#modal-config .modal-panel-footer .btn-cancel')?.addEventListener('click', () => cerrarConfig());
    const inputHoras = $('config-horas-diarias');
    if (inputHoras) {
        const btnHorasInc = $('btn-horas-diarias-inc');
        const btnHorasDec = $('btn-horas-diarias-dec');
        if (btnHorasInc) pressHoldHoras.vincular(btnHorasInc, 0.5);
        if (btnHorasDec) pressHoldHoras.vincular(btnHorasDec, -0.5);
    }
    const btnObjetivoInc = $('btn-edit-objetivo-inc');
    const btnObjetivoDec = $('btn-edit-objetivo-dec');
    if (btnObjetivoInc) pressHoldObjetivoEdicion.vincular(btnObjetivoInc, 0.5);
    if (btnObjetivoDec) pressHoldObjetivoEdicion.vincular(btnObjetivoDec, -0.5);
    document.querySelector('#modal-selector-perfiles .btn-settings')?.addEventListener('click', () => mostrarconfig());
    $('theme-toggle-modal')?.addEventListener('click', () => alternarTema());
    $('theme-toggle-config')?.addEventListener('click', () => alternarTema());
}

export const Configuracion = {
    actualizarEstadoBotonIgnorarTF, actualizarEstadoBotonHoverPopup, actualizarEstadoBotonRuedaCalendario,
    actualizarEstadoBotonLogicaCubierto, actualizarEstadoBotonObjetivoPorRegistro,
    actualizarEstadoBotonFormatoCortoStats, actualizarEstadoBotonHintIntegrado, actualizarEstadoBotonMetricaUso, actualizarEstadoBotonAplicarHoras, cerrarConfig,
    abrirModalAyuda, abrirConfig, alternarTema, cerrarModalAyuda, _precargarCamposConfig, refrescarConfigSiVisible, mostrarConfigOnboarding, mostrarConfigEnAjuste,
    pressHoldObjetivoEdicion, formatearInput, bindEventos
};
