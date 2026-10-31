import { RespaldoLocal } from './respaldo-local.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { $, setColapsable } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { GestorModales } from './gestor-modales.js';
import { GestorHistorial } from '../services/gestor-historial.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { UIBase } from './base.js';
import { SincronizacionGist } from '../services/sincronizacion-gist.js';
import { HistoricoEdicion } from './historico-edicion.js';
import { TarjetaFichaje } from './tarjeta-fichaje.js';
import { Configuracion } from './configuracion.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { setIconoBtn } from './boton-fichar.js';
import { _crearPressHold } from './gestos.js';
import { mostrarToast } from './toast.js';
import { Animaciones } from './animaciones.js';
import { icono, montar } from '../core/html.js';

// ====================================================================
//                     UI GIST AND BACKUP MODULE
// ====================================================================
const { _setBtnDisabled, _setBtnActivo, _flashCampo, _abrirModalConPadre, _cerrarModalConPadre } = UIBase;
const { _animarValor } = Animaciones;

const { mostrarImportar, cerrarImportar, mostrarExportar, cerrarExportar, ejecutarExportacion } = RespaldoLocal;
let _gistAutoSyncTemp = null;
let _gistLimitesTemp = null;
let _gistMergeDesdeModal = false;

function _gistEstadoAutoSyncActual() {
    return parseInt(_gistAutoSyncTemp ?? SincronizacionGist.getAutoSync());
}

function actualizarEstadoBotonesGist() {
    const token = $('gist-token')?.value.trim() || '';
    const gistId = $('gist-id')?.value.trim() || '';
    const soloToken = token !== '';
    const ambosCompletos = soloToken && gistId.length > 10;

    _setBtnDisabled('btn-gist-subir', !soloToken);
    _setBtnDisabled('btn-gist-bajar', !ambosCompletos);
    _setBtnDisabled('btn-toggle-gist-backup', !ambosCompletos);

    const estadoBackup = _gistEstadoAutoSyncActual();
    _setBtnDisabled('btn-toggle-gist-merge', !(ambosCompletos && estadoBackup === 1));

    const estadoEl = $('gist-estado');
    const tituloEl = $('gist-estado-titulo');
    const conexionEl = $('gist-conexion-resumen');
    estadoEl?.classList.toggle('gist-estado--off', !ambosCompletos);
    if (tituloEl) tituloEl.textContent = ambosCompletos ? 'Conectado' : soloToken ? 'Falta el Gist ID' : 'Sin configurar';
    if (conexionEl) {
        conexionEl.textContent = ambosCompletos
            ? `Configurado · ${gistId.slice(0, 6)}…${gistId.slice(-4)}`
            : soloToken ? 'Token cargado · falta el Gist ID' : 'Ingresá tu token para empezar';
    }
    _actualizarResumenLimites();
}

function _actualizarResumenLimites() {
    const el = $('gist-limites-resumen');
    if (!el) return;
    const tipo = _tipoSyncActual();
    if (!tipo) { el.textContent = 'Desactivado'; return; }
    const limite = _gistLimitesTemp ? _gistLimitesTemp[tipo] : SincronizacionGist.getSyncLimite(tipo);
    const desde = $('gist-rango-desde')?.value || '--:--';
    const hasta = $('gist-rango-hasta')?.value || '--:--';
    el.textContent = `${limite === 0 ? 'Sin límite' : `${limite} por hora`} · ${desde} – ${hasta}`;
}

function _gistSetPanel(btnId, abierto, animar = true) {
    const btn = $(btnId);
    const panel = $(btn?.getAttribute('aria-controls') || '');
    if (!btn || !panel) return;
    btn.setAttribute('aria-expanded', String(abierto));
    setColapsable(panel, abierto, { animar });
}

function toggleGistPanel(btnId) {
    const btn = $(btnId);
    _gistSetPanel(btnId, btn?.getAttribute('aria-expanded') !== 'true');
}

