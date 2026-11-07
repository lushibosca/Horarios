import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { Formularios } from './formularios.js';
import { EventosApp } from '../core/eventos.js';
import { Movimiento } from '../core/movimiento.js';
import { EstiloCalendario } from '../core/estilo-calendario.js';
import { InstaladorPWA } from './instalador-pwa.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { RecordatorioPush } from '../services/recordatorio-push.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorTemas } from './gestor-temas.js';
import { GestorPerfiles } from '../services/gestor-perfiles.js';
import { GestorModales } from './gestor-modales.js';
import { GestorHistorial } from '../services/gestor-historial.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { UIBase } from './base.js';
import { Perfiles } from './perfiles.js';
import { Calendario } from './calendario.js';
import { SincronizacionGist } from '../services/sincronizacion-gist.js';
import { GistRespaldo } from './gist-respaldo.js';
import { RespaldoLocal } from './respaldo-local.js';
import { Historico } from './historico.js';
import { HistoricoEdicion } from './historico-edicion.js';
import { Estadisticas } from './estadisticas.js';
import { Reportes } from './reportes.js';
import { TarjetaFichaje } from './tarjeta-fichaje.js';
import { TarjetaFichajeVista } from './tarjeta-fichaje-vista.js';
import { CicloStats } from './tarjeta-ciclo-stats.js';
import { TarjetaFondos } from './tarjeta-fondos.js';
import { TarjetaTiempoFuera } from './tarjeta-tiempo-fuera.js';
import { TarjetaLote } from './tarjeta-lote.js';
import { OrdenTarjetas } from './orden-tarjetas.js';
import { Notificaciones } from './notificaciones.js';
import { Configuracion } from './configuracion.js';
import { HistorialDias } from './historial-dias.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { resetearBoton, restaurarBotonGuardarEdicion, animarExitoFichaje } from './boton-fichar.js';
import { registrarSwipe, debounce } from './gestos.js';
import { mostrarToast, _habilitarCierreToast } from './toast.js';
import { Animaciones } from './animaciones.js';

const {
    _actualizarOffsetsStickyMes, actualizarOffsetsStickyMesDebounced, mostrarError, limpiarError,
    obtenerNombrePerfilSafe, descargarJSON, _avisarFichaje, aplicarFeedbackCampos
} = UIBase;
const { _esperarAnim } = Animaciones;

const {
    crearPerfilDesdeSelector, cerrarSelectorPerfiles, cerrarEditorPerfil
} = Perfiles;

const {
    _cerrarSelectorMeses, toggleVistaHistorico, setVistaHistoricoCalendario
} = Calendario;

const {
    actualizarBotonesHistorico, cerrarModalGist, gistMergeCancelar, gistSubir, gistBajar
} = GistRespaldo;

const { cerrarImportar, cerrarExportar, toggleCamposRangoExport } = RespaldoLocal;

const {
    _initListenerAccionesLista, _initListenerToggleAnio, _initListenerToggleMes
} = Historico;

const {
    cerrarEdicion, setBloqueoEdicion, _actualizarHintEdicion, actualizarHintGrupo, cerrarFiltros,
    iniciarTimerAutoCierreBotones, verificarBloqueoCredito, setBloqueoEdicionGrupo, cerrarEdicionGrupo,
    setTiempoExpansionBotones
} = HistoricoEdicion;

const {
    _bindStatItemPopups, toggleStats, setModoEstadisticas
} = Estadisticas;

const { cerrarModalReporteSecciones } = Reportes;

const {
    actualizarUI, alternarVista, _forzarVista, setTimerAutoVista, _retenerRegistroAyer
} = TarjetaFichaje;
const { iniciar: _iniciarCicloStatsSiempre, detener: _detenerCicloStats, prepararFase: _prepararMostrarFaseAlRenderizar } = CicloStats;

const { _refrescarFormatoCortoStatsCache, _cicloAutoActivo } = TarjetaFichajeVista;
// con el hint integrado y la animación de los hitos en Desactivado no hay ciclo automático (ni al cargar ni al volver a la pestaña)
const _iniciarCicloStats = (...args) => (_cicloAutoActivo() ? _iniciarCicloStatsSiempre(...args) : false);

