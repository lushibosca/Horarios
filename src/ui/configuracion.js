import { Preferencias } from '../core/preferencias.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { $, alClic } from '../core/dom.js';
import { Movimiento } from '../core/movimiento.js';
import { EstiloCalendario } from '../core/estilo-calendario.js';
import { EstiloTarjeta } from '../core/estilo-tarjeta.js';
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
import { EstadoApp } from '../services/estado-app.js';
import { _crearPressHold, debounce } from './gestos.js';
import { _scrollHastaVisible, _scrollA } from './scroll.js';
import { mostrarToast } from './toast.js';
import { Animaciones } from './animaciones.js';
import { VistaPrevia } from './vista-previa.js';
import { TarjetaEstilos } from './tarjeta-estilos.js';
import { AyudaBuscador } from './ayuda-buscador.js';
import { AvisoJornada } from '../services/aviso-jornada.js';
import { DiasHabiles } from '../services/dias-habiles.js';
import { Objetivos } from '../services/objetivos.js';

// ====================================================================
// UI CONFIG MODULE (configuración, ayuda, tema y steppers)
// ====================================================================
const {
    _abrirModalConPadre, _cerrarModalConPadre, _crearToggleConfig, _setBtnDisabled, _flashCampo
} = UIBase;
const { _esperarAnim, _animarValor } = Animaciones;

const _reprogramarPushDebounced = debounce(() => AvisoJornada.sincronizarHoy(), 400);

const verificarBloqueoCredito = (...args) => EstadoApp._notify().verificarBloqueoCredito(...args);
const actualizarUI = (...args) => EstadoApp._notify().actualizarUI(...args);
const { getFondoCard, _getLabelFondo, toggleFondoCard } = TarjetaFondos;
const _refrescarFormatoCortoStatsCache = () => EventosApp.emit('config:formato-corto-stats');
const { actualizarEstadoBotonPersistir } = OrdenTarjetas;
const { actualizarEstadoBotonNotificaciones } = Notificaciones;

function elegirTema(tema) {
    Almacenamiento.setItem(STORAGE_KEYS.TEMA_OSCURO, tema);
    GestorTemas.aplicarTema(tema);
}

function alternarTema() {
    elegirTema(GestorTemas.siguienteTema(GestorTemas.temaGuardado()));
}

const { toggle: toggleIgnorarTiempoFuera, actualizarEstado: actualizarEstadoBotonIgnorarTF } =
    _crearToggleConfig({
        getVal: () => EstadoApp.getIgnorarTiempoFuera(),
        setVal: (v) => { EstadoApp.setIgnorarTiempoFuera(v); Preferencias.IGNORAR_TF.set(v); },
        btnId: 'btn-toggle-ignorar-tf',
        onAfterToggle: () => { GestionDatos.recalcularTotalesEnMemoria(true); EstadoApp.guardarYActualizar(); AvisoJornada.sincronizarHoy(); },
    });

const { toggle: toggleHoverPopupCalendario, actualizarEstado: actualizarEstadoBotonHoverPopup } =
    _crearToggleConfig({
        getVal: () => Preferencias.HOVER_POPUP.get(),
        setVal: (v) => Preferencias.HOVER_POPUP.set(v),
        btnId: 'btn-toggle-hover-popup',
    });

const { toggle: toggleLogicaCubierto, actualizarEstado: actualizarEstadoBotonLogicaCubierto } =
    _crearToggleConfig({
        getVal: () => Preferencias.IGNORAR_LOGICA_CUBIERTO.get(),
        setVal: (v) => Preferencias.IGNORAR_LOGICA_CUBIERTO.set(v),
        btnId: 'btn-toggle-logica-cubierto',
        onAfterToggle: () => { actualizarUI(); }
    });

const { toggle: toggleObjetivoPorRegistro, actualizarEstado: actualizarEstadoBotonObjetivoPorRegistro } =
    _crearToggleConfig({
        getVal: () => Preferencias.IGNORAR_OBJETIVO_POR_REGISTRO.get(),
        setVal: (v) => Preferencias.IGNORAR_OBJETIVO_POR_REGISTRO.set(v),
        btnId: 'btn-toggle-objetivo-registro',
        onAfterToggle: () => { actualizarUI(); actualizarEstadoBotonAplicarHoras(); _reprogramarPushDebounced(); }
    });

const { toggle: toggleFormatoCortoStats, actualizarEstado: actualizarEstadoBotonFormatoCortoStats } =
    _crearToggleConfig({
        getVal: () => Preferencias.FORMATO_CORTO_STATS.get(),
        setVal: (v) => Preferencias.FORMATO_CORTO_STATS.set(v),
        btnId: 'btn-toggle-formato-corto-stats',
        onAfterToggle: () => { _refrescarFormatoCortoStatsCache(); actualizarUI(); }
    });