function abrirModalGist() {
    _abrirModalConPadre('modal-gist', () => {
        const tokenInput = $('gist-token');
        const gistIdInput = $('gist-id');
        const lastSyncEl = $('gist-ultima-sync');

        if (tokenInput) tokenInput.value = SincronizacionGist.getToken();
        if (gistIdInput) gistIdInput.value = SincronizacionGist.getGistId();
        if (lastSyncEl) {
            const last = SincronizacionGist.getLastSync();
            lastSyncEl.textContent = last ? `Sincronizado: ${SincronizacionGist.formatLastSync(last)}` : 'No sincronizado';
        }

        const rango = SincronizacionGist.getRangoHorario();
        const desdeEl = $('gist-rango-desde');
        const hastaEl = $('gist-rango-hasta');
        if (desdeEl) desdeEl.value = rango.desde;
        if (hastaEl) hastaEl.value = rango.hasta;

        _gistAutoSyncTemp = SincronizacionGist.getAutoSync();
        actualizarBotonGistBackup();
        actualizarBotonGistMerge();
        actualizarEstadoBotonesGist();
        const _gistCompleto = SincronizacionGist.getToken() && (SincronizacionGist.getGistId() || '').length > 10;
        _gistSetPanel('btn-gist-panel-limites', false, false);
        _gistSetPanel('btn-gist-panel-conexion', !_gistCompleto, false);
    });
    _gistLimitesTemp = null;
    _actualizarCampoLimite();
}

function _leerRangoHorarioInputs() {
    const desdeRaw = $('gist-rango-desde')?.value || '';
    const hastaRaw = $('gist-rango-hasta')?.value || '';
    const desdeValida = !desdeRaw || TiempoUtils.validarHora(desdeRaw);
    const hastaValida = !hastaRaw || TiempoUtils.validarHora(hastaRaw);
    return {
        desde: desdeRaw || SincronizacionGist.RANGO_HORARIO_DEFAULT.desde,
        hasta: hastaRaw || SincronizacionGist.RANGO_HORARIO_DEFAULT.hasta,
        desdeInvalida: desdeRaw !== '' && !desdeValida,
        hastaInvalida: hastaRaw !== '' && !hastaValida,
        valida: desdeValida && hastaValida
    };
}

function _gistGuardarCredencialesSiModalAbierto() {
    if (!$('modal-gist')?.classList.contains('show')) return;

    SincronizacionGist.saveCredentials(
        $('gist-token')?.value.trim() || '',
        $('gist-id')?.value.trim() || ''
    );

    const { desde, hasta, valida } = _leerRangoHorarioInputs();
    if (valida) SincronizacionGist.setRangoHorario(desde, hasta);

    if (_gistAutoSyncTemp !== null) {
        SincronizacionGist.setAutoSync(_gistAutoSyncTemp);
        _gistAutoSyncTemp = null;
    }
    if (_gistLimitesTemp !== null) {
        SincronizacionGist.setSyncLimite('bajar', _gistLimitesTemp.bajar);
        SincronizacionGist.setSyncLimite('subir', _gistLimitesTemp.subir);
        _gistLimitesTemp = null;
    }
}

function actualizarBotonesHistorico() {
    const btnRespaldar = $('btn-hist-respaldar');
    const btnRestaurar = $('btn-hist-restaurar');
    if (!btnRespaldar || !btnRestaurar) return;

    const tieneGist = SincronizacionGist.esGistIdValido(SincronizacionGist.getGistId());

    const newRespaldar = /** @type {HTMLElement} */ (btnRespaldar.cloneNode(true));
    const newRestaurar = /** @type {HTMLElement} */ (btnRestaurar.cloneNode(true));
    btnRespaldar.parentNode?.replaceChild(newRespaldar, btnRespaldar);
    btnRestaurar.parentNode?.replaceChild(newRestaurar, btnRestaurar);

    const autoCierre = () => {
        HistoricoEdicion.iniciarTimerAutoCierreBotones();
    };

    if (tieneGist) {
        newRespaldar.title = 'Subir a Gist';
        newRespaldar.addEventListener('click', () => { autoCierre(); gistSubir(); });
        setIconoBtn(newRespaldar, '#icon-cloud-upload');

        newRestaurar.title = 'Bajar de Gist';
        newRestaurar.addEventListener('click', () => { autoCierre(); gistBajar(); });
        setIconoBtn(newRestaurar, '#icon-cloud-download');
    } else {
        newRespaldar.title = 'Respaldar';
        newRespaldar.addEventListener('click', () => { autoCierre(); mostrarExportar(true); });
        setIconoBtn(newRespaldar, '#icon-download');

        newRestaurar.title = 'Restaurar';
        newRestaurar.addEventListener('click', () => { autoCierre(); mostrarImportar(true); });
        setIconoBtn(newRestaurar, '#icon-upload');
    }
}