const { setFondoCard } = TarjetaFondos;
const { actualizarEstadoBotonTimerMain } = TarjetaTiempoFuera;
const { toggleModoLote, poblarSelectoresTipos, actualizarBotonLote, toggleFormulario } = TarjetaLote;

const {
    aplicarVisibilidadCards, obtenerOrdenCards, aplicarOrdenCards, iniciarDragOrdenCards, iniciarDragTarjetas
} = OrdenTarjetas;

const {
    actualizarEstadoBotonNotificaciones, actualizarEstadoBotonPushBuffer,
    actualizarEstadoBotonPushHabilitado, actualizarSelectPushAnticipacion,
    _suscribirCambiosPermisoNotificaciones, cerrarModalNotificaciones
} = Notificaciones;

const {
    actualizarEstadoBotonIgnorarTF, actualizarEstadoBotonHoverPopup, actualizarEstadoBotonRuedaCalendario,
    actualizarEstadoBotonLogicaCubierto, actualizarEstadoBotonObjetivoPorRegistro,
    actualizarEstadoBotonFormatoCortoStats, actualizarEstadoBotonHintIntegrado, actualizarEstadoBotonMetricaUso, actualizarEstadoBotonAplicarHoras, cerrarConfig,
    cerrarModalAyuda, refrescarConfigSiVisible, formatearInput
} = Configuracion;

const {
    cerrarModalHistorialDias, cerrarEditorTramoDias
} = HistorialDias;

function _suscribirEventosServicios() {
    EventosApp.on('historial:cambio', ({ canUndo, canRedo }) => {
        const undoBtn = $('btn-undo');
        const redoBtn = $('btn-redo');
        if (undoBtn) undoBtn.disabled = !canUndo;
        if (redoBtn) redoBtn.disabled = !canRedo;
    });
    EventosApp.on('perfil:cambio', ({ nombre }) => {
        const el = $('nombre-perfil-header');
        if (el) el.textContent = nombre;
    });
    EventosApp.on('filtros:cambio', ({ activo }) => {
        $('btn-filtro')?.classList.toggle('filtro-activo', activo);
    });
}

function _initGlobales() {
    _suscribirEventosServicios();
    GestorPerfiles.inicializar();
    
    EstadoApp.configurarNotificaciones({
        abrirModal: GestorModales.abrir,
        actualizarEstadoBotonTimerMain, actualizarHintGrupo, actualizarUI,
        animarExitoFichaje, aplicarFeedbackCampos, cerrarEdicion, cerrarEdicionGrupo, cerrarFiltros, cerrarImportar,
        cerrarTodosModales: GestorModales.cerrarTodos,
        confirmarModal: GestorModales.confirmar,
        descargarJSON, avisarFichaje: _avisarFichaje, iniciarTimerAutoCierreBotones, limpiarError, mostrarError, mostrarToast,
        obtenerNombrePerfilSafe, resetearBoton, restaurarBotonGuardarEdicion, setBloqueoEdicion,
        setBloqueoEdicionGrupo, temaGuardado: GestorTemas.temaGuardado, verificarBloqueoCredito,
        formularioRegistro: Formularios.registro, formularioEdicion: Formularios.edicion,
        leerObjetivoEdicion: () => parseFloat($('edit-objetivo')?.dataset.valor ?? ''),
        hayUIBloqueante: () => !!document.querySelector('.modal.show') || document.body.classList.contains('config-onboarding'),
        forzarVista: _forzarVista, prepararMostrarFaseAlRenderizar: _prepararMostrarFaseAlRenderizar, retenerRegistroAyer: _retenerRegistroAyer, refrescarConfigSiVisible
    });
    Almacenamiento.configurarNotificaciones({ mostrarToast });
    RecordatorioPush.configurarNotificaciones({ mostrarToast });

    GestorModales.registrarAccionVolver('modal-gist', cerrarModalGist);
    GestorModales.registrarAccionVolver('modal-gist-merge', gistMergeCancelar);
    GestorModales.registrarAccionVolver('modal-config', cerrarConfig);
    GestorModales.registrarAccionVolver('modal-selector-perfiles', cerrarSelectorPerfiles);
    GestorModales.registrarAccionVolver('modal-editar', cerrarEdicion);
    GestorModales.registrarAccionVolver('modal-importar', cerrarImportar);
    GestorModales.registrarAccionVolver('modal-exportar', cerrarExportar);
    GestorModales.registrarAccionVolver('modal-editar-perfil', cerrarEditorPerfil);
    GestorModales.registrarAccionVolver('modal-editar-grupo', cerrarEdicionGrupo);
    GestorModales.registrarAccionVolver('modal-reporte-secciones', cerrarModalReporteSecciones);
    GestorModales.registrarAccionVolver('modal-ayuda', cerrarModalAyuda);
    GestorModales.registrarAccionVolver('modal-historial-dias', cerrarModalHistorialDias);
    GestorModales.registrarAccionVolver('modal-notificaciones', cerrarModalNotificaciones);
    GestorModales.registrarAccionVolver('modal-editar-tramo-dias', cerrarEditorTramoDias);
}