const { toggle: toggleRuedaCalendario, actualizarEstado: actualizarEstadoBotonRuedaCalendario } =
    _crearToggleConfig({
        getVal: () => Preferencias.RUEDA_CALENDARIO.get(),
        setVal: (v) => Preferencias.RUEDA_CALENDARIO.set(v),
        btnId: 'btn-toggle-rueda-calendario',
        onAfterToggle: () => { EventosApp.emit('config:rueda-calendario'); }
    });

// El estilo de la tarjeta de estado (EstiloTarjeta) rota con un solo botón. Con el estilo "Barra con hitos" (el antiguo hint integrado) aparece la opción de animación de los hitos, con tres estados en un solo botón:
// Desactivado (sin ciclo automático del número grande), Barra (cada hito con su descripción desplegada en la barra) y Texto (el nombre del hito en el número grande, el predeterminado).
// Se guardan en CICLO_HINT_AUTO (false = desactivado) y DESC_HITOS_NUMERO (barra o texto).
const _MODOS_ANIM_HINT = ['off', 'barra', 'texto'];
const _ETIQUETAS_ANIM_HINT = { off: 'Desactivado', barra: 'Barra', texto: 'Texto' };

function _modoAnimHint() {
    if (!Preferencias.CICLO_HINT_AUTO.get()) return 'off';
    return Preferencias.DESC_HITOS_NUMERO.get() ? 'texto' : 'barra';
}

// Cada toque pasa al estilo siguiente y redibuja la tarjeta
function toggleEstiloTarjeta() {
    EstiloTarjeta.siguiente();
    EventosApp.emit('config:hint-integrado');
    // todo el contenido de la tarjeta se funde del diseño anterior al nuevo, igual que al pasar de día a semana (y el alto se anima, ver _animarAlturaCard)
    EstadoApp._notify().cambiarConFundido(() => actualizarUI());
}

/** Cierra Ajustes (sin volver al modal padre) para dejar la página libre durante la vista previa; al terminar se reabre. */
function _cerrarAjustesParaVistaPrevia() {
    GestorModales.cerrar('modal-config');
}

function _volverAAjustes() {
    GestorModales.abrir('modal-config', _precargarCamposConfig);
}

// Tocar la opción del estilo de la tarjeta no lo cambia a ciegas: cierra Ajustes, lleva la tarjeta de estado a la vista y deja abajo los controles
// para probar los estilos en vivo (la tarjeta se puede tocar para ver el día y la semana)
/** @param {boolean} [desdeAjustes] con false (el atajo de mantener la tarjeta) no hay Ajustes que cerrar ni al que volver */
function abrirVistaPreviaTarjeta(desdeAjustes = true) {
    VistaPrevia.abrir(_configTarjeta(desdeAjustes));
}

/** @param {boolean} [desdeAjustes] */
function _configTarjeta(desdeAjustes = true) {
    return {
        id: 'tarjeta',
        titulo: 'Tarjeta de estado',
        idObjetivo: 'stats-card',
        antes: desdeAjustes ? _cerrarAjustesParaVistaPrevia : undefined,
        alCerrar: desdeAjustes ? _volverAAjustes : undefined,
        // las subopciones arriba y las filas fijas (estilo y fondo) al final: el panel crece hacia arriba y esas filas no cambian de lugar (ver VistaPrevia.abrir)
        filas: [
            {
                etiqueta: 'Disposición', valor: () => EstiloTarjeta.etiquetaDisposicion(),
                alTocar: toggleDisposicionLinea, visible: () => EstiloTarjeta.actual() === 'linea' && _esPC()
            },
            {
                etiqueta: 'Disposición', valor: () => EstiloTarjeta.etiquetaMosaicos(),
                alTocar: toggleMosaicosLinea, visible: () => EstiloTarjeta.actual() === 'linea' && !_esPC()
            },
            {
                etiqueta: 'Disposición', valor: () => EstiloTarjeta.etiquetaAnillo(),
                alTocar: toggleDisposicionAnillo, visible: () => EstiloTarjeta.actual() === 'anillo'
            },
            {
                etiqueta: 'Animación', icono: '#icon-eye', valor: () => _ETIQUETAS_ANIM_HINT[_modoAnimHint()],
                alTocar: toggleAnimacionHint, visible: () => EstiloTarjeta.hintIntegrado()
            },
            { etiqueta: 'Estilo', valor: () => EstiloTarjeta.etiqueta(), alTocar: toggleEstiloTarjeta },
            // siempre visible (no es una subopción de un estilo): el fondo de la tarjeta, el mismo de Ajustes > Apariencia
            { etiqueta: 'Fondo', icono: '#icon-landscape', valor: () => _getLabelFondo(getFondoCard()), alTocar: toggleFondoCard }
        ]
    };
}