function guardarConfigGist() {
    const token = $('gist-token')?.value.trim() || '';
    const gistId = $('gist-id')?.value.trim() || '';
    const { desde, hasta, desdeInvalida, hastaInvalida } = _leerRangoHorarioInputs();

    if (desdeInvalida) {
        mostrarToast('Hora inicial inválida.', 'error');
        return;
    }
    if (hastaInvalida) {
        mostrarToast('Hora final inválida.', 'error');
        return;
    }

    const rango = SincronizacionGist.getRangoHorario();
    const huboCambios = token !== SincronizacionGist.getToken()
        || gistId !== SincronizacionGist.getGistId()
        || desde !== rango.desde
        || hasta !== rango.hasta
        || (_gistAutoSyncTemp !== null && _gistAutoSyncTemp !== SincronizacionGist.getAutoSync())
        || (_gistLimitesTemp !== null);

    if (_gistAutoSyncTemp !== null) SincronizacionGist.setAutoSync(_gistAutoSyncTemp);
    if (_gistLimitesTemp !== null) {
        SincronizacionGist.setSyncLimite('bajar', _gistLimitesTemp.bajar);
        SincronizacionGist.setSyncLimite('subir', _gistLimitesTemp.subir);
    }
    SincronizacionGist.saveCredentials(token, gistId);
    SincronizacionGist.setRangoHorario(desde, hasta);
    mostrarToast(huboCambios ? 'Configuración guardada' : 'Sin cambios', huboCambios ? 'success' : 'info');
    cerrarModalGist();
}

function cerrarModalGist() {
    _gistAutoSyncTemp = null;
    _gistLimitesTemp = null;
    _cerrarModalConPadre('modal-gist');
    actualizarBotonesHistorico();
}

function _calcularRegistrosMerge(modo, mergeData) {
    const { registrosNormalizados, soloEnGist, complementarios = [], data } = mergeData;

    if (modo === 'merge') {
        if (soloEnGist.length === 0 && complementarios.length === 0) {
            return { vacio: true };
        }
        if (EstadoApp.registros().length + soloEnGist.length > S.SECURITY_LIMITS.MAX_REGISTROS) {
            return { limiteAlcanzado: true };
        }

        const registrosActualizados = EstadoApp.registros().map(local => {
            const imp = complementarios.find(c => c.fecha === local.fecha);
            if (!imp) return local;
            const actualizado = { ...local };
            if (!actualizado.salida && imp.salida) actualizado.salida = imp.salida;
            if (!actualizado.tiempoFuera && imp.tiempoFuera) actualizado.tiempoFuera = imp.tiempoFuera;
            const t = EstadoApp.calcularHoras(actualizado.entrada, actualizado.salida, actualizado.tiempoFuera || null, actualizado.credito || null);
            if (t) { actualizado.horas = t.horas; actualizado.minutos = t.minutos; actualizado.total = t.total; }
            return actualizado;
        });

        const partes = [];
        if (soloEnGist.length > 0) partes.push(`${soloEnGist.length} día${TiempoUtils.pluralizar(soloEnGist.length)} nuevo${TiempoUtils.pluralizar(soloEnGist.length)}`);
        if (complementarios.length > 0) partes.push(`${complementarios.length} registro${TiempoUtils.pluralizar(complementarios.length)} completado${TiempoUtils.pluralizar(complementarios.length)}`);

        return {
            registrosFinales: [...registrosActualizados, ...soloEnGist],
            mensajeExito: `Combinado: ${partes.join(', ')}`
        };

    } else {
        ImportarExportar.aplicarConfigImportada(data, registrosNormalizados);
        return {
            registrosFinales: registrosNormalizados,
            mensajeExito: `${registrosNormalizados.length} registros restaurados desde Gist`
        };
    }
}