function _initListenersFormulario() {
    const verificarBloqueCreditoDebounced = debounce(verificarBloqueoCredito, 200);

    ['entrada', 'salida'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', formatearInput);
        if (el) el.addEventListener('input', () => limpiarError(id, null));
    });
    $('fecha')?.addEventListener('change', () => limpiarError('fecha', null));

    ['edit-entrada', 'edit-salida'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('input', (e) => { formatearInput(e); verificarBloqueCreditoDebounced(); });
        el.addEventListener('change', verificarBloqueoCredito);
    });

    $('calendario-selector-meses')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) _cerrarSelectorMeses();
    });

    const tf = $('edit-tiempo-fuera');
    if (tf) tf.addEventListener('input', (e) => { formatearInput(e); verificarBloqueCreditoDebounced(); });

    const notasEl = $('edit-notas');
    if (notasEl) notasEl.addEventListener('input', () => {
        const v = notasEl.value;
        const filtrado = S.sanitizeNotas(v);
        if (filtrado !== v) {
            const pos = (notasEl.selectionStart ?? 0) - (v.length - filtrado.length);
            notasEl.value = filtrado;
            notasEl.setSelectionRange(pos, pos);
        }
    });

    ['gist-rango-desde', 'gist-rango-hasta'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', formatearInput);
    });

    ['edit-entrada', 'edit-salida', 'edit-tiempo-fuera'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', _actualizarHintEdicion);
    });
}

function _initListenersTeclado() {
    const bindEnter = (id, handler) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            handler(el);
        });
    };
    bindEnter('entrada', () => $('salida')?.focus());
    bindEnter('salida', (el) => { el.blur(); const b = $('btn-agregar'); if (b && !b.disabled) b.click(); });
    bindEnter('edit-entrada', () => $('edit-salida')?.focus());
    bindEnter('edit-salida', () => $('edit-tiempo-fuera')?.focus());
    bindEnter('edit-tiempo-fuera', (el) => { el.blur(); const b = /** @type {HTMLButtonElement} */ (document.querySelector('#modal-editar .btn-edit')); if (b && !b.disabled) b.click(); });
    bindEnter('nombre-nuevo-perfil-selector', (el) => { el.blur(); crearPerfilDesdeSelector(); });
    bindEnter('nombre-perfil-editar', (el) => { el.blur(); const b = /** @type {HTMLButtonElement} */ (document.querySelector('#modal-editar-perfil .btn-edit')); if (b && !b.disabled) b.click(); });
}

function _initSwipesYStats() {
    _habilitarCierreToast();
    registrarSwipe($('stats-card'), () => alternarVista());
    registrarSwipe($('form-registro'), dir => {
        /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
        toggleModoLote(dir);
    });

    const anchor = $('stat-items-tipos-anchor');
    if (anchor) {
        TiposRegistro.obtenerTodosLosTipos().forEach(t => {
            const item = document.createElement('div');
            item.className = 'stat-item';
            const label = Object.assign(document.createElement('div'), { className: 'stat-label', textContent: t.labelPlural });
            const value = Object.assign(document.createElement('div'), { className: 'stat-value', id: `stat-${TiposRegistro.claveStat(t)}`, textContent: '0' });
            item.appendChild(label);
            item.appendChild(value);
            anchor.parentNode?.insertBefore(item, anchor);
        });
    }
    _bindStatItemPopups(document.querySelector('.stats-grid'));
}