// Atajo desde las tarjetas (mantener y soltar sin mover, ver orden-tarjetas.js): abre la vista previa de su estilo, salvo que haya un modal u otra vista previa
EventosApp.on('tarjeta:personalizar', (datos) => {
    if (VistaPrevia.activa() || document.querySelector('.modal.show') || document.body.classList.contains('config-onboarding')) return;
    if (datos?.tarjeta === 'estado') abrirVistaPreviaTarjeta(false);
    else if (datos?.tarjeta === 'calendario') abrirVistaPreviaCalendario(false);
    else if (datos?.tarjeta === 'tema') VistaPrevia.abrir(_configTema(false));
});

/** @param {boolean} [desdeAjustes] */
function abrirVistaPreviaCalendario(desdeAjustes = true) {
    VistaPrevia.abrir(_configCalendario(desdeAjustes));
}

/** @param {boolean} [desdeAjustes] */
function _configCalendario(desdeAjustes = true) {
    return {
        id: 'calendario',
        titulo: 'Calendario',
        idObjetivo: 'card-historico',
        antes: desdeAjustes ? _cerrarAjustesParaVistaPrevia : undefined,
        alCerrar: desdeAjustes ? _volverAAjustes : undefined,
        filas: [
            { etiqueta: 'Estilo', icono: '#icon-calendar-simple', valor: () => EstiloCalendario.etiqueta(), alTocar: toggleEstiloCalendario }
        ]
    };
}

// El tema no tiene tarjeta ni filas: se ve toda la página y se elige con círculos de color. Se abre desde el encabezado (mantener y soltar, ver header-posicion.js),
// desde el botón de tema del selector de perfiles (que se oculta mientras, conservando su entrada del historial, y se reabre al terminar) o pasando a él desde las otras vistas
/** @param {boolean} [desdeSelector] con true (el botón del selector de perfiles) hay un modal que cerrar y al que volver */
function _configTema(desdeSelector = false) {
    return {
        id: 'tema',
        titulo: 'Tema',
        sinVelo: true,
        antes: desdeSelector ? () => GestorModales.cerrar('modal-selector-perfiles', null, { sinHistorial: true }) : undefined,
        alCerrar: desdeSelector ? () => GestorModales.abrir('modal-selector-perfiles', null, { sinHistorial: true }) : undefined,
        filas: [],
        circulos: { opciones: GestorTemas.muestras(), actual: () => GestorTemas.temaGuardado(), alElegir: elegirTema }
    };
}

// Las tres vistas previas están integradas: desde el panel se pasa de una a otra (tocando las flechas del título o deslizando en pantallas táctiles)
VistaPrevia.registrarVista('tarjeta', () => _configTarjeta(false));
VistaPrevia.registrarVista('calendario', () => _configCalendario(false));
VistaPrevia.registrarVista('tema', () => _configTema());
VistaPrevia.definirOrden(['tarjeta', 'calendario', 'tema']);

/** PC (mouse): mismo criterio que .config-solo-pc / .config-solo-movil en responsivo-movimiento.css. Las subopciones de la línea de tiempo se muestran según el dispositivo. */
const _esPC = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Solo cambia un atributo de <html>: el CSS reacciona al instante, sin redibujar la tarjeta
function toggleDisposicionLinea() {
    TarjetaEstilos.reubicar(() => EstiloTarjeta.siguienteDisposicion());   // lo que se mueve en la tarjeta viaja a su lugar nuevo
}

function toggleDisposicionAnillo() {
    TarjetaEstilos.reubicar(() => EstiloTarjeta.siguienteAnillo());
}

function toggleMosaicosLinea() {
    TarjetaEstilos.reubicar(() => EstiloTarjeta.siguienteMosaicos());
}

function toggleAnimacionHint() {
    const siguiente = _MODOS_ANIM_HINT[(_MODOS_ANIM_HINT.indexOf(_modoAnimHint()) + 1) % _MODOS_ANIM_HINT.length];
    Preferencias.CICLO_HINT_AUTO.set(siguiente !== 'off');
    if (siguiente !== 'off') Preferencias.DESC_HITOS_NUMERO.set(siguiente === 'texto');
    EventosApp.emit('config:hint-integrado');
    actualizarUI();
}