function _gistMergeCerrarOVolver() {
    if (_gistMergeDesdeModal) {
        _gistMergeDesdeModal = false;
        GestorModales.alternar('modal-gist-merge', 'modal-gist');
    } else {
        GestorModales.cerrar('modal-gist-merge');
    }
}

async function gistMergeAplicar(modo, modoAutomatico = false) {
    if (!_gistMergeData) return;
    const mergeData = _gistMergeData;
    _gistMergeData = null;

    const resultado = _calcularRegistrosMerge(modo, mergeData);

    if (resultado.vacio) {
        if (!modoAutomatico) _gistMergeCerrarOVolver();
        mostrarToast('Sin datos nuevos para completar', 'info');
        return;
    }
    if (resultado.limiteAlcanzado) {
        mostrarToast('Límite alcanzado', 'error');
        return;
    }

    const { registrosFinales, mensajeExito } = resultado;

    EstadoApp.registros().splice(0, EstadoApp.registros().length, ...registrosFinales);
    EstadoApp.registros().sort((a, b) => {
        if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
        return (b.entrada || '').localeCompare(a.entrada || '');
    });
    Compensatorios.migrarObjetivoHorasFaltante();
    GestionDatos.sincronizarPushHoy();
    GestorHistorial.saveState(EstadoApp.registros(), modo === 'replace' ? 'reemplazar con Gist' : 'combinar con Gist');

    await EstadoApp.guardarYActualizar();
    TarjetaFichaje.actualizarUI();
    Configuracion.refrescarConfigSiVisible();

    if (!modoAutomatico) _gistMergeCerrarOVolver();
    const lastSyncEl = $('gist-ultima-sync');
    if (lastSyncEl) lastSyncEl.textContent = `Última sync: ${SincronizacionGist.formatLastSync(SincronizacionGist.getLastSync())}`;
    mostrarToast(mensajeExito, 'success');

    const btn = $('btn-gist-bajar');
    if (btn) btn.disabled = false;
}

function gistMergeCancelar() {
    _gistMergeData = null;
    const btn = $('btn-gist-bajar');
    if (btn) btn.disabled = false;
    _gistMergeCerrarOVolver();
}

function toggleGistMerge() {
    const actual = SincronizacionGist.getMergeBehavior();
    SincronizacionGist.setMergeBehavior(actual === 'merge' ? 'replace' : 'merge');
    actualizarBotonGistMerge();
}

function actualizarBotonGistMerge() {
    const hint = $('hint-gist-merge');
    const iconEl = $('icon-gist-merge');
    const esMerge = SincronizacionGist.getMergeBehavior() === 'merge';
    if (hint) hint.textContent = esMerge ? 'Combinar' : 'Reemplazar';
    const desc = $('desc-gist-merge');
    if (desc) desc.textContent = esMerge ? ' · une Gist con tus datos locales' : ' · sustituye tus datos locales';
    if (iconEl) setIconoBtn(iconEl, esMerge ? '#icon-combine' : '#icon-replace-swap');
}

function toggleGistBackup() {
    const actual = _gistEstadoAutoSyncActual();
    _gistAutoSyncTemp = (actual + 1) % 3;
    actualizarBotonGistBackup();
    actualizarEstadoBotonesGist();
    _actualizarCampoLimite();
}

function actualizarBotonGistBackup() {
    const btn = $('btn-toggle-gist-backup');
    const hint = $('hint-gist-backup');
    const label = $('label-gist-backup');
    const rangoEl = $('gist-rango-horario');
    const estado = _gistEstadoAutoSyncActual();
    if (!btn) return;

    const configs = [
        { texto: 'Sin automatizar', hint: ' · solo sincronizás de forma manual', activo: false },
        { texto: 'Restaurar', hint: ' · baja tus datos de Gist al abrir la app', activo: true },
        { texto: 'Respaldar', hint: ' · sube tus datos a Gist al abrir la app', activo: true }
    ];
    const c = configs[estado];
    _setBtnActivo(btn.id, c.activo);
    if (label) label.textContent = c.texto;
    if (hint) hint.textContent = c.hint;

    if (rangoEl) {
        const activo = estado === 1 || estado === 2;
        rangoEl.classList.toggle('disabled', !activo);
    }
}