function _initDatosYConfig(config) {
    EstadoApp.setVistaActual(config.vistaActual);
    EstadoApp.setIgnorarTiempoFuera(config.ignorarTiempoFuera || false);
    actualizarEstadoBotonIgnorarTF();
    poblarSelectoresTipos();
    actualizarEstadoBotonHoverPopup();
    actualizarEstadoBotonRuedaCalendario();
    actualizarEstadoBotonLogicaCubierto();
    actualizarEstadoBotonObjetivoPorRegistro();
    actualizarEstadoBotonFormatoCortoStats();
    actualizarEstadoBotonHintIntegrado();
    actualizarEstadoBotonMetricaUso();
    _refrescarFormatoCortoStatsCache();
    actualizarEstadoBotonAplicarHoras();
    actualizarEstadoBotonPushBuffer();
    actualizarEstadoBotonPushHabilitado();
    actualizarEstadoBotonNotificaciones();
    actualizarSelectPushAnticipacion();
    aplicarVisibilidadCards();
    aplicarOrdenCards(obtenerOrdenCards());
    iniciarDragOrdenCards();
    iniciarDragTarjetas();
    setFondoCard(config.fondoCard || 'golden-gate');
    setModoEstadisticas(config.modoEstadisticas || 'mensual');

    GestionDatos.cargarPerfilActivo();

    GestorHistorial.updateButtons();
}

function _restaurarEstadoVisual(config) {
    GestorTemas.aplicarTema(config.tema);
    Movimiento.init();
    EstiloCalendario.init();

    $('fecha').value = TiempoUtils.obtenerFechaHoy();

    try {
        const persistir = Almacenamiento.getBoolean(STORAGE_KEYS.PERSISTIR_TARJETAS, true);
        if (persistir && Almacenamiento.getBoolean(STORAGE_KEYS.FORMULARIO_EXPANDIDO)) toggleFormulario();
        if (persistir && Almacenamiento.getBoolean(STORAGE_KEYS.STATS_EXPANDIDO)) toggleStats();

        const estadoHistorico = persistir ? Almacenamiento.getItem(STORAGE_KEYS.HISTORICO_EXPANDIDO, 'cerrado') : 'cerrado';
        if (estadoHistorico === 'meses' || estadoHistorico === 'completo') {
            const contenido = $('contenido-historico');
            const icon = $('icon-indicator-historico');
            if (contenido) contenido.classList.add('expanded');
            if (estadoHistorico === 'meses') {
                if (icon) { icon.classList.remove('icon-rotate-neg90'); icon.classList.add('rotated'); }
            } else {
                const botones = $('botones-historico');
                if (botones) { botones.classList.add('expanded'); setTiempoExpansionBotones(Date.now()); }
                if (icon) { icon.classList.remove('rotated'); icon.classList.add('icon-rotate-neg90'); }
            }
        }

        const usarCalendario = Almacenamiento.getBoolean(STORAGE_KEYS.VISTA_HISTORICO_CAL, true);
        if (usarCalendario) {
            if ($('contenido-historico')?.classList.contains('expanded')) {
                setVistaHistoricoCalendario(false);
                toggleVistaHistorico();
            } else {
                setVistaHistoricoCalendario(true);
            }
        }
    } catch (e) {
        console.warn('Error restaurando estado visual:', e);
    }
}

function _initAutoSync() {
    const _tieneCredenciales = SincronizacionGist.getToken() && SincronizacionGist.esGistIdValido(SincronizacionGist.getGistId());
    if (!_tieneCredenciales) return;
    const estado = SincronizacionGist.getAutoSync();
    if (estado === 1 && SincronizacionGist.dentroDelRangoHorario() && !SincronizacionGist.superaLimite('bajar')) {
        setTimeout(async () => { await gistBajar(true); SincronizacionGist.marcarSync('bajar'); }, 2000);
    } else if (estado === 2 && SincronizacionGist.dentroDelRangoHorario() && !SincronizacionGist.superaLimite('subir')) {
        setTimeout(async () => { await gistSubir(); SincronizacionGist.marcarSync('subir'); }, 2000);
    }
}

let _relojUIInterval = null;

function _iniciarRelojUI() {
    if (_relojUIInterval) return;
    _relojUIInterval = setInterval(() => actualizarUI(null, true), 20000);
}

function _detenerRelojUI() {
    clearInterval(_relojUIInterval);
    _relojUIInterval = null;
}