const { toggle: toggleMetricaUso, actualizarEstado: actualizarEstadoBotonMetricaUso } =
    _crearToggleConfig({
        getVal: () => Preferencias.STATS_HABILITADO.get(),
        setVal: (v) => Preferencias.STATS_HABILITADO.set(v),
        btnId: 'btn-toggle-metrica-uso',
    });

function actualizarEstadoBotonAplicarHoras() {
    const modoGlobal = Preferencias.IGNORAR_OBJETIVO_POR_REGISTRO.get();
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
        `Se va a reemplazar el objetivo horario de ${TiempoUtils.contar(totalRegistros, 'registro')} existente${TiempoUtils.pluralizar(totalRegistros)} por ${TiempoUtils.horasATexto(horas, 'short')}.`,
        'Aplicar',
        '#icon-aplicar-horas'
    );
    if (!confirmado) return;

    const { aplicados, creditosRecalculados } = Objetivos.aplicarHorasATodosLosRegistros();
    const guardado = await EstadoApp.guardarYActualizar();
    if (guardado) {
        actualizarUI();
        _reprogramarPushDebounced();
        let mensaje = aplicados > 0
            ? `Objetivo actualizado en ${TiempoUtils.contar(aplicados, 'registro')}`
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

// Cada toque pasa al estilo siguiente; el CSS reacciona solo al atributo de <html>, así que el calendario cambia al instante
function toggleEstiloCalendario() {
    // los estilos miden distinto (el alto de las celdas cambia): la tarjeta de Registros acompaña el cambio con una transición de alto
    Animaciones._animarAlturaCambio($('card-historico'), () => EstiloCalendario.siguiente());
}

function _refrescarTogglesConfig() {
    actualizarEstadoBotonIgnorarTF();
    actualizarEstadoBotonLogicaCubierto();
    actualizarEstadoBotonObjetivoPorRegistro();
    actualizarEstadoBotonAplicarHoras();
    actualizarHintAnimaciones();
    // Un respaldo restaurado puede cambiarlos sin recargar la app
    actualizarEstadoBotonFormatoCortoStats();
    actualizarEstadoBotonHoverPopup();
    actualizarEstadoBotonRuedaCalendario();
    actualizarEstadoBotonPersistir();
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
        if (huboCambio) DiasHabiles.registrarCambioDiasHabiles(nuevosDias);
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
    VistaPrevia.bindEventos();
    alClic({
        'btn-toggle-ignorar-tf': () => toggleIgnorarTiempoFuera(),
        'btn-toggle-hover-popup': () => toggleHoverPopupCalendario(),
        'btn-toggle-animaciones': () => toggleReducirAnimaciones(),
        // las dos abren la vista previa en vivo: los estilos, subopciones y el fondo se eligen ahí
        'btn-personalizar-tarjeta': () => abrirVistaPreviaTarjeta(),
        'btn-personalizar-calendario': () => abrirVistaPreviaCalendario(),
        'btn-toggle-logica-cubierto': () => toggleLogicaCubierto(),
        'btn-toggle-objetivo-registro': () => toggleObjetivoPorRegistro(),
        'btn-toggle-rueda-calendario': () => toggleRuedaCalendario(),
        'btn-toggle-metrica-uso': () => toggleMetricaUso(),
        'btn-toggle-formato-corto-stats': () => toggleFormatoCortoStats(),
        'btn-aplicar-horas-todos': () => aplicarHorasConfiguradasATodos(),
        'btn-ayuda-perfiles': () => abrirModalAyuda(),
        'btn-ayuda-config': () => abrirModalAyuda(),
    });
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
    // en el selector de perfiles el botón de tema abre la personalización del tema; el de Ajustes (que solo se ve en el onboarding) sigue cambiando el tema directo
    $('theme-toggle-modal')?.addEventListener('click', () => { if (!VistaPrevia.activa()) VistaPrevia.abrir(_configTema(true)); });
    $('theme-toggle-config')?.addEventListener('click', () => alternarTema());
}

export const Configuracion = {
    actualizarEstadoBotonIgnorarTF, actualizarEstadoBotonHoverPopup, actualizarEstadoBotonRuedaCalendario,
    actualizarEstadoBotonLogicaCubierto, actualizarEstadoBotonObjetivoPorRegistro,
    actualizarEstadoBotonFormatoCortoStats, actualizarEstadoBotonMetricaUso, actualizarEstadoBotonAplicarHoras, cerrarConfig,
    cerrarModalAyuda, _precargarCamposConfig, refrescarConfigSiVisible, mostrarConfigOnboarding, mostrarConfigEnAjuste,
    pressHoldObjetivoEdicion, formatearInput, bindEventos
};