function toggleVerToken() {
    const input = $('gist-token');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

function abrirGistEnBrowser() {
    const gistIdRaw = $('gist-id')?.value.trim() || SincronizacionGist.getGistId();
    if (gistIdRaw && SincronizacionGist.esGistIdValido(gistIdRaw)) {
        window.open(`https://gist.github.com/${gistIdRaw.trim()}`, '_blank', 'noopener,noreferrer');
    } else {
        window.open('https://gist.github.com', '_blank', 'noopener,noreferrer');
    }
}

function _tipoSyncActual() {
    const estado = _gistEstadoAutoSyncActual();
    return estado === 1 ? 'bajar' : estado === 2 ? 'subir' : null;
}

function _actualizarCampoLimite(dir = 0) {
    const tipo = _tipoSyncActual();
    const contenedor = $('gist-limite-sync');
    if (!contenedor) return;
    if (!tipo) {
        contenedor.classList.add('disabled');
        _actualizarResumenLimites();
        return;
    }
    const limite = _gistLimitesTemp ? _gistLimitesTemp[tipo] : SincronizacionGist.getSyncLimite(tipo);
    const input = $('gist-limite-valor');
    const label = $('gist-limite-label');
    if (input) _animarValor(input, limite, dir);
    if (label) label.textContent = tipo === 'bajar' ? 'Límite bajadas por hora (0 = sin límite)' : 'Límite subidas por hora (0 = sin límite)';
    contenedor.classList.remove('disabled');
    _actualizarResumenLimites();
}

function cambiarLimiteSync(delta) {
    const tipo = _tipoSyncActual();
    if (!tipo) return;
    if (!_gistLimitesTemp) _gistLimitesTemp = { bajar: SincronizacionGist.getSyncLimite('bajar'), subir: SincronizacionGist.getSyncLimite('subir') };
    const previo = _gistLimitesTemp[tipo];
    _gistLimitesTemp[tipo] = Math.max(0, Math.min(99, previo + delta));
    _actualizarCampoLimite(Math.sign(_gistLimitesTemp[tipo] - previo));
}

const pressHoldLimite = _crearPressHold(delta => cambiarLimiteSync(delta));

async function _gistConSpinner(btnId, mensajeError, accion) {
    const btn = $(btnId);
    if (btn) btn.disabled = true;
    const iconoPerfil = $('header-profile-icon');
    iconoPerfil?.classList.add('icono-spin');
    _flashCampo('header-profile-btn');

    try {
        await accion();
    } catch (e) {
        console.error(`${mensajeError}:`, e);
        mostrarToast(mensajeError, 'error');
    } finally {
        if (btn) btn.disabled = false;
        iconoPerfil?.classList.remove('icono-spin');
    }
}

async function gistSubir() {
    _gistGuardarCredencialesSiModalAbierto();
    await _gistConSpinner('btn-gist-subir', 'Error al subir', async () => {
        const nuevoId = await SincronizacionGist.subir(
            EstadoApp.registros(),
            EstadoApp.diasHabiles(),
            EstadoApp.horasDiarias(),
            EstadoApp.historialDiasHabiles(),
            ImportarExportar.obtenerConfigExportable()
        );
        const gistIdInput = $('gist-id');
        if (gistIdInput) gistIdInput.value = nuevoId;
        const lastSyncEl = $('gist-ultima-sync');
        if (lastSyncEl) lastSyncEl.textContent = `Última sync: ${SincronizacionGist.formatLastSync(SincronizacionGist.getLastSync())}`;
        mostrarToast('Datos respaldados en Gist', 'success');
    });
}

let _gistMergeData = null;

async function _validarDatosGist(data) {
    if (!data.registros || !Array.isArray(data.registros)) throw new Error('Datos inválidos en el Gist');
    const allowedRootKeys = ['registros', STORAGE_KEYS.DIAS_HABILES, STORAGE_KEYS.HORAS_DIARIAS, STORAGE_KEYS.HISTORIAL_DIAS_HABILES, ...ImportarExportar.KEYS_CONFIG_EXPORTABLE, 'fecha', 'version', 'hash', 'timestamp', '_hashNoCoincide'];
    if (Object.keys(data).some(k => !allowedRootKeys.includes(k)) || !ImportarExportar.validarCamposConfigImport(data)) throw new Error('Estructura del Gist sospechosa');
    if (data._hashNoCoincide) {
        const continuar = await GestorModales.confirmar('El hash de integridad no coincide. El Gist puede haber sido modificado o corrompido. ¿Restaurar de todas formas?', 'Restaurar', '#icon-upload');
        if (!continuar) return null;
    } else if (!data.hash) {
        const continuar = await GestorModales.confirmar('Este Gist no tiene verificación de integridad. ¿Restaurar de todas formas?', 'Restaurar', '#icon-upload');
        if (!continuar) return null;
    }
    if (data.version && data.version > S.SECURITY_LIMITS.SCHEMA_VERSION) {
        mostrarToast(`Gist de versión más nueva (v${data.version}). Algunos datos pueden no importarse correctamente.`, 'warning');
    }
    const registrosNormalizados = ImportarExportar.normalizarRegistrosImportados(data.registros, EstadoApp.calcularHoras);
    if (registrosNormalizados.length === 0) throw new Error('No se encontraron registros válidos');
    if (registrosNormalizados.length > S.SECURITY_LIMITS.MAX_REGISTROS) throw new Error(`Máximo ${S.SECURITY_LIMITS.MAX_REGISTROS} registros permitidos`);
    return registrosNormalizados;
}

function _calcularDiffGist(registrosNormalizados) {
    const localesPorFecha = new Map(EstadoApp.registros().map(r => [r.fecha, r]));
    const gistPorFecha = new Map(registrosNormalizados.map(r => [r.fecha, r]));

    const soloEnGist = registrosNormalizados.filter(r => !localesPorFecha.has(r.fecha));
    const enAmbos = registrosNormalizados.filter(r => localesPorFecha.has(r.fecha));
    const soloLocal = EstadoApp.registros().filter(r => !gistPorFecha.has(r.fecha));
    const complementarios = enAmbos.filter(imp => {
        const local = localesPorFecha.get(imp.fecha);
        return local && ((!local.salida && imp.salida) || (!local.tiempoFuera && imp.tiempoFuera));
    });
    return { soloEnGist, enAmbos, soloLocal, complementarios };
}

function _calcularConfigCambios(data) {
    return ImportarExportar.calcularCambiosConfigImport(data);
}

const _mkEl = (tag, cls, texto) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = String(texto);
    return e;
};