function _initListenerVisibility() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            _detenerRelojUI();
            _detenerCicloStats();
        } else {
            actualizarUI(null, true);
            _iniciarRelojUI();
            _iniciarCicloStats();
        }
    });
}

function _initListenerEscape() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modal = document.querySelector('.modal.show');
        if (!modal) return;
        e.preventDefault();
        GestorModales.ejecutarAccionCierre(modal.id);
    });
}

function _initListenerUndoRedo() {
    document.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        const objetivo = /** @type {HTMLElement} */ (e.target);
        const tag = objetivo.tagName;
        const esCampoEditable = tag === 'INPUT' || tag === 'TEXTAREA' || objetivo.isContentEditable;
        if (esCampoEditable) return;
        if (e.key === 'z' || e.key === 'Z') {
            e.preventDefault();
            $('btn-undo')?.click();
        } else if (e.key === 'y' || e.key === 'Y') {
            e.preventDefault();
            $('btn-redo')?.click();
        }
    });
}

function _initListenersOtros() {
    const actualizarBotonLoteDebounced = debounce(actualizarBotonLote, 300);
    const agregarListenersFecha = (el) => {
        if (!el) return;
        el.addEventListener('change', () => actualizarBotonLote());
        el.addEventListener('input', () => actualizarBotonLoteDebounced());
    };
    agregarListenersFecha($('lote-fecha-desde'));
    agregarListenersFecha($('lote-fecha-hasta'));

    $('tipo-exportacion')?.addEventListener('change', () => toggleCamposRangoExport());

    const fileInput = $('file-import');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const nombreEl = $('nombre-archivo-seleccionado');
            const btnCombinar = $('btn-combinar');
            const btnReemplazar = $('btn-reemplazar');
            const hayArchivo = (/** @type {HTMLInputElement} */ (e.target).files?.length ?? 0) > 0;
            if (hayArchivo) {
                if (nombreEl) { nombreEl.textContent = `✓ ${/** @type {HTMLInputElement} */ (e.target).files?.[0].name}`; nombreEl.classList.remove('hidden'); }
                if (btnCombinar) btnCombinar.disabled = false;
                if (btnReemplazar) btnReemplazar.disabled = false;
            } else {
                if (nombreEl) { nombreEl.classList.add('hidden'); nombreEl.textContent = ''; }
                if (btnCombinar) btnCombinar.disabled = true;
                if (btnReemplazar) btnReemplazar.disabled = true;
            }
        });
    }
}

async function init() {
    Almacenamiento.migrarClavesLegadas();

    _initGlobales();
    _initListenersFormulario();
    _initListenersTeclado();
    _initSwipesYStats();
    const config = GestionDatos.cargarConfiguracion();
    _initDatosYConfig(config);
    _restaurarEstadoVisual(config);
    setBloqueoEdicion(true);
    setBloqueoEdicionGrupo(true);
    const btnEliminarPerfil = $('btn-eliminar-perfil-editor');
    if (btnEliminarPerfil) btnEliminarPerfil.disabled = true;

    InstaladorPWA.init();
    _suscribirCambiosPermisoNotificaciones();
    actualizarUI(null, false, false, true, true);
    Calendario.animarEntradaInicial();
    _iniciarCicloStats();
    actualizarBotonesHistorico();

    const hoy = TiempoUtils.obtenerFechaHoy();
    const hoyEsLaborable = TiempoUtils.esFechaHabil(hoy, Compensatorios.diasHabilesEnFecha(hoy));
    if (EstadoApp.vistaActual() === 'semana' && hoyEsLaborable) {
        setTimerAutoVista(setTimeout(() => {
            setTimerAutoVista(null);
            alternarVista();
            _esperarAnim().then(() => _iniciarCicloStats());
        }, 2500));
    }

    _initAutoSync();
    _iniciarRelojUI();
    _initListenerVisibility();

    _initListenerEscape();
    _initListenerUndoRedo();
    const lista = $('lista-registros');
    if (lista) {
        _initListenerAccionesLista(lista);
        _initListenerToggleAnio(lista);
        _initListenerToggleMes(lista);
    }
    _initListenersOtros();

    _actualizarOffsetsStickyMes();
    window.addEventListener('resize', actualizarOffsetsStickyMesDebounced);
}

export const OrquestadorUI = { init };