const _mkColapsable = (contenido) => {
    const wrap = _mkEl('div', 'collapsible');
    const inner = _mkEl('div', 'collapsible-inner');
    inner.appendChild(contenido);
    wrap.appendChild(inner);
    return wrap;
};

function _crearSelectorModoMerge(onCambio) {
    const el = _mkEl('div', 'btn-group');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Cómo aplicar los datos del Gist');
    const btns = [['merge', '#icon-combine', 'Combinar'], ['replace', '#icon-replace-swap', 'Reemplazar']].map(([modo, href, texto]) => {
        const btn = _mkEl('button');
        btn.type = 'button';
        btn.dataset.modo = modo;
        montar(btn, icono(href));
        btn.appendChild(document.createTextNode(texto));
        btn.addEventListener('click', () => onCambio(modo));
        el.appendChild(btn);
        return btn;
    });
    return {
        el,
        pintar(modo) {
            btns.forEach(b => {
                const activo = b.dataset.modo === modo;
                b.classList.toggle('btn-activo', activo);
                b.setAttribute('aria-pressed', String(activo));
            });
        }
    };
}

function _crearTarjetaResultadoMerge({ nLocal, nGist, nNuevos, nComp }, configCambios) {
    const el = _mkEl('div', 'gist-res');
    const fila = (label, valorEl, conBorde) => {
        const f = _mkEl('div', 'gist-res-fila' + (conBorde ? ' con-borde' : ''));
        f.append(_mkEl('span', 'gist-res-label', label), valorEl);
        return f;
    };

    const antesEl = _mkEl('em');
    const despuesEl = _mkEl('span');
    const deltaEl = _mkEl('span');
    const valorReg = _mkEl('span', 'gist-res-valor');
    valorReg.append(antesEl, despuesEl, deltaEl);
    el.appendChild(fila('Registros', valorReg, false));

    let wrapComp = null;
    if (nComp > 0) {
        const valorComp = _mkEl('span', 'gist-res-valor');
        valorComp.append(_mkEl('span', null, nComp), _mkEl('span', 'gist-delta is-info', 'datos faltantes'));
        wrapComp = _mkColapsable(fila('Se completan', valorComp, true));
        el.appendChild(wrapComp);
    }

    let cfgValor = null;
    if (configCambios.length > 0) {
        cfgValor = _mkEl('span', 'gist-res-valor');
        el.appendChild(fila('Configuración', cfgValor, true));
    }

    return {
        el,
        pintar(esMerge, animar) {
            const despues = esMerge ? nLocal + nNuevos : nGist;
            const delta = despues - nLocal;
            antesEl.textContent = `${nLocal} →`;
            despuesEl.textContent = String(despues);
            deltaEl.className = 'gist-delta' + (delta > 0 ? ' is-mas' : delta < 0 ? ' is-menos' : '');
            deltaEl.textContent = delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : 'sin cambios';
            cfgValor?.replaceChildren(esMerge ? _mkEl('em', null, 'sin cambios') : document.createTextNode(configCambios.join(', ')));
            setColapsable(wrapComp, esMerge, { animar });
        }
    };
}

function _crearAlertaReemplazoMerge(nSoloLocal) {
    if (nSoloLocal === 0) return null;
    const alerta = _mkEl('div', 'gist-alerta');
    montar(alerta, icono('#icon-alert-triangle'));
    const txt = _mkEl('span');
    txt.append(
        'Se eliminan ',
        _mkEl('strong', null, `${nSoloLocal} ${nSoloLocal === 1 ? 'registro local' : 'registros locales'}`),
        ` que no ${nSoloLocal === 1 ? 'está' : 'están'} en el Gist.`
    );
    alerta.appendChild(txt);
    const el = _mkColapsable(alerta);
    el.classList.add('gist-alerta-wrap');
    return { el, pintar: (esMerge, animar) => setColapsable(el, !esMerge, { animar }) };
}

function _buildResumenMerge(resumenEl, { soloEnGist, enAmbos, soloLocal, complementarios }, registrosNormalizados, configCambios) {
    const cantidades = {
        nLocal: enAmbos.length + soloLocal.length,
        nGist: registrosNormalizados.length,
        nNuevos: soloEnGist.length,
        nComp: complementarios.length
    };
    resumenEl.innerHTML = '';
    resumenEl.dataset.modo = 'merge';

    const selector = _crearSelectorModoMerge(modo => {
        if (resumenEl.dataset.modo === modo) return;
        resumenEl.dataset.modo = modo;
        pintar(true);
    });
    const tarjeta = _crearTarjetaResultadoMerge(cantidades, configCambios);
    const alerta = _crearAlertaReemplazoMerge(soloLocal.length);
    resumenEl.append(selector.el, tarjeta.el);
    if (alerta) resumenEl.appendChild(alerta.el);

    function pintar(animar) {
        const modo = resumenEl.dataset.modo;
        const esMerge = modo === 'merge';
        selector.pintar(modo);
        tarjeta.pintar(esMerge, animar);
        alerta?.pintar(esMerge, animar);

        const btnAplicar = $('btn-gist-merge-aplicar');
        if (btnAplicar) {
            btnAplicar.classList.toggle('btn-edit', esMerge);
            btnAplicar.classList.toggle('btn-delete', !esMerge);
        }
    }
    pintar(false);
}

async function gistBajar(modoAutomatico = false) {
    _gistGuardarCredencialesSiModalAbierto();
    _gistMergeDesdeModal = $('modal-gist')?.classList.contains('show') ?? false;
    await _gistConSpinner('btn-gist-bajar', 'Error al bajar', async () => {
        const data = await SincronizacionGist.bajar();
        const registrosNormalizados = await _validarDatosGist(data);
        if (!registrosNormalizados) return;

        const diff = _calcularDiffGist(registrosNormalizados);
        const { soloEnGist, complementarios } = diff;
        _gistMergeData = { registrosNormalizados, soloEnGist, complementarios, data };

        if (modoAutomatico) {
            await gistMergeAplicar(SincronizacionGist.getMergeBehavior(), true);
        } else {
            const configCambios = _calcularConfigCambios(data);
            const resumenEl = $('gist-merge-resumen');
            if (resumenEl) _buildResumenMerge(resumenEl, diff, registrosNormalizados, configCambios);
            if (_gistMergeDesdeModal) GestorModales.alternar('modal-gist', 'modal-gist-merge');
            else GestorModales.abrir('modal-gist-merge');
        }
    });
}

function bindEventos() {
    document.querySelector('.config-actions .btn-gist')?.addEventListener('click', () => abrirModalGist());
    document.querySelector('.config-actions .btn-backup')?.addEventListener('click', () => mostrarImportar());
    document.querySelector('.config-actions .btn-export')?.addEventListener('click', () => mostrarExportar());
    $('gist-token')?.addEventListener('input', () => actualizarEstadoBotonesGist());
    $('gist-id')?.addEventListener('input', () => actualizarEstadoBotonesGist());
    $('btn-toggle-token')?.addEventListener('click', () => toggleVerToken());
    $('btn-crear-token')?.addEventListener('click', () => window.open('https://github.com/settings/tokens/new?description=Horarios+sync&scopes=gist', '_blank', 'noopener,noreferrer'));
    $('btn-gist-abrir')?.addEventListener('click', () => abrirGistEnBrowser());
    $('btn-gist-subir')?.addEventListener('click', () => gistSubir());
    $('btn-gist-bajar')?.addEventListener('click', () => gistBajar());
    $('btn-toggle-gist-backup')?.addEventListener('click', () => toggleGistBackup());
    $('btn-toggle-gist-merge')?.addEventListener('click', () => toggleGistMerge());
    document.querySelectorAll('.gist-panel-toggle').forEach(b => b.addEventListener('click', () => toggleGistPanel(b.id)));
    const inputLimite = $('gist-limite-valor');
    if (inputLimite) {
        const btnDec = $('btn-gist-limite-dec') || inputLimite.closest('.input-number-group')?.querySelectorAll('.btn-increment')?.[0];
        const btnInc = $('btn-gist-limite-inc') || inputLimite.closest('.input-number-group')?.querySelectorAll('.btn-increment')?.[1];
        if (btnDec) pressHoldLimite.vincular(btnDec, -1);
        if (btnInc) pressHoldLimite.vincular(btnInc, 1);
    }

    $('btn-gist-guardar')?.addEventListener('click', () => guardarConfigGist());
    $('btn-gist-volver')?.addEventListener('click', () => cerrarModalGist());

    $('btn-gist-merge-aplicar')?.addEventListener('click', () => gistMergeAplicar($('gist-merge-resumen')?.dataset.modo === 'replace' ? 'replace' : 'merge'));
    $('btn-gist-merge-cancelar')?.addEventListener('click', () => gistMergeCancelar());

    $('btn-seleccionar-archivo')?.addEventListener('click', () => $('file-import').click());
    $('btn-combinar')?.addEventListener('click', () => ImportarExportar.importarDatos($('file-import').files?.[0], 'merge'));
    $('btn-reemplazar')?.addEventListener('click', () => ImportarExportar.importarDatos($('file-import').files?.[0], 'replace'));
    $('btn-volver-importar')?.addEventListener('click', () => cerrarImportar());

    document.querySelector('#modal-exportar .btn-export')?.addEventListener('click', () => ejecutarExportacion());
    $('btn-volver-exportar')?.addEventListener('click', () => cerrarExportar());



    ['gist-rango-desde', 'gist-rango-hasta'].forEach(id => $(id)?.addEventListener('input', () => _actualizarResumenLimites()));
}

export const GistRespaldo = {
    bindEventos,
    actualizarEstadoBotonesGist,
    actualizarResumenLimites: _actualizarResumenLimites,
    toggleGistPanel,
    actualizarBotonesHistorico,
    abrirModalGist,
    cerrarModalGist,
    guardarConfigGist,
    toggleVerToken,
    abrirGistEnBrowser,
    gistMergeCancelar,
    gistMergeAplicar,
    toggleGistBackup,
    toggleGistMerge,
    cambiarLimiteSync,
    pressHoldLimite,
    gistSubir,
    gistBajar
};
