
(function () {
    'use strict';

    const $ = id => document.getElementById(id);

    // ====================================================================
    // STORAGE KEYS — MODULE
    // ====================================================================
    const STORAGE_KEYS = Object.freeze({
        // ── Configuración global ──────────────────────────────────────
        TEMA_OSCURO: 'temaOscuro',
        VISTA_ACTUAL: 'vistaActual',
        MODO_ESTADISTICAS: 'modoEstadisticas',
        HOVER_POPUP: 'hoverPopupCalendario',
        DIAS_HABILES: 'diasHabiles',
        HORAS_DIARIAS: 'horasDiarias',
        VISTA_HISTORICO_CAL: 'vistaHistoricoCalendario',
        SALDO_DESDE_ENERO: 'saldoAnualDesdeEnero',
        SALDO_DESDE_PRIMERO_MES: 'saldoMensualDesdePrimero',

        // ── Configuración por perfil (useProfile = true) ──────────────
        IGNORAR_TF: 'ignorarTiempoFuera',
        FONDO_CARD: 'fondoCard',
        PERSISTIR_TARJETAS: 'persistirTarjetas',
        ORDEN_CARDS: 'ordenCards',

        // ── Estado UI persistido ──────────────────────────────────────
        FORMULARIO_EXPANDIDO: 'formularioExpandido',
        STATS_EXPANDIDO: 'statsExpandido',
        HISTORICO_EXPANDIDO: 'historicoExpandido',

        // ── Perfiles e historial ──────────────────────────────────────
        PERFIL_ACTIVO: 'perfilActivo',
        PERFILES: 'perfiles',
        HISTORY: 'history',

        // ── Gist ──────────────────────────────────────────────────────
        GIST_TOKEN: 'gistToken',

        // ── Plantillas (claves con parte dinámica) ────────────────────
        BREAK_TIME: (perfilId) => `breakStartTime_${perfilId}`,
        GIST_LIMITE: (tipo) => `gistSyncLimite_${tipo}`,
        MES_EXPANDIDO: (clave) => `mes-${clave}-expandido`,
        ANIO_EXPANDIDO: (anioId) => `anio-${anioId}-expandido`,
        CARD_VISIBLE: (cual) => `cardVisible_${cual}`,
    });


    function _applyDataColors(root) {
        root.querySelectorAll('[data-color]').forEach(el => {
            el.style.color = el.dataset.color;
        });
    }

    // ====================================================================
    // PWA INSTALLER MODULE
    // ====================================================================
    const PWAInstaller = (function () {
        let deferredPrompt = null;
        const btnInstall = document.getElementById('btn-install');

        function init() {
            if (window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true) {
                if (btnInstall) btnInstall.style.display = 'none';
                return;
            }

            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                if (btnInstall) {
                    btnInstall.style.display = 'flex';
                }
            });

            window.addEventListener('appinstalled', () => {
                if (btnInstall) btnInstall.style.display = 'none';
                deferredPrompt = null;
                if (window.UILogic) {
                    UILogic.mostrarToast('¡App instalada con éxito!', 'success');
                }
            });
        }

        async function instalarApp() {
            if (!deferredPrompt) return;

            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
        }

        return {
            init,
            instalarApp
        };
    })();

    // ====================================================================
    // TIME AND DATE UTILITIES MODULE (TimeUtils)
    // ====================================================================
    const TimeUtils = (function () {
        'use strict';

        const REGEX_PATTERNS = {
            FECHA: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
            HORA: /^([01]\d|2[0-3]):([0-5]\d)$/
        };

        function validarFecha(f) {
            if (!f || !REGEX_PATTERNS.FECHA.test(f)) return false;
            try {
                const [y, m, d] = f.split('-').map(Number);
                const fecha = new Date(y, m - 1, d);
                if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return false;
                const ahora = new Date();
                const hace20Anos = new Date(ahora.getFullYear() - 20, 0, 1);
                const en2Anos = new Date(ahora.getFullYear() + 2, 11, 31);
                return fecha >= hace20Anos && fecha <= en2Anos && !isNaN(fecha.getTime());
            } catch (e) {
                return false;
            }
        }

        function validarHora(h) {
            return !!(h && REGEX_PATTERNS.HORA.test(h));
        }

        function parsearFechaLocal(fechaStr) {
            return new Date(fechaStr.replace(/-/g, '/') + ' 00:00:00');
        }

        function formatearFechaLocal(date) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }

        function obtenerHoraActual() {
            const d = new Date();
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }

        function minutosAHora(totalMinutos) {
            const h = Math.floor(Math.abs(totalMinutos) / 60);
            const m = Math.abs(totalMinutos) % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        function obtenerFechaHoy() {
            return formatearFechaLocal(new Date());
        }

        function fechaLocalISOFull() {
            const d = new Date();
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }

        function horaAMinutos(h) {
            if (!validarHora(h)) return 0;
            const [hr, mn] = h.split(':').map(Number);
            return (hr * 60) + mn;
        }

        function sumarMinutosAHora(horaString, minutosASumar) {
            let totalMinutos = minutosASumar + horaAMinutos(horaString);
            let horas = Math.floor(totalMinutos / 60);
            let mins = Math.floor(totalMinutos % 60);
            if (horas > 23) { horas = 23; mins = 59; }
            return `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        }

        function obtenerNombreDia(f) {
            if (!f) return '';
            const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const date = parsearFechaLocal(f);
            return isNaN(date.getTime()) ? '' : dias[date.getDay()];
        }

        function obtenerLunes(fechaInput = new Date()) {
            const date = typeof fechaInput === 'string' ? parsearFechaLocal(fechaInput) : new Date(fechaInput);
            const diaSemana = date.getDay();
            const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
            const lunes = new Date(date);
            lunes.setDate(date.getDate() + offsetLunes);
            return lunes;
        }

        function obtenerLunesSemanaISO(fechaStr) {
            return formatearFechaLocal(obtenerLunes(fechaStr));
        }

        function obtenerSemanaRangoActual() {
            const lunes = obtenerLunes();
            const domingo = new Date(lunes);
            domingo.setDate(lunes.getDate() + 6);
            return {
                inicio: formatearFechaLocal(lunes),
                fin: formatearFechaLocal(domingo)
            };
        }

        function descomponerHorasDecimales(totalHoras) {
            const abs = Math.abs(totalHoras);
            let h = Math.floor(abs);
            let m = Math.round((abs - h) * 60);
            if (m === 60) { h++; m = 0; }
            return { horas: h, minutos: m, esNegativo: totalHoras < 0 };
        }

        function horasATexto(totalHoras, modo = 'long') {
            const { horas, minutos, esNegativo } = descomponerHorasDecimales(totalHoras);
            const signo = esNegativo ? '-' : '';
            if (modo === 'short') {
                return horas > 0 ? `${signo}${horas}h${minutos > 0 ? ' ' + minutos + 'm' : ''}` : `${signo}${minutos}m`;
            }
            let partes = [];
            if (horas > 0) partes.push(`${horas} ${horas === 1 ? 'hora' : 'horas'}`);
            if (minutos > 0) partes.push(`${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`);
            if (horas === 0 && minutos === 0) partes.push('0 minutos');
            return signo + partes.join(' ');
        }

        function formatoDiferencia(totalHoras, horasDiariasObjetivo) {
            const diffMinutos = Math.round(totalHoras * 60) - (horasDiariasObjetivo * 60);
            if (diffMinutos === 0) return '';
            const abs = Math.abs(diffMinutos);
            const h = Math.floor(abs / 60);
            const m = abs % 60;
            return (diffMinutos > 0 ? '+' : '-') + (h > 0 ? `${h}h` : '') + (h > 0 && m > 0 ? ' ' : '') + (m > 0 || h === 0 ? `${m}m` : '');
        }

        function formatoTituloMes(claveMes) {
            const [año, mes] = claveMes.split('-');
            const fecha = new Date(año, mes - 1, 1);
            let nombre = fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            return nombre.charAt(0).toUpperCase() + nombre.slice(1);
        }

        /**
         * Genera un array de fechas ISO "YYYY-MM-DD" entre `desde` y `hasta` (inclusive).
         * Nunca muta los Date originales; cada fecha se clona internamente.
         * @param {string} desde - Fecha ISO inicial "YYYY-MM-DD"
         * @param {string} hasta - Fecha ISO final  "YYYY-MM-DD"
         * @returns {string[]}
         */
        function generarRangoFechas(desde, hasta) {
            const resultado = [];
            const cur = parsearFechaLocal(desde);
            const fin = parsearFechaLocal(hasta);
            while (cur <= fin) {
                resultado.push(formatearFechaLocal(cur));
                cur.setDate(cur.getDate() + 1);
            }
            return resultado;
        }

        return {
            validarFecha, validarHora, parsearFechaLocal, formatearFechaLocal,
            obtenerFechaHoy, obtenerHoraActual, minutosAHora, fechaLocalISOFull,
            horaAMinutos, sumarMinutosAHora,
            obtenerNombreDia, obtenerLunes, obtenerLunesSemanaISO, obtenerSemanaRangoActual,
            horasATexto, formatoDiferencia, formatoTituloMes,
            generarRangoFechas
        };
    })();

    // ====================================================================
    // STORAGE HELPER MODULE
    // ====================================================================
    const StorageHelper = (function () {
        'use strict';

        function _getKey(key, useProfile) {
            if (useProfile && window.PerfilManager) {
                return window.PerfilManager.perfilKey(key);
            }
            if (useProfile) return key + '_default';
            return key;
        }

        function setItem(key, value, useProfile = false) {
            try {
                const finalKey = _getKey(key, useProfile);
                const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
                localStorage.setItem(finalKey, valueToStore);
                return true;
            } catch (e) {
                console.error(`Error guardando en Storage (${key}):`, e);
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    if (window.UILogic) UILogic.mostrarToast('Almacenamiento lleno, no se pudo guardar', 'error');
                }
                return false;
            }
        }

        function getItem(key, defaultValue = null, useProfile = false) {
            try {
                const value = localStorage.getItem(_getKey(key, useProfile));
                return value !== null ? value : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        }

        function getBoolean(key, defaultValue = false, useProfile = false) {
            const val = getItem(key, null, useProfile);
            if (val === null) return defaultValue;
            return val === 'true';
        }

        function getNumber(key, defaultValue = 0, useProfile = false) {
            const val = getItem(key, null, useProfile);
            if (val === null) return defaultValue;
            const parsed = parseFloat(val);
            return isNaN(parsed) ? defaultValue : parsed;
        }

        function getObject(key, defaultValue = null, useProfile = false) {
            const val = getItem(key, null, useProfile);
            if (!val) return defaultValue;
            try {
                return JSON.parse(val, (k, v) => {
                    if (['__proto__', 'constructor', 'prototype'].includes(k)) return undefined;
                    return v;
                });
            } catch (e) {
                return defaultValue;
            }
        }

        function removeItem(key, useProfile = false) {
            try {
                localStorage.removeItem(_getKey(key, useProfile));
            } catch (e) { }
        }

        return {
            setItem,
            getItem,
            getBoolean,
            getNumber,
            getObject,
            removeItem
        };
    })();

    // ====================================================================
    // SECURITY AND UTILS MODULE
    // ====================================================================
    const SecurityAndUtils = (function () {
        const SECURITY_LIMITS = {
            MAX_REGISTROS: 1000,
            MAX_STRING_LENGTH: 100,
            MAX_NOTAS_LENGTH: 35,
            MAX_JSON_SIZE: 4 * 1024 * 1024,
            SCHEMA_VERSION: 3,
        };

        const REGEX_PATTERNS = {
            ID: /^[a-zA-Z0-9-_]{10,100}$/,
            NOTAS: /[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ ]/g
        };

        function sanitizeString(str, maxLength = SECURITY_LIMITS.MAX_STRING_LENGTH) {
            if (typeof str !== 'string') return '';
            return str
                .replace(/[<>"'`]/g, '')
                .replace(/javascript:/gi, '')
                .replace(/data:/gi, '')
                .replace(/vbscript:/gi, '')
                .replace(/on\w+\s*=/gi, '')
                .replace(/[\x00-\x1F\x7F]/g, '')
                .replace(/&lt;/gi, '')
                .replace(/&gt;/gi, '')
                .replace(/&#/g, '')
                .trim()
                .substring(0, maxLength);
        }

        function sanitizeNotas(str, trim = false) {
            if (typeof str !== 'string') return '';
            const r = str.replace(REGEX_PATTERNS.NOTAS, '').substring(0, SECURITY_LIMITS.MAX_NOTAS_LENGTH);
            return trim ? r.trim() : r;
        }

        function generarIDSeguro() {
            if (window.crypto && window.crypto.getRandomValues) {
                const array = new Uint32Array(4);
                crypto.getRandomValues(array);
                return Array.from(array, num => num.toString(36)).join('');
            }
            const timestamp = Date.now().toString(36);
            const random1 = Math.random().toString(36).substring(2, 11);
            const random2 = Math.random().toString(36).substring(2, 11);
            return `${timestamp}-${random1}${random2}`;
        }

        async function calcularHashSHA256(data) {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(JSON.stringify(data));
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        function validarRegistroSeguro(r) {
            if (!r || typeof r !== 'object') return false;
            if (Array.isArray(r) || r instanceof Date) return false;
            if (typeof r.id !== 'string' || !REGEX_PATTERNS.ID.test(r.id)) return false;
            if (typeof r.fecha !== 'string' || !TimeUtils.validarFecha(r.fecha)) return false;
            if (r.entrada !== null) {
                if (typeof r.entrada !== 'string' || !TimeUtils.validarHora(r.entrada)) return false;
            }
            if (r.salida !== null) {
                if (typeof r.salida !== 'string' || !TimeUtils.validarHora(r.salida)) return false;
            }
            if (r.tiempoFuera !== null && r.tiempoFuera !== '') {
                if (typeof r.tiempoFuera !== 'string' || !TimeUtils.validarHora(r.tiempoFuera)) return false;
            }
            if (r.credito !== null && r.credito !== undefined && r.credito !== '') {
                if (typeof r.credito !== 'string' || !TimeUtils.validarHora(r.credito)) return false;
            }
            if (r.notas !== null && r.notas !== undefined && r.notas !== '') {
                if (typeof r.notas !== 'string' || r.notas.length > SECURITY_LIMITS.MAX_NOTAS_LENGTH) return false;
            }
            if (!Number.isFinite(r.horas) || r.horas < 0 || r.horas > 24) return false;
            if (!Number.isFinite(r.minutos) || r.minutos < 0 || r.minutos > 59) return false;
            if (!Number.isFinite(r.total) || r.total < 0 || r.total > 24) return false;

            const propiedadesPermitidas = ['id', 'fecha', 'entrada', 'salida', 'tiempoFuera', 'horas', 'minutos', 'total', 'credito', 'notas'];
            const propiedadesActuales = Object.keys(r);
            const tienePropiedadesSospechosas = propiedadesActuales.some(prop => !propiedadesPermitidas.includes(prop));
            if (tienePropiedadesSospechosas) return false;

            return true;
        }

        return {
            SECURITY_LIMITS,
            REGEX_PATTERNS,
            sanitizeString,
            sanitizeNotas,
            generarIDSeguro,
            calcularHashSHA256,
            validarRegistroSeguro,
            fechaLocalISO: TimeUtils.fechaLocalISOFull
        };
    })();

    // ====================================================================
    // PERFIL MANAGER MODULE
    // ====================================================================
    const PerfilManager = (function (S) {
        const MAX_PERFILES = 9;
        let perfilActual = 'default';
        let perfiles = {};

        function inicializar() {
            cargarPerfiles();
            actualizarSelector();
            actualizarNombrePerfil();
        }

        function cargarPerfiles() {
            const defaultPerfil = {
                'default': { nombre: 'Principal', registros: [], diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 7 }
            };

            perfiles = StorageHelper.getObject(STORAGE_KEYS.PERFILES, defaultPerfil);
            if (!perfiles['default']) perfiles['default'] = defaultPerfil['default'];

            perfilActual = StorageHelper.getItem(STORAGE_KEYS.PERFIL_ACTIVO, 'default');
            if (!perfiles[perfilActual]) {
                const availableIds = Object.keys(perfiles);
                perfilActual = availableIds.length > 0 ? availableIds[0] : 'default';
            }
        }

        function guardarPerfiles() {
            const savedPerfiles = StorageHelper.setItem(STORAGE_KEYS.PERFILES, perfiles);
            const savedActivo = StorageHelper.setItem(STORAGE_KEYS.PERFIL_ACTIVO, perfilActual);
            return savedPerfiles && savedActivo;
        }

        function actualizarNombrePerfil() {
            const nombreInput = document.getElementById('nombre-perfil-actual');
            if (nombreInput && perfiles[perfilActual]) nombreInput.value = perfiles[perfilActual].nombre;
            const btnEliminar = document.getElementById('btn-eliminar-perfil-modal');
            if (btnEliminar) {
                btnEliminar.disabled = (perfilActual === 'default');
            }
        }

        function guardarDatosPerfilActual() {
            if (!window.DataManagement) return false;
            const actual = perfiles[perfilActual];
            perfiles[perfilActual] = {
                nombre: actual.nombre,
                registros: [...window.DataManagement.registros()],
                diasHabiles: window.DataManagement.diasHabiles(),
                horasDiarias: window.DataManagement.horasDiarias(),
                ...(actual.gistId && { gistId: actual.gistId }),
                ...(actual.gistLastSync && { gistLastSync: actual.gistLastSync }),
                ...(actual.gistAutoSync != null && { gistAutoSync: actual.gistAutoSync }),
                ...(actual.gistRangoDesde && { gistRangoDesde: actual.gistRangoDesde }),
                ...(actual.gistRangoHasta && { gistRangoHasta: actual.gistRangoHasta }),
                ...(actual.gistSyncFecha_subir && { gistSyncFecha_subir: actual.gistSyncFecha_subir }),
                ...(actual.gistSyncCount_subir != null && { gistSyncCount_subir: actual.gistSyncCount_subir }),
                ...(actual.gistSyncFecha_bajar && { gistSyncFecha_bajar: actual.gistSyncFecha_bajar }),
                ...(actual.gistSyncCount_bajar != null && { gistSyncCount_bajar: actual.gistSyncCount_bajar }),
                ...(actual.gistMergeBehavior && { gistMergeBehavior: actual.gistMergeBehavior })
            };
            return guardarPerfiles();
        }

        function cargarDatosPerfilActual() { return perfiles[perfilActual]; }

        function actualizarSelector() {
            const btnTexto = document.getElementById('nombre-perfil-header');
            if (btnTexto && perfiles[perfilActual]) {
                btnTexto.textContent = perfiles[perfilActual].nombre;
            }
        }

        function obtenerListaPerfiles() {
            return Object.entries(perfiles).map(([id, perfil]) => ({
                id: id,
                nombre: perfil.nombre,
                esActual: id === perfilActual,
                totalRegistros: Array.isArray(perfil.registros) ? perfil.registros.length : 0
            })).sort((a, b) => {
                if (a.id === 'default') return -1;
                if (b.id === 'default') return 1;
                return a.nombre.localeCompare(b.nombre);
            });
        }

        function cambiarPerfil(nuevoId) {
            if (!nuevoId || nuevoId === perfilActual) return;
            guardarDatosPerfilActual();
            perfilActual = nuevoId;
            if (StorageHelper.setItem(STORAGE_KEYS.PERFIL_ACTIVO, perfilActual)) {
                location.reload();
            }
        }

        function obtenerPerfilActual() { return perfilActual; }
        function obtenerDatosPerfil() { return perfiles[perfilActual]; }
        function obtenerTodosPerfiles() { return perfiles; }

        function perfilKey(base) {
            return base + '_' + perfilActual;
        }

        return {
            inicializar, cambiarPerfil, guardarDatosPerfilActual, cargarDatosPerfilActual,
            obtenerPerfilActual, obtenerDatosPerfil, obtenerListaPerfiles, obtenerTodosPerfiles,
            guardarPerfiles, perfilKey, MAX_PERFILES
        };

    })(SecurityAndUtils);

    // ====================================================================
    // MODAL MANAGER MODULE
    // ====================================================================
    const ModalManager = (function () {
        const _padres = {};

        let _navegandoHaciaAtras = false;
        let _ignorandoPopstate = false;
        let _enAlternanciaHaciaAdelante = false;
        let _enAlternanciaHaciaAtras = false;

        function _getAccionVolver(modalId) {
            const acciones = {
                'modal-gist': () => window.UILogic?.cerrarModalGist(),
                'modal-gist-merge': () => window.UILogic?.gistMergeCancelar(),
                'modal-config': () => window.UILogic && UILogic.cerrarConfig(),
                'modal-selector-perfiles': () => window.UILogic && UILogic.cerrarSelectorPerfiles(),
                'modal-editar': () => window.UILogic && UILogic.cerrarEdicion(),
                'modal-importar': () => window.UILogic && UILogic.cerrarImportar(),
                'modal-exportar': () => window.UILogic && UILogic.cerrarExportar(),
                'modal-filtros': () => window.UILogic && UILogic.cerrarFiltros(),
                'modal-editar-perfil': () => window.UILogic && UILogic.cerrarEditorPerfil(),
                'modal-editar-grupo': () => window.UILogic && UILogic.cerrarEdicionGrupo(),
                'modal-confirmar': () => document.getElementById('modal-confirmar-cancel')?.click(),
            };
            return acciones[modalId] || null;
        }

        window.addEventListener('popstate', (event) => {
            if (_ignorandoPopstate) {
                _ignorandoPopstate = false;
                return;
            }

            _navegandoHaciaAtras = true;

            const modalesAbiertos = Array.from(document.querySelectorAll('.modal.show'));
            if (modalesAbiertos.length > 0) {
                const topModal = modalesAbiertos[modalesAbiertos.length - 1];
                const accionVolver = _getAccionVolver(topModal.id);

                if (accionVolver) {
                    accionVolver();
                } else {
                    cerrar(topModal.id);
                }
            }

            setTimeout(() => { _navegandoHaciaAtras = false; }, 50);
        });

        let _mousedownEnOverlay = false;

        function _handleOverlayMousedown(event) {
            _mousedownEnOverlay = event.target.classList.contains('modal') && event.target.classList.contains('show');
        }

        function handleOutsideClick(event) {
            if (!_mousedownEnOverlay) return;
            if (event.target.classList.contains('modal') && event.target.classList.contains('show')) {
                const modalId = event.target.id;
                if (modalId === 'modal-confirmar') {
                    return;
                }
                const accionVolver = _getAccionVolver(modalId);
                if (accionVolver) {
                    accionVolver();
                } else {
                    cerrar(modalId);
                }
            }
        }

        function abrir(modalId, callback = null) {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            modal.classList.add('show');
            document.body.classList.add('modal-open');

            if (!_navegandoHaciaAtras && !_enAlternanciaHaciaAtras) {
                history.pushState({ modalId: modalId }, "");
            }

            setTimeout(() => {
                modal.addEventListener('mousedown', _handleOverlayMousedown);
                modal.addEventListener('click', handleOutsideClick);
            }, 100);

            if (callback) callback();
        }

        function cerrar(modalId, callback = null) {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            modal.classList.remove('show');

            if (document.querySelectorAll('.modal.show').length === 0) {
                document.body.classList.remove('modal-open');
            }

            modal.removeEventListener('mousedown', _handleOverlayMousedown);
            modal.removeEventListener('click', handleOutsideClick);

            if (!_navegandoHaciaAtras && !_enAlternanciaHaciaAdelante) {
                _ignorandoPopstate = true;
                history.back();
            }

            if (callback) callback();
        }

        function alternar(modalIdCerrar, modalIdAbrir, callbackCerrar = null, callbackAbrir = null) {
            const esHaciaAtras = (_padres[modalIdCerrar] === modalIdAbrir);

            if (esHaciaAtras) {
                _enAlternanciaHaciaAtras = true;
                delete _padres[modalIdCerrar];
            } else {
                _enAlternanciaHaciaAdelante = true;
                if (modalIdCerrar && modalIdAbrir) {
                    _padres[modalIdAbrir] = modalIdCerrar;
                }
            }

            cerrar(modalIdCerrar, callbackCerrar);
            abrir(modalIdAbrir, callbackAbrir);

            _enAlternanciaHaciaAdelante = false;
            _enAlternanciaHaciaAtras = false;
        }

        function cerrarTodos() {
            document.querySelectorAll('.modal.show').forEach(modal => {
                modal.classList.remove('show');
                modal.removeEventListener('mousedown', _handleOverlayMousedown);
                modal.removeEventListener('click', handleOutsideClick);
            });
            Object.keys(_padres).forEach(k => delete _padres[k]);
            document.body.classList.remove('modal-open');
        }

        return { abrir, cerrar, alternar, cerrarTodos, getPadre: (id) => _padres[id] || null, setPadre: (id, padreId) => { if (id && padreId) _padres[id] = padreId; } };
    })();

    // ====================================================================
    // HISTORY MANAGER MODULE
    // ====================================================================
    const HistoryManager = (function () {
        let _stack = [];
        let currentIndex = -1;
        const MAX_HISTORY = 20;

        function deepClone(obj) {
            if (obj === null || obj === undefined) return obj;
            try { return structuredClone(obj); }
            catch (e) { return JSON.parse(JSON.stringify(obj)); }
        }

        function saveState(registros) {
            const copiaSegura = deepClone(registros);
            if (currentIndex < _stack.length - 1) _stack.splice(currentIndex + 1);
            _stack.push(copiaSegura);
            if (_stack.length > MAX_HISTORY) {
                _stack.shift();
                currentIndex = MAX_HISTORY - 1;
            } else {
                currentIndex = _stack.length - 1;
            }
            updateButtons();
            saveToLocalStorage();
        }

        function undo() {
            if (currentIndex > 0) {
                currentIndex--;
                updateButtons();
                saveToLocalStorage();
                return deepClone(_stack[currentIndex]);
            }
            return null;
        }

        function redo() {
            if (currentIndex < _stack.length - 1) {
                currentIndex++;
                updateButtons();
                saveToLocalStorage();
                return deepClone(_stack[currentIndex]);
            }
            return null;
        }

        function canUndo() { return currentIndex > 0; }
        function canRedo() { return currentIndex < _stack.length - 1; }

        function updateButtons() {
            const undoBtn = document.getElementById('btn-undo');
            const redoBtn = document.getElementById('btn-redo');
            if (undoBtn) undoBtn.disabled = !canUndo();
            if (redoBtn) redoBtn.disabled = !canRedo();
        }

        function saveToLocalStorage() {
            const historyData = { history: _stack, currentIndex: currentIndex, timestamp: Date.now() };
            StorageHelper.setItem(STORAGE_KEYS.HISTORY, historyData, true);
        }

        function loadFromLocalStorage() {
            const historyData = StorageHelper.getObject(STORAGE_KEYS.HISTORY, null, true);
            if (historyData) {
                const ahora = Date.now();
                const tiempoTranscurrido = ahora - (historyData.timestamp || 0);
                const limiteEnMs = 24 * 60 * 60 * 1000;

                if (tiempoTranscurrido < limiteEnMs) {
                    _stack = historyData.history || [];
                    currentIndex = historyData.currentIndex !== undefined ? historyData.currentIndex : -1;
                    console.log(`✓ Historial restaurado: ${_stack.length} estados, índice actual: ${currentIndex}`);
                    return _stack.length > 0 && currentIndex >= 0;
                } else {
                    console.log('Historial expirado (más de 24hs), limpiando...');
                    StorageHelper.removeItem(STORAGE_KEYS.HISTORY, true);
                }
            }
            _stack = [];
            currentIndex = -1;
            updateButtons();
            return false;
        }

        function clearStorage() { StorageHelper.removeItem(STORAGE_KEYS.HISTORY, true); }

        function clear() {
            _stack = [];
            currentIndex = -1;
            clearStorage();
            updateButtons();
        }

        function getCurrentState() {
            if (currentIndex >= 0 && currentIndex < _stack.length) {
                return deepClone(_stack[currentIndex]);
            }
            return null;
        }

        return {
            saveState, undo, redo, canUndo, canRedo, updateButtons, clear,
            saveToLocalStorage, loadFromLocalStorage, getCurrentState
        };
    })();

    function confirmarModal(texto, labelOk = 'Confirmar', icono = '#icon-trash') {
        return new Promise((resolve) => {
            const elTexto = document.getElementById('modal-confirmar-texto');
            const elLabel = document.getElementById('modal-confirmar-label-ok');
            const elIcono = document.querySelector('#modal-confirmar-ok svg use');
            const btnOk = document.getElementById('modal-confirmar-ok');
            const btnCancel = document.getElementById('modal-confirmar-cancel');
            if (!elTexto || !btnOk || !btnCancel) { resolve(false); return; }

            elTexto.textContent = texto;
            if (elLabel) elLabel.textContent = labelOk;
            if (elIcono) elIcono.setAttribute('href', icono);

            const modalPadre = document.querySelector('.modal.show');
            const modalPadreId = modalPadre ? modalPadre.id : null;

            function ok() { cleanup(); resolve(true); }
            function cancel() { cleanup(); resolve(false); }

            function onPopstate() {
                _removeListeners();
                resolve(false);
            }

            function _removeListeners() {
                btnOk.removeEventListener('click', ok);
                btnCancel.removeEventListener('click', cancel);
                window.removeEventListener('popstate', onPopstate);
            }

            function cleanup() {
                _removeListeners();
                if (modalPadreId) {
                    ModalManager.alternar('modal-confirmar', modalPadreId);
                } else {
                    ModalManager.cerrar('modal-confirmar');
                }
            }

            btnOk.addEventListener('click', ok);
            btnCancel.addEventListener('click', cancel);
            window.addEventListener('popstate', onPopstate, { once: true });
            if (modalPadreId) {
                ModalManager.alternar(modalPadreId, 'modal-confirmar');
            } else {
                ModalManager.abrir('modal-confirmar');
            }
        });
    }

    // ====================================================================
    // TIPOS DE REGISTRO MODULE
    // ====================================================================
    const TiposRegistro = (function () {
        const TIPOS = {
            FERIADO: {
                id: 'feriado',
                codigo: '00:00',
                emoji: '🎉',
                label: 'Feriado',
                labelPlural: 'Feriados',
                descripcion: 'Día no laboral',
                color: 'purple',
                contabiliza: true
            },
            AUSENCIA: {
                id: 'ausencia',
                codigo: '11:11',
                emoji: '🏠',
                label: 'Licencia',
                labelPlural: 'Licencias',
                descripcion: 'Día libre',
                color: 'purple',
                contabiliza: true
            },
            VACACIONES: {
                id: 'vacaciones',
                codigo: '12:12',
                emoji: '🏖️',
                label: 'Vacaciones',
                labelPlural: 'Vacaciones',
                descripcion: 'Vacaciones',
                color: 'orange',
                contabiliza: true
            },
            ASUETO: {
                id: 'asueto',
                codigo: '13:13',
                emoji: '🎁',
                label: 'Asueto',
                labelPlural: 'Asuetos',
                descripcion: 'Día de asueto',
                color: 'purple',
                contabiliza: true
            },
            ENFERMEDAD: {
                id: 'enfermedad',
                codigo: '14:14',
                emoji: '🏥',
                label: 'Enfermedad',
                labelPlural: 'Enfermedades',
                descripcion: 'Enfermedad justificada',
                color: 'purple',
                contabiliza: true
            },
            PARO: {
                id: 'paro',
                codigo: '15:15',
                emoji: '📢',
                label: 'Paro',
                labelPlural: 'Paros',
                descripcion: 'Fuerza Mayor',
                color: 'purple',
                contabiliza: true
            },
            REMOTO: {
                id: 'remoto',
                codigo: '16:16',
                emoji: '💻',
                label: 'Remoto',
                labelPlural: 'Remotos',
                descripcion: 'Trabajo desde casa',
                color: 'purple',
                contabiliza: true
            },
            CAPACITACION: {
                id: 'capacitacion',
                codigo: '17:17',
                emoji: '📚',
                label: 'Capacitación',
                labelPlural: 'Capacitaciones',
                descripcion: 'Formacion profesional',
                color: 'purple',
                contabiliza: true
            },
            COMPENSATORIO: {
                id: 'compensatorio',
                codigo: '18:18',
                emoji: '⚖️',
                label: 'Compensatorio',
                labelPlural: 'Compensatorios',
                descripcion: 'Día compensatorio',
                color: 'purple',
                contabiliza: true
            }
        };

        function esRegistroEspecial(entrada, salida) {
            if (!entrada || !salida) return false;
            return entrada === salida && Object.values(TIPOS).some(t => t.codigo === entrada);
        }

        function obtenerTipoPorCodigo(entrada, salida) {
            if (!esRegistroEspecial(entrada, salida)) return null;
            return Object.values(TIPOS).find(t => t.codigo === entrada) || null;
        }

        function obtenerTipoPorId(id) {
            return Object.values(TIPOS).find(t => t.id === id) || null;
        }

        function validarTipoPermitido(id) {
            return Object.values(TIPOS).some(t => t.id === id);
        }

        function obtenerTodosLosTipos() {
            return Object.values(TIPOS);
        }

        function obtenerCodigosPorTipo(id) {
            const tipo = obtenerTipoPorId(id);
            return tipo ? { entrada: tipo.codigo, salida: tipo.codigo } : null;
        }

        return {
            TIPOS,
            esRegistroEspecial,
            obtenerTipoPorCodigo,
            obtenerTipoPorId,
            validarTipoPermitido,
            obtenerTodosLosTipos,
            obtenerCodigosPorTipo
        };
    })();

    // ====================================================================
    // DATA MANAGEMENT MODULE 
    // ====================================================================
    const DataManagement = (function (S) {
        let registros = [], diasHabiles = [1, 2, 3, 4, 5], horasDiarias = 7, editandoId = null; let vistaActual = 'diaria'; let ignorarTiempoFuera = false;
        let filtroActivo = false;
        let filtroDesde = null;
        let filtroHasta = null;
        let filtroTipo = null;
        let grupoEnEdicion = null;

        function ordenarRegistros() {
            registros.sort((a, b) => {
                if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
                return (b.entrada || '').localeCompare(a.entrada || '');
            });
        }

        function editarGrupo(grupo) {
            if (grupoEnEdicion !== null) return;
            grupoEnEdicion = {
                registros: grupo.registros,
                subtipo: grupo.subtipo,
                fechaDesde: grupo.registros[grupo.registros.length - 1].fecha,
                fechaHasta: grupo.registros[0].fecha
            };
            $('edit-grupo-tipo').value = grupo.subtipo;
            $('edit-grupo-desde').value = grupoEnEdicion.fechaDesde;
            $('edit-grupo-hasta').value = grupoEnEdicion.fechaHasta;
            UILogic.actualizarHintGrupo();
            ModalManager.abrir('modal-editar-grupo');
            UILogic.setBloqueoEdicionGrupo(true);
        }

        async function guardarEdicionGrupo() {
            if (!grupoEnEdicion) return;
            const modal = $('modal-editar-grupo');
            const btnGuardar = modal.querySelector('.btn-edit');
            btnGuardar.disabled = true;
            try {
                const nuevoTipo = S.sanitizeString($('edit-grupo-tipo').value.trim(), 20);
                const nuevaDesde = S.sanitizeString($('edit-grupo-desde').value.trim(), 10);
                const nuevaHasta = S.sanitizeString($('edit-grupo-hasta').value.trim(), 10);

                if (!nuevaDesde || !nuevaHasta) { UILogic.mostrarToast('Verifica ambas fechas', 'error'); return; }
                if (!TimeUtils.validarFecha(nuevaDesde)) { UILogic.mostrarToast('Fecha "Desde" inválida', 'error'); return; }
                if (!TimeUtils.validarFecha(nuevaHasta)) { UILogic.mostrarToast('Fecha "Hasta" inválida', 'error'); return; }
                if (nuevaDesde > nuevaHasta) { UILogic.mostrarToast('La fecha inicial debe ser inferior a la final', 'error'); return; }

                const hoy = new Date();
                const fechaInicioObj = TimeUtils.parsearFechaLocal(nuevaDesde);
                const fechaFinObj = TimeUtils.parsearFechaLocal(nuevaHasta);
                const dosPasado = new Date(hoy); dosPasado.setFullYear(hoy.getFullYear() - 2);
                const dosFuturo = new Date(hoy); dosFuturo.setFullYear(hoy.getFullYear() + 2);

                if (fechaInicioObj < dosPasado || fechaFinObj > dosFuturo) { UILogic.mostrarToast('El rango debe estar entre 2 años atrás y 2 años adelante', 'error'); return; }
                if (!TiposRegistro.validarTipoPermitido(nuevoTipo)) { UILogic.mostrarToast('Tipo de registro inválido', 'error'); return; }

                const diffDays = Math.ceil(Math.abs(fechaFinObj - fechaInicioObj) / (1000 * 60 * 60 * 24)) + 1;
                if (diffDays > 60) { UILogic.mostrarToast(`El rango contiene ${diffDays} días.\n Máximo: 60 días por operación.`, 'error'); return; }

                const huboCambios = nuevoTipo !== grupoEnEdicion.subtipo || nuevaDesde !== grupoEnEdicion.fechaDesde || nuevaHasta !== grupoEnEdicion.fechaHasta;
                if (!huboCambios) { UILogic.mostrarToast('Sin cambios', 'info'); UILogic.cerrarEdicionGrupo(); return; }

                const fechasNuevas = TimeUtils.generarRangoFechas(nuevaDesde, nuevaHasta);

                const idsDelGrupo = new Set(grupoEnEdicion.registros.map(r => r.id));
                const fechasSet = new Set(fechasNuevas);
                const conflictos = registros.filter(r => fechasSet.has(r.fecha) && !idsDelGrupo.has(r.id));
                if (conflictos.length > 0) {
                    const diasConflicto = conflictos.map(r => r.fecha.substring(8, 10)).sort((a, b) => a - b).join(', ');
                    UILogic.mostrarToast(`Conflicto en día(s): ${diasConflicto}\n Ya existen registros en esas fechas.`, 'error');
                    return;
                }

                registros = registros.filter(r => !idsDelGrupo.has(r.id));
                const codigosTipo = TiposRegistro.obtenerCodigosPorTipo(nuevoTipo);
                const { entrada, salida } = codigosTipo;

                const nuevosRegistros = fechasNuevas.map(fechaISO => {
                    const t = calcularHoras(entrada, salida, null);
                    return { id: S.generarIDSeguro(), fecha: fechaISO, entrada, salida, tiempoFuera: null, horas: t?.horas || 0, minutos: t?.minutos || 0, total: t?.total || 0 };
                });

                registros.push(...nuevosRegistros);
                ordenarRegistros();
                HistoryManager.saveState(registros);
                const saved = await guardarYActualizar(nuevosRegistros.map(r => r.id));
                if (saved) { UILogic.mostrarToast('Grupo actualizado', 'success'); UILogic.cerrarEdicionGrupo(); }
            } finally {
                btnGuardar.disabled = false;
            }
        }

        async function eliminarGrupoActual() {
            if (!grupoEnEdicion) return;
            if (grupoEnEdicion.registros.length > 60) {
                UILogic.mostrarToast(`Este grupo contiene ${grupoEnEdicion.registros.length} registros.\nMáximo permitido: 60 registros por operación.`, 'error');
                return;
            }
            const idsAEliminar = grupoEnEdicion.registros.map(r => r.id);
            registros = registros.filter(r => !idsAEliminar.includes(r.id));
            HistoryManager.saveState(registros);
            const saved = await guardarYActualizar();
            if (saved) { UILogic.mostrarToast('Grupo eliminado', 'success'); UILogic.cerrarEdicionGrupo(); }
        }

        function setGrupoEnEdicion(val) { grupoEnEdicion = val; }

        async function registrarDiaEspecial(fecha, tipo) {
            const registroExistente = registros.find(r => r.fecha === fecha);
            if (registroExistente) { UILogic.mostrarToast('Ya existe un registro para hoy', 'warning'); throw new Error('Registro ya existe'); }

            const tipoConfig = TiposRegistro.obtenerTipoPorId(tipo);
            if (!tipoConfig) { UILogic.mostrarToast('Tipo inválido', 'error'); throw new Error('Tipo inválido'); }

            const entrada = tipoConfig.codigo;
            const salida = tipoConfig.codigo;
            const tipoTexto = `${tipoConfig.emoji} ${tipoConfig.label}`;

            if (registros.length >= S.SECURITY_LIMITS.MAX_REGISTROS) { UILogic.mostrarToast('Límite de registros alcanzado', 'error'); throw new Error('Límite alcanzado'); }

            const nuevoId = S.generarIDSeguro();
            const t = calcularHoras(entrada, salida, null);
            registros.push({
                id: nuevoId, fecha: fecha, entrada: entrada, salida: salida, tiempoFuera: null,
                horas: t?.horas || 0, minutos: t?.minutos || 0, total: t?.total || 0
            });

            ordenarRegistros();
            HistoryManager.saveState(registros);
            const saved = await guardarYActualizar(nuevoId);
            if (saved) { UILogic.mostrarToast(`Registro agregado como ${tipoTexto}`, 'success'); }
            else { throw new Error('Error al guardar'); }
        }

        async function guardarYActualizar(idNuevo = null, animarCard = false) {
            let saveSuccessful = false;
            try {
                if (window.PerfilManager) { saveSuccessful = PerfilManager.guardarDatosPerfilActual(); }
                else { saveSuccessful = true; }
            } catch (e) {
                console.error('Error crítico al guardar:', e);
                saveSuccessful = false;
            }
            if (saveSuccessful) { UILogic.actualizarUI(idNuevo, false, animarCard); }
            else { UILogic.mostrarToast('Error al guardar. Almacenamiento lleno o bloqueado.', 'error'); }
            return saveSuccessful;
        }

        function cargarConfiguracion() {
            const perfilData = window.PerfilManager ? PerfilManager.obtenerDatosPerfil() : null;
            return {
                diasHabiles: (perfilData && Array.isArray(perfilData.diasHabiles))
                    ? perfilData.diasHabiles
                    : StorageHelper.getObject(STORAGE_KEYS.DIAS_HABILES, [1, 2, 3, 4, 5]),
                horasDiarias: (perfilData && perfilData.horasDiarias !== undefined)
                    ? perfilData.horasDiarias
                    : StorageHelper.getNumber(STORAGE_KEYS.HORAS_DIARIAS, 7),
                temaOscuro: StorageHelper.getBoolean(STORAGE_KEYS.TEMA_OSCURO, true),
                vistaActual: StorageHelper.getItem(STORAGE_KEYS.VISTA_ACTUAL, 'diaria'),
                ignorarTiempoFuera: StorageHelper.getBoolean(STORAGE_KEYS.IGNORAR_TF, false, true),
                modoEstadisticas: StorageHelper.getItem(STORAGE_KEYS.MODO_ESTADISTICAS, 'mensual'),
                fondoCard: StorageHelper.getItem(STORAGE_KEYS.FONDO_CARD, 'golden-gate', true)
            };
        }

        function calcularHoras(e, s, tf = null, cr = null, esCalculoTemporal = false) {
            const tfEfectivo = ignorarTiempoFuera ? null : tf;
            const tfMinutos = tfEfectivo ? TimeUtils.horaAMinutos(tfEfectivo) : 0;
            const crMinutos = cr ? TimeUtils.horaAMinutos(cr) : 0;

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

        function calcularHorasFeriadoEnRango(inicio, fin) {
            const horasDiariasLocal = horasDiarias;
            const diasHabilesConfig = diasHabiles;
            let horasDescontar = 0;

            registros.forEach(r => {
                const tipoEspecial = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
                if (r.fecha >= inicio && r.fecha <= fin && tipoEspecial) {
                    if (tipoEspecial.id === 'remoto') return;
                    const fechaObj = TimeUtils.parsearFechaLocal(r.fecha);
                    const diaSemana = fechaObj.getDay();
                    if (diasHabilesConfig.includes(diaSemana)) horasDescontar += horasDiariasLocal;
                }
            });
            return horasDescontar;
        }

        function validarFormulario() {
            let valido = true;
            const fecha = S.sanitizeString($('fecha').value, 10);
            const entrada = S.sanitizeString($('entrada').value.trim(), 5);
            const salida = S.sanitizeString($('salida').value.trim(), 5);

            UILogic.limpiarError('fecha', null);
            UILogic.limpiarError('entrada', null);
            UILogic.limpiarError('salida', null);

            if (!fecha || !TimeUtils.validarFecha(fecha)) { UILogic.mostrarError('fecha', null); valido = false; }
            if (entrada && !TimeUtils.validarHora(entrada)) { UILogic.mostrarError('entrada', null); valido = false; }
            if (salida && !TimeUtils.validarHora(salida)) { UILogic.mostrarError('salida', null); valido = false; }
            return valido;
        }

        async function agregarRegistro() {
            if (!validarFormulario()) { UILogic.mostrarToast('Verifica los campos', 'error'); return; }

            const btn = $('btn-agregar');
            btn.disabled = true;
            let usaHoraActual = false;

            let f = S.sanitizeString($('fecha').value, 10);
            let e = S.sanitizeString($('entrada').value.trim(), 5);
            let s = S.sanitizeString($('salida').value.trim(), 5);

            const _hoy = TimeUtils.obtenerFechaHoy();
            if (f > _hoy && !TiposRegistro.esRegistroEspecial(e, s)) {
                UILogic.resetearBoton(btn);
                UILogic.mostrarError('fecha', null);
                UILogic.mostrarToast('Fecha futura no permitida en registro regular', 'warning');
                return;
            }

            if (!e) {
                const { ayerStr: ayer, ayerAbierto } = detectarAyerAbierto(TimeUtils.obtenerFechaHoy(), registros);
                const regHoy = registros.find(r => r.fecha === f);
                if (ayerAbierto && !regHoy) { f = ayer; $('fecha').value = f; }
            }

            let registroExistente = registros.find(r => r.fecha === f);

            if (!e && !s) {
                const horaActual = TimeUtils.obtenerHoraActual();
                if (registroExistente && registroExistente.entrada && !registroExistente.salida) {
                    s = horaActual; $('salida').value = s; usaHoraActual = true;
                } else {
                    e = horaActual; $('entrada').value = e; usaHoraActual = true;
                }
            }

            if (!e && s) {
                if (!registroExistente) { UILogic.resetearBoton(btn); UILogic.mostrarToast('Debes fichar una entrada primero', 'error'); return; }
                if (registroExistente.salida) { UILogic.resetearBoton(btn); UILogic.mostrarToast('Ya existe un registro completo para esta fecha', 'error'); return; }
                if (!registroExistente.entrada) { UILogic.resetearBoton(btn); UILogic.mostrarToast('Debes fichar una entrada primero', 'error'); return; }
            }

            if (registroExistente && !e && s && registroExistente.entrada && !registroExistente.salida) {
                const timerDetenido = detenerYRegistrarTimer(registroExistente);
                registroExistente.salida = s;
                let t = calcularHoras(registroExistente.entrada, s, registroExistente.tiempoFuera || null);
                registroExistente.horas = t?.horas || 0;
                registroExistente.minutos = t?.minutos || 0;
                registroExistente.total = t?.total || 0;

                HistoryManager.saveState(registros);
                const saved = await guardarYActualizar(registroExistente.id);
                if (saved) {
                    const salidaManual = !usaHoraActual;
                    if (salidaManual) {
                        UILogic.aplicarFeedbackCampos([
                            { id: 'entrada', fallback: 'Entrada', mostrar: false },
                            { id: 'salida', fallback: 'Salida', mostrar: true }
                        ]);
                    }
                    let mensaje;
                    if (timerDetenido && usaHoraActual) {
                        const tiempoFuera = registroExistente.tiempoFuera || '00:00';
                        mensaje = `Salida registrada con hora actual \nTiempo fuera: +${tiempoFuera} \n(entrada: ${registroExistente.entrada})`;
                    } else if (usaHoraActual) {
                        mensaje = `Salida registrada con hora actual \n(entrada: ${registroExistente.entrada})`;
                    } else {
                        mensaje = `Salida ${s} agregada \n(entrada: ${registroExistente.entrada})`;
                    }
                    UILogic.mostrarToast(mensaje, 'success');
                    UILogic.resetearBoton(btn);
                    $('fecha').value = TimeUtils.obtenerFechaHoy();
                    $('salida').value = '';
                }
                return;
            }

            if (registroExistente) {
                UILogic.resetearBoton(btn);
                if (usaHoraActual) { $('entrada').value = ''; }
                UILogic.mostrarToast('Ya existe un registro para esta fecha', 'error');
                return;
            }

            if (registros.length >= S.SECURITY_LIMITS.MAX_REGISTROS) {
                UILogic.resetearBoton(btn);
                UILogic.mostrarToast('Límite alcanzado', 'error');
                return;
            }

            const nuevoId = S.generarIDSeguro();
            const t = calcularHoras(e || null, s || null, null);
            registros.push({
                id: nuevoId, fecha: f, entrada: e || null, salida: s || null, tiempoFuera: null,
                horas: t?.horas || 0, minutos: t?.minutos || 0, total: t?.total || 0
            });

            ordenarRegistros();
            HistoryManager.saveState(registros);

            const saved = await guardarYActualizar(nuevoId);
            if (saved) {
                const entradaManual = e && !usaHoraActual;
                const salidaManual = s && !usaHoraActual;
                if (entradaManual || salidaManual) {
                    UILogic.aplicarFeedbackCampos([
                        { id: 'entrada', fallback: 'Entrada', mostrar: entradaManual },
                        { id: 'salida', fallback: 'Salida', mostrar: salidaManual }
                    ]);
                }
                const mensaje = usaHoraActual ? 'Registro agregado con hora actual' : 'Registro agregado';
                UILogic.mostrarToast(mensaje, 'success');
                UILogic.resetearBoton(btn);
                $('fecha').value = TimeUtils.obtenerFechaHoy();
                $('entrada').value = '';
                $('salida').value = '';
            }
        }

        async function eliminarRegistroActual() {
            if (editandoId) {
                const modal = $('modal-editar');
                const btnEliminar = modal.querySelector('.btn-delete');
                btnEliminar.disabled = true;
                const registroABorrar = registros.find(r => r.id === editandoId);
                const hoy = TimeUtils.obtenerFechaHoy();

                if (registroABorrar && registroABorrar.fecha === hoy) {
                    const perfilId = window.PerfilManager ? PerfilManager.obtenerPerfilActual() : 'default';
                    const storageKey = STORAGE_KEYS.BREAK_TIME(perfilId);
                    if (StorageHelper.getItem(storageKey)) {
                        StorageHelper.removeItem(storageKey);
                        UILogic.mostrarToast('Timer detenido al borrar el registro', 'info');
                    }
                }

                registros = registros.filter(r => r.id !== editandoId);
                HistoryManager.saveState(registros);

                const saved = await guardarYActualizar();
                btnEliminar.disabled = false;
                btnEliminar.innerHTML = '<svg class="icon"><use href="#icon-trash"/></svg> Eliminar';

                if (saved) {
                    UILogic.mostrarToast('Registro eliminado', 'success');
                    UILogic.cerrarEdicion();
                    UILogic.actualizarEstadoBotonTimerMain();
                    if (window.UILogic && window.UILogic.actualizarBotonLote) {
                        window.UILogic.actualizarBotonLote();
                    }
                }
            }
        }

        function editarRegistro(id) {
            if (editandoId !== null) return;
            const r = registros.find(x => x.id === id);
            if (!r) return;

            editandoId = id;
            $('edit-fecha').value = r.fecha;
            $('edit-entrada').value = r.entrada || '';
            $('edit-salida').value = r.salida || '';
            $('edit-tiempo-fuera').value = r.tiempoFuera || '';
            $('edit-notas').value = r.notas || '';

            const btnCredito = document.getElementById('btn-toggle-credito');
            btnCredito.style.background = '';
            btnCredito.style.color = '';
            btnCredito.style.border = '';

            if (r.credito && r.credito !== '00:00') {
                btnCredito.dataset.activo = "true";
                btnCredito.classList.add('btn-activo');
            } else {
                btnCredito.dataset.activo = "false";
                btnCredito.classList.remove('btn-activo');
            }

            ModalManager.abrir('modal-editar');
            UILogic.setBloqueoEdicion(true);

            requestAnimationFrame(() => {
                UILogic.verificarBloqueoCredito();
                const hintEl = document.getElementById('edit-hint-resumen');
                if (hintEl) hintEl.dispatchEvent ? document.getElementById('edit-entrada').dispatchEvent(new Event('input')) : null;
            });
        }

        /**
         * Valida los campos del formulario de edición antes de guardar.
         * Usa registros y editandoId del closure del módulo.
         * @returns {{ msg: string, tipo: string }} | null  — null si no hay error.
         */
        function _validarCamposEdicion(f, e, s, tf) {
            const hoy = TimeUtils.obtenerFechaHoy();

            if (f > hoy && !TiposRegistro.esRegistroEspecial(e, s))
                return { msg: 'Fecha futura no permitida en registro regular', tipo: 'warning' };

            if (!TimeUtils.validarFecha(f))
                return { msg: 'Fecha inválida', tipo: 'error' };
            if (e && !TimeUtils.validarHora(e))
                return { msg: 'Hora de entrada inválida', tipo: 'error' };
            if (s && !TimeUtils.validarHora(s))
                return { msg: 'Hora de salida inválida', tipo: 'error' };
            if (tf && !TimeUtils.validarHora(tf))
                return { msg: 'Tiempo fuera inválido', tipo: 'error' };
            if (!e && s)
                return { msg: 'Debes fichar una entrada', tipo: 'error' };

            if (registros.some(reg => reg.fecha === f && reg.id !== editandoId))
                return { msg: 'Ya existe otro registro para esa fecha', tipo: 'error' };

            if (e && tf) {
                const minutosEntrada = TimeUtils.horaAMinutos(e);
                const minutosFuera = TimeUtils.horaAMinutos(tf);
                let minutosLimite = s
                    ? TimeUtils.horaAMinutos(s)
                    : TimeUtils.horaAMinutos(TimeUtils.obtenerHoraActual());
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

        async function guardarEdicion() {
            const r = registros.find(x => x.id === editandoId);
            if (!r) return;
            const modal = $('modal-editar');
            const btnGuardar = modal.querySelector('.btn-edit');
            btnGuardar.disabled = true;

            const f = S.sanitizeString($('edit-fecha').value, 10);
            const e = S.sanitizeString($('edit-entrada').value.trim(), 5);
            const s = S.sanitizeString($('edit-salida').value.trim(), 5);

            let tf = S.sanitizeString($('edit-tiempo-fuera').value.trim(), 5);
            if (tf === '') tf = null;

            let notas = S.sanitizeString($('edit-notas').value.trim(), S.SECURITY_LIMITS.MAX_NOTAS_LENGTH);
            if (notas) notas = S.sanitizeNotas(notas, true) || null;
            if (notas === '') notas = null;

            let cr = null;
            const btnCredito = document.getElementById('btn-toggle-credito');

            if (btnCredito && btnCredito.dataset.activo === "true") {
                const calcTemp = calcularHoras(e, s, tf, null);
                if (calcTemp) {
                    const horasTrabajadas = calcTemp.total;
                    const horasObjetivo = horasDiarias;
                    const diferencia = horasObjetivo - horasTrabajadas;
                    if (diferencia > 0.01) {
                        let h = Math.floor(diferencia);
                        let m = Math.round((diferencia - h) * 60);
                        if (m === 60) { h++; m = 0; }
                        cr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    }
                }
            }
            if (r.fecha === f && (r.entrada || '') === (e || '') && (r.salida || '') === (s || '') &&
                (r.tiempoFuera || '') === (tf || '') && (r.credito || '') === (cr || '') && (r.notas || '') === (notas || '')) {
                UILogic.mostrarToast('Sin cambios', 'info');
                UILogic.restaurarBotonGuardarEdicion(btnGuardar);
                UILogic.cerrarEdicion();
                return;
            }

            if (!e && !s) {
                const registroABorrar = registros.find(r => r.id === editandoId);
                if (registroABorrar && registroABorrar.fecha === TimeUtils.obtenerFechaHoy()) {
                    const perfilId = window.PerfilManager ? PerfilManager.obtenerPerfilActual() : 'default';
                    StorageHelper.removeItem(STORAGE_KEYS.BREAK_TIME(perfilId));
                    UILogic.actualizarEstadoBotonTimerMain();
                }
                registros = registros.filter(r => r.id !== editandoId);
                HistoryManager.saveState(registros);
                const saved = await guardarYActualizar();
                if (saved) {
                    UILogic.mostrarToast('Registro eliminado (vacío)', 'info');
                    UILogic.restaurarBotonGuardarEdicion(btnGuardar);
                    UILogic.cerrarEdicion();
                } else {
                    UILogic.restaurarBotonGuardarEdicion(btnGuardar);
                }
                return;
            }

            const camposError = _validarCamposEdicion(f, e, s, tf);
            if (camposError) {
                UILogic.restaurarBotonGuardarEdicion(btnGuardar);
                UILogic.mostrarToast(camposError.msg, camposError.tipo);
                return;
            }

            r.fecha = f; r.entrada = e || null;
            if (s && !(r.salida || '')) {
                const timerDetenido = detenerYRegistrarTimer(r);
                if (timerDetenido) tf = r.tiempoFuera;
            }

            r.salida = s || null; r.tiempoFuera = tf; r.credito = cr; r.notas = notas;

            const t = calcularHoras(r.entrada, r.salida, r.tiempoFuera, r.credito);
            r.horas = t?.horas || 0; r.minutos = t?.minutos || 0; r.total = t?.total || 0;

            ordenarRegistros();
            HistoryManager.saveState(registros);
            const saved = await guardarYActualizar(null, true);

            if (saved) {
                if (cr) UILogic.mostrarToast(`Guardado con Salida Temprano (+${cr})`, 'success');
                else UILogic.mostrarToast('Registro actualizado', 'success');
                UILogic.restaurarBotonGuardarEdicion(btnGuardar);
                UILogic.cerrarEdicion();
            } else {
                UILogic.restaurarBotonGuardarEdicion(btnGuardar);
            }
        }

        async function borrarTodoHistorial() {
            const totalRegistros = registros.length;
            const confirmar = await confirmarModal(`Esto restablecerá el perfil activo: se eliminarán ${totalRegistros} registro${totalRegistros !== 1 ? 's' : ''} y la configuración volverá a los valores por defecto. No afecta otros perfiles.`, 'Restablecer');
            if (!confirmar) return;

            diasHabiles = [1, 2, 3, 4, 5];
            horasDiarias = 7;
            registros.splice(0, registros.length);
            ignorarTiempoFuera = false;

            const perfilId = window.PerfilManager ? PerfilManager.obtenerPerfilActual() : 'default';
            StorageHelper.removeItem(STORAGE_KEYS.BREAK_TIME(perfilId));
            const keys = [STORAGE_KEYS.FONDO_CARD, STORAGE_KEYS.IGNORAR_TF, 'cardVisible_registrar', 'cardVisible_estadisticas', 'cardVisible_historico', STORAGE_KEYS.ORDEN_CARDS];
            keys.forEach(k => StorageHelper.removeItem(k, true));

            if (window.PerfilManager) {
                const perfil = PerfilManager.obtenerDatosPerfil();
                if (perfil) {
                    ['gistLastSync', 'gistAutoSync', 'gistRangoDesde', 'gistRangoHasta', 'gistSyncFecha_subir', 'gistSyncCount_subir', 'gistSyncFecha_bajar', 'gistSyncCount_bajar', 'gistMergeBehavior'].forEach(k => delete perfil[k]);
                }
            }

            HistoryManager.saveState(registros);
            if (await guardarYActualizar()) location.reload();
        }

        function normalizarRegistrosImportados(rawList, calcularHorasFn) {
            const validarHora = (h) => TimeUtils.validarHora(h) ? S.sanitizeString(h, 5) : null;
            const hoy = TimeUtils.obtenerFechaHoy();
            const descartadosFuturos = rawList.filter(r =>
                S.validarRegistroSeguro(r) && r.fecha > hoy && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)
            ).length;
            if (descartadosFuturos > 0)
                UILogic.mostrarToast(`${descartadosFuturos} registro${descartadosFuturos > 1 ? 's' : ''} normal${descartadosFuturos > 1 ? 'es' : ''} con fecha futura omitido${descartadosFuturos > 1 ? 's' : ''}`, 'warning');
            const normalizados = rawList
                .filter(r => S.validarRegistroSeguro(r))
                .filter(r => {
                    if (r.fecha <= hoy) return true;
                    return TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
                })
                .map(r => ({
                    id: (r.id && S.REGEX_PATTERNS.ID.test(r.id)) ? r.id : S.generarIDSeguro(),
                    fecha: S.sanitizeString(r.fecha, 10),
                    entrada: validarHora(r.entrada), salida: validarHora(r.salida), tiempoFuera: validarHora(r.tiempoFuera),
                    horas: Math.max(0, Math.min(24, parseFloat(r.horas) || 0)),
                    minutos: Math.max(0, Math.min(59, parseFloat(r.minutos) || 0)),
                    total: Math.max(0, Math.min(24, parseFloat(r.total) || 0)),
                    credito: validarHora(r.credito),
                    notas: (r.notas && typeof r.notas === 'string') ? S.sanitizeString(r.notas, S.SECURITY_LIMITS.MAX_NOTAS_LENGTH) || null : null,
                }));

            normalizados.forEach(r => {
                const t = calcularHorasFn(r.entrada, r.salida, r.tiempoFuera || null, r.credito || null);
                r.horas = t?.horas || 0; r.minutos = t?.minutos || 0; r.total = t?.total || 0;
            });
            return normalizados;
        }

        async function exportarJSON() {
            const data = {
                registros, diasHabiles, horasDiarias,
                fecha: TimeUtils.fechaLocalISOFull(), version: S.SECURITY_LIMITS.SCHEMA_VERSION,
                hash: await S.calcularHashSHA256(registros), timestamp: Date.now()
            };
            try {
                const nombreSafe = window.UILogic.obtenerNombrePerfilSafe();
                const fechaHoy = TimeUtils.fechaLocalISOFull().slice(0, 10);
                window.UILogic.descargarJSON(data, `Horarios_${nombreSafe}_${fechaHoy}.json`);
                window.UILogic.mostrarToast('Datos exportados', 'success');
                ModalManager.cerrarTodos();
            } catch (e) {
                console.error(e);
                UILogic.mostrarToast('Error al exportar', 'error');
            }
        }

        function importarDatos(modo = 'replace') {
            const fileInput = $('file-import');
            const file = fileInput.files[0];
            if (!file) { UILogic.mostrarToast('Selecciona un archivo primero', 'error'); return; }
            if (file.size > S.SECURITY_LIMITS.MAX_JSON_SIZE) { UILogic.mostrarToast('Archivo muy grande', 'error'); return; }
            if (!file.type || file.type !== 'application/json') { UILogic.mostrarToast('Solo se permiten archivos JSON', 'error'); return; }

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const contenido = e.target.result;
                    if (!contenido || contenido.trim().length === 0) { UILogic.mostrarToast('Archivo vacío', 'error'); return; }
                    if (contenido.length > S.SECURITY_LIMITS.MAX_JSON_SIZE) { UILogic.mostrarToast('Contenido del archivo demasiado grande', 'error'); return; }

                    const data = JSON.parse(contenido, (key, value) => {
                        if (['__proto__', 'constructor', 'prototype'].includes(key)) return undefined;
                        return value;
                    });

                    const allowedRootKeys = ['registros', STORAGE_KEYS.DIAS_HABILES, STORAGE_KEYS.HORAS_DIARIAS, 'fecha', 'version', 'hash', 'timestamp', 'rangoExportado'];
                    if (Object.keys(data).some(k => !allowedRootKeys.includes(k))) { UILogic.mostrarToast('Archivo con estructura sospechosa', 'error'); return; }
                    if (!data || typeof data !== 'object' || Array.isArray(data)) { UILogic.mostrarToast('Estructura de archivo inválida', 'error'); return; }
                    if (!data.registros || !Array.isArray(data.registros)) { UILogic.mostrarToast('Archivo inválido o corrupto', 'error'); return; }
                    if (data.version && data.version > S.SECURITY_LIMITS.SCHEMA_VERSION) {
                        UILogic.mostrarToast(`Archivo de versión más nueva (v${data.version}). Algunos datos pueden no importarse correctamente.`, 'warning');
                    }
                    if (data.rangoExportado !== undefined) {
                        const rangoSafe = S.sanitizeString(String(data.rangoExportado), 100);
                        if (!/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\-:]+$/.test(rangoSafe)) { UILogic.mostrarToast('Metadatos de rango inválidos', 'error'); return; }
                    }
                    if (data.hash) {
                        if (await S.calcularHashSHA256(data.registros) !== data.hash) {
                            UILogic.mostrarToast('⚠️ El archivo puede estar corrupto o modificado', 'warning');
                            if (!(await confirmarModal('El hash de integridad no coincide. ¿Restaurar de todas formas?', 'Restaurar', '#icon-upload'))) return;
                        }
                    } else {
                        if (!(await confirmarModal('Este archivo no tiene verificación de integridad. ¿Restaurar de todas formas?', 'Restaurar', '#icon-upload'))) return;
                    }
                    if (data.registros.length > S.SECURITY_LIMITS.MAX_REGISTROS) { UILogic.mostrarToast(`Máximo ${S.SECURITY_LIMITS.MAX_REGISTROS} registros permitidos`, 'error'); return; }

                    const registrosImportados = normalizarRegistrosImportados(data.registros, calcularHoras);
                    if (registrosImportados.length === 0) { UILogic.mostrarToast('No se encontraron registros válidos', 'warning'); return; }

                    if (modo === 'replace') {
                        registros = registrosImportados;
                        if (Array.isArray(data.diasHabiles)) {
                            const diasValidos = data.diasHabiles.filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
                            if (diasValidos.length > 0) diasHabiles = diasValidos;
                        }
                        if (data.horasDiarias !== undefined) {
                            const horasParsed = typeof data.horasDiarias === 'string' ? parseFloat(data.horasDiarias) : data.horasDiarias;
                            if (Number.isFinite(horasParsed) && horasParsed >= 0 && horasParsed <= 24) horasDiarias = horasParsed;
                        }
                        finalizarImportacionAndSave(registrosImportados.length === 1 ? 'Se reemplazaron los datos por 1 registro' : `Se reemplazaron los datos por ${registrosImportados.length} registros`);
                    } else if (modo === 'merge') {
                        const fechasExistentes = new Set(registros.map(r => r.fecha));
                        const nuevos = registrosImportados.filter(imp => !fechasExistentes.has(imp.fecha));
                        const complementarios = registrosImportados.filter(imp => {
                            if (!fechasExistentes.has(imp.fecha)) return false;
                            const local = registros.find(r => r.fecha === imp.fecha);
                            if (!local) return false;
                            return (!local.salida && imp.salida) || (!local.tiempoFuera && imp.tiempoFuera);
                        });

                        if (nuevos.length === 0 && complementarios.length === 0) { UILogic.mostrarToast('No hay días nuevos ni datos para completar', 'info'); return; }
                        if (registros.length + nuevos.length > S.SECURITY_LIMITS.MAX_REGISTROS) { UILogic.mostrarToast(`Límite alcanzado. Solo se pueden agregar ${S.SECURITY_LIMITS.MAX_REGISTROS - registros.length} registros más`, 'error'); return; }

                        complementarios.forEach(imp => {
                            const local = registros.find(r => r.fecha === imp.fecha);
                            if (!local) return;
                            if (!local.salida && imp.salida) local.salida = imp.salida;
                            if (!local.tiempoFuera && imp.tiempoFuera) local.tiempoFuera = imp.tiempoFuera;
                            const t = calcularHoras(local.entrada, local.salida, local.tiempoFuera || null, local.credito || null);
                            if (t) { local.horas = t.horas; local.minutos = t.minutos; local.total = t.total; }
                        });
                        registros = registros.concat(nuevos);
                        const partes = [];
                        if (nuevos.length > 0) partes.push(`${nuevos.length} día${nuevos.length !== 1 ? 's' : ''} nuevo${nuevos.length !== 1 ? 's' : ''}`);
                        if (complementarios.length > 0) partes.push(`${complementarios.length} registro${complementarios.length !== 1 ? 's' : ''} completado${complementarios.length !== 1 ? 's' : ''}`);
                        finalizarImportacionAndSave(`Combinado: ${partes.join(', ')}`);
                    }
                } catch (err) {
                    console.error('Error en importación:', err);
                    UILogic.mostrarToast(err instanceof SyntaxError ? 'Archivo JSON mal formado' : 'Error al procesar el archivo', 'error');
                }
            };
            reader.onerror = () => { UILogic.mostrarToast('Error al leer el archivo', 'error'); };
            reader.readAsText(file);
        }

        async function finalizarImportacionAndSave(mensajeExito) {
            ordenarRegistros();
            HistoryManager.saveState(registros);
            if (await guardarYActualizar()) {
                const esPerfilDefault = window.PerfilManager && PerfilManager.obtenerPerfilActual() === 'default';
                if (esPerfilDefault) {
                    StorageHelper.setItem(STORAGE_KEYS.DIAS_HABILES, diasHabiles);
                    StorageHelper.setItem(STORAGE_KEYS.HORAS_DIARIAS, horasDiarias);
                }
                UILogic.mostrarToast(mensajeExito, 'success');
                UILogic.cerrarImportar();
                $('file-import').value = '';
            }
        }

        function detenerYRegistrarTimer(registro) {
            const perfilId = window.PerfilManager ? PerfilManager.obtenerPerfilActual() : 'default';
            const storageKey = STORAGE_KEYS.BREAK_TIME(perfilId);
            const storedStart = StorageHelper.getItem(storageKey);
            if (!storedStart) return false;

            const diffMs = Date.now() - parseInt(storedStart);
            const segundosTranscurridos = Math.floor(diffMs / 1000);
            if (segundosTranscurridos < 30) { StorageHelper.removeItem(storageKey); return false; }

            let minutosTranscurridos = Math.floor(segundosTranscurridos / 60);
            if ((segundosTranscurridos % 60) >= 30) minutosTranscurridos += 1;

            const tiempoActual = registro.tiempoFuera || '00:00';
            registro.tiempoFuera = TimeUtils.sumarMinutosAHora(tiempoActual, minutosTranscurridos);
            StorageHelper.removeItem(storageKey);
            return true;
        }

        function detectarAyerAbierto(fechaHoy, regs) {
            const ayerObj = TimeUtils.parsearFechaLocal(fechaHoy);
            ayerObj.setDate(ayerObj.getDate() - 1);
            const ayerStr = TimeUtils.formatearFechaLocal(ayerObj);
            const regAyer = regs instanceof Map ? (regs.get(ayerStr) ?? null) : (regs.find(r => r.fecha === ayerStr) ?? null);

            let ayerAbierto = false;
            if (regAyer?.entrada && !regAyer.salida) {
                const [hE, mE] = regAyer.entrada.split(':').map(Number);
                const fechaEntrada = TimeUtils.parsearFechaLocal(ayerStr);
                fechaEntrada.setHours(hE, mE, 0, 0);
                ayerAbierto = (Date.now() - fechaEntrada.getTime()) <= 86400000;
            }
            return { ayerStr, regAyer, ayerAbierto };
        }

        function calcularBufferSemanal(inicioSemana, fechaHoy) {
            const horasDiariasLocal = horasDiarias;
            let buffer = 0;
            const registrosRango = registros.filter(r => r.fecha >= inicioSemana && r.fecha <= fechaHoy);
            const registrosMap = new Map(registrosRango.map(r => [r.fecha, r]));

            const { ayerStr, ayerAbierto } = detectarAyerAbierto(fechaHoy, registrosMap);

            for (const isoDate of TimeUtils.generarRangoFechas(inicioSemana, fechaHoy)) {
                const numDia = TimeUtils.parsearFechaLocal(isoDate).getDay();
                const esDiaLaboralConfigurado = diasHabiles.includes(numDia);
                const r = registrosMap.get(isoDate);
                let horasObjetivoDia = 0, horasHechasDia = 0;
                const esEspecial = r && TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
                const tieneSalida = r && r.salida && !esEspecial;
                const esRemoto = esEspecial && TiposRegistro.obtenerTipoPorCodigo(r?.entrada, r?.salida)?.id === 'remoto';

                let diaTerminado = (isoDate === fechaHoy) ? tieneSalida : (ayerAbierto && isoDate === ayerStr ? false : true);

                if (esRemoto) {
                    if (esDiaLaboralConfigurado) horasObjetivoDia = horasDiariasLocal;
                    horasHechasDia = horasDiariasLocal;
                } else {
                    if (esDiaLaboralConfigurado && !esEspecial && diaTerminado) horasObjetivoDia = horasDiariasLocal;
                    if (r && !esEspecial && r.salida) horasHechasDia = r.total;
                }
                buffer += (horasHechasDia - horasObjetivoDia);
            }
            return buffer;
        }

        function limpiarFiltros() {
            filtroActivo = false; filtroDesde = null; filtroHasta = null; filtroTipo = null;
            $('filtro-fecha-desde').value = ''; $('filtro-fecha-hasta').value = ''; $('filtro-tipo').value = '';
            guardarYActualizar();
            UILogic.cerrarFiltros();
            UILogic.mostrarToast('Filtro eliminado', 'info');
            document.getElementById('btn-filtro').classList.remove('filtro-activo');
        }

        function aplicarFiltrosInmediato(desde, hasta, tipo) {
            if (!desde && !hasta && !tipo) {
                filtroActivo = false; filtroDesde = null; filtroHasta = null; filtroTipo = null;
                document.getElementById('btn-filtro').classList.remove('filtro-activo');
            } else {
                filtroActivo = true; filtroDesde = desde || null; filtroHasta = hasta || null; filtroTipo = tipo || null;
                document.getElementById('btn-filtro').classList.add('filtro-activo');
            }
            guardarYActualizar();
        }

        function obtenerRegistrosFiltrados() {
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
            const tipoConfig = TiposRegistro.obtenerTipoPorId(tipo);
            if (!tipoConfig) { UILogic.mostrarToast('Tipo inválido', 'error'); throw new Error('Tipo inválido'); }
            const entrada = tipoConfig.codigo;
            const salida = tipoConfig.codigo;

            const fechasARegistrar = TimeUtils.generarRangoFechas(desde, hasta);

            if (fechasARegistrar.length > 60) { UILogic.mostrarToast(`El rango seleccionado contiene ${fechasARegistrar.length} días.\n Máximo permitido: 60 días por operación.`, 'error'); throw new Error('Límite de días excedido'); }

            const nuevosRegistros = fechasARegistrar.filter(f => !registros.some(r => r.fecha === f));
            if (nuevosRegistros.length === 0) { UILogic.mostrarToast('Todas las fechas ya están registradas', 'warning'); throw new Error('Sin fechas nuevas'); }

            const idsNuevosParaAnimar = [];
            nuevosRegistros.forEach(fecha => {
                const t = calcularHoras(entrada, salida, null);
                const nuevoId = S.generarIDSeguro();
                idsNuevosParaAnimar.push(nuevoId);
                registros.push({
                    id: nuevoId, fecha: fecha, entrada: entrada, salida: salida, tiempoFuera: null,
                    horas: t?.horas || 0, minutos: t?.minutos || 0, total: t?.total || 0
                });
            });

            ordenarRegistros();
            HistoryManager.saveState(registros);
            const saved = await guardarYActualizar(idsNuevosParaAnimar);
            if (saved) {
                UILogic.mostrarToast(nuevosRegistros.length === 1 ? '1 día registrado' : `${nuevosRegistros.length} días registrados`, 'success');
                if (UILogic.actualizarBotonLote) UILogic.actualizarBotonLote();
            } else { throw new Error('Error al guardar'); }
        }

        function _aplicarEstadoHistorial(estado, mensaje) {
            if (!estado) return;
            registros.splice(0, registros.length, ...estado);
            registros.forEach(r => {
                if (r.entrada && r.salida && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) {
                    const t = calcularHoras(r.entrada, r.salida, r.tiempoFuera || null, r.credito || null);
                    if (t) { r.horas = t.horas; r.minutos = t.minutos; r.total = t.total; }
                }
            });
            guardarYActualizar(null, true);
            UILogic.mostrarToast(mensaje, 'info');
            if (window.UILogic && window.UILogic.actualizarBotonLote) {
                const modoLote = document.getElementById('modo-lote');
                if (modoLote && getComputedStyle(modoLote).display !== 'none') window.UILogic.actualizarBotonLote();
            }
            if (window.UILogic && window.UILogic.iniciarTimerAutoCierreBotones) window.UILogic.iniciarTimerAutoCierreBotones();
        }

        async function borrarPeriodoDirecto(desde, hasta) {
            const registrosAEliminar = registros.filter(r => {
                if (r.fecha < desde || r.fecha > hasta) return false;
                return !TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
            });
            if (registrosAEliminar.length > 60) { UILogic.mostrarToast(`Máximo 60 registros. Encontrados: ${registrosAEliminar.length}`, 'error'); throw new Error('Límite excedido'); }
            if (registrosAEliminar.length === 0) { UILogic.mostrarToast('No hay registros de jornadas en ese período', 'info'); throw new Error('Sin registros'); }

            registros = registros.filter(r => !registrosAEliminar.includes(r));
            HistoryManager.saveState(registros);
            const saved = await guardarYActualizar();
            if (saved) {
                UILogic.mostrarToast(registrosAEliminar.length === 1 ? '1 registro eliminado' : `${registrosAEliminar.length} registros eliminados`, 'success');
                UILogic.actualizarBotonLote?.();
            } else { throw new Error('Error al guardar'); }
        }

        return {
            registros: () => registros, horasSemanales: () => (horasDiarias * diasHabiles.length), diasHabiles: () => diasHabiles,
            horasDiarias: () => horasDiarias, setDiasHabiles: (v) => diasHabiles = v, setHorasDiarias: (v) => horasDiarias = v,
            getIgnorarTiempoFuera: () => ignorarTiempoFuera, setIgnorarTiempoFuera: (v) => { ignorarTiempoFuera = v; },
            recalcularTotalesEnMemoria: function () {
                registros.forEach(r => {
                    if (r.entrada && r.salida && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) {
                        const t = calcularHoras(r.entrada, r.salida, r.tiempoFuera || null, r.credito || null);
                        if (t) { r.horas = t.horas; r.minutos = t.minutos; r.total = t.total; }
                    }
                });
            },
            editandoId: () => editandoId, setEditandoId: (id) => editandoId = id, vistaActual: () => vistaActual, setVistaActual: (v) => vistaActual = v,
            cargarConfiguracion, calcularHoras, calcularHorasFeriadoEnRango, normalizarRegistrosImportados, guardarYActualizar,
            agregarRegistro, eliminarRegistroActual, editarRegistro, guardarEdicion, borrarTodoHistorial, exportarJSON, importarDatos,
            calcularBufferSemanal, detectarAyerAbierto, aplicarFiltrosInmediato, limpiarFiltros, obtenerRegistrosFiltrados,
            registrarVacacionesDirecto, borrarPeriodoDirecto, registrarDiaEspecial, editarGrupo, guardarEdicionGrupo,
            eliminarGrupoActual, setGrupoEnEdicion: (val) => grupoEnEdicion = val,
            undoAction: function () { _aplicarEstadoHistorial(HistoryManager.undo(), 'Deshecho'); },
            redoAction: function () { _aplicarEstadoHistorial(HistoryManager.redo(), 'Rehecho'); }
        };
    })(SecurityAndUtils);

    // ====================================================================
    //                     MÓDULO GIST SYNC
    // ====================================================================
    const GistSync = (function (S) {
        const GIST_FILENAME = 'horarios_backup.json';
        const GIST_ID_REGEX = /^[a-f0-9]{20,40}$/i;

        function esGistIdValido(id) { return id && GIST_ID_REGEX.test(id.trim()); }

        function _conPerfil(fn) {
            if (!window.PerfilManager) return;
            const perfil = PerfilManager.obtenerDatosPerfil();
            if (perfil) { fn(perfil); PerfilManager.guardarPerfiles(); }
        }

        function getToken() { return StorageHelper.getItem(STORAGE_KEYS.GIST_TOKEN, ''); }

        function getGistId() { return window.PerfilManager?.obtenerDatosPerfil()?.gistId || ''; }
        function getLastSync() { return window.PerfilManager?.obtenerDatosPerfil()?.gistLastSync || null; }
        function getMergeBehavior() { return window.PerfilManager?.obtenerDatosPerfil()?.gistMergeBehavior || 'replace'; }
        function setMergeBehavior(valor) { _conPerfil(perfil => { perfil.gistMergeBehavior = valor; }); }

        function getAutoSync() {
            const val = window.PerfilManager?.obtenerDatosPerfil()?.gistAutoSync;
            if (val === 1 || val === 2) return val;
            if (val === true) return 1;
            return 0;
        }
        function setAutoSync(valor) { _conPerfil(perfil => { perfil.gistAutoSync = valor; }); }

        function getRangoHorario() {
            const perfil = window.PerfilManager?.obtenerDatosPerfil();
            return {
                desde: perfil?.gistRangoDesde || '21:00',
                hasta: perfil?.gistRangoHasta || '00:00'
            };
        }
        function setRangoHorario(desde, hasta) { _conPerfil(perfil => { perfil.gistRangoDesde = desde; perfil.gistRangoHasta = hasta; }); }

        function _claveHoraActual() {
            return TimeUtils.fechaLocalISOFull().slice(0, 13);
        }

        function getSyncCount(tipo) {
            const perfil = window.PerfilManager?.obtenerDatosPerfil();
            const key = `gistSyncCount_${tipo}`;
            const keyFecha = `gistSyncFecha_${tipo}`;
            if (!perfil?.[keyFecha] || perfil[keyFecha] !== _claveHoraActual()) return 0;
            return perfil?.[key] || 0;
        }

        function marcarSync(tipo) {
            if (getSyncLimite(tipo) === 0) return;
            _conPerfil(perfil => {
                const key = `gistSyncCount_${tipo}`;
                const keyFecha = `gistSyncFecha_${tipo}`;
                const clave = _claveHoraActual();
                const esNuevaHora = perfil[keyFecha] !== clave;
                perfil[keyFecha] = clave;
                perfil[key] = esNuevaHora ? 1 : (perfil[key] || 0) + 1;
            });
        }

        function getSyncLimite(tipo) {
            const defValue = tipo === 'bajar' ? 2 : (tipo === 'subir' ? 1 : 2);
            return StorageHelper.getNumber(STORAGE_KEYS.GIST_LIMITE(tipo), defValue);
        }

        function setSyncLimite(tipo, valor) {
            const anteriorLimite = getSyncLimite(tipo);
            StorageHelper.setItem(STORAGE_KEYS.GIST_LIMITE(tipo), valor);
            if (anteriorLimite === 0 && valor > 0 && window.PerfilManager) {
                _conPerfil(perfil => {
                    perfil[`gistSyncCount_${tipo}`] = 0;
                    perfil[`gistSyncFecha_${tipo}`] = null;
                });
            }
        }

        function superaLimite(tipo) {
            const limite = getSyncLimite(tipo);
            if (limite === 0) return false;
            return getSyncCount(tipo) >= limite;
        }

        function dentroDelRangoHorario() {
            const { desde, hasta } = getRangoHorario();
            const horaActual = TimeUtils.obtenerHoraActual();
            return desde <= hasta ? (horaActual >= desde && horaActual <= hasta) : (horaActual >= desde || horaActual <= hasta);
        }

        function saveCredentials(token, gistId) {
            if (token) StorageHelper.setItem(STORAGE_KEYS.GIST_TOKEN, S.sanitizeString(token.trim(), 256));
            else StorageHelper.removeItem(STORAGE_KEYS.GIST_TOKEN);

            _conPerfil(perfil => {
                if (gistId && esGistIdValido(gistId)) perfil.gistId = gistId.trim();
                else if (gistId === '') delete perfil.gistId;
            });
        }

        function saveLastSync(gistId) {
            const ahoraISO = new Date().toISOString();
            _conPerfil(perfil => {
                perfil.gistLastSync = ahoraISO;
                if (gistId && esGistIdValido(gistId)) perfil.gistId = gistId;
            });
        }

        function formatLastSync(isoOrLegacy) {
            if (!isoOrLegacy) return null;
            try {
                const d = new Date(isoOrLegacy);
                if (!isNaN(d.getTime())) return d.toLocaleString('es-AR');
            } catch (e) { }
            return isoOrLegacy;
        }

        async function subir(registros, diasHabiles, horasDiarias) {
            const token = getToken();
            if (!token) throw new Error('Falta el token de GitHub');

            const hash = await S.calcularHashSHA256(registros);
            const data = { registros, diasHabiles, horasDiarias, fecha: S.fechaLocalISO(), version: S.SECURITY_LIMITS.SCHEMA_VERSION, hash, timestamp: Date.now() };
            const gistId = getGistId();
            const gistIdValido = esGistIdValido(gistId);
            const url = gistIdValido ? `https://api.github.com/gists/${gistId}` : 'https://api.github.com/gists';
            const method = gistIdValido ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
                body: JSON.stringify({ description: 'Horarios PWA - Backup automático', public: false, files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } })
            });

            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || `Error ${response.status}`);
            const result = await response.json();
            saveLastSync(result.id);
            return result.id;
        }

        async function bajar() {
            const token = getToken();
            const gistId = getGistId();
            if (!token) throw new Error('Falta el token de GitHub');
            if (!gistId || !esGistIdValido(gistId)) throw new Error('Gist ID inválido — dejá el campo vacío y subí primero para crear uno');

            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
            });

            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || `Error ${response.status}`);
            const file = (await response.json()).files[GIST_FILENAME];
            if (!file) throw new Error(`Archivo ${GIST_FILENAME} no encontrado en el Gist`);

            const data = JSON.parse(file.content, (key, value) => ['__proto__', 'constructor', 'prototype'].includes(key) ? undefined : value);
            if (data.hash && await S.calcularHashSHA256(data.registros) !== data.hash) data._hashNoCoincide = true;

            saveLastSync(gistId);
            return data;
        }

        return { getToken, getGistId, getLastSync, formatLastSync, getMergeBehavior, setMergeBehavior, getAutoSync, setAutoSync, getRangoHorario, setRangoHorario, getSyncCount, marcarSync, superaLimite, getSyncLimite, setSyncLimite, dentroDelRangoHorario, saveCredentials, esGistIdValido, subir, bajar };
    })(SecurityAndUtils);

    const UILogic = (function (S, D, GistSync) {

        let toastTimeout = null;
        let _toastQueue = [];
        let _toastRunning = false;
        let intervaloPulsacion = null;
        let timeoutInicial = null;
        let edicionBloqueada = true;
        let edicionGrupoBloqueada = true;
        let perfilEnEdicion = null;
        let modoLoteActivo = false;
        let tiempoExpansionBotones = null;
        let timerAutoCierreBotones = null;
        let modoEstadisticas = 'mensual';
        let _modalAbiertoDesdeLista = false;
        let _timerAutoVista = null;

        // ─── PROXIES A TIMEUTILS ───────────────────────────────────────────
        const obtenerFechaHoy = TimeUtils.obtenerFechaHoy;
        const obtenerHoraActual = TimeUtils.obtenerHoraActual;
        const minutosAHora = TimeUtils.minutosAHora;
        const obtenerNombreDia = TimeUtils.obtenerNombreDia;
        const horasATexto = TimeUtils.horasATexto;
        const horasATextoCorto = (t) => TimeUtils.horasATexto(t, 'short');
        const formatoTituloMes = TimeUtils.formatoTituloMes;
        const obtenerLunesSemana = TimeUtils.obtenerLunesSemanaISO;
        const _getLunes = TimeUtils.obtenerLunes;
        const obtenerSemanaActual = TimeUtils.obtenerSemanaRangoActual;

        function formatoDiferencia(tiempoTotal) {
            return TimeUtils.formatoDiferencia(tiempoTotal, D.horasDiarias());
        }

        function registrarSwipe(el, callback, { minX = 50, maxY = 80, ignoreInputs = false } = {}) {
            if (!el || el.dataset.swipeInit) return;
            el.dataset.swipeInit = '1';
            let _x = null, _y = null;
            el.addEventListener('touchstart', e => {
                if (e.touches.length !== 1) return;
                if (ignoreInputs && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
                _x = e.touches[0].clientX;
                _y = e.touches[0].clientY;
            }, { passive: true });
            el.addEventListener('touchend', e => {
                if (_x === null) return;
                const dx = e.changedTouches[0].clientX - _x;
                const dy = e.changedTouches[0].clientY - _y;
                _x = null; _y = null;
                if (Math.abs(dy) > maxY) return;
                if (Math.abs(dx) < minX) return;
                callback(dx < 0 ? 1 : -1);
            }, { passive: true });
        }

        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        function mostrarError(inputId, errorId) {
            const input = $(inputId);
            const error = $(errorId);
            if (input) input.classList.add('error');
            if (error) error.style.display = 'block';
        }

        function limpiarError(inputId, errorId) {
            const input = $(inputId);
            const error = $(errorId);
            if (input) input.classList.remove('error');
            if (error) error.style.display = 'none';
        }

        // ----------------------------------------------------------------
        // HELPERS COMPARTIDOS DE EXPORTACIÓN
        // ----------------------------------------------------------------

        function obtenerNombrePerfilSafe() {
            let nombre = 'Backup';
            if (window.PerfilManager) nombre = window.PerfilManager.obtenerDatosPerfil().nombre;
            return nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ'\-_ ]/g, '').trim().replace(/\s+/g, '_');
        }

        function descargarJSON(data, nombreArchivo) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function mostrarToast(mensaje, tipo = 'info', duracion = 3000) {
            const textoLimpio = S.sanitizeString(mensaje, 200);
            const ultimo = _toastQueue[_toastQueue.length - 1];
            const actual = _toastRunning ? $('toast')?.textContent : null;
            if ((ultimo && ultimo.mensaje === textoLimpio) || actual === textoLimpio) return;
            _toastQueue.push({ mensaje: textoLimpio, tipo, duracionBase: duracion });
            if (!_toastRunning) _procesarToastQueue();
        }

        function _procesarToastQueue() {
            if (_toastQueue.length === 0) {
                _toastRunning = false;
                return;
            }

            _toastRunning = true;
            const actual = _toastQueue.shift();
            const toast = $('toast');
            toast.classList.remove('show');
            toast.textContent = actual.mensaje;
            toast.className = `toast ${actual.tipo}`;
            let duracionFinal = actual.duracionBase || 3000;
            if (_toastQueue.length >= 2) {
                duracionFinal = Math.floor(duracionFinal / 2);
            }

            setTimeout(() => {
                toast.classList.add('show');
                toastTimeout = setTimeout(() => {
                    toast.classList.remove('show');
                    toastTimeout = null;
                    setTimeout(() => _procesarToastQueue(), 350);
                }, duracionFinal);
            }, 10);
        }

        function resetearBoton(btn) {
            btn.disabled = false;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.innerHTML = '<svg class="icon"><use href="#icon-save"/></svg> <span id="btn-registrar-texto">Fichar</span>';
        }

        function restaurarBotonGuardarEdicion(btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = '<svg class="icon"><use href="#icon-save"/></svg> Guardar';
        }



        function agruparRegistrosPorMes(registros) {
            if (!Array.isArray(registros)) {
                console.warn('agruparRegistrosPorMes: entrada inválida');
                return new Map();
            }

            const grupos = new Map();
            registros.forEach(r => {
                if (!r || typeof r !== 'object' || !r.fecha || typeof r.fecha !== 'string') {
                    return;
                }

                if (r.fecha.length < 7) {
                    return;
                }

                const claveMes = r.fecha.substring(0, 7);
                if (!grupos.has(claveMes)) {
                    grupos.set(claveMes, []);
                }
                grupos.get(claveMes).push(r);
            });
            return grupos;
        }

        function obtenerTipoRegistro(registro) {
            if (!registro) return null;

            const tipo = TiposRegistro.obtenerTipoPorCodigo(registro.entrada, registro.salida);
            return tipo ? tipo.id : null;
        }

        function esFechaConsecutiva(fechaActual, fechaSiguiente) {
            const actual = TimeUtils.parsearFechaLocal(fechaActual);
            const siguiente = TimeUtils.parsearFechaLocal(fechaSiguiente);
            actual.setDate(actual.getDate() - 1);
            return TimeUtils.formatearFechaLocal(actual) === fechaSiguiente;
        }

        function agruparRegistrosConsecutivos(registros) {
            if (!registros || registros.length === 0) return [];

            const resultado = [];
            let i = 0;

            while (i < registros.length) {
                const registroActual = registros[i];
                const tipoActual = obtenerTipoRegistro(registroActual);

                if (tipoActual === null) {
                    resultado.push({
                        tipo: 'individual',
                        registros: [registroActual]
                    });
                    i++;
                    continue;
                }

                const grupo = [registroActual];
                let j = i + 1;

                while (j < registros.length) {
                    const registroSiguiente = registros[j];
                    const tipoSiguiente = obtenerTipoRegistro(registroSiguiente);

                    if (tipoSiguiente !== tipoActual) break;

                    const ultimaFecha = grupo[grupo.length - 1].fecha;
                    if (!esFechaConsecutiva(ultimaFecha, registroSiguiente.fecha)) break;

                    grupo.push(registroSiguiente);
                    j++;
                }

                if (grupo.length > 1) {
                    resultado.push({
                        tipo: 'grupo',
                        subtipo: tipoActual,
                        registros: grupo
                    });
                } else {
                    resultado.push({
                        tipo: 'individual',
                        registros: grupo
                    });
                }

                i = j;
            }

            return resultado;
        }

        function _crearChevron() {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'icon chevron-mes chevron-mes-icon');
            svg.setAttribute('viewBox', '0 0 24 24');
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', '#icon-chevron-down');
            svg.appendChild(use);
            return svg;
        }

        function crearItemRegistroIndividual(r, horasDiarias, idResaltar = null, hoy = obtenerFechaHoy()) {
            const item = document.createElement('div');

            let className = r.fecha === hoy ? 'registro-item hoy' : 'registro-item';
            if (idResaltar && r.id === idResaltar) className += ' nuevo-registro-animacion';
            item.className = className;
            item.dataset.registroId = r.id;
            item.dataset.accion = 'editar-registro';

            const info = document.createElement('div');
            info.className = 'registro-info';

            const tipoEspecial = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);

            const fechaEl = document.createElement('div');
            fechaEl.className = 'registro-fecha';
            const etiqueta = tipoEspecial ? ` ${tipoEspecial.emoji} (${tipoEspecial.label})` : '';
            fechaEl.textContent = `${obtenerNombreDia(r.fecha)} ${r.fecha.substring(8)}${etiqueta}`;

            const tfText = (() => {
                if (!r.tiempoFuera || r.tiempoFuera === '' || r.tiempoFuera === '00:00') return '';
                const [tfH, tfM] = r.tiempoFuera.split(':').map(Number);
                const tfStr = tfH > 0 ? `${tfH}h${tfM > 0 ? ' ' + tfM + 'm' : ''}` : `${tfM}m`;
                return ` (${tfStr} Fuera)`;
            })();
            const crText = r.credito && r.credito !== '00:00' ? ' (Salida Temprano)' : '';

            const horasEl = document.createElement('div');
            horasEl.className = 'registro-horas';
            horasEl.textContent = tipoEspecial
                ? tipoEspecial.descripcion
                : `${r.entrada || '-'} → ${r.salida || '-'}${tfText}${crText}`;

            const totalEl = document.createElement('div');
            totalEl.className = 'registro-total';
            let totalText = 'Incompleto';

            if (tipoEspecial) {
                totalText = 'Justificado';
                totalEl.classList.add(`${tipoEspecial.color}-text`);
            } else if (r.entrada && r.salida) {
                totalText = `${r.horas}h ${r.minutos}m`;
                if (horasDiarias > 0) {
                    const diffText = formatoDiferencia(r.total);
                    totalEl.classList.add(r.total >= horasDiarias ? 'green-text' : 'red-text');
                    if (diffText) totalText += ` (${diffText})`;
                }
            } else if (r.entrada && !r.salida) {
                if (r.fecha === hoy) {
                    totalText = 'En curso . . .';
                    totalEl.classList.add('blue-text');
                } else {
                    totalText = 'Incompleto';
                    totalEl.classList.add('yellow-text');
                }
            } else {
                totalText = 'Sin datos';
            }

            totalEl.textContent = totalText;
            info.appendChild(fechaEl);
            info.appendChild(horasEl);
            info.appendChild(totalEl);
            item.appendChild(info);

            return item;
        }

        function crearContenedorMes(claveMes, registrosDelMes, horasDiarias, idNuevo, mesHoy, hoy) {
            const grupos = agruparRegistrosConsecutivos(registrosDelMes);

            const contenedorMesActual = document.createElement('div');
            contenedorMesActual.className = 'registro-mes-container';

            const headerMes = document.createElement('h3');
            headerMes.className = 'registro-mes-header';
            headerMes.dataset.mesId = claveMes;
            headerMes.dataset.accion = 'toggle-mes';
            headerMes.dataset.mesContainer = claveMes;

            const chevron = _crearChevron();
            headerMes.appendChild(chevron);
            headerMes.appendChild(document.createTextNode(' ' + formatoTituloMes(claveMes)));

            const detalleMesActual = document.createElement('div');
            detalleMesActual.className = 'registro-mes-detalle';

            let debeEstarExpandido = false;
            try {
                const estadoGuardado = StorageHelper.getItem(STORAGE_KEYS.MES_EXPANDIDO(claveMes));
                debeEstarExpandido = estadoGuardado !== null ? estadoGuardado === 'true' : claveMes === mesHoy;
            } catch (e) {
                debeEstarExpandido = claveMes === mesHoy;
            }

            if (debeEstarExpandido) {
                detalleMesActual.classList.add('expanded');
                chevron.style.transform = 'rotate(180deg)';
            }

            let semanaAnterior = null;
            grupos.forEach(grupo => {
                const esGrupo = grupo.tipo === 'grupo';
                const r = esGrupo ? grupo.registros[grupo.registros.length - 1] : grupo.registros[0];
                const semanaActual = obtenerLunesSemana(r.fecha);

                if (semanaAnterior && semanaActual !== semanaAnterior) {
                    const sep = document.createElement('div');
                    sep.className = 'separador-semana';
                    detalleMesActual.appendChild(sep);
                }

                detalleMesActual.appendChild(
                    esGrupo
                        ? crearGrupoExpandible(grupo, horasDiarias, idNuevo)
                        : crearItemRegistroIndividual(r, horasDiarias, idNuevo, hoy)
                );
                semanaAnterior = semanaActual;
            });

            contenedorMesActual.appendChild(headerMes);
            contenedorMesActual.appendChild(detalleMesActual);
            return contenedorMesActual;
        }

        function actualizarListaRegistros(registros, idNuevo = null) {
            const lista = $('lista-registros');

            const mesesExpandidos = new Set();
            lista.querySelectorAll('.registro-mes-container').forEach(container => {
                const detalle = container.querySelector('.registro-mes-detalle');
                if (detalle && detalle.classList.contains('expanded')) {
                    const header = container.querySelector('.registro-mes-header');
                    if (header && header.dataset.mesId) mesesExpandidos.add(header.dataset.mesId);
                }
            });

            lista.innerHTML = '';
            const horasDiarias = D.horasDiarias();
            const registrosAMostrar = D.obtenerRegistrosFiltrados();

            if (registrosAMostrar.length === 0) {
                lista.innerHTML = '<div class="empty-state">No hay registros</div>';
                return;
            }

            const hoy = obtenerFechaHoy();
            const mesHoy = hoy.substring(0, 7);
            const anioHoy = hoy.substring(0, 4);
            const gruposPorMes = agruparRegistrosPorMes(registrosAMostrar);
            const fragmento = document.createDocumentFragment();

            const mesesAnioActual = new Map();
            const mesesPorAnio = new Map();

            gruposPorMes.forEach((regs, claveMes) => {
                const anio = claveMes.substring(0, 4);
                if (anio === anioHoy) {
                    mesesAnioActual.set(claveMes, regs);
                } else {
                    if (!mesesPorAnio.has(anio)) mesesPorAnio.set(anio, new Map());
                    mesesPorAnio.get(anio).set(claveMes, regs);
                }
            });

            mesesAnioActual.forEach((registrosDelMes, claveMes) => {
                fragmento.appendChild(crearContenedorMes(claveMes, registrosDelMes, horasDiarias, idNuevo, mesHoy, hoy));
            });

            const aniosOrdenados = Array.from(mesesPorAnio.keys()).sort().reverse();
            aniosOrdenados.forEach(anio => {
                const mesesDelAnio = mesesPorAnio.get(anio);

                const contenedorAnio = document.createElement('div');
                contenedorAnio.className = 'registro-mes-container';

                const headerAnio = document.createElement('h3');
                headerAnio.className = 'registro-mes-header';
                headerAnio.dataset.anioId = anio;
                headerAnio.dataset.accion = 'toggle-anio';

                const chevronAnio = _crearChevron();
                headerAnio.appendChild(chevronAnio);
                headerAnio.appendChild(document.createTextNode(' ' + anio));

                const detalleAnio = document.createElement('div');
                detalleAnio.className = 'registro-mes-detalle';

                let anioExpandido = false;
                try {
                    anioExpandido = StorageHelper.getItem(STORAGE_KEYS.ANIO_EXPANDIDO(anio)) === 'true';
                } catch (e) { }

                if (anioExpandido) {
                    detalleAnio.classList.add('expanded');
                    chevronAnio.style.transform = 'rotate(180deg)';
                }

                mesesDelAnio.forEach((registrosDelMes, claveMes) => {
                    detalleAnio.appendChild(crearContenedorMes(claveMes, registrosDelMes, horasDiarias, idNuevo, mesHoy, hoy));
                });

                contenedorAnio.appendChild(headerAnio);
                contenedorAnio.appendChild(detalleAnio);
                fragmento.appendChild(contenedorAnio);
            });

            lista.appendChild(fragmento);
        }

        function setProgressBarColor(progressEl, status) {
            if (!progressEl) return;
            progressEl.className = 'progress-fill';
            progressEl.classList.add(status);
            if (status === 'blue') progressEl.classList.add('shimmer');
        }

        function crearGrupoExpandible(grupo, horasDiarias, idResaltar = null) {
            const primerReg = grupo.registros[0];
            const ultimoReg = grupo.registros[grupo.registros.length - 1];

            const container = document.createElement('div');
            container.className = 'registro-grupo-container';

            const header = document.createElement('div');

            let className = 'registro-item';
            let animarGrupo = false;

            if (idResaltar) {
                const idsNuevos = Array.isArray(idResaltar) ? idResaltar : [idResaltar];
                const contieneNuevo = grupo.registros.some(r => idsNuevos.includes(r.id));
                if (contieneNuevo) {
                    animarGrupo = true;
                }
            }

            if (animarGrupo) {
                className += ' nuevo-registro-animacion';
            }
            header.className = className;

            const info = document.createElement('div');
            info.className = 'registro-info';

            const fechaEl = document.createElement('div');
            fechaEl.className = 'registro-fecha';

            const tipoConfig = TiposRegistro.obtenerTipoPorId(grupo.subtipo);
            const emoji = tipoConfig ? tipoConfig.emoji : '📅';
            const label = tipoConfig ? tipoConfig.labelPlural : 'Registros';

            fechaEl.textContent = `${emoji} ${label} (${grupo.registros.length} días)`;

            const horasEl = document.createElement('div');
            horasEl.className = 'registro-horas';
            const rangoFechas = `${ultimoReg.fecha.substring(8)} al ${primerReg.fecha.substring(8)}`;
            horasEl.textContent = rangoFechas;

            const totalEl = document.createElement('div');
            const colorClase = tipoConfig ? `${tipoConfig.color}-text` : 'purple-text';
            totalEl.className = `registro-total ${colorClase}`;
            totalEl.textContent = 'Justificado';

            info.appendChild(fechaEl);
            info.appendChild(horasEl);
            info.appendChild(totalEl);
            header.appendChild(info);

            header.dataset.accion = 'editar-grupo';
            header.dataset.grupoData = JSON.stringify({
                registros: grupo.registros.map(r => r.id),
                subtipo: grupo.subtipo
            });

            container.appendChild(header);
            return container;
        }

        function calcularRegularidad(desviacionMinutos) {
            if (desviacionMinutos === null) return '--:--';
            const mins = Math.round(desviacionMinutos);
            const label = mins <= 20 ? 'Alta' : mins <= 40 ? 'Media' : 'Baja';
            return `±${mins}m | ${label}`;
        }

        function desviacionEstandar(valores) {
            if (valores.length < 2) return null;
            const media = valores.reduce((a, b) => a + b, 0) / valores.length;
            const varianza = valores.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / valores.length;
            return Math.sqrt(varianza);
        }

        function _calcularEstadisticasRango(registrosRango, opciones = {}) {
            const { regularidadPorMes = false } = opciones;

            const conteosPorTipo = {};
            TiposRegistro.obtenerTodosLosTipos().forEach(t => {
                conteosPorTipo[t.labelPlural.toLowerCase()] = registrosRango.filter(
                    r => r.entrada === t.codigo && r.salida === t.codigo
                ).length;
            });

            const compensaciones = registrosRango.filter(r => r.credito && r.credito !== '00:00').length;

            let tiempoFueraTotalMinutos = 0;
            registrosRango.forEach(r => {
                if (r.tiempoFuera && r.tiempoFuera !== '00:00') {
                    const [h, m] = r.tiempoFuera.split(':').map(Number);
                    if (!isNaN(h) && !isNaN(m)) tiempoFueraTotalMinutos += (h * 60) + m;
                }
            });
            const hTiempoFuera = Math.floor(tiempoFueraTotalMinutos / 60);
            const mTiempoFuera = tiempoFueraTotalMinutos % 60;

            const registrosValidos = registrosRango.filter(r =>
                r.entrada && r.salida && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)
            );

            const vacios = {
                entradaPromedio: '--:--', salidaPromedio: '--:--',
                diasTrabajados: 0, promedioDiario: '--:--',
                tiempoFueraTotal: '--:--', tiempoTotal: '--:--',
                ...conteosPorTipo, compensaciones,
                regularidadEntrada: '--:--', regularidadJornada: '--:--',
                bufferPeriodo: null
            };
            if (registrosValidos.length === 0) return vacios;

            const avgMin = arr => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
            const promedioEntrada = avgMin(registrosValidos.map(r => TimeUtils.horaAMinutos(r.entrada)));
            const promedioSalida = avgMin(registrosValidos.map(r => TimeUtils.horaAMinutos(r.salida)));

            const horasDiariasParaRemoto = D.horasDiarias();
            const remotos = conteosPorTipo['remotos'] || 0;
            const totalHorasTrabajadas = registrosValidos.reduce((s, r) => s + r.total, 0);
            const totalHoras = totalHorasTrabajadas + (remotos * horasDiariasParaRemoto);
            const promDiario = totalHorasTrabajadas / registrosValidos.length;
            let hPromedio = Math.floor(promDiario);
            let mPromedio = Math.round((promDiario - hPromedio) * 60);
            if (mPromedio === 60) { hPromedio++; mPromedio = 0; }
            let hTotal = Math.floor(totalHoras);
            let mTotal = Math.round((totalHoras - hTotal) * 60);
            if (mTotal === 60) { hTotal++; mTotal = 0; }

            let regEntrada, regJornada;
            if (regularidadPorMes) {
                const meses = [...new Set(registrosValidos.map(r => r.fecha.substring(0, 7)))];
                const desE = [], desJ = [];
                meses.forEach(mes => {
                    const regs = registrosValidos.filter(r => r.fecha.startsWith(mes));
                    if (regs.length >= 2) {
                        const dE = desviacionEstandar(regs.map(r => TimeUtils.horaAMinutos(r.entrada)));
                        const dJ = desviacionEstandar(regs.map(r => Math.round(r.total * 60)));
                        if (dE !== null) desE.push(dE);
                        if (dJ !== null) desJ.push(dJ);
                    }
                });
                regEntrada = calcularRegularidad(desE.length > 0 ? desE.reduce((a, b) => a + b, 0) / desE.length : null);
                regJornada = calcularRegularidad(desJ.length > 0 ? desJ.reduce((a, b) => a + b, 0) / desJ.length : null);
            } else {
                regEntrada = calcularRegularidad(desviacionEstandar(registrosValidos.map(r => TimeUtils.horaAMinutos(r.entrada))));
                regJornada = calcularRegularidad(desviacionEstandar(registrosValidos.map(r => Math.round(r.total * 60))));
            }

            const horasDiariasObj = D.horasDiarias();
            let bufferPeriodo = null;
            if (horasDiariasObj > 0 && opciones.desde && opciones.hasta) {
                const diasHabilesConfig = D.diasHabiles();
                const regsPorFecha = new Map(registrosRango.map(r => [r.fecha, r]));
                const hoy = obtenerFechaHoy();

                const { ayerStr, ayerAbierto } = D.detectarAyerAbierto(hoy, regsPorFecha);

                let objetivo = 0;
                let hechas = 0;
                for (const iso of TimeUtils.generarRangoFechas(opciones.desde, opciones.hasta)) {
                    if (iso > hoy) continue;
                    const esDiaHabil = diasHabilesConfig.includes(TimeUtils.parsearFechaLocal(iso).getDay());
                    const r = regsPorFecha.get(iso);
                    const esEspecial = r && TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
                    const esHoy = iso === hoy;
                    const esRemoto = esEspecial && TiposRegistro.obtenerTipoPorCodigo(r?.entrada, r?.salida)?.id === 'remoto';

                    let diaTerminado = true;
                    if (esHoy) {
                        diaTerminado = (r && r.salida);
                    } else if (ayerAbierto && iso === ayerStr) {
                        diaTerminado = false;
                    }

                    if (esDiaHabil && (!esEspecial || esRemoto) && diaTerminado) {
                        objetivo += horasDiariasObj;
                    }
                    if (r && r.salida && !esEspecial && diaTerminado) {
                        hechas += r.total;
                    }
                    if (esRemoto) {
                        hechas += horasDiariasObj;
                    }
                }
                bufferPeriodo = hechas - objetivo;
            }

            return {
                entradaPromedio: TimeUtils.minutosAHora(promedioEntrada),
                salidaPromedio: TimeUtils.minutosAHora(promedioSalida),
                diasTrabajados: registrosValidos.length,
                promedioDiario: `${hPromedio}h ${mPromedio}m`,
                tiempoFueraTotal: hTiempoFuera > 0 ? `${hTiempoFuera}h ${mTiempoFuera}m` : `${mTiempoFuera}m`,
                tiempoTotal: `${hTotal}h ${mTotal}m`,
                ...conteosPorTipo, compensaciones,
                regularidadEntrada: regEntrada,
                regularidadJornada: regJornada,
                bufferPeriodo
            };
        }

        function _renderizarStats(stats, opciones = {}) {
            const { mostrarBtnReporte = true } = opciones;

            const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
            set('stat-entrada-promedio', stats.entradaPromedio);
            set('stat-salida-promedio', stats.salidaPromedio);
            set('stat-tiempo-fuera-total', stats.tiempoFueraTotal);
            set('stat-tiempo-total', stats.tiempoTotal);

            const toggleStatItem = (id, value) => {
                const el = $(id); if (!el) return;
                const si = el.closest('.stat-item');
                if (si) { if (value === 0) { si.style.display = 'none'; } else { si.style.display = ''; el.textContent = value; } }
            };
            toggleStatItem('stat-dias-trabajados', stats.diasTrabajados);

            TiposRegistro.obtenerTodosLosTipos().forEach(t => {
                const clave = t.labelPlural.toLowerCase();
                toggleStatItem(`stat-${clave}`, stats[clave] || 0);
            });

            toggleStatItem('stat-compensaciones', stats.compensaciones);

            const elProm = $('stat-promedio-diario');
            if (elProm) elProm.textContent = stats.promedioDiario || '--:--';

            const elRegEnt = $('stat-regularidad-entrada');
            if (elRegEnt) elRegEnt.textContent = stats.regularidadEntrada || '--:--';
            const elRegJor = $('stat-regularidad-jornada');
            if (elRegJor) elRegJor.textContent = stats.regularidadJornada || '--:--';

            const btnReporte = document.getElementById('btn-reporte');
            if (btnReporte) {
                btnReporte.disabled = !mostrarBtnReporte;
            }
            const elSaldo = $('stat-saldo');
            const itemSaldo = $('stat-item-saldo');
            if (elSaldo && itemSaldo) {
                if (stats.bufferPeriodo === null) {
                    itemSaldo.style.display = 'none';
                } else {
                    itemSaldo.style.display = '';
                    const b = stats.bufferPeriodo;
                    elSaldo.textContent = b === 0 ? '0h' : horasATextoCorto(b);
                    elSaldo.style.color = b > 0 ? 'var(--c-green)' : b < 0 ? 'var(--c-red)' : 'var(--text-main)';
                }
            }
        }

        function calcularEstadisticasMes(mesAnio = null) {
            let mesActual, añoActual;
            if (mesAnio) {
                const [año, mes] = mesAnio.split('-').map(Number);
                añoActual = año; mesActual = mes - 1;
            } else {
                const hoy = new Date();
                mesActual = hoy.getMonth(); añoActual = hoy.getFullYear();
            }
            const registros = D.registros().filter(r => {
                const [a, m] = r.fecha.split('-').map(Number);
                return a === añoActual && m === mesActual + 1;
            });
            const primerDiaMes = `${añoActual}-${String(mesActual + 1).padStart(2, '0')}-01`;
            const ultimoDia = TimeUtils.formatearFechaLocal(new Date(añoActual, mesActual + 1, 0));
            let fechaDesde = primerDiaMes;
            const desdePrimeroDia = StorageHelper.getBoolean(STORAGE_KEYS.SALDO_DESDE_PRIMERO_MES, false);
            if (!desdePrimeroDia && registros.length > 0) {
                const primerRegistro = registros.reduce((min, r) => r.fecha < min ? r.fecha : min, registros[0].fecha);
                if (primerRegistro > fechaDesde) fechaDesde = primerRegistro;
            }
            return _calcularEstadisticasRango(registros, { regularidadPorMes: false, desde: fechaDesde, hasta: ultimoDia });
        }

        function actualizarEstadisticas(mesAnio = null) {
            const selectMes = $('select-mes-stats');
            if (!mesAnio && selectMes) mesAnio = selectMes.value;
            if (mesAnio && selectMes) {
                const [año, mes] = mesAnio.split('-').map(Number);
                const tieneRegs = D.registros().some(r => { const [a, m] = r.fecha.split('-').map(Number); return a === año && m === mes; });
                if (!tieneRegs) {
                    mesAnio = TimeUtils.formatearFechaLocal(new Date()).slice(0, 7);
                    if (selectMes) selectMes.value = mesAnio;
                }
            }
            const stats = calcularEstadisticasMes(mesAnio);
            _renderizarStats(stats, { mostrarBtnReporte: true });
        }

        let _fondoCard = 'golden-gate';
        let _bgFadeTimer = null;
        let _bgActiveLayer = 'a';

        function setFondoCard(valor) {
            _fondoCard = valor;
        }

        function toggleFondoCard() {
            const ids = [...(window.FONDOS_SVG || []).map(f => f.id), 'ninguno'];
            const idx = ids.indexOf(_fondoCard);
            _fondoCard = ids[(idx + 1) % ids.length];
            StorageHelper.setItem(STORAGE_KEYS.FONDO_CARD, _fondoCard, true);
            const btn = $('hint-fondo-label');
            if (btn) btn.textContent = _getLabelFondo(_fondoCard);
            const bg = $('stats-card-bg');
            if (bg && bg.dataset.estado) actualizarFondoCard(bg.dataset.estado);
        }

        function _getLabelFondo(id) {
            if (id === 'ninguno') return 'Sin fondo';
            const fondo = (window.FONDOS_SVG || []).find(f => f.id === id);
            return fondo ? fondo.label : id;
        }

        function _getSvgFondo(id, color) {
            const fondo = (window.FONDOS_SVG || []).find(f => f.id === id);
            if (!fondo) return '';
            return _sanitizarSVG(fondo.svg(color));
        }

        function _sanitizarSVG(svgStr) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgStr, 'image/svg+xml');

            const TAGS_BLOQUEADOS = ['script', 'foreignObject', 'use', 'iframe', 'object', 'embed', 'link'];
            TAGS_BLOQUEADOS.forEach(tag => {
                doc.querySelectorAll(tag).forEach(el => el.remove());
            });

            const ATTRS_BLOQUEADOS = /^on|^xlink:href$|^href$/i;
            doc.querySelectorAll('*').forEach(el => {
                [...el.attributes].forEach(attr => {
                    if (ATTRS_BLOQUEADOS.test(attr.name)) el.removeAttribute(attr.name);
                });
            });

            doc.querySelectorAll('[style]').forEach(el => {
                const safe = el.getAttribute('style').replace(/@import|url\s*\(/gi, '');
                el.setAttribute('style', safe);
            });

            const svgEl = doc.querySelector('svg');
            return svgEl ? svgEl.outerHTML : '';
        }

        function actualizarFondoCard(estado, colorOverride = null) {
            const bg = $('stats-card-bg');
            if (!bg) return;
            bg.dataset.estado = estado;

            const coloresVar = {
                blue: 'rgba(76,114,172,0.12)',
                green: 'rgba(76,172,140,0.12)',
                red: 'rgba(172,90,76,0.12)',
                purple: 'rgba(140,80,200,0.12)',
                gold: 'rgba(172,155,76,0.12)',
                orange: 'rgba(210, 120, 50, 0.12)',
            };

            const colores = {
                esperando: 'rgba(140,150,170,0.07)',
                en_curso: coloresVar.blue,
                finalizado_ok: coloresVar.green,
                finalizado_fail: coloresVar.red,
                especial: coloresVar.purple
            };

            const color = colorOverride
                ? (coloresVar[colorOverride] || colores.especial)
                : (colores[estado] || colores.esperando);

            if (_fondoCard === 'ninguno') {
                bg.innerHTML = '';
                return;
            }

            let layerA = bg.querySelector('.stats-card-bg__layer[data-layer="a"]');
            let layerB = bg.querySelector('.stats-card-bg__layer[data-layer="b"]');
            if (!layerA) {
                layerA = document.createElement('div');
                layerA.className = 'stats-card-bg__layer';
                layerA.dataset.layer = 'a';
                bg.appendChild(layerA);
            }
            if (!layerB) {
                layerB = document.createElement('div');
                layerB.className = 'stats-card-bg__layer';
                layerB.dataset.layer = 'b';
                bg.appendChild(layerB);
            }

            const nuevoSVG = _getSvgFondo(_fondoCard, color);
            const incoming = _bgActiveLayer === 'a' ? layerB : layerA;
            const outgoing = _bgActiveLayer === 'a' ? layerA : layerB;

            incoming.style.zIndex = '2';
            incoming.style.opacity = '0';
            incoming.innerHTML = nuevoSVG;

            outgoing.style.zIndex = '1';
            outgoing.style.opacity = '0';

            if (_bgFadeTimer) { clearTimeout(_bgFadeTimer); _bgFadeTimer = null; }

            incoming.offsetHeight;
            incoming.style.opacity = '1';

            _bgActiveLayer = _bgActiveLayer === 'a' ? 'b' : 'a';
            _bgFadeTimer = setTimeout(() => {
                outgoing.innerHTML = '';
                outgoing.style.opacity = '0';
                _bgFadeTimer = null;
            }, 650);
        }

        function calcularEstadoCard() {
            const hoy = obtenerFechaHoy();
            const { inicio: ini, fin: fn } = obtenerSemanaActual();
            const registros = D.registros();
            const horasDiarias = D.horasDiarias();
            const horasSemanales = D.horasSemanales();
            const diasHabiles = D.diasHabiles();
            const { ayerStr: ayer, regAyer, ayerAbierto } = D.detectarAyerAbierto(hoy, registros);

            const diaSemanaHoy = new Date().getDay();
            let esDiaHabil = true;
            if (Array.isArray(diasHabiles)) {
                esDiaHabil = diasHabiles.includes(diaSemanaHoy);
            } else {
                esDiaHabil = diaSemanaHoy === 0 ? (diasHabiles === 7) : (diaSemanaHoy <= diasHabiles);
            }

            const mapDia = d => d === 0 ? 7 : d;
            const hoyIndex = mapDia(diaSemanaHoy);
            let quedanDiasFuturos = false;
            if (Array.isArray(diasHabiles)) {
                for (let d = hoyIndex + 1; d <= 7; d++) {
                    if (diasHabiles.includes(d === 7 ? 0 : d)) { quedanDiasFuturos = true; break; }
                }
            } else {
                quedanDiasFuturos = hoyIndex < diasHabiles;
            }
            const regHoy = registros.find(r => r.fecha === hoy) ?? null;
            const semanaAbierta = quedanDiasFuturos || (esDiaHabil && !(regHoy && regHoy.salida));

            const bufferSemanal = D.calcularBufferSemanal(ini, hoy);

            const fechaLimite = hoy < fn ? hoy : fn;
            const registrosSemana = registros.filter(r => r.fecha >= ini && r.fecha <= fechaLimite);
            let totalSemana = 0;
            registrosSemana.forEach(r => {
                const tipo = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
                if (tipo && tipo.id === 'remoto') totalSemana += horasDiarias;
                else if (!tipo) totalSemana += r.total;
            });

            const horasDescontar = D.calcularHorasFeriadoEnRango(ini, fn);
            const objetivoSemana = Math.max(0, horasSemanales - horasDescontar);

            let todosEspeciales = false;
            if (Array.isArray(diasHabiles) && diasHabiles.length > 0 && horasDiarias > 0) {
                const fechasLaborables = TimeUtils.generarRangoFechas(ini, fn)
                    .filter(f => diasHabiles.includes(TimeUtils.parsearFechaLocal(f).getDay()));
                if (fechasLaborables.length > 0) {
                    const especiales = fechasLaborables.filter(fecha => {
                        const r = registros.find(x => x.fecha === fecha);
                        if (!r) return false;
                        const tipo = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
                        return tipo && tipo.id !== 'remoto';
                    });
                    todosEspeciales = (especiales.length === fechasLaborables.length);
                }
            }

            const tipoEspecialHoy = (regHoy && regHoy.salida && regHoy.entrada === regHoy.salida)
                ? TiposRegistro.obtenerTipoPorCodigo(regHoy.entrada, regHoy.salida)
                : null;

            let tiempoHoy = 0;
            if (ayerAbierto && !regHoy) {
                const horaActual = obtenerHoraActual();
                const t = D.calcularHoras(regAyer.entrada, horaActual, regAyer.tiempoFuera || null, null, true);
                tiempoHoy = t ? t.total : 0;
            } else if (regHoy && regHoy.entrada && !tipoEspecialHoy) {
                if (regHoy.salida) {
                    tiempoHoy = regHoy.total;
                } else {
                    const horaActual = obtenerHoraActual();
                    const t = D.calcularHoras(regHoy.entrada, horaActual, regHoy.tiempoFuera || null, null, true);
                    tiempoHoy = t ? t.total : 0;
                }
            }

            return {
                hoy, ini, fn,
                registros, regHoy,
                horasDiarias, horasSemanales,
                diasHabiles, esDiaHabil,
                semanaAbierta, bufferSemanal,
                totalSemana, objetivoSemana,
                tipoEspecialHoy, tiempoHoy,
                todosEspeciales,
                ayerAbierto, ayerStr: ayer, regAyer
            };
        }

        function derivarVistaSemana(est) {
            const { totalSemana: tot, objetivoSemana, semanaAbierta, horasDiarias, todosEspeciales } = est;

            const prog = objetivoSemana > 0 ? Math.min((tot / objetivoSemana) * 100, 100) : 100;

            let colorBarra, colorBorde, estadoFondo, mensaje, mostrarMensaje;

            if (horasDiarias === 0) {
                colorBarra = 'blue'; colorBorde = 'transparent';
                estadoFondo = 'esperando';
                mensaje = `Total fichado: ${horasATexto(tot)}`;
                mostrarMensaje = false;
            } else if (todosEspeciales) {
                colorBarra = 'blue'; colorBorde = 'transparent';
                estadoFondo = 'esperando';
                mensaje = 'Semana sin días laborables';
                mostrarMensaje = true;
            } else if (tot >= objetivoSemana) {
                colorBarra = 'green'; colorBorde = 'green';
                estadoFondo = 'finalizado_ok';
                mensaje = `Hiciste ${horasATexto(tot - objetivoSemana)} de más`;
                mostrarMensaje = true;
            } else if (semanaAbierta) {
                colorBarra = 'blue'; colorBorde = 'blue';
                estadoFondo = 'en_curso';
                mensaje = objetivoSemana === 0
                    ? `${horasATexto(tot)} (Sin objetivo)`
                    : `Faltan ${horasATexto(objetivoSemana - tot)}`;
                mostrarMensaje = true;
            } else {
                colorBarra = 'red'; colorBorde = 'red';
                estadoFondo = 'finalizado_fail';
                mensaje = `Faltaron ${horasATexto(objetivoSemana - tot)}`;
                mostrarMensaje = true;
            }

            return {
                titulo: `<svg class="icon"><use href="#icon-calendar-simple" /></svg> Esta Semana`,
                stats: todosEspeciales ? '🌞' : horasATexto(tot),
                mensaje, mostrarMensaje,
                colorBarra, anchoBarra: prog,
                colorBorde, estadoFondo,
                hint: 'Toca para ver Hoy',
                hintEsHTML: false,
            };
        }

        function _calcularHintSalidaEstimada(reg, objetivoDiario, bufferSemanal, diasHabiles) {
            const [hE, mE] = reg.entrada.split(':').map(Number);
            let minutosTotal = (hE * 60) + mE + (objetivoDiario * 60);

            if (reg.tiempoFuera && !D.getIgnorarTiempoFuera()) {
                const [hF, mF] = reg.tiempoFuera.split(':').map(Number);
                minutosTotal += (hF * 60) + mF;
            }

            const perfilId = window.PerfilManager ? PerfilManager.obtenerPerfilActual() : 'default';
            const inicioBreak = StorageHelper.getItem(STORAGE_KEYS.BREAK_TIME(perfilId));
            if (inicioBreak && !D.getIgnorarTiempoFuera()) {
                const mins = Math.floor((Date.now() - parseInt(inicioBreak)) / 60000);
                if (mins > 0) minutosTotal += mins;
            }

            let hS = Math.floor(minutosTotal / 60) % 24;
            const mS = Math.floor(minutosTotal % 60);
            const horaSalida = `${String(hS).padStart(2, '0')}:${String(mS).padStart(2, '0')}`;

            const esLaborable = Array.isArray(diasHabiles) && diasHabiles.includes(new Date().getDay());
            const mostrarBuffer = Math.abs(bufferSemanal) > 0.01 && esLaborable;

            if (mostrarBuffer) {
                const minutosConBuffer = minutosTotal - (bufferSemanal * 60);
                let hSB = Math.floor(minutosConBuffer / 60) % 24;
                const mSB = Math.floor(minutosConBuffer % 60);
                const horaBuf = `${String(hSB).padStart(2, '0')}:${String(mSB).padStart(2, '0')}`;
                const colorBuffer = bufferSemanal > 0 ? 'var(--c-green)' : bufferSemanal < 0 ? 'var(--c-red)' : 'var(--text-main)';
                return {
                    hint: `Salida estimada: <strong>${horaSalida}</strong> <span class="hint-buffer-color" data-color="${colorBuffer}">(<strong>${horaBuf}</strong>)</span>`,
                    hintEsHTML: true
                };
            }

            return {
                hint: `Salida estimada: <strong>${horaSalida}</strong>`,
                hintEsHTML: true
            };
        }

        function derivarVistaHoy(est) {
            const { regHoy, tiempoHoy, horasDiarias, esDiaHabil, tipoEspecialHoy, bufferSemanal, diasHabiles } = est;
            const objetivoDiario = horasDiarias;

            if (!regHoy || !regHoy.entrada) {

                if (est.ayerAbierto) {
                    const prog = objetivoDiario > 0 ? Math.min((tiempoHoy / objetivoDiario) * 100, 100) : 100;
                    const cumplido = objetivoDiario === 0 || tiempoHoy >= objetivoDiario;

                    let colorBarra = cumplido ? 'green' : 'blue';
                    let colorBorde = cumplido ? 'green' : 'blue';
                    let mensaje = '';

                    if (objetivoDiario === 0) {
                        mensaje = 'En curso (cruce de medianoche)';
                    } else if (cumplido) {
                        const extra = tiempoHoy - objetivoDiario;
                        if (bufferSemanal < 0 && Math.abs(bufferSemanal) > extra) {
                            mensaje = 'Te podes ir, pero debés tiempo';
                        } else {
                            mensaje = extra > 0 ? `Te podes ir (+${horasATexto(extra)})` : 'Te podes ir';
                        }
                    } else {
                        const faltante = objetivoDiario - tiempoHoy;
                        const faltanteTexto = `Faltan ${horasATexto(faltante)}`;
                        mensaje = bufferSemanal >= faltante ? `${faltanteTexto}, pero te podés ir` : faltanteTexto;
                    }

                    const nombreDiaAyer = obtenerNombreDia(est.ayerStr);
                    let hint = 'Toca Fichar para registrar salida';
                    let hintEsHTML = false;
                    const regAyer = est.regAyer;

                    if (regAyer && regAyer.entrada && objetivoDiario > 0 && !TiposRegistro.esRegistroEspecial(regAyer.entrada, regAyer.salida)) {
                        ({ hint, hintEsHTML } = _calcularHintSalidaEstimada(regAyer, objetivoDiario, bufferSemanal, diasHabiles));
                    }

                    return {
                        titulo: `<svg class="icon"><use href="#icon-clock" /></svg>${nombreDiaAyer} (ayer)`,
                        stats: horasATexto(tiempoHoy),
                        mensaje: mensaje,
                        mostrarMensaje: true,
                        colorBarra: colorBarra, anchoBarra: prog,
                        colorBorde: colorBorde, estadoFondo: 'en_curso', estadoFondoColor: null,
                        hint: hint,
                        hintEsHTML: hintEsHTML,
                    };
                }

                return {
                    titulo: `<svg class="icon"><use href="#icon-clock" /></svg>${obtenerNombreDia(obtenerFechaHoy())}`,
                    stats: esDiaHabil ? '🎒' : '🌞',
                    mensaje: esDiaHabil
                        ? (horasDiarias === 0 ? '' : 'Esperando registro...')
                        : (horasDiarias === 0 ? '' : 'Día libre'),
                    mostrarMensaje: horasDiarias > 0,
                    colorBarra: 'blue', anchoBarra: 0,
                    colorBorde: 'transparent', estadoFondo: 'esperando',
                    hint: 'Toca para ver la Semana', hintEsHTML: false,
                };
            }

            if (tipoEspecialHoy) {
                return {
                    titulo: `<svg class="icon"><use href="#icon-clock" /></svg>${obtenerNombreDia(obtenerFechaHoy())}`,
                    stats: `${tipoEspecialHoy.emoji} ${tipoEspecialHoy.label}`,
                    mensaje: `¡${tipoEspecialHoy.descripcion}!`,
                    mostrarMensaje: true,
                    colorBarra: tipoEspecialHoy.color, anchoBarra: 100,
                    colorBorde: tipoEspecialHoy.color,
                    estadoFondo: 'especial', estadoFondoColor: tipoEspecialHoy.color,
                    hint: 'Toca para ver la Semana', hintEsHTML: false,
                };
            }

            const dayClosed = !!regHoy.salida;
            const prog = objetivoDiario > 0 ? Math.min((tiempoHoy / objetivoDiario) * 100, 100) : 100;
            const cumplido = objetivoDiario === 0 || tiempoHoy >= objetivoDiario;

            let colorBarra, colorBorde, estadoFondo, mensaje, mostrarMensaje;

            if (objetivoDiario === 0) {
                colorBarra = 'blue'; colorBorde = 'transparent';
                estadoFondo = dayClosed ? 'finalizado_ok' : 'en_curso';
                mensaje = ''; mostrarMensaje = false;
            } else if (dayClosed) {
                colorBarra = cumplido ? 'green' : 'red';
                colorBorde = cumplido ? 'green' : 'red';
                estadoFondo = cumplido ? 'finalizado_ok' : 'finalizado_fail';
                const dif = tiempoHoy - objetivoDiario;
                mensaje = dif >= 0 ? `${horasATexto(dif)} extras` : `Faltaron ${horasATexto(Math.abs(dif))}`;
                mostrarMensaje = true;
            } else {
                colorBarra = cumplido ? 'green' : 'blue';
                colorBorde = cumplido ? 'green' : 'blue';
                estadoFondo = 'en_curso';
                mostrarMensaje = true;
                if (cumplido) {
                    const extra = tiempoHoy - objetivoDiario;
                    if (bufferSemanal < 0 && Math.abs(bufferSemanal) > extra) {
                        mensaje = 'Te podes ir, pero debés tiempo';
                    } else {
                        mensaje = extra > 0 ? `Te podes ir (+${horasATexto(extra)})` : 'Te podes ir';
                    }
                } else {
                    const faltante = objetivoDiario - tiempoHoy;
                    const faltanteTexto = `Faltan ${horasATexto(faltante)}`;
                    mensaje = bufferSemanal >= faltante ? `${faltanteTexto}, pero te podés ir` : faltanteTexto;
                }
            }

            let hint = 'Toca para ver la Semana';
            let hintEsHTML = false;
            if (regHoy.entrada && !dayClosed && objetivoDiario > 0 && !TiposRegistro.esRegistroEspecial(regHoy.entrada, regHoy.salida)) {
                ({ hint, hintEsHTML } = _calcularHintSalidaEstimada(regHoy, objetivoDiario, bufferSemanal, diasHabiles));
            }

            return {
                titulo: `<svg class="icon"><use href="#icon-clock" /></svg>${obtenerNombreDia(obtenerFechaHoy())}`,
                stats: horasATexto(tiempoHoy),
                mensaje, mostrarMensaje,
                colorBarra, anchoBarra: prog,
                colorBorde, estadoFondo, estadoFondoColor: null,
                hint, hintEsHTML,
            };
        }

        const _COLORES_BORDE = ['blue', 'green', 'red', 'purple', 'orange', 'gold', 'transparent'];

        function _renderTitulo(vista) {
            const el = $('stats-titulo');
            if (el) el.innerHTML = vista.titulo;
        }

        let _cicloStatsInterval = null;
        let _cicloStatsValorHoras = '';
        let _cicloStatsEntrada = '';
        let _cicloStatsSalida = '';

        const _CICLO_DURACION_MS = 2500;

        function _detenerCicloStats() {
            clearTimeout(_cicloStatsInterval);
            _cicloStatsInterval = null;
            const el = $('stats-semana');
            if (el) el.classList.remove('ciclo-fade-out', 'ciclo-fade-in');
        }

        function _iniciarCicloStats() {
            _detenerCicloStats();
            if (!_cicloStatsEntrada) return;

            const fases = [
                _cicloStatsValorHoras,
                `Entrada ${_cicloStatsEntrada}`,
                _cicloStatsSalida ? `Salida ${_cicloStatsSalida}` : null,
            ].filter(Boolean);

            let idx = 0;

            const _cicloTick = () => {
                const el = $('stats-semana');
                if (!el) { _detenerCicloStats(); return; }

                el.classList.add('ciclo-fade-out');

                setTimeout(() => {
                    idx++;
                    if (idx >= fases.length) {
                        el.classList.remove('ciclo-fade-out');
                        el.classList.add('ciclo-fade-in');
                        el.textContent = _cicloStatsValorHoras;
                        void el.offsetWidth;
                        el.classList.remove('ciclo-fade-in');
                        _detenerCicloStats();
                        return;
                    }

                    el.classList.remove('ciclo-fade-out');
                    el.classList.add('ciclo-fade-in');
                    el.textContent = fases[idx];
                    void el.offsetWidth;
                    el.classList.remove('ciclo-fade-in');

                    _cicloStatsInterval = setTimeout(_cicloTick, _CICLO_DURACION_MS);
                }, 350);
            };

            _cicloStatsInterval = setTimeout(_cicloTick, _CICLO_DURACION_MS);
        }

        function _renderStats(vista) {
            const el = $('stats-semana');
            if (!el) return;

            const esDiaria = D.vistaActual() !== 'semana';
            const hoy = obtenerFechaHoy();
            const regHoy = D.registros().find(r => r.fecha === hoy) ?? null;
            const esEspecial = regHoy && TiposRegistro.esRegistroEspecial(regHoy.entrada, regHoy.salida);
            const entradaHoy = (esDiaria && regHoy && regHoy.entrada && !esEspecial) ? regHoy.entrada : '';
            const salidaHoy = (esDiaria && regHoy && regHoy.salida && !esEspecial) ? regHoy.salida : '';

            _cicloStatsValorHoras = vista.stats;
            _cicloStatsEntrada = entradaHoy;
            _cicloStatsSalida = salidaHoy;

            if (!_cicloStatsInterval) {
                el.textContent = vista.stats;
            }
        }

        function _renderBarra(vista) {
            const el = $('progress-bar');
            if (!el) return;
            el.style.width = `${vista.anchoBarra}%`;
            setProgressBarColor(el, vista.colorBarra);
        }

        function _renderMensaje(vista) {
            const el = $('stats-mensaje');
            if (!el) return;
            el.textContent = vista.mensaje;
            el.style.display = vista.mostrarMensaje ? 'block' : 'none';
        }

        function _renderCard(vista) {
            const card = $('stats-card');
            if (!card) return;
            card.classList.remove(..._COLORES_BORDE.map(c => `border-${c}`));
            card.classList.add(`border-${vista.colorBorde}`);
            actualizarFondoCard(vista.estadoFondo, vista.estadoFondoColor ?? null);
        }

        function _renderHint(vista) {
            const el = $('toggle-hint');
            if (!el) return;
            if (vista.hintEsHTML) { el.innerHTML = vista.hint; _applyDataColors(el); }
            else el.textContent = vista.hint;
        }

        function _renderBuffer(est) {
            const el = $('stats-buffer');
            if (!el) return;
            el.innerHTML = '';
            const { bufferSemanal, horasDiarias, semanaAbierta } = est;
            if (horasDiarias > 0 && Math.abs(bufferSemanal) > 0.01 && semanaAbierta) {
                const esPositivo = bufferSemanal > 0;
                const color = esPositivo ? 'var(--c-green)' : 'var(--c-red)';
                const punto = document.createElement('span');
                punto.className = 'buffer-semanal-punto';
                punto.style.backgroundColor = color;
                const span = document.createElement('span');
                span.style.color = color;
                span.style.fontWeight = '500';
                span.textContent = `${horasATexto(Math.abs(bufferSemanal))} ${esPositivo ? 'extras' : 'faltantes'} esta semana`;
                span.insertBefore(punto, span.firstChild);
                el.appendChild(span);
            }
        }

        function _renderSelectorStats() {
            const anioEl = $('select-anio-stats');
            const mesEl = $('select-mes-stats');
            const semEl = $('select-semana-stats');
            const labelEl = $('label-periodo-toggle');
            if (modoEstadisticas === 'anual') {
                if (anioEl) anioEl.classList.remove('hidden');
                if (mesEl) mesEl.classList.add('hidden');
                if (semEl) semEl.classList.add('hidden');
                if (labelEl) labelEl.textContent = 'Anual';
                poblarSelectorAnios();
            } else if (modoEstadisticas === 'semanal') {
                if (anioEl) anioEl.classList.add('hidden');
                if (mesEl) mesEl.classList.add('hidden');
                if (semEl) semEl.classList.remove('hidden');
                if (labelEl) labelEl.textContent = 'Semanal';
                poblarSelectorSemanas();
                actualizarEstadisticasSemana(semEl?.value);
            } else {
                if (anioEl) anioEl.classList.add('hidden');
                if (mesEl) mesEl.classList.remove('hidden');
                if (semEl) semEl.classList.add('hidden');
                if (labelEl) labelEl.textContent = 'Mensual';
                poblarSelectorMeses();
            }
        }

        // ── Utilidades de animación ──────────────────────────────────────────
        function _getCSSdur(varName) {
            const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            if (!raw) return 300;
            return raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
        }
        const DUR_ANIM = () => _getCSSdur('--dur-anim');
        const DUR_CALENDARIO = () => _getCSSdur('--dur-calendario');

        // Patrón genérico: fade-out → fn() → fade-in, sincronizado con --dur-anim
        function _animarFadeSwap(el, fn) {
            if (!el) { fn(); return; }
            el.classList.add('fade-out');
            setTimeout(() => { fn(); el.classList.remove('fade-out'); }, DUR_ANIM());
        }

        function _animarCambioCard(renderFn) {
            const els = [
                $('stats-semana'),
                $('stats-mensaje'),
                $('stats-buffer'),
                $('toggle-hint'),
            ].filter(Boolean);

            _detenerCicloStats();

            els.forEach(el => el.classList.add('ciclo-fade-out'));

            setTimeout(() => {
                renderFn();
                els.forEach(el => {
                    el.classList.remove('ciclo-fade-out');
                    el.classList.add('ciclo-fade-in');
                    void el.offsetWidth;
                    el.classList.remove('ciclo-fade-in');
                });
            }, DUR_ANIM());
        }

        function actualizarUI(idNuevo = null, soloReloj = false, animarCard = false) {
            if (!soloReloj) {
                actualizarListaRegistros(D.registros(), idNuevo);
            }

            const est = calcularEstadoCard();
            const vista = D.vistaActual() === 'semana'
                ? derivarVistaSemana(est)
                : derivarVistaHoy(est);

            _renderTitulo(vista);
            _renderCard(vista);
            _renderBarra(vista);
            _renderSelectorStats();
            actualizarEstadoBotonTimerMain();
            if (_vistaHistoricoCalendario) {
                const selector = document.getElementById('calendario-selector-meses');
                if (selector && selector.style.display !== 'none') {
                    _cerrarSelectorMeses(idNuevo);
                } else {
                    _renderizarCalendario(idNuevo);
                }
            }

            const debeAnimar = animarCard || (idNuevo !== null && !soloReloj);
            if (debeAnimar) {
                _animarCambioCard(() => {
                    _renderStats(vista);
                    _renderMensaje(vista);
                    _renderHint(vista);
                    _renderBuffer(est);
                });
            } else {
                _renderStats(vista);
                _renderMensaje(vista);
                _renderHint(vista);
                _renderBuffer(est);
            }
        }

        // ─── TOGGLES DE UI Y STORAGE ───────────────────────────────────────

        /**
         * Factory para pares toggle/actualizarEstado de configuraciones booleanas.
         *
         * @param {object} cfg
         * @param {function(): boolean}  cfg.getVal        - Lee el valor actual.
         * @param {function(boolean): void} cfg.setVal     - Persiste el nuevo valor.
         * @param {string}               cfg.btnId         - ID del botón a marcar con btn-activo.
         * @param {string}               cfg.mensajeOn     - Toast cuando queda activo.
         * @param {string}               cfg.mensajeOff    - Toast cuando queda inactivo.
         * @param {function(boolean): void} [cfg.onAfterToggle] - Efecto secundario opcional.
         * @returns {{ toggle: function, actualizarEstado: function }}
         */
        function _crearToggleConfig({ getVal, setVal, btnId, mensajeOn, mensajeOff, onAfterToggle }) {
            function actualizarEstado() {
                _setBtnActivo(btnId, getVal());
            }
            function toggle() {
                const nuevo = !getVal();
                setVal(nuevo);
                actualizarEstado();
                mostrarToast(nuevo ? mensajeOn : mensajeOff, 'info');
                onAfterToggle?.(nuevo);
            }
            return { toggle, actualizarEstado };
        }

        function alternarTema() {
            const temaOscuro = !StorageHelper.getBoolean(STORAGE_KEYS.TEMA_OSCURO, true);
            document.documentElement.classList.toggle('dark-mode', temaOscuro);
            StorageHelper.setItem(STORAGE_KEYS.TEMA_OSCURO, temaOscuro);
            ['theme-toggle', 'theme-toggle-modal', 'btn-tema-selector'].forEach(id => {
                const icon = document.getElementById(id)?.querySelector('use');
                if (icon) icon.setAttribute('href', temaOscuro ? '#icon-sun' : '#icon-moon');
            });
        }

        function alternarVista() {
            if (_timerAutoVista) { clearTimeout(_timerAutoVista); _timerAutoVista = null; }
            const card = document.getElementById('stats-card');
            const content = document.getElementById('stats-card-content');
            if (card) card.classList.add('cambiando-vista');
            _animarFadeSwap(content, () => {
                const vistaActual = D.vistaActual() === 'semana' ? 'diaria' : 'semana';
                D.setVistaActual(vistaActual);
                StorageHelper.setItem(STORAGE_KEYS.VISTA_ACTUAL, vistaActual);
                _detenerCicloStats();
                actualizarUI();
                if (card) card.classList.remove('cambiando-vista');
            });
        }

        function _setBtnActivo(id, activo) {
            const btn = document.getElementById(id);
            if (btn) btn.classList.toggle('btn-activo', activo);
        }

        // ── ignorarTiempoFuera ──────────────────────────────────────────────
        const { toggle: toggleIgnorarTiempoFuera, actualizarEstado: actualizarEstadoBotonIgnorarTF } =
            _crearToggleConfig({
                getVal: () => D.getIgnorarTiempoFuera(),
                setVal: (v) => { D.setIgnorarTiempoFuera(v); StorageHelper.setItem(STORAGE_KEYS.IGNORAR_TF, v, true); },
                btnId: 'btn-toggle-ignorar-tf',
                mensajeOn: 'Tiempo fuera ignorado',
                mensajeOff: 'Tiempo fuera incluido',
                onAfterToggle: () => { D.recalcularTotalesEnMemoria(); actualizarUI(); },
            });

        // ── hoverPopupCalendario ────────────────────────────────────────────
        const { toggle: toggleHoverPopupCalendario, actualizarEstado: actualizarEstadoBotonHoverPopup } =
            _crearToggleConfig({
                getVal: () => StorageHelper.getBoolean(STORAGE_KEYS.HOVER_POPUP, true),
                setVal: (v) => StorageHelper.setItem(STORAGE_KEYS.HOVER_POPUP, v),
                btnId: 'btn-toggle-hover-popup',
                mensajeOn: 'Popup activado',
                mensajeOff: 'Popup desactivado',
            });

        // ── saldoDesdeEnero ──────────────────────────────────────────────────
        const { toggle: toggleSaldoDesdeEnero, actualizarEstado: actualizarEstadoBotonSaldoDesdeEnero } =
            _crearToggleConfig({
                getVal: () => StorageHelper.getBoolean(STORAGE_KEYS.SALDO_DESDE_ENERO, false),
                setVal: (v) => StorageHelper.setItem(STORAGE_KEYS.SALDO_DESDE_ENERO, v),
                btnId: 'btn-toggle-saldo-enero',
                mensajeOn: 'Cálculo de saldo anual desde el primer dia del año',
                mensajeOff: 'Cálculo de saldo anual desde el primer registro del año',
                onAfterToggle: () => { actualizarUI(); }
            });

        // ── saldoDesdePrimeroDiaMes ──────────────────────────────────────────
        const { toggle: toggleSaldoDesdePrimeroDiaMes, actualizarEstado: actualizarEstadoBotonSaldoDesdePrimeroDiaMes } =
            _crearToggleConfig({
                getVal: () => StorageHelper.getBoolean(STORAGE_KEYS.SALDO_DESDE_PRIMERO_MES, false),
                setVal: (v) => StorageHelper.setItem(STORAGE_KEYS.SALDO_DESDE_PRIMERO_MES, v),
                btnId: 'btn-toggle-saldo-primero-mes',
                mensajeOn: 'Cálculo de saldo mensual desde el 1° del mes',
                mensajeOff: 'Cálculo de saldo mensual desde el primer registro del mes',
                onAfterToggle: () => { actualizarUI(); }
            });

        // ── persistirTarjetas ───────────────────────────────────────────────
        const { toggle: togglePersistirTarjetas, actualizarEstado: actualizarEstadoBotonPersistir } =
            _crearToggleConfig({
                getVal: () => StorageHelper.getBoolean(STORAGE_KEYS.PERSISTIR_TARJETAS, true),
                setVal: (v) => StorageHelper.setItem(STORAGE_KEYS.PERSISTIR_TARJETAS, v),
                btnId: 'btn-toggle-persistir-tarjetas',
                mensajeOn: 'Estado guardado',
                mensajeOff: 'Tarjetas no se recuerdan al iniciar',
            });

        function toggleVisibilidadCard(cual) {
            const key = STORAGE_KEYS.CARD_VISIBLE(cual);
            const nuevo = !StorageHelper.getBoolean(key, true, true);
            StorageHelper.setItem(key, nuevo, true);
            aplicarVisibilidadCard(cual, nuevo);
            _setBtnActivo('btn-toggle-card-' + cual, nuevo);
            mostrarToast('Tarjeta ' + cual + (nuevo ? ' visible' : ' oculta'), 'info');
        }

        function aplicarVisibilidadCard(cual, visible) {
            const card = document.getElementById('card-' + cual);
            if (card) card.style.display = visible ? '' : 'none';
        }

        function aplicarVisibilidadCards() {
            ['registrar', 'estadisticas', 'historico'].forEach(cual => {
                const visible = StorageHelper.getBoolean(STORAGE_KEYS.CARD_VISIBLE(cual), true, true);
                aplicarVisibilidadCard(cual, visible);
                _setBtnActivo('btn-toggle-card-' + cual, visible);
            });
        }

        function obtenerOrdenCards() {
            const guardado = StorageHelper.getObject(STORAGE_KEYS.ORDEN_CARDS, null, true);
            const validos = ['registrar', 'estadisticas', 'historico'];
            if (Array.isArray(guardado) && guardado.length === 3 && validos.every(v => guardado.includes(v))) {
                return guardado;
            }
            return validos;
        }

        function aplicarOrdenCards(orden) {
            const statsCard = document.getElementById('stats-card');
            const leftColumn = statsCard ? statsCard.parentElement : null;
            const container = leftColumn ? leftColumn.parentElement : null;
            if (!leftColumn || !container) return;

            const delays = [0.10, 0.15, 0.25];
            orden.forEach((cual, idx) => {
                const card = document.getElementById('card-' + cual);
                if (!card) return;
                card.style.animationDelay = `${delays[idx] || 0.25}s`;
                const esUltima = idx === orden.length - 1;
                if (esUltima) {
                    container.appendChild(card);
                } else {
                    leftColumn.appendChild(card);
                }
            });

            const lista = document.getElementById('lista-orden-cards');
            if (lista) {
                orden.forEach(cual => {
                    const item = document.getElementById('orden-item-' + cual);
                    if (item) lista.appendChild(item);
                });
            }
        }

        function iniciarDragOrdenCards() {
            const lista = document.getElementById('lista-orden-cards');
            if (!lista) return;

            let draggingEl = null;
            let dragClone = null;
            let startY = 0;
            let initialYOffset = 0;
            let dragTimer = null;
            const DRAG_DELAY = 150;

            function getCardFromItem(el) {
                const handle = el?.classList?.contains('drag-handle') ? el : el?.querySelector('.drag-handle');
                return handle?.dataset?.card;
            }

            function initDrag(item, clientY) {
                draggingEl = item;
                const rect = item.getBoundingClientRect();
                initialYOffset = clientY - rect.top;

                dragClone = item.cloneNode(true);
                dragClone.style.position = 'fixed';
                dragClone.style.top = `${rect.top}px`;
                dragClone.style.left = `${rect.left}px`;
                dragClone.style.width = `${rect.width}px`;
                dragClone.style.height = `${rect.height}px`;
                dragClone.style.zIndex = '999999';
                dragClone.style.pointerEvents = 'none';
                dragClone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
                dragClone.style.margin = '0';
                dragClone.style.transform = 'scale(1.02)';
                dragClone.style.opacity = '0.9';
                document.body.appendChild(dragClone);
                draggingEl.style.opacity = '0';

                if (navigator.vibrate) navigator.vibrate(30);
            }

            function moveDrag(clientY) {
                if (!dragClone || !draggingEl) return;

                dragClone.style.top = `${clientY - initialYOffset}px`;

                const target = [...lista.querySelectorAll('.orden-card-item')].find(item => {
                    if (item === draggingEl) return false;
                    const r = item.getBoundingClientRect();
                    return clientY >= r.top && clientY <= r.bottom;
                });

                if (target) {
                    const targetRect = target.getBoundingClientRect();
                    const targetMiddle = targetRect.top + targetRect.height / 2;

                    if (clientY < targetMiddle) {
                        lista.insertBefore(draggingEl, target);
                    } else {
                        lista.insertBefore(draggingEl, target.nextSibling);
                    }
                }
            }

            function endDrag() {
                clearTimeout(dragTimer);
                if (!draggingEl) return;

                if (dragClone) {
                    dragClone.remove();
                    dragClone = null;
                }
                draggingEl.style.opacity = '';

                const itemsDOM = Array.from(lista.querySelectorAll('.orden-card-item'));
                const nuevoOrden = itemsDOM.map(i => getCardFromItem(i)).filter(Boolean);

                try {
                    StorageHelper.setItem(STORAGE_KEYS.ORDEN_CARDS, nuevoOrden, true);
                } catch (e) { }

                if (typeof aplicarOrdenCards === 'function') {
                    aplicarOrdenCards(nuevoOrden);
                }

                draggingEl = null;
            }

            lista.addEventListener('touchstart', (e) => {
                const handle = e.target.closest('.drag-handle');
                if (!handle) return;
                const item = handle.closest('.orden-card-item');
                if (!item) return;

                startY = e.touches[0].clientY;
                dragTimer = setTimeout(() => {
                    initDrag(item, startY);
                }, DRAG_DELAY);
            }, { passive: true });

            lista.addEventListener('touchmove', (e) => {
                if (!draggingEl) {
                    if (Math.abs(e.touches[0].clientY - startY) > 10) clearTimeout(dragTimer);
                    return;
                }
                e.preventDefault();
                moveDrag(e.touches[0].clientY);
            }, { passive: false });

            lista.addEventListener('touchend', endDrag);
            lista.addEventListener('touchcancel', endDrag);

            lista.addEventListener('mousedown', (e) => {
                const handle = e.target.closest('.drag-handle');
                if (!handle) return;
                const item = handle.closest('.orden-card-item');
                if (!item) return;

                startY = e.clientY;
                dragTimer = setTimeout(() => {
                    initDrag(item, startY);
                }, DRAG_DELAY);
            });

            document.addEventListener('mousemove', (e) => {
                if (!draggingEl) {
                    if (Math.abs(e.clientY - startY) > 10) clearTimeout(dragTimer);
                    return;
                }
                e.preventDefault();
                moveDrag(e.clientY);
            });

            document.addEventListener('mouseup', endDrag);
        }

        function cerrarEdicion() {
            ModalManager.cerrar('modal-editar', () => {
                D.setEditandoId(null);
                document.dispatchEvent(new Event('scroll'));
            });
        }

        function mostrarImportar(desdeLista = false) {
            _modalAbiertoDesdeLista = desdeLista;
            ModalManager.alternar(desdeLista ? null : 'modal-config', 'modal-importar', null, () => {
                $('file-import').value = '';

                const nombreEl = document.getElementById('nombre-archivo-seleccionado');
                if (nombreEl) {
                    nombreEl.style.display = 'none';
                    nombreEl.textContent = '';
                }

                const btnCombinar = document.getElementById('btn-combinar');
                const btnReemplazar = document.getElementById('btn-reemplazar');

                if (btnCombinar) {
                    btnCombinar.disabled = true;
                }
                if (btnReemplazar) {
                    btnReemplazar.disabled = true;
                }

                const btnVolverI = $('btn-volver-importar');
                if (btnVolverI) {
                    btnVolverI.lastChild.textContent = desdeLista ? ' Cerrar' : ' Volver';
                    btnVolverI.querySelector('use').setAttribute('href', desdeLista ? '#icon-cancelar' : '#icon-undo');
                }
                setTimeout(() => $('file-import').click(), 50);
            });
        }

        function cerrarImportar() {
            if (!_modalAbiertoDesdeLista) {
                ModalManager.setPadre('modal-config', 'modal-selector-perfiles');
            }
            ModalManager.alternar('modal-importar', _modalAbiertoDesdeLista ? null : 'modal-config');
            _modalAbiertoDesdeLista = false;
        }

        function calcularEstadisticasAnio(anio) {
            const anioNum = parseInt(anio);
            const registros = D.registros().filter(r => parseInt(r.fecha.substring(0, 4)) === anioNum);
            let fechaDesde = `${anioNum}-01-01`;

            const desdeEnero = StorageHelper.getBoolean(STORAGE_KEYS.SALDO_DESDE_ENERO, false);
            if (!desdeEnero && registros.length > 0) {
                const primerRegistro = registros.reduce((min, r) => r.fecha < min ? r.fecha : min, registros[0].fecha);
                if (primerRegistro > fechaDesde) {
                    fechaDesde = primerRegistro;
                }
            }

            return _calcularEstadisticasRango(registros, {
                regularidadPorMes: true,
                desde: fechaDesde,
                hasta: `${anioNum}-12-31`
            });
        }

        function _crearOpcion(value, text, selected = false) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = text;
            if (selected) opt.selected = true;
            return opt;
        }

        function poblarSelectorAnios() {
            const selectAnio = $('select-anio-stats');
            if (!selectAnio) return;

            const anioActualmenteSeleccionado = selectAnio.value;

            const aniosUnicos = new Set();
            D.registros().forEach(r => aniosUnicos.add(r.fecha.substring(0, 4)));
            const aniosOrdenados = Array.from(aniosUnicos).sort().reverse();

            selectAnio.innerHTML = '';

            if (aniosOrdenados.length === 0) {
                selectAnio.appendChild(_crearOpcion('', 'Sin registros'));
                actualizarEstadisticasAnio(null);
                return;
            }

            const anioActual = String(new Date().getFullYear());

            let anioASeleccionar;
            if (anioActualmenteSeleccionado && aniosOrdenados.includes(anioActualmenteSeleccionado)) {
                anioASeleccionar = anioActualmenteSeleccionado;
            } else if (aniosOrdenados.includes(anioActual)) {
                anioASeleccionar = anioActual;
            } else {
                anioASeleccionar = aniosOrdenados[0];
            }

            aniosOrdenados.forEach(anio => {
                selectAnio.appendChild(_crearOpcion(anio, anio, anio === anioASeleccionar));
            });

            actualizarEstadisticasAnio(anioASeleccionar);
        }

        function actualizarEstadisticasAnio(anio) {
            const stats = calcularEstadisticasAnio(anio);
            _renderizarStats(stats, { mostrarBtnReporte: true });
        }

        function pegarHoraActual(id) {
            const input = document.getElementById(id);
            if (!input) return;
            if (input.value.trim() !== '') {
                input.value = '';
            } else {
                input.value = obtenerHoraActual();
            }
            input.dispatchEvent(new Event('input'));
        }

        function limpiarCampo(id) {
            const input = document.getElementById(id);
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input'));
            }
        }

        function cerrarConfig() {
            const padre = ModalManager.getPadre('modal-config');
            if (padre) {
                ModalManager.alternar('modal-config', padre);
            } else {
                ModalManager.cerrar('modal-config');
            }
        }

        function _obtenerSemanas() {
            const semanas = new Map();
            D.registros().forEach(r => {
                const d = new Date(r.fecha + 'T00:00:00');
                const lunes = _getLunes(d);
                const key = TimeUtils.formatearFechaLocal(lunes);
                if (!semanas.has(key)) semanas.set(key, lunes);
            });
            return Array.from(semanas.keys()).sort().reverse();
        }

        function _formatearSemana(lunesISO) {
            const lunes = new Date(lunesISO + 'T00:00:00');
            const domingo = new Date(lunes);
            domingo.setDate(lunes.getDate() + 6);
            const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            const dL = lunes.getDate();
            const dD = domingo.getDate();
            const mL = meses[lunes.getMonth()];
            const mD = meses[domingo.getMonth()];
            if (lunes.getMonth() === domingo.getMonth()) {
                return `${dL} al ${dD} de ${mD}`;
            }
            return `${dL} ${mL} al ${dD} ${mD}`;
        }

        function poblarSelectorSemanas() {
            const select = $('select-semana-stats');
            if (!select) return;
            const selActual = select.value;
            const semanas = _obtenerSemanas();
            select.innerHTML = '';
            if (semanas.length === 0) {
                select.appendChild(_crearOpcion('', 'Sin registros'));
                actualizarEstadisticasSemana(null);
                return;
            }
            const semanasPorAnio = new Map();
            semanas.forEach(key => {
                const anio = key.substring(0, 4);
                if (!semanasPorAnio.has(anio)) semanasPorAnio.set(anio, []);
                semanasPorAnio.get(anio).push(key);
            });

            let seleccionar;
            if (selActual && semanas.includes(selActual)) {
                seleccionar = selActual;
            } else {
                const lunesISO = TimeUtils.formatearFechaLocal(_getLunes());
                seleccionar = semanas.includes(lunesISO) ? lunesISO : semanas[0];
            }

            semanasPorAnio.forEach((keys, anio) => {
                const grupo = document.createElement('optgroup');
                grupo.label = anio;
                keys.forEach(key => {
                    grupo.appendChild(_crearOpcion(key, _formatearSemana(key), key === seleccionar));
                });
                select.appendChild(grupo);
            });

            actualizarEstadisticasSemana(seleccionar);
        }

        function calcularEstadisticasSemana(lunesISO) {
            if (!lunesISO) return _calcularEstadisticasRango([], { regularidadPorMes: false });
            const lunes = new Date(lunesISO + 'T00:00:00');
            const domingo = new Date(lunes);
            domingo.setDate(lunes.getDate() + 6);
            const hasta = TimeUtils.formatearFechaLocal(domingo);
            const registros = D.registros().filter(r => r.fecha >= lunesISO && r.fecha <= hasta);
            return _calcularEstadisticasRango(registros, { regularidadPorMes: false, desde: lunesISO, hasta });
        }

        function actualizarEstadisticasSemana(lunesISO) {
            const stats = calcularEstadisticasSemana(lunesISO);
            _renderizarStats(stats, { mostrarBtnReporte: false });
        }

        function _animarCambioStats(fn) {
            _animarFadeSwap($('form-stats'), fn);
        }

        function cambiarSemanaStats() {
            const v = $('select-semana-stats')?.value;
            if (v !== undefined) _animarCambioStats(() => actualizarEstadisticasSemana(v));
        }

        function cambiarAnioStats() {
            const v = $('select-anio-stats')?.value;
            if (v !== undefined) _animarCambioStats(() => actualizarEstadisticasAnio(v));
        }

        function togglePeriodoStats(direccion = 1) {
            if (_popupStatEl) { _popupStatEl.remove(); _popupStatEl = null; }
            const selectMes = $('select-mes-stats');
            const selectAnio = $('select-anio-stats');
            const label = $('label-periodo-toggle');
            const selectSemana = $('select-semana-stats');

            const orden = ['mensual', 'anual', 'semanal'];
            const idx = orden.indexOf(modoEstadisticas);
            modoEstadisticas = orden[(idx + direccion + orden.length) % orden.length];
            try { StorageHelper.setItem(STORAGE_KEYS.MODO_ESTADISTICAS, modoEstadisticas); } catch (e) { }

            _animarCambioStats(() => {
                selectMes.classList.add('hidden');
                selectAnio.classList.add('hidden');
                if (selectSemana) selectSemana.classList.add('hidden');
                if (modoEstadisticas === 'anual') {
                    selectAnio.classList.remove('hidden');
                    if (label) label.textContent = 'Anual';
                    poblarSelectorAnios();
                } else if (modoEstadisticas === 'semanal') {
                    if (selectSemana) selectSemana.classList.remove('hidden');
                    if (label) label.textContent = 'Semanal';
                    poblarSelectorSemanas();
                } else {
                    selectMes.classList.remove('hidden');
                    if (label) label.textContent = 'Mensual';
                    poblarSelectorMeses();
                }
            });
        }

        function poblarSelectorMeses() {
            const selectMes = $('select-mes-stats');
            if (!selectMes) return;
            const mesActualmenteSeleccionado = selectMes.value;
            const mesesUnicos = new Set();
            D.registros().forEach(r => {
                const mesAnio = r.fecha.substring(0, 7);
                mesesUnicos.add(mesAnio);
            });

            const mesesOrdenados = Array.from(mesesUnicos).sort().reverse();
            selectMes.innerHTML = '';
            if (mesesOrdenados.length === 0) {
                selectMes.appendChild(_crearOpcion('', 'Sin registros'));
                actualizarEstadisticas(null);
                return;
            }

            const mesActual = TimeUtils.formatearFechaLocal(new Date()).slice(0, 7);
            let mesASeleccionar = mesActual;

            if (mesActualmenteSeleccionado && mesesOrdenados.includes(mesActualmenteSeleccionado)) {
                mesASeleccionar = mesActualmenteSeleccionado;
            } else if (!mesesOrdenados.includes(mesActual)) {
                mesASeleccionar = mesesOrdenados[0];
            }

            const mesesPorAnio = new Map();
            mesesOrdenados.forEach(mesAnio => {
                const anio = mesAnio.substring(0, 4);
                if (!mesesPorAnio.has(anio)) mesesPorAnio.set(anio, []);
                mesesPorAnio.get(anio).push(mesAnio);
            });

            mesesPorAnio.forEach((meses, anio) => {
                const grupo = document.createElement('optgroup');
                grupo.label = anio;

                meses.forEach(mesAnio => {
                    const [a, m] = mesAnio.split('-');
                    const nombreMes = new Date(a, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
                    const label = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
                    grupo.appendChild(_crearOpcion(mesAnio, label, mesAnio === mesASeleccionar));
                });

                selectMes.appendChild(grupo);
            });

            actualizarEstadisticas(mesASeleccionar);
        }

        function cambiarMesStats() {
            const v = $('select-mes-stats')?.value;
            if (v !== undefined) _animarCambioStats(() => actualizarEstadisticas(v));
        }

        // ── Helpers privados de generarReporte ───────────────────────
        function _sumarHorasEfectivas(regs, horasDiarias) {
            return regs.reduce((sum, r) => {
                const t = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
                if (t && t.id === 'remoto') return sum + horasDiarias;
                if (!t) return sum + r.total;
                return sum;
            }, 0);
        }

        function _resolverPeriodoDatos(esAnual) {
            if (esAnual) {
                const anio = $('select-anio-stats')?.value;
                if (!anio) { mostrarToast('No hay año seleccionado', 'error'); return null; }
                const anioNum = parseInt(anio);
                return {
                    periodoLabel: anio,
                    nombreArchivo: `reporte_${anio}.txt`,
                    registrosPeriodo: D.registros().filter(r => parseInt(r.fecha.substring(0, 4)) === anioNum),
                    stats: calcularEstadisticasAnio(anio),
                    mesSeleccionado: null
                };
            }
            const selectMes = $('select-mes-stats');
            const mes = selectMes?.value;
            if (!mes) { mostrarToast('No hay mes seleccionado', 'error'); return null; }
            const [año, mesNum] = mes.split('-').map(Number);
            return {
                periodoLabel: selectMes.options[selectMes.selectedIndex].text,
                nombreArchivo: `reporte_${mes}.txt`,
                registrosPeriodo: D.registros().filter(r => {
                    const [aReg, mReg] = r.fecha.split('-').map(Number);
                    return aReg === año && mReg === mesNum;
                }),
                stats: calcularEstadisticasMes(mes),
                mesSeleccionado: mes
            };
        }

        function _seccionDetalleAnual(registrosPeriodo, horasDiariasObjetivo) {
            const mesesOrdenados = [...new Set(registrosPeriodo.map(r => r.fecha.substring(0, 7)))].sort();
            let seccion = `

────────────────────────────────────────────────────────────────

📅 TOTALES POR MES
────────────────────────────────────────────────────────────────

`;
            mesesOrdenados.forEach(claveMes => {
                const regsM = registrosPeriodo.filter(r => r.fecha.startsWith(claveMes));
                const normales = regsM.filter(r => !TiposRegistro.esRegistroEspecial(r.entrada, r.salida) && r.entrada && r.salida);
                const especiales = regsM.filter(r => TiposRegistro.esRegistroEspecial(r.entrada, r.salida));
                const notas = TiposRegistro.obtenerTodosLosTipos()
                    .map(t => {
                        const n = especiales.filter(r => TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida)?.id === t.id).length;
                        return n ? `${n} ${t.labelPlural.toLowerCase()}` : null;
                    })
                    .filter(Boolean);
                const nombreMes = formatoTituloMes(claveMes).split(' ')[0];
                seccion += `   ${nombreMes.padEnd(12)} ${horasATextoCorto(_sumarHorasEfectivas(regsM, horasDiariasObjetivo)).padEnd(10)}  (${normales.length} jornadas)`;
                if (notas.length) seccion += `  [${notas.join(', ')}]`;
                seccion += '\n';
            });
            return seccion;
        }

        function _seccionDetalleMensual(registrosPeriodo, horasDiariasObjetivo) {
            let seccion = `

──────────────────────────────────────────────────────────────────

📋 DETALLE DIARIO
──────────────────────────────────────────────────────────────────

`;
            const ordenados = [...registrosPeriodo].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            ordenados.forEach(r => {
                const tipoEspecial = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
                const fecha = r.fecha.split('-').reverse().join('/');
                const dia = obtenerNombreDia(r.fecha);
                let linea;
                if (tipoEspecial) {
                    linea = `${fecha}  ${dia.padEnd(10)} ${tipoEspecial.label.toUpperCase()}`;
                } else {
                    const entrada = r.entrada || '--:--';
                    const salida = r.salida || '--:--';
                    const total = r.salida ? horasATextoCorto(r.total) : 'Incompleto';
                    const tiempoFuera = r.tiempoFuera ? ` (${r.tiempoFuera} fuera)` : '';
                    const infoAsueto = (r.credito && r.credito !== '00:00') ? ' [SALIDA TEMPRANO]' : '';
                    const indicador = r.salida ? (r.total >= horasDiariasObjetivo ? '✓ ' : '✗ ') : '  ';
                    linea = `${fecha}  ${dia.padEnd(10)} ${entrada} → ${salida}  [${total}]${tiempoFuera}${infoAsueto} ${indicador}`;
                }
                seccion += linea + '\n';
            });
            return seccion;
        }

        function _agruparRegistrosPorSemana(registros) {
            const semanas = new Map();
            registros.forEach(r => {
                const lunes = obtenerLunesSemana(r.fecha);
                if (!semanas.has(lunes)) {
                    const base = { trabajados: [] };
                    TiposRegistro.obtenerTodosLosTipos().forEach(t => { base[t.labelPlural.toLowerCase()] = []; });
                    semanas.set(lunes, base);
                }
                const semana = semanas.get(lunes);
                const tipoEspecial = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
                if (tipoEspecial) {
                    const cat = tipoEspecial.labelPlural.toLowerCase();
                    if (semana[cat]) semana[cat].push(r);
                } else {
                    semana.trabajados.push(r);
                }
            });
            return semanas;
        }
        // ─────────────────────────────────────────────────────────────

        function generarReporte() {
            const esAnual = modoEstadisticas === 'anual';
            const periodo = _resolverPeriodoDatos(esAnual);
            if (!periodo) return;
            const { periodoLabel, registrosPeriodo, stats, nombreArchivo, mesSeleccionado } = periodo;
            const horasDiariasObjetivo = D.horasDiarias();

            const reporte = {

                header: () => `
================================================================
REPORTE DE HORAS TRABAJADAS                   
================================================================

📅 Período: ${periodoLabel}
📊 Generado: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}

────────────────────────────────────────────────────────────────`,

                resumenGeneral: () => {
                    const lineasTipos = TiposRegistro.obtenerTodosLosTipos()
                        .map(t => `   • ${(t.label + ':').padEnd(24)}${stats[t.labelPlural.toLowerCase()] || 0}`)
                        .join('\n');
                    return `

📈 RESUMEN GENERAL
────────────────────────────────────────────────────────────────

   • Jornadas:               ${stats.diasTrabajados}
${lineasTipos}
   • Salidas Temprano:       ${stats.compensaciones}
   • Entrada promedio:       ${stats.entradaPromedio}
   • Salida promedio:        ${stats.salidaPromedio}
   • Promedio diario:        ${stats.promedioDiario}
   
   • Total horas trabajadas: ${horasATextoCorto(_sumarHorasEfectivas(registrosPeriodo, horasDiariasObjetivo))}
   • Saldo:                  ${stats.bufferPeriodo !== null ? horasATextoCorto(stats.bufferPeriodo) : 'N/A'}`;
                },

                detallePeriodo: () => esAnual
                    ? _seccionDetalleAnual(registrosPeriodo, horasDiariasObjetivo)
                    : _seccionDetalleMensual(registrosPeriodo, horasDiariasObjetivo),

                totalesPorSemana: () => {
                    if (esAnual || !mesSeleccionado) return '';
                    const [añoActual, mesActual] = mesSeleccionado.split('-').map(Number);
                    const pad = n => String(n).padStart(2, '0');
                    const primerDiaMes = `${añoActual}-${pad(mesActual)}-01`;
                    const ultimaDiaMes = `${añoActual}-${pad(mesActual)}-${pad(new Date(añoActual, mesActual, 0).getDate())}`;

                    const semanas = _agruparRegistrosPorSemana(registrosPeriodo);
                    const semanasOrdenadas = [...semanas.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0]));
                    if (!semanasOrdenadas.length) return '';

                    let seccion = `

────────────────────────────────────────────────────────────────

📅 TOTALES POR SEMANA
────────────────────────────────────────────────────────────────

`;
                    const semanasIncompletas = [];

                    semanasOrdenadas.forEach(([lunesOriginal, datos], index) => {
                        let totalSemanal = datos.trabajados.reduce((sum, r) => sum + r.total, 0);
                        if (datos.remotos?.length) totalSemanal += datos.remotos.length * horasDiariasObjetivo;

                        const fechaLunes = TimeUtils.parsearFechaLocal(lunesOriginal);
                        const fechaDomingo = new Date(fechaLunes);
                        fechaDomingo.setDate(fechaLunes.getDate() + 6);
                        const domingo = TimeUtils.formatearFechaLocal(fechaDomingo);

                        let lunes = lunesOriginal, fechaFin = domingo, esIncompleta = false, continuaEn = '';

                        if (domingo > ultimaDiaMes) {
                            fechaFin = ultimaDiaMes;
                            esIncompleta = true;
                            const mesSig = mesActual === 12 ? 1 : mesActual + 1;
                            const añoSig = mesActual === 12 ? añoActual + 1 : añoActual;
                            continuaEn = `continúa en ${new Date(añoSig, mesSig - 1, 1).toLocaleDateString('es-ES', { month: 'long' })}`;
                        }
                        if (lunes < primerDiaMes) {
                            lunes = primerDiaMes;
                            esIncompleta = true;
                            const mesAnt = mesActual === 1 ? 12 : mesActual - 1;
                            const añoAnt = mesActual === 1 ? añoActual - 1 : añoActual;
                            continuaEn = `viene de ${new Date(añoAnt, mesAnt - 1, 1).toLocaleDateString('es-ES', { month: 'long' })}`;
                        }

                        seccion += `   Semana ${index + 1} (${lunes.split('-').reverse().join('/')} - ${fechaFin.split('-').reverse().join('/')})${esIncompleta ? '*' : ''}:\n`;
                        seccion += `      └─ ${horasATextoCorto(totalSemanal)}`;

                        const notasExtras = TiposRegistro.obtenerTodosLosTipos()
                            .map(t => {
                                const clave = t.labelPlural.toLowerCase();
                                return datos[clave]?.length ? `${datos[clave].length} ${clave}` : null;
                            })
                            .filter(Boolean);
                        if (notasExtras.length) seccion += ` [${notasExtras.join(', ')}]`;
                        seccion += '\n\n';

                        if (esIncompleta && continuaEn) semanasIncompletas.push(`* Semana ${index + 1}: ${continuaEn}`);
                    });

                    if (semanasIncompletas.length) seccion += semanasIncompletas.join('\n') + '\n';
                    return seccion;
                },

                configuracion: () => `

────────────────────────────────────────────────────────────────

⚙️ Ajustes
────────────────────────────────────────────────────────────────

   • Horas diarias:          ${D.horasDiarias()}
   • Días hábiles/semana:    ${D.diasHabiles().map(d => ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d]).join(', ')}
   • Horas semanales:        ${D.horasSemanales()}`,

                footer: () => `

────────────────────────────────────────────────────────────────

Generado por Sistema Lushibosca
`
            };

            const contenido =
                reporte.header() +
                reporte.resumenGeneral() +
                reporte.detallePeriodo() +
                reporte.totalesPorSemana() +
                reporte.configuracion() +
                reporte.footer();

            try {
                const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo });
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                mostrarToast(esAnual ? 'Reporte anual generado' : 'Reporte generado', 'success');
            } catch (e) {
                console.error('Error generando reporte:', e);
                mostrarToast('Error al generar reporte', 'error');
            }
        }

        const sumarMinutosAHora = TimeUtils.sumarMinutosAHora;

        function actualizarEstadoBotonTimerMain() {
            const btn = document.getElementById('btn-timer-main');
            const card = document.getElementById('stats-card');
            if (!btn) return;

            if (modoLoteActivo) {
                btn.style.display = 'none';
                return;
            }

            btn.style.display = '';

            const hoy = obtenerFechaHoy();
            const registroHoy = D.registros().find(r => r.fecha === hoy);
            const perfilId = window.PerfilManager ? PerfilManager.obtenerPerfilActual() : 'default';
            const storageKey = STORAGE_KEYS.BREAK_TIME(perfilId);
            const isRunning = StorageHelper.getItem(storageKey) !== null;
            const icon = btn.querySelector('use');

            const diaCerrado = registroHoy && registroHoy.salida && registroHoy.salida.trim() !== '';

            if (!isRunning && (!registroHoy || diaCerrado)) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
                btn.title = diaCerrado ? "Día finalizado" : "Debes fichar entrada primero";
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.title = isRunning ? "Detener tiempo fuera" : "Iniciar tiempo fuera";
            }

            if (isRunning) {
                btn.classList.add('running');
                btn.style.color = 'var(--c-red)';
                btn.style.borderColor = 'var(--c-red)';
                icon.setAttribute('href', '#icon-exit');

                if (card) {
                    card.classList.add('timer-running');
                    const titulo = card.querySelector('h2');

                    const vistaActual = D.vistaActual();
                    const icono = vistaActual === 'semana'
                        ? '<svg class="icon"><use href="#icon-calendar-simple"/></svg>'
                        : '<svg class="icon"><use href="#icon-clock"/></svg>';

                    const contexto = vistaActual === 'semana' ? 'Esta Semana' : obtenerNombreDia(obtenerFechaHoy());

                    if (titulo) {
                        titulo.innerHTML = `${icono} ${contexto} - <svg class="icon"><use href="#icon-exit"/></svg> Tiempo fuera `;
                        const breakCounter = document.createElement('span');
                        breakCounter.id = 'break-counter';
                        breakCounter.className = 'break-counter-label';
                        titulo.appendChild(breakCounter);
                        _iniciarContadorBreak(storageKey);
                    }
                }

            } else {
                btn.classList.remove('running');
                btn.style.color = 'var(--text-main)';
                btn.style.borderColor = 'var(--border)';
                icon.setAttribute('href', '#icon-exit');

                if (card) card.classList.remove('timer-running');
                _detenerContadorBreak();
            }
        }

        let _breakCounterInterval = null;

        function _iniciarContadorBreak(storageKey) {
            _detenerContadorBreak();
            function _actualizarContador() {
                const el = document.getElementById('break-counter');
                if (!el) { _detenerContadorBreak(); return; }
                const start = parseInt(StorageHelper.getItem(storageKey));
                if (isNaN(start)) { el.textContent = ''; _detenerContadorBreak(); return; }
                const totalSeg = Math.floor((Date.now() - start) / 1000);
                const mins = Math.floor(totalSeg / 60);
                const horas = Math.floor(mins / 60);
                const minsResto = mins % 60;
                if (horas > 0) {
                    el.textContent = `${horas}h ${minsResto}m`;
                } else {
                    el.textContent = `${mins}m`;
                }
            }
            _actualizarContador();
            _breakCounterInterval = setInterval(_actualizarContador, 1000);
        }

        function _detenerContadorBreak() {
            if (_breakCounterInterval) {
                clearInterval(_breakCounterInterval);
                _breakCounterInterval = null;
            }
        }

        async function toggleTimerBreakMain() {
            const perfilId = window.PerfilManager ? PerfilManager.obtenerPerfilActual() : 'default';
            const storageKey = STORAGE_KEYS.BREAK_TIME(perfilId);
            const storedStart = StorageHelper.getItem(storageKey);
            const hoy = obtenerFechaHoy();
            const registroHoy = D.registros().find(r => r.fecha === hoy);

            if (!storedStart && !registroHoy) {
                mostrarToast('Debes crear un registro para hoy primero', 'warning');
                return;
            }

            if (!storedStart) {
                StorageHelper.setItem(storageKey, Date.now());
                mostrarToast('Tiempo fuera iniciado', 'info');
            } else {
                const start = parseInt(storedStart);
                const end = Date.now();
                const diffMs = end - start;

                const segundosTranscurridos = Math.floor(diffMs / 1000);
                let minutosTranscurridos = Math.floor(segundosTranscurridos / 60);
                const segundosRestantes = segundosTranscurridos % 60;

                if (segundosRestantes >= 30) {
                    minutosTranscurridos += 1;
                }

                if (segundosTranscurridos < 30) {
                    StorageHelper.removeItem(storageKey);
                    mostrarToast('Tiempo muy corto, no se registró', 'info');
                    actualizarEstadoBotonTimerMain();
                    actualizarUI();
                    return;
                }

                if (!registroHoy) {
                    StorageHelper.removeItem(storageKey);
                    mostrarToast('No hay registro para hoy, tiempo fuera descartado', 'warning');
                    actualizarEstadoBotonTimerMain();
                    actualizarUI();
                    return;
                }
                const tiempoActual = registroHoy.tiempoFuera || '00:00';
                const nuevoTiempoFuera = sumarMinutosAHora(tiempoActual, minutosTranscurridos);
                registroHoy.tiempoFuera = nuevoTiempoFuera;
                const t = D.calcularHoras(registroHoy.entrada, registroHoy.salida, nuevoTiempoFuera);
                registroHoy.horas = t?.horas || 0;
                registroHoy.minutos = t?.minutos || 0;
                registroHoy.total = t?.total || 0;
                HistoryManager.saveState(D.registros());

                StorageHelper.removeItem(storageKey);
                await D.guardarYActualizar(registroHoy.id);

                const mensaje = minutosTranscurridos === 1
                    ? 'Se descontó 1 minuto al registro de hoy'
                    : `Se descontaron ${minutosTranscurridos} minutos al registro de hoy`;
                mostrarToast(mensaje, 'success');
            }

            actualizarEstadoBotonTimerMain();
        }

        function setBloqueoEdicion(bloqueado) {
            edicionBloqueada = bloqueado;

            const btnLock = $('btn-lock-toggle');
            if (btnLock) {
                const icon = btnLock.querySelector('use');
                icon.setAttribute('href', bloqueado ? '#icon-lock' : '#icon-lock-open');
                btnLock.title = bloqueado ? "Desbloquear edición" : "Bloquear edición";
                btnLock.style.color = 'var(--text-main)';
                btnLock.style.background = bloqueado ? 'var(--c-red)' : 'var(--c-green)';
            }

            const inputs = ['edit-fecha', 'edit-entrada', 'edit-salida', 'edit-tiempo-fuera', 'edit-notas'];
            inputs.forEach(id => {
                const el = $(id);
                if (el) el.disabled = bloqueado;
            });

            const modal = $('modal-editar');
            if (modal) {
                const botones = modal.querySelectorAll('button:not(#btn-lock-toggle):not(.btn-cancel):not(#btn-toggle-credito)');
                botones.forEach(btn => {
                    btn.disabled = bloqueado;
                });
            }
            verificarBloqueoCredito();
        }

        function toggleBloqueoEdicion() {
            setBloqueoEdicion(!edicionBloqueada);
        }

        function renderizarListaPerfiles() {
            const lista = document.getElementById('lista-perfiles-botones');
            if (!lista) return;

            lista.innerHTML = '';
            const perfiles = window.PerfilManager.obtenerListaPerfiles();

            perfiles.forEach(p => {
                const container = document.createElement('div');
                container.className = `btn-perfil-select ${p.esActual ? 'activo' : ''}`;

                const infoSection = document.createElement('div');
                infoSection.className = 'btn-perfil-info';

                const nombreSpan = document.createElement('div');
                nombreSpan.className = 'btn-perfil-nombre';
                nombreSpan.textContent = p.nombre;

                infoSection.appendChild(nombreSpan);

                const badge = document.createElement('div');
                badge.className = 'btn-perfil-badge';
                badge.style.color = p.esActual ? 'var(--c-green)' : '';
                const countText = `${p.totalRegistros} registro${p.totalRegistros !== 1 ? 's' : ''}`;
                badge.textContent = p.esActual ? `${countText} · Activo` : countText;
                infoSection.appendChild(badge);

                const editBtn = document.createElement('button');
                editBtn.className = 'btn-perfil-edit';
                editBtn.innerHTML = '<svg class="icon"><use href="#icon-edit"/></svg>';
                editBtn.title = 'Editar perfil';
                editBtn.onclick = (e) => {
                    e.stopPropagation();
                    UILogic.abrirEditorPerfil(p.id);
                };

                container.onclick = () => {
                    if (!p.esActual) {
                        window.PerfilManager.cambiarPerfil(p.id);
                    }
                };

                if (p.esActual) {
                    container.style.cursor = 'default';
                }

                container.appendChild(infoSection);
                container.appendChild(editBtn);
                lista.appendChild(container);
            });
        }

        function _cerrarSelectorMeses(idResaltar = null) {
            const grid = document.getElementById('calendario-grid');
            const selector = document.getElementById('calendario-selector-meses');
            const navBotones = document.getElementById('calendario-nav-botones');
            _animarFadeSwap(selector, () => {
                selector.style.display = 'none';
                navBotones.style.display = 'flex';
                grid.style.display = 'grid';
                grid.classList.add('fade-out');
                grid.offsetHeight;
                _renderizarCalendario(idResaltar);
                grid.classList.remove('fade-out');
            });
        }

        function abrirSelectorMesesCalendario() {
            const grid = document.getElementById('calendario-grid');
            const selector = document.getElementById('calendario-selector-meses');
            const navBotones = document.getElementById('calendario-nav-botones');
            const titulo = document.getElementById('calendario-titulo-mes');

            if (selector.style.display !== 'none') {
                _cerrarSelectorMeses();
                return;
            }

            const registros = D.registros();
            const mesesUnicos = new Set();
            registros.forEach(r => mesesUnicos.add(r.fecha.substring(0, 7)));
            const mesesOrdenados = Array.from(mesesUnicos).sort().reverse();

            selector.innerHTML = '';
            if (mesesOrdenados.length === 0) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'empty-state empty-state--calendario';
                emptyEl.textContent = 'No hay registros';
                selector.appendChild(emptyEl);
            } else {
                const hoy = new Date();
                const anioActual = _calendarioMes ? _calendarioMes.anio : hoy.getFullYear();
                const mesActual = _calendarioMes ? _calendarioMes.mes : hoy.getMonth();

                const mesesPorAnio = new Map();
                mesesOrdenados.forEach(mesAnio => {
                    const anioStr = mesAnio.substring(0, 4);
                    if (!mesesPorAnio.has(anioStr)) mesesPorAnio.set(anioStr, []);
                    mesesPorAnio.get(anioStr).push(mesAnio);
                });

                mesesPorAnio.forEach((meses, anioStr) => {
                    const separador = document.createElement('div');
                    separador.className = 'selector-meses-anio-header';
                    separador.textContent = anioStr;
                    selector.appendChild(separador);

                    meses.forEach(mesAnio => {
                        const [aStr, mesStr] = mesAnio.split('-');
                        const anio = parseInt(aStr);
                        const mes = parseInt(mesStr) - 1;

                        const btn = document.createElement('button');
                        btn.className = 'btn-mes-calendario';

                        const fecha = new Date(anio, mes, 1);
                        let nombreMes = fecha.toLocaleDateString('es-ES', { month: 'long' });
                        nombreMes = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1).replace('.', '');
                        btn.textContent = nombreMes;

                        if (anio === anioActual && mes === mesActual) {
                            btn.classList.add('activo');
                        }

                        btn.onclick = (e) => {
                            e.stopPropagation();
                            _calendarioMes = { anio, mes };
                            _cerrarSelectorMeses();
                        };

                        selector.appendChild(btn);
                    });
                });
            }

            const alturaCalendario = grid.offsetHeight;
            selector.style.height = alturaCalendario + 'px';

            _animarFadeSwap(grid, () => {
                grid.style.display = 'none';
                navBotones.style.display = 'none';
                titulo.innerHTML = '<svg class="icon"><use href="#icon-back" /></svg> Volver';
                selector.style.display = 'grid';
                selector.classList.add('fade-out');
                selector.offsetHeight;
                selector.classList.remove('fade-out');
            });
        }

        function abrirSelectorPerfiles() {
            ModalManager.abrir('modal-selector-perfiles', () => {
                const inputNuevo = document.getElementById('nombre-nuevo-perfil-selector');
                if (inputNuevo) inputNuevo.value = '';

                renderizarListaPerfiles();

                const temaOscuro = document.documentElement.classList.contains('dark-mode');
                const toggleBtnModal = document.getElementById('theme-toggle-modal');

                if (toggleBtnModal) {
                    const icon = toggleBtnModal.querySelector('use');
                    if (temaOscuro) {
                        icon.setAttribute('href', '#icon-sun');
                    } else {
                        icon.setAttribute('href', '#icon-moon');
                    }
                }
            });
        }

        function crearPerfilDesdeSelector() {
            const input = document.getElementById('nombre-nuevo-perfil-selector');
            if (!input) return;

            const nombre = S.sanitizeString(input.value.trim(), 30);

            if (!nombre) {
                mostrarToast('Ingresa un nombre para el perfil', 'error');
                return;
            }

            const regexSeguro = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\-_ ]+$/;

            if (!regexSeguro.test(nombre)) {
                mostrarToast('El nombre contiene caracteres no válidos.\n Solo letras, números y espacios.', 'error');
                return;
            }

            const perfiles = window.PerfilManager ? PerfilManager.obtenerTodosPerfiles() : {};

            const nombreNormalizado = nombre.toLowerCase().trim();
            const nombreExiste = Object.values(perfiles).some(perfil =>
                perfil.nombre.toLowerCase().trim() === nombreNormalizado
            );

            if (nombreExiste) {
                mostrarToast('Ya existe un perfil con ese nombre', 'error');
                return;
            }

            if (Object.keys(perfiles).length >= PerfilManager.MAX_PERFILES) {
                mostrarToast(`Máximo de perfiles alcanzado (${PerfilManager.MAX_PERFILES})`, 'error');
                return;
            }

            const id = 'perfil_' + Date.now();
            perfiles[id] = {
                nombre: nombre,
                registros: [],
                diasHabiles: [1, 2, 3, 4, 5],
                horasDiarias: 7
            };

            try {
                if (!StorageHelper.setItem(STORAGE_KEYS.PERFILES, perfiles)) throw new Error('quota');
            } catch (e) {
                console.error('Error al guardar perfil:', e);
                delete perfiles[id];
                mostrarToast('Error al guardar: almacenamiento lleno', 'error');
                return;
            }

            if (window.PerfilManager) {
                window.PerfilManager.inicializar();
            }

            mostrarToast(`Perfil "${nombre}" creado`, 'success');

            input.value = '';

            renderizarListaPerfiles();

            requestAnimationFrame(() => {
                const lista = document.getElementById('lista-perfiles-botones');
                const nuevoPerfilElement = lista?.lastElementChild;
                if (nuevoPerfilElement) {
                    nuevoPerfilElement.style.animation = 'zoomIn 0.3s ease-out';
                    nuevoPerfilElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        }

        function cerrarSelectorPerfiles() {
            ModalManager.cerrar('modal-selector-perfiles');
        }

        function mostrarconfig() {
            ModalManager.alternar('modal-selector-perfiles', 'modal-config', null, () => {
                $('config-horas-diarias').value = D.horasDiarias();

                const diasActivos = D.diasHabiles();
                const checkboxes = document.querySelectorAll('input[name="dia-habil"]');
                checkboxes.forEach(cb => {
                    cb.checked = diasActivos.includes(parseInt(cb.value));
                    cb.onchange = UILogic.actualizarFeedbackConfig;
                });

                UILogic.actualizarFeedbackConfig();
                actualizarEstadoBotonIgnorarTF();
                const lbl = $('hint-fondo-label');
                if (lbl) lbl.textContent = _getLabelFondo(_fondoCard);
            });
        }

        function abrirEditorPerfil(perfilId) {
            perfilEnEdicion = perfilId;
            const perfiles = window.PerfilManager ? PerfilManager.obtenerTodosPerfiles() : {};
            const perfil = perfiles[perfilId];

            if (!perfil) {
                mostrarToast('Perfil no encontrado', 'error');
                return;
            }

            document.getElementById('nombre-perfil-editar').value = perfil.nombre;
            document.getElementById('id-perfil-editar').value = perfilId;

            const btnEliminar = document.getElementById('btn-eliminar-perfil-editor');
            if (btnEliminar) {
                btnEliminar.disabled = (perfilId === 'default');
            }

            ModalManager.alternar('modal-selector-perfiles', 'modal-editar-perfil');
        }

        function cerrarEditorPerfil() {
            perfilEnEdicion = null;
            ModalManager.alternar('modal-editar-perfil', 'modal-selector-perfiles', null, () => {
                const inputNuevo = document.getElementById('nombre-nuevo-perfil-selector');
                if (inputNuevo) inputNuevo.value = '';
                renderizarListaPerfiles();
            });
        }

        function guardarEdicionPerfil() {
            if (!perfilEnEdicion) return;

            const nuevoNombre = S.sanitizeString(document.getElementById('nombre-perfil-editar').value.trim(), 30);

            if (!nuevoNombre) {
                mostrarToast('Ingresa un nombre válido', 'error');
                return;
            }

            const regexSeguro = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\-_ ]+$/;

            if (!regexSeguro.test(nuevoNombre)) {
                mostrarToast('Caracteres no permitidos en el nombre.', 'error');
                return;
            }

            const perfiles = window.PerfilManager ? PerfilManager.obtenerTodosPerfiles() : {};

            if (!perfiles[perfilEnEdicion]) {
                mostrarToast('Perfil no encontrado', 'error');
                return;
            }

            if (perfiles[perfilEnEdicion].nombre === nuevoNombre) {
                mostrarToast('Sin cambios', 'info');
                cerrarEditorPerfil();
                return;
            }

            const nombreNormalizado = nuevoNombre.toLowerCase().trim();
            const nombreExiste = Object.entries(perfiles).some(([id, perfil]) =>
                id !== perfilEnEdicion &&
                perfil.nombre.toLowerCase().trim() === nombreNormalizado
            );

            if (nombreExiste) {
                mostrarToast('Ya existe otro perfil con ese nombre', 'error');
                return;
            }

            const nombreAnterior = perfiles[perfilEnEdicion].nombre;
            perfiles[perfilEnEdicion].nombre = nuevoNombre;
            try {
                if (!StorageHelper.setItem(STORAGE_KEYS.PERFILES, perfiles)) throw new Error('quota');
            } catch (e) {
                console.error('Error al guardar perfil:', e);
                perfiles[perfilEnEdicion].nombre = nombreAnterior;
                mostrarToast('Error al guardar: almacenamiento lleno', 'error');
                return;
            }

            const perfilActual = window.PerfilManager.obtenerPerfilActual();
            if (perfilEnEdicion === perfilActual) {
                const btnTexto = document.getElementById('nombre-perfil-header');
                if (btnTexto) btnTexto.textContent = nuevoNombre;
            }

            if (window.PerfilManager) {
                window.PerfilManager.inicializar();
            }

            mostrarToast('Perfil actualizado', 'success');
            cerrarEditorPerfil();
        }

        async function eliminarPerfilDesdeEditor() {
            if (!perfilEnEdicion || perfilEnEdicion === 'default') {
                mostrarToast('No se puede eliminar el perfil Principal', 'error');
                return;
            }

            const perfiles = window.PerfilManager ? PerfilManager.obtenerTodosPerfiles() : {};
            const perfil = perfiles[perfilEnEdicion];

            if (!perfil) {
                mostrarToast('Perfil no encontrado', 'error');
                return;
            }

            const confirmacion = await confirmarModal(`¿Estás seguro de que querés eliminar el perfil "${perfil.nombre}"? Esta acción no se puede deshacer.`, 'Eliminar');

            if (!confirmacion) return;

            const pid = perfilEnEdicion;
            ['breakStartTime', STORAGE_KEYS.HISTORY, STORAGE_KEYS.FONDO_CARD, STORAGE_KEYS.IGNORAR_TF,
                'cardVisible_registrar', 'cardVisible_estadisticas', 'cardVisible_historico', STORAGE_KEYS.ORDEN_CARDS
            ].forEach(k => StorageHelper.removeItem(`${k}_${pid}`));

            delete perfiles[perfilEnEdicion];
            try {
                if (!StorageHelper.setItem(STORAGE_KEYS.PERFILES, perfiles)) throw new Error('quota');
            } catch (e) {
                console.error('Error al eliminar perfil:', e);
                mostrarToast('Error al guardar: almacenamiento lleno', 'error');
                return;
            }

            const perfilActual = window.PerfilManager.obtenerPerfilActual();
            if (perfilEnEdicion === perfilActual) {
                try {
                    if (!StorageHelper.setItem(STORAGE_KEYS.PERFIL_ACTIVO, 'default')) throw new Error('quota');
                } catch (e) {
                    console.error('Error al guardar perfil activo:', e);
                    mostrarToast('Error al guardar: almacenamiento lleno', 'error');
                    return;
                }
                mostrarToast('Perfil eliminado. Recargando...', 'success');
                setTimeout(() => location.reload(), 1000);
            } else {
                if (window.PerfilManager) {
                    window.PerfilManager.inicializar();
                }

                mostrarToast('Perfil eliminado', 'success');
                cerrarEditorPerfil();
            }
        }

        function toggleModoLote() {
            const modoNormal = document.getElementById('modo-normal');
            const modoLote = document.getElementById('modo-lote');
            const btnTexto = document.getElementById('btn-registrar-texto');
            const btnTimer = document.getElementById('btn-timer-main');
            const btn = document.getElementById('btn-agregar');

            modoLoteActivo = !modoLoteActivo;

            if (modoLoteActivo) {
                _animarFadeSwap(modoNormal, () => {
                    modoNormal.style.display = 'none';
                    modoLote.classList.add('fade-out');
                    modoLote.style.display = 'block';
                    modoLote.offsetHeight;
                    modoLote.classList.remove('fade-out');

                    document.getElementById('lote-tipo').value = 'feriado';
                    document.getElementById('lote-fecha-desde').value = '';
                    document.getElementById('lote-fecha-hasta').value = '';

                    btnTexto.textContent = 'Fichar Lote';
                    btn.style.background = '';
                    btn.style.color = '';

                    setIconoBtn(btn, '#icon-save');

                    btnTimer.disabled = true;
                    btnTimer.style.opacity = '0.3';

                    actualizarBotonLote();
                });

            } else {
                _animarFadeSwap(modoLote, () => {
                    modoLote.style.display = 'none';
                    modoNormal.classList.add('fade-out');
                    modoNormal.style.display = 'block';
                    modoNormal.offsetHeight;
                    modoNormal.classList.remove('fade-out');
                    UILogic.resetearBoton(btn);
                    btnTimer.style.opacity = '1';
                    actualizarEstadoBotonTimerMain();
                });
            }
        }

        async function ejecutarAccionRegistro() {
            if (modoLoteActivo) {
                await registrarLoteDesdeCard();
            } else {
                await DataManagement.agregarRegistro();
            }

            if (modoLoteActivo) {
                setTimeout(() => actualizarBotonLote(), 100);
            }
        }

        async function registrarLoteDesdeCard() {
            const inputDesde = document.getElementById('lote-fecha-desde');
            const inputHasta = document.getElementById('lote-fecha-hasta');
            const tipo = document.getElementById('lote-tipo').value;

            if (inputDesde.value === '' && inputDesde.validity && !inputDesde.validity.valid) {
                mostrarToast('Fecha inicial inválida', 'error');
                return;
            }

            if (inputHasta.value === '' && inputHasta.validity && !inputHasta.validity.valid) {
                mostrarToast('Fecha final inválida', 'error');
                return;
            }

            const desde = inputDesde.value;
            const hasta = inputHasta.value;

            if (!desde && !hasta) {
                if (!inputDesde.checkValidity() || !inputHasta.checkValidity()) {
                    mostrarToast('Revisa las fechas ingresadas', 'error');
                    return;
                }

                if (tipo === 'normal') {
                    mostrarToast('Completa los campos Desde y Hasta.', 'info');
                    return;
                }


                const fechaHoy = UILogic.obtenerFechaHoy();
                const registroExistente = DataManagement.registros().find(r => r.fecha === fechaHoy);
                if (registroExistente) {
                    mostrarToast('Ya existe un registro para hoy', 'warning');
                    return;
                }

                try {
                    await DataManagement.registrarDiaEspecial(fechaHoy, tipo);
                    document.getElementById('lote-fecha-desde').value = '';
                    document.getElementById('lote-fecha-hasta').value = '';
                } catch (error) {
                    console.error('Error al registrar:', error);
                }
                return;
            }

            if (desde && !hasta) {
                if (tipo === 'normal') {
                    mostrarToast('Completa ambos campos', 'info');
                    return;
                }

                const registroExistente = DataManagement.registros().find(r => r.fecha === desde);
                if (registroExistente) {
                    mostrarToast('Ya existe un registro para esa fecha', 'warning');
                    return;
                }

                try {
                    await DataManagement.registrarDiaEspecial(desde, tipo);
                    aplicarFeedbackCampos([
                        { id: 'lote-fecha-desde', fallback: 'Desde', mostrar: true },
                        { id: 'lote-fecha-hasta', fallback: 'Hasta', mostrar: false }
                    ]);
                    document.getElementById('lote-fecha-desde').value = '';
                    document.getElementById('lote-fecha-hasta').value = '';
                } catch (error) {
                    console.error('Error al registrar:', error);
                }
                return;
            }

            if (!desde && hasta) {
                mostrarToast('Completa ambos campos', 'info');
                return;
            }

            if (desde > hasta) {
                mostrarToast('La fecha inicial debe ser inferior a la final', 'error');
                return;
            }

            let registrosDelTipoEnRango;

            if (tipo === 'normal') {
                registrosDelTipoEnRango = DataManagement.registros().filter(r => {
                    const dentroDelRango = r.fecha >= desde && r.fecha <= hasta;
                    const esEspecial = TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
                    return dentroDelRango && !esEspecial;
                });
            } else {
                const codigosTipo = TiposRegistro.obtenerCodigosPorTipo(tipo);

                if (!codigosTipo) {
                    mostrarToast('Tipo de registro inválido', 'error');
                    return;
                }

                registrosDelTipoEnRango = DataManagement.registros().filter(r =>
                    r.fecha >= desde &&
                    r.fecha <= hasta &&
                    r.entrada === codigosTipo.entrada &&
                    r.salida === codigosTipo.salida
                );
            }

            try {
                if (tipo === 'normal') {
                    await DataManagement.borrarPeriodoDirecto(desde, hasta);
                } else {
                    await DataManagement.registrarVacacionesDirecto(desde, hasta, tipo);
                }

                aplicarFeedbackCampos([
                    { id: 'lote-fecha-desde', fallback: 'Desde', mostrar: true },
                    { id: 'lote-fecha-hasta', fallback: 'Hasta', mostrar: true }
                ]);
                document.getElementById('lote-fecha-desde').value = '';
                document.getElementById('lote-fecha-hasta').value = '';
            } catch (error) {
                console.error('Error en operación de lote:', error);
            }
        }

        function setIconoBtn(btn, icono) {
            const use = btn.querySelector('svg use');
            if (use) use.setAttribute('href', icono);
        }

        function poblarSelectoresTipos() {
            const tipos = TiposRegistro.obtenerTodosLosTipos();

            const cfg = [
                { id: 'lote-tipo', getLabel: t => `${t.emoji} ${t.label}`, extra: [{ value: 'normal', text: '🕒 Jornadas (borrar)' }] },
                { id: 'filtro-tipo', getLabel: t => `${t.emoji} ${t.labelPlural}`, prefix: '<option value="">Todos</option><option value="normal">🕒 Jornadas</option>' },
                { id: 'edit-grupo-tipo', getLabel: t => `${t.emoji} ${t.label}` },
            ];

            cfg.forEach(({ id, getLabel, prefix = '', extra = [] }) => {
                const sel = $(id);
                if (!sel) return;
                sel.innerHTML = prefix;
                tipos.forEach(t => sel.appendChild(_crearOpcion(t.id, getLabel(t))));
                extra.forEach(e => sel.appendChild(_crearOpcion(e.value, e.text)));
            });
        }

        function actualizarBotonLote() {
            const tipo = document.getElementById('lote-tipo').value;
            const desde = document.getElementById('lote-fecha-desde').value;
            const hasta = document.getElementById('lote-fecha-hasta').value;
            const btn = document.getElementById('btn-agregar');
            const btnTexto = document.getElementById('btn-registrar-texto');

            btn.style.background = '';
            btn.style.color = '';

            if (!desde && !hasta) {
                btnTexto.textContent = 'Fichar';
                setIconoBtn(btn, '#icon-save');
                return;
            }

            if (desde && !hasta) {
                if (tipo === 'normal') {
                    btnTexto.textContent = 'Requiere Rango';
                    btn.style.color = 'var(--c-red)';
                    setIconoBtn(btn, '#icon-save');
                    return;
                }

                const registroExiste = DataManagement.registros().find(r => r.fecha === desde);
                if (registroExiste) {
                    btnTexto.textContent = 'Fichado';
                    btn.style.color = 'var(--text-muted)';
                } else {
                    btnTexto.textContent = 'Fichar';
                }
                setIconoBtn(btn, '#icon-save');
                return;
            }

            if (!desde && hasta) {
                btnTexto.textContent = 'Requiere Rango';
                btn.style.color = 'var(--c-red)';
                return;
            }

            if (!TimeUtils.validarFecha(desde)) {
                btnTexto.textContent = 'Fecha Inicial Inválida';
                btn.style.color = 'var(--c-red)';
                setIconoBtn(btn, '#icon-save');
                return;
            }

            if (!TimeUtils.validarFecha(hasta)) {
                btnTexto.textContent = 'Fecha Final Inválida';
                btn.style.color = 'var(--c-red)';
                setIconoBtn(btn, '#icon-save');
                return;
            }

            if (desde > hasta) {
                btnTexto.textContent = 'Rango Inválido';
                btn.style.color = 'var(--c-red)';
                setIconoBtn(btn, '#icon-save');
                return;
            }

            const fechaInicio = TimeUtils.parsearFechaLocal(desde);
            const fechaFin = TimeUtils.parsearFechaLocal(hasta);
            const diffTime = Math.abs(fechaFin - fechaInicio);
            const diasTotales = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            let registrosDelTipoEnRango;

            if (tipo === 'normal') {
                registrosDelTipoEnRango = DataManagement.registros().filter(r => {
                    const dentroDelRango = r.fecha >= desde && r.fecha <= hasta;
                    const esEspecial = TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
                    return dentroDelRango && !esEspecial;
                });

                const cantidadRegistros = registrosDelTipoEnRango.length;

                if (cantidadRegistros > 0) {
                    btnTexto.textContent = `Borrar (${cantidadRegistros})`;
                    btn.style.color = 'var(--c-red)';
                    setIconoBtn(btn, '#icon-trash');
                } else {
                    btnTexto.textContent = 'Sin Registros';
                    btn.style.color = 'var(--text-muted)';
                    setIconoBtn(btn, '#icon-save');
                }
            } else {
                const codigosTipo = TiposRegistro.obtenerCodigosPorTipo(tipo);

                if (codigosTipo) {
                    registrosDelTipoEnRango = DataManagement.registros().filter(r =>
                        r.fecha >= desde &&
                        r.fecha <= hasta &&
                        r.entrada === codigosTipo.entrada &&
                        r.salida === codigosTipo.salida
                    );

                    const diasOcupados = DataManagement.registros().filter(r =>
                        r.fecha >= desde && r.fecha <= hasta
                    );

                    const yaRegistrados = registrosDelTipoEnRango.length;
                    const disponibles = diasTotales - diasOcupados.length;
                    const sobreescribirOtros = diasOcupados.length - yaRegistrados;

                    if (disponibles === 0 && yaRegistrados === diasTotales) {
                        btnTexto.textContent = `Fichado (${diasTotales})`;
                        btn.style.color = 'var(--text-muted)';
                    } else if (disponibles === diasTotales) {
                        btnTexto.textContent = `Fichar (${diasTotales})`;
                    } else if (sobreescribirOtros > 0) {
                        btnTexto.textContent = `Fichar (${disponibles} - ${sobreescribirOtros})`;
                    } else {
                        btnTexto.textContent = `Fichar (${disponibles})`;
                    }
                    setIconoBtn(btn, '#icon-save');
                } else {
                    registrosDelTipoEnRango = [];
                    btnTexto.textContent = 'Fichar';
                    setIconoBtn(btn, '#icon-save');
                }
            }
        }

        function toggleCredito() {
            const btn = document.getElementById('btn-toggle-credito');
            const estaActivo = btn.dataset.activo === "true";

            btn.dataset.activo = estaActivo ? "false" : "true";
            _setBtnActivo('btn-toggle-credito', !estaActivo);
            mostrarToast(!estaActivo ? 'Asueto | Salida temprano activado' : 'Asueto | Salida temprano desactivado', 'info');
        }

        function mostrarExportar(desdeLista = false) {
            _modalAbiertoDesdeLista = desdeLista;
            ModalManager.alternar(desdeLista ? null : 'modal-config', 'modal-exportar', null, () => {
                const tipoSelect = document.getElementById('tipo-exportacion');
                if (tipoSelect) tipoSelect.value = 'todo';

                const camposRango = document.getElementById('campos-rango-exportar');
                if (camposRango) { camposRango.style.maxHeight = '0'; camposRango.style.opacity = '0'; }

                document.getElementById('export-fecha-desde').value = '';
                document.getElementById('export-fecha-hasta').value = '';

                const btnVolverE = $('btn-volver-exportar');
                if (btnVolverE) {
                    btnVolverE.lastChild.textContent = desdeLista ? ' Cerrar' : ' Volver';
                    btnVolverE.querySelector('use').setAttribute('href', desdeLista ? '#icon-cancelar' : '#icon-undo');
                }
            });
        }

        function cerrarExportar() {
            if (!_modalAbiertoDesdeLista) {
                ModalManager.setPadre('modal-config', 'modal-selector-perfiles');
            }
            ModalManager.alternar('modal-exportar', _modalAbiertoDesdeLista ? null : 'modal-config');
            _modalAbiertoDesdeLista = false;
        }

        function toggleCamposRangoExport() {
            const tipo = document.getElementById('tipo-exportacion').value;
            const camposRango = document.getElementById('campos-rango-exportar');

            if (tipo === 'rango') {
                camposRango.style.maxHeight = '200px';
                camposRango.style.opacity = '1';
            } else {
                camposRango.style.maxHeight = '0';
                camposRango.style.opacity = '0';
            }
        }

        async function ejecutarExportacion() {
            const tipo = document.getElementById('tipo-exportacion').value;
            const btn = document.querySelector('#modal-exportar .btn-export');

            btn.disabled = true;

            try {
                if (tipo === 'todo') {
                    D.exportarJSON();
                    cerrarExportar();

                } else if (tipo === 'mes-actual') {
                    const mesActual = TimeUtils.formatearFechaLocal(new Date()).slice(0, 7);
                    await exportarRango(mesActual, mesActual, true);

                } else if (tipo === 'rango') {
                    const desde = S.sanitizeString(document.getElementById('export-fecha-desde').value, 10);
                    const hasta = S.sanitizeString(document.getElementById('export-fecha-hasta').value, 10);

                    if (!desde || !hasta) {
                        mostrarToast('Completa ambas fechas', 'error');
                        btn.disabled = false;
                        return;
                    }

                    if (!TimeUtils.validarFecha(desde) || !TimeUtils.validarFecha(hasta)) {
                        mostrarToast('Fechas inválidas', 'error');
                        btn.disabled = false;
                        return;
                    }

                    if (desde > hasta) {
                        mostrarToast('La fecha inicial debe ser anterior a la final', 'error');
                        btn.disabled = false;
                        return;
                    }

                    await exportarRango(desde, hasta, false);
                }

            } catch (error) {
                console.error('Error en exportación:', error);
                mostrarToast('Error al exportar', 'error');
            } finally {
                btn.disabled = false;
            }
        }

        async function exportarRango(desde, hasta, esMes = false) {
            let registrosFiltrados;

            if (esMes) {
                const [año, mes] = desde.split('-').map(Number);
                registrosFiltrados = D.registros().filter(r => {
                    const [aReg, mReg] = r.fecha.split('-').map(Number);
                    return aReg === año && mReg === mes;
                });
            } else {
                registrosFiltrados = D.registros().filter(r =>
                    r.fecha >= desde && r.fecha <= hasta
                );
            }

            if (registrosFiltrados.length === 0) {
                mostrarToast('No hay registros en ese rango', 'warning');
                return;
            }

            const ahora = new Date();
            const año = ahora.getFullYear();
            const mes = String(ahora.getMonth() + 1).padStart(2, '0');
            const dia = String(ahora.getDate()).padStart(2, '0');
            const hora = String(ahora.getHours()).padStart(2, '0');
            const minuto = String(ahora.getMinutes()).padStart(2, '0');
            const segundo = String(ahora.getSeconds()).padStart(2, '0');
            const fechaLocal = `${año}-${mes}-${dia} ${hora}:${minuto}:${segundo}`;

            const data = {
                registros: registrosFiltrados,
                diasHabiles: D.diasHabiles(),
                horasDiarias: D.horasDiarias(),
                fecha: fechaLocal,
                version: S.SECURITY_LIMITS.SCHEMA_VERSION,
                hash: await S.calcularHashSHA256(registrosFiltrados),
                timestamp: Date.now(),
                rangoExportado: esMes ? `Mes ${desde}` : `${desde} a ${hasta}`
            };

            if (data.rangoExportado) {
                data.rangoExportado = S.sanitizeString(data.rangoExportado, 100);
            }

            try {
                const nombreSafe = obtenerNombrePerfilSafe();
                const fechaHoy = `${año}-${mes}-${dia}`;
                const sufijo = esMes ? `_${desde}` : `_${desde}_${hasta}`;
                descargarJSON(data, `Horarios_${nombreSafe}${sufijo}_${fechaHoy}.json`);

                const mensaje = esMes
                    ? `Exportados ${registrosFiltrados.length} registros del mes`
                    : `Exportados ${registrosFiltrados.length} registros`;
                mostrarToast(mensaje, 'success');
                cerrarExportar();

            } catch (e) {
                console.error(e);
                mostrarToast('Error al exportar', 'error');
            }
        }

        let _gistModalPadre = null;
        let _gistAutoSyncTemp = null;
        let _gistLimitesTemp = null;
        let _gistLimitesOrig = null;
        let _gistMergeDesdeModal = false;

        function actualizarEstadoBotonesGist() {
            const token = document.getElementById('gist-token')?.value.trim() || '';
            const gistId = document.getElementById('gist-id')?.value.trim() || '';
            const soloToken = token !== '';
            const ambosCompletos = soloToken && gistId.length > 10;

            _setBtnDisabled('btn-gist-subir', !soloToken);
            _setBtnDisabled('btn-gist-bajar', !ambosCompletos);
            _setBtnDisabled('btn-toggle-gist-backup', !ambosCompletos);

            const estadoBackup = parseInt(_gistAutoSyncTemp ?? GistSync.getAutoSync());
            _setBtnDisabled('btn-toggle-gist-merge', !(ambosCompletos && estadoBackup === 1));
        }

        function abrirModalGist() {
            const modalAbierto = document.querySelector('.modal.show');
            _gistModalPadre = modalAbierto ? modalAbierto.id : null;

            const tokenInput = document.getElementById('gist-token');
            const gistIdInput = document.getElementById('gist-id');
            const lastSyncEl = document.getElementById('gist-ultima-sync');

            if (tokenInput) tokenInput.value = GistSync.getToken();
            if (gistIdInput) gistIdInput.value = GistSync.getGistId();
            if (lastSyncEl) {
                const last = GistSync.getLastSync();
                lastSyncEl.textContent = last ? `Sincronizado: ${GistSync.formatLastSync(last)}` : 'No sincronizado';
            }

            const rango = GistSync.getRangoHorario();
            const desdeEl = document.getElementById('gist-rango-desde');
            const hastaEl = document.getElementById('gist-rango-hasta');
            if (desdeEl) desdeEl.value = rango.desde;
            if (hastaEl) hastaEl.value = rango.hasta;

            _gistAutoSyncTemp = GistSync.getAutoSync();
            actualizarBotonGistBackup();
            actualizarBotonGistMerge();
            actualizarEstadoBotonesGist();
            ModalManager.cerrarTodos();
            ModalManager.abrir('modal-gist');
            _gistLimitesTemp = null;
            _actualizarCampoLimite();
            _gistLimitesOrig = { bajar: GistSync.getSyncLimite('bajar'), subir: GistSync.getSyncLimite('subir') };
        }

        function _gistGuardarCredencialesSiModalAbierto() {
            if (document.getElementById('modal-gist')?.classList.contains('show')) {
                GistSync.saveCredentials(
                    document.getElementById('gist-token')?.value.trim() || '',
                    document.getElementById('gist-id')?.value.trim() || ''
                );
            }
        }

        function _setBtnDisabled(id, disabled) {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.disabled = disabled;
        }

        function actualizarBotonesHistorico() {
            const btnRespaldar = document.getElementById('btn-hist-respaldar');
            const btnRestaurar = document.getElementById('btn-hist-restaurar');
            if (!btnRespaldar || !btnRestaurar) return;

            const tieneGist = GistSync.esGistIdValido(GistSync.getGistId());

            const newRespaldar = btnRespaldar.cloneNode(true);
            const newRestaurar = btnRestaurar.cloneNode(true);
            btnRespaldar.parentNode.replaceChild(newRespaldar, btnRespaldar);
            btnRestaurar.parentNode.replaceChild(newRestaurar, btnRestaurar);

            if (tieneGist) {
                newRespaldar.title = 'Subir a Gist';
                newRespaldar.addEventListener('click', () => gistSubir());
                newRespaldar.querySelector('use').setAttribute('href', '#icon-cloud-upload');

                newRestaurar.title = 'Bajar de Gist';
                newRestaurar.addEventListener('click', () => gistBajar());
                newRestaurar.querySelector('use').setAttribute('href', '#icon-cloud-download');
            } else {
                newRespaldar.title = 'Respaldar';
                newRespaldar.addEventListener('click', () => mostrarExportar(true));
                newRespaldar.querySelector('use').setAttribute('href', '#icon-download');

                newRestaurar.title = 'Restaurar';
                newRestaurar.addEventListener('click', () => mostrarImportar(true));
                newRestaurar.querySelector('use').setAttribute('href', '#icon-upload');
            }
        }

        function guardarConfigGist() {
            const token = document.getElementById('gist-token')?.value.trim() || '';
            const gistId = document.getElementById('gist-id')?.value.trim() || '';
            const desdeRaw = document.getElementById('gist-rango-desde')?.value || '';
            const hastaRaw = document.getElementById('gist-rango-hasta')?.value || '';

            if (desdeRaw && !TimeUtils.validarHora(desdeRaw)) {
                mostrarToast('Hora inicial inválida.', 'error');
                return;
            }
            if (hastaRaw && !TimeUtils.validarHora(hastaRaw)) {
                mostrarToast('Hora final inválida.', 'error');
                return;
            }

            const desde = desdeRaw || '21:00';
            const hasta = hastaRaw || '00:00';

            const rango = GistSync.getRangoHorario();
            const limitesCambiaron = _gistLimitesOrig !== null && (
                _gistLimitesOrig.bajar !== GistSync.getSyncLimite('bajar') ||
                _gistLimitesOrig.subir !== GistSync.getSyncLimite('subir')
            );
            const huboCambios = token !== GistSync.getToken()
                || gistId !== GistSync.getGistId()
                || desde !== rango.desde
                || hasta !== rango.hasta
                || limitesCambiaron
                || (_gistAutoSyncTemp !== null && _gistAutoSyncTemp !== GistSync.getAutoSync())
                || (_gistLimitesTemp !== null);

            if (_gistAutoSyncTemp !== null) GistSync.setAutoSync(_gistAutoSyncTemp);
            if (_gistLimitesTemp !== null) {
                GistSync.setSyncLimite('bajar', _gistLimitesTemp.bajar);
                GistSync.setSyncLimite('subir', _gistLimitesTemp.subir);
            }
            GistSync.saveCredentials(token, gistId);
            GistSync.setRangoHorario(desde, hasta);
            mostrarToast(huboCambios ? 'Configuración guardada' : 'Sin cambios', huboCambios ? 'success' : 'info');
            _gistAutoSyncTemp = null;
            _gistLimitesTemp = null;
            _gistModalPadre = null;
            _gistLimitesOrig = null;
            ModalManager.cerrar('modal-gist');
            actualizarBotonesHistorico();
        }

        function cerrarModalGist() {
            _gistAutoSyncTemp = null;
            _gistLimitesTemp = null;
            _gistLimitesOrig = null;
            ModalManager.cerrar('modal-gist');
            if (_gistModalPadre) {
                ModalManager.abrir(_gistModalPadre);
                if (_gistModalPadre === 'modal-config') {
                    ModalManager.setPadre('modal-config', 'modal-selector-perfiles');
                }
            }
            _gistModalPadre = null;
            actualizarBotonesHistorico();
        }

        function _calcularRegistrosMerge(modo, mergeData) {
            const { registrosNormalizados, soloEnGist, complementarios = [], data } = mergeData;

            if (modo === 'merge') {
                if (soloEnGist.length === 0 && complementarios.length === 0) {
                    return { vacio: true };
                }
                if (D.registros().length + soloEnGist.length > S.SECURITY_LIMITS.MAX_REGISTROS) {
                    return { limiteAlcanzado: true };
                }

                const registrosActualizados = D.registros().map(local => {
                    const imp = complementarios.find(c => c.fecha === local.fecha);
                    if (!imp) return local;
                    const actualizado = { ...local };
                    if (!actualizado.salida && imp.salida) actualizado.salida = imp.salida;
                    if (!actualizado.tiempoFuera && imp.tiempoFuera) actualizado.tiempoFuera = imp.tiempoFuera;
                    const t = D.calcularHoras(actualizado.entrada, actualizado.salida, actualizado.tiempoFuera || null, actualizado.credito || null);
                    if (t) { actualizado.horas = t.horas; actualizado.minutos = t.minutos; actualizado.total = t.total; }
                    return actualizado;
                });

                const partes = [];
                if (soloEnGist.length > 0) partes.push(`${soloEnGist.length} día${soloEnGist.length !== 1 ? 's' : ''} nuevo${soloEnGist.length !== 1 ? 's' : ''}`);
                if (complementarios.length > 0) partes.push(`${complementarios.length} registro${complementarios.length !== 1 ? 's' : ''} completado${complementarios.length !== 1 ? 's' : ''}`);

                return {
                    registrosFinales: [...registrosActualizados, ...soloEnGist],
                    mensajeExito: `Combinado: ${partes.join(', ')}`
                };

            } else {
                if (Array.isArray(data.diasHabiles)) {
                    const diasValidos = data.diasHabiles.filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
                    if (diasValidos.length > 0) D.setDiasHabiles(diasValidos);
                }
                if (data.horasDiarias != null) {
                    const hd = parseFloat(data.horasDiarias);
                    if (Number.isFinite(hd) && hd >= 0 && hd <= 24) D.setHorasDiarias(hd);
                }
                return {
                    registrosFinales: registrosNormalizados,
                    mensajeExito: `${registrosNormalizados.length} registros restaurados desde Gist`
                };
            }
        }

        async function gistMergeAplicar(modo, modoAutomatico = false) {
            if (!_gistMergeData) return;
            const mergeData = _gistMergeData;
            _gistMergeData = null;

            const resultado = _calcularRegistrosMerge(modo, mergeData);

            if (resultado.vacio) {
                ModalManager.cerrar('modal-gist-merge');
                mostrarToast('Sin datos nuevos para completar', 'info');
                return;
            }
            if (resultado.limiteAlcanzado) {
                mostrarToast('Límite alcanzado', 'error');
                return;
            }

            const { registrosFinales, mensajeExito } = resultado;

            D.registros().splice(0, D.registros().length, ...registrosFinales);
            D.registros().sort((a, b) => {
                if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
                return (b.entrada || '').localeCompare(a.entrada || '');
            });
            HistoryManager.saveState(D.registros());

            await D.guardarYActualizar();
            actualizarUI();

            if (!modoAutomatico) ModalManager.cerrar('modal-gist-merge');
            const lastSyncEl = document.getElementById('gist-ultima-sync');
            if (lastSyncEl) lastSyncEl.textContent = `Última sync: ${GistSync.formatLastSync(GistSync.getLastSync())}`;
            mostrarToast(mensajeExito, 'success');

            const btn = document.getElementById('btn-gist-bajar');
            if (btn) btn.disabled = false;
        }

        function gistMergeCancelar() {
            _gistMergeData = null;
            ModalManager.cerrar('modal-gist-merge');
            const btn = document.getElementById('btn-gist-bajar');
            if (btn) btn.disabled = false;
            if (_gistMergeDesdeModal) {
                _gistMergeDesdeModal = false;
                ModalManager.abrir('modal-gist');
            }
        }

        function toggleGistMerge() {
            const actual = GistSync.getMergeBehavior();
            GistSync.setMergeBehavior(actual === 'merge' ? 'replace' : 'merge');
            actualizarBotonGistMerge();
        }

        function actualizarBotonGistMerge() {
            const hint = document.getElementById('hint-gist-merge');
            const iconEl = document.getElementById('icon-gist-merge')?.querySelector('use');
            const esMerge = GistSync.getMergeBehavior() === 'merge';
            if (hint) hint.textContent = esMerge ? 'Combinar' : 'Reemplazar';
            if (iconEl) iconEl.setAttribute('href', esMerge ? '#icon-combine' : '#icon-replace-swap');
        }

        function toggleGistBackup() {
            const actual = parseInt(_gistAutoSyncTemp ?? GistSync.getAutoSync());
            _gistAutoSyncTemp = (actual + 1) % 3;
            actualizarBotonGistBackup();
            actualizarEstadoBotonesGist();
            _actualizarCampoLimite();
        }

        function actualizarBotonGistBackup() {
            const btn = document.getElementById('btn-toggle-gist-backup');
            const hint = document.getElementById('hint-gist-backup');
            const label = document.getElementById('label-gist-backup');
            const rangoEl = document.getElementById('gist-rango-horario');
            const estado = _gistAutoSyncTemp ?? GistSync.getAutoSync();
            if (!btn) return;

            const configs = [
                { texto: 'Sin automatizar', hint: '', activo: false },
                { texto: 'Restaurar', hint: '', activo: true },
                { texto: 'Respaldar', hint: '', activo: true }
            ];
            const c = configs[estado];
            _setBtnActivo(btn.id, c.activo);
            if (label) label.textContent = c.texto;
            if (hint) { hint.textContent = c.hint; hint.style.color = c.color; }

            if (rangoEl) {
                const activo = estado === 1 || estado === 2;
                rangoEl.classList.toggle('disabled', !activo);
            }
        }

        function toggleVerToken() {
            const input = document.getElementById('gist-token');
            if (!input) return;
            input.type = input.type === 'password' ? 'text' : 'password';
        }

        function abrirGistEnBrowser() {
            const gistIdRaw = document.getElementById('gist-id')?.value.trim() || GistSync.getGistId();
            if (gistIdRaw && GistSync.esGistIdValido(gistIdRaw)) {
                window.open(`https://gist.github.com/${gistIdRaw.trim()}`, '_blank', 'noopener,noreferrer');
            } else {
                window.open('https://gist.github.com', '_blank', 'noopener,noreferrer');
            }
        }

        function _tipoSyncActual() {
            const estado = parseInt(_gistAutoSyncTemp ?? GistSync.getAutoSync());
            return estado === 1 ? 'bajar' : estado === 2 ? 'subir' : null;
        }

        function _actualizarCampoLimite() {
            const tipo = _tipoSyncActual();
            const contenedor = document.getElementById('gist-limite-sync');
            if (!contenedor) return;
            if (!tipo) {
                contenedor.classList.add('disabled');
                return;
            }
            const limite = _gistLimitesTemp ? _gistLimitesTemp[tipo] : GistSync.getSyncLimite(tipo);
            const input = document.getElementById('gist-limite-valor');
            const label = document.getElementById('gist-limite-label');
            if (input) input.value = limite;
            if (label) label.textContent = tipo === 'bajar' ? 'Límite bajadas por hora (0 = sin límite)' : 'Límite subidas por hora (0 = sin límite)';
            contenedor.classList.remove('disabled');
        }

        function cambiarLimiteSync(delta) {
            const tipo = _tipoSyncActual();
            if (!tipo) return;
            if (!_gistLimitesTemp) _gistLimitesTemp = { bajar: GistSync.getSyncLimite('bajar'), subir: GistSync.getSyncLimite('subir') };
            _gistLimitesTemp[tipo] = Math.max(0, Math.min(99, _gistLimitesTemp[tipo] + delta));
            _actualizarCampoLimite();
        }

        let _timeoutLimite = null;
        let _intervaloLimite = null;

        function iniciarCambioLimite(delta) {
            cambiarLimiteSync(delta);
            _timeoutLimite = setTimeout(() => {
                _intervaloLimite = setInterval(() => cambiarLimiteSync(delta), 100);
            }, 500);
        }

        function detenerCambioLimite() {
            if (_timeoutLimite) { clearTimeout(_timeoutLimite); _timeoutLimite = null; }
            if (_intervaloLimite) { clearInterval(_intervaloLimite); _intervaloLimite = null; }
        }


        async function gistSubir() {
            _gistGuardarCredencialesSiModalAbierto();
            const btn = document.getElementById('btn-gist-subir');
            if (btn) btn.disabled = true;
            mostrarToast('Subiendo...', 'info');


            try {
                const nuevoId = await GistSync.subir(
                    D.registros(),
                    D.diasHabiles(),
                    D.horasDiarias()
                );
                const gistIdInput = document.getElementById('gist-id');
                if (gistIdInput) gistIdInput.value = nuevoId;
                const lastSyncEl = document.getElementById('gist-ultima-sync');
                if (lastSyncEl) lastSyncEl.textContent = `Última sync: ${GistSync.formatLastSync(GistSync.getLastSync())}`;
                mostrarToast('Datos respaldados en Gist', 'success');
            } catch (e) {
                console.error('Gist subir error:', e);
                mostrarToast('Error al subir', 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        let _gistMergeData = null;

        async function gistBajar(modoAutomatico = false) {
            _gistGuardarCredencialesSiModalAbierto();
            _gistMergeDesdeModal = document.getElementById('modal-gist')?.classList.contains('show') ?? false;
            const btn = document.getElementById('btn-gist-bajar');
            if (btn) btn.disabled = true;
            mostrarToast('Bajando...', 'info');

            try {
                const data = await GistSync.bajar();

                if (!data.registros || !Array.isArray(data.registros)) {
                    throw new Error('Datos inválidos en el Gist');
                }

                const allowedRootKeys = ['registros', STORAGE_KEYS.DIAS_HABILES, STORAGE_KEYS.HORAS_DIARIAS, 'fecha', 'version', 'hash', 'timestamp', '_hashNoCoincide'];
                const hasInvalidKeys = Object.keys(data).some(k => !allowedRootKeys.includes(k));
                if (hasInvalidKeys) throw new Error('Estructura del Gist sospechosa');

                if (data._hashNoCoincide) {
                    const continuar = await confirmarModal('El hash de integridad no coincide. El Gist puede haber sido modificado o corrompido. ¿Restaurar de todas formas?', 'Restaurar', '#icon-upload');
                    if (!continuar) {
                        if (btn) btn.disabled = false;
                        return;
                    }
                }

                if (data.version && data.version > S.SECURITY_LIMITS.SCHEMA_VERSION) {
                    mostrarToast(`Gist de versión más nueva (v${data.version}). Algunos datos pueden no importarse correctamente.`, 'warning');
                }

                const registrosNormalizados = D.normalizarRegistrosImportados(data.registros, D.calcularHoras);

                if (registrosNormalizados.length === 0) throw new Error('No se encontraron registros válidos');
                if (registrosNormalizados.length > S.SECURITY_LIMITS.MAX_REGISTROS) throw new Error(`Máximo ${S.SECURITY_LIMITS.MAX_REGISTROS} registros permitidos`);

                const fechasLocales = new Set(D.registros().map(r => r.fecha));
                const soloEnGist = registrosNormalizados.filter(r => !fechasLocales.has(r.fecha));
                const enAmbos = registrosNormalizados.filter(r => fechasLocales.has(r.fecha));
                const soloLocal = D.registros().filter(r => !registrosNormalizados.some(g => g.fecha === r.fecha));
                const complementarios = enAmbos.filter(imp => {
                    const local = D.registros().find(r => r.fecha === imp.fecha);
                    if (!local) return false;
                    return (!local.salida && imp.salida) || (!local.tiempoFuera && imp.tiempoFuera);
                });

                _gistMergeData = { registrosNormalizados, soloEnGist, complementarios, data };

                if (modoAutomatico) {
                    await gistMergeAplicar(GistSync.getMergeBehavior(), true);
                } else {
                    const configCambios = [];
                    if (Array.isArray(data.diasHabiles)) {
                        const diasGist = [...data.diasHabiles].sort().join(',');
                        const diasLocal = [...D.diasHabiles()].sort().join(',');
                        if (diasGist !== diasLocal) configCambios.push('días laborales');
                    }
                    if (data.horasDiarias != null && parseFloat(data.horasDiarias) !== D.horasDiarias()) {
                        configCambios.push(`horas diarias (${D.horasDiarias()}h → ${parseFloat(data.horasDiarias)}h)`);
                    }

                    const resumenEl = document.getElementById('gist-merge-resumen');
                    if (resumenEl) {
                        resumenEl.innerHTML = '';

                        const _mkSvg = (id) => {
                            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                            svg.setAttribute('class', 'icon');
                            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                            use.setAttribute('href', id);
                            svg.appendChild(use);
                            return svg;
                        };
                        const _mkStrong = (text, cls) => {
                            const s = document.createElement('strong');
                            if (cls) s.className = cls;
                            s.textContent = String(text);
                            return s;
                        };
                        const _mkRow = (...nodes) => {
                            const d = document.createElement('div');
                            nodes.forEach(n => d.appendChild(typeof n === 'string' ? document.createTextNode(n) : n));
                            return d;
                        };

                        const bloqueFilas = document.createElement('div');
                        bloqueFilas.appendChild(_mkRow(
                            _mkSvg('#icon-cloud'), ` En Gist `,
                            _mkStrong(soloEnGist.length, 'text-green'),
                            ` registro${soloEnGist.length !== 1 ? 's' : ''} nuevos`
                        ));
                        const filaAmbos = _mkRow(
                            _mkSvg('#icon-combine'), ` En ambos `,
                            _mkStrong(enAmbos.length),
                            ` registro${enAmbos.length !== 1 ? 's' : ''} (por fecha`
                        );
                        if (complementarios.length > 0) {
                            filaAmbos.appendChild(document.createTextNode(', '));
                            filaAmbos.appendChild(_mkStrong(complementarios.length, 'text-blue'));
                            filaAmbos.appendChild(document.createTextNode(' para completar'));
                        }
                        filaAmbos.appendChild(document.createTextNode(')'));
                        bloqueFilas.appendChild(filaAmbos);
                        bloqueFilas.appendChild(_mkRow(
                            _mkSvg('#icon-save'), ` Local `,
                            _mkStrong(soloLocal.length),
                            ` registro${soloLocal.length !== 1 ? 's' : ''} no subidos`
                        ));
                        resumenEl.appendChild(bloqueFilas);

                        const configEl = document.createElement('div');
                        configEl.id = '_gist-config-cambios';
                        configEl.textContent = configCambios.length > 0
                            ? `⚙ Reemplazar cambiará: ${configCambios.join(', ')}`
                            : `⚙ Sin cambios de configuración`;
                        resumenEl.appendChild(configEl);

                        const footer = document.createElement('div');
                        footer.className = 'gist-resumen-footer';
                        footer.appendChild(_mkStrong('Combinar'));
                        let txtCombinar = `: agrega ${soloEnGist.length} nuevo(s)`;
                        if (complementarios.length > 0) txtCombinar += `, completa ${complementarios.length} registro(s)`;
                        txtCombinar += ', mantiene los locales';
                        footer.appendChild(document.createTextNode(txtCombinar));
                        footer.appendChild(document.createElement('br'));
                        footer.appendChild(_mkStrong('Reemplazar'));
                        footer.appendChild(document.createTextNode(`: usa los ${registrosNormalizados.length} registros del Gist`));
                        resumenEl.appendChild(footer);
                    }
                    ModalManager.cerrar('modal-gist');
                    ModalManager.abrir('modal-gist-merge');
                }
            } catch (e) {
                console.error('Gist bajar error:', e);
                mostrarToast('Error al bajar', 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
        }


        async function init() {
            if (typeof (Storage) === "undefined") {
                alert("Tu navegador no soporta localStorage.");
                return;
            }

            PerfilManager.inicializar();

            window.DataManagement = {
                agregarRegistro: D.agregarRegistro,
                exportarJSON: D.exportarJSON,
                mostrarImportar: mostrarImportar,
                importarDatos: D.importarDatos,
                borrarTodoHistorial: D.borrarTodoHistorial,
                editarRegistro: D.editarRegistro,
                guardarEdicion: D.guardarEdicion,
                eliminarRegistroActual: D.eliminarRegistroActual,
                undoAction: D.undoAction,
                redoAction: D.redoAction,
                aplicarFiltrosInmediato: D.aplicarFiltrosInmediato,
                limpiarFiltros: D.limpiarFiltros,
                registrarDiaEspecial: D.registrarDiaEspecial,
                registros: D.registros,
                diasHabiles: D.diasHabiles,
                horasDiarias: D.horasDiarias,
                setDiasHabiles: D.setDiasHabiles,
                setHorasDiarias: D.setHorasDiarias,
                calcularHoras: D.calcularHoras,
                registrarVacacionesDirecto: D.registrarVacacionesDirecto,
                borrarPeriodoDirecto: D.borrarPeriodoDirecto,
                editarGrupo: D.editarGrupo,
                guardarEdicionGrupo: D.guardarEdicionGrupo,
                eliminarGrupoActual: D.eliminarGrupoActual
            };
            window.HistoryManager = { undo: D.undoAction, redo: D.redoAction };
            window.PWAInstaller = { instalarApp: PWAInstaller.instalarApp };
            window.PerfilManager = PerfilManager;

            window.UILogic = UILogic;

            ['entrada', 'salida'].forEach(id => {
                const el = $(id);
                if (el) el.addEventListener('input', formatearInput);
                if (el) el.addEventListener('input', () => limpiarError(id, null));
            });
            $('fecha')?.addEventListener('change', () => limpiarError('fecha', null));

            const verificarBloqueCreditoDebounced = debounce(verificarBloqueoCredito, 200);

            ['edit-entrada', 'edit-salida'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', (e) => {
                        formatearInput(e);
                        verificarBloqueCreditoDebounced();
                    });

                    el.addEventListener('change', verificarBloqueoCredito);
                }
            });

            $('calendario-selector-meses')?.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    _cerrarSelectorMeses();
                }
            });

            const tf = document.getElementById('edit-tiempo-fuera');
            if (tf) tf.addEventListener('input', (e) => {
                formatearInput(e);
                verificarBloqueCreditoDebounced();
            });

            const notasEl = document.getElementById('edit-notas');
            if (notasEl) notasEl.addEventListener('input', () => {
                const v = notasEl.value;
                const filtrado = S.sanitizeNotas(v);
                if (filtrado !== v) {
                    const pos = notasEl.selectionStart - (v.length - filtrado.length);
                    notasEl.value = filtrado;
                    notasEl.setSelectionRange(pos, pos);
                }
            });

            ['gist-rango-desde', 'gist-rango-hasta'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', formatearInput);
            });

            function actualizarHintEdicion() {
                const hint = document.getElementById('edit-hint-resumen');
                if (!hint) return;
                const e = document.getElementById('edit-entrada')?.value.trim();
                const s = document.getElementById('edit-salida')?.value.trim();
                const tf = document.getElementById('edit-tiempo-fuera')?.value.trim();

                if (!e && !s) { hint.textContent = ''; return; }

                const tipoEspecial = TiposRegistro.obtenerTipoPorCodigo(e, s);
                if (tipoEspecial) {
                    hint.textContent = tipoEspecial.label;
                    return;
                }

                if (e?.length === 5 && s?.length === 5) {
                    const t = D.calcularHoras(e, s, tf || null, null, false);
                    if (t) {
                        hint.textContent = `Total: ${t.horas}h ${t.minutos}m`;
                    } else {
                        hint.textContent = '';
                    }
                } else {
                    hint.textContent = '';
                }
            }

            ['edit-entrada', 'edit-salida', 'edit-tiempo-fuera'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', actualizarHintEdicion);
            });

            // ===================================
            // LISTENERS PARA TECLA ENTER MODULE
            // ===================================
            const inputEntrada = document.getElementById('entrada');
            if (inputEntrada) {
                inputEntrada.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const inputSalida = document.getElementById('salida');
                        if (inputSalida) inputSalida.focus();
                    }
                });
            }

            const inputSalida = document.getElementById('salida');
            if (inputSalida) {
                inputSalida.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        inputSalida.blur();

                        const btnAgregar = document.getElementById('btn-agregar');
                        if (btnAgregar && !btnAgregar.disabled) {
                            btnAgregar.click();
                        }
                    }
                });
            }

            const editEntrada = document.getElementById('edit-entrada');
            if (editEntrada) {
                editEntrada.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const editSalida = document.getElementById('edit-salida');
                        if (editSalida) editSalida.focus();
                    }
                });
            }

            const editSalida = document.getElementById('edit-salida');
            if (editSalida) {
                editSalida.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const editTiempoFuera = document.getElementById('edit-tiempo-fuera');
                        if (editTiempoFuera) editTiempoFuera.focus();
                    }
                });
            }

            const editTiempoFuera = document.getElementById('edit-tiempo-fuera');
            if (editTiempoFuera) {
                editTiempoFuera.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        editTiempoFuera.blur();

                        const btnGuardar = document.querySelector('#modal-editar .btn-edit');
                        if (btnGuardar && !btnGuardar.disabled) {
                            btnGuardar.click();
                        }
                    }
                });
            }

            const inputNuevoPerfil = document.getElementById('nombre-nuevo-perfil-selector');
            if (inputNuevoPerfil) {
                inputNuevoPerfil.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        inputNuevoPerfil.blur();

                        UILogic.crearPerfilDesdeSelector();
                    }
                });
            }

            const inputEditarPerfil = document.getElementById('nombre-perfil-editar');
            if (inputEditarPerfil) {
                inputEditarPerfil.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        inputEditarPerfil.blur();

                        const btnGuardarPerfil = document.querySelector('#modal-editar-perfil .btn-edit');
                        if (btnGuardarPerfil && !btnGuardarPerfil.disabled) {
                            btnGuardarPerfil.click();
                        }
                    }
                });
            }

            registrarSwipe(document.getElementById('stats-card'), () => alternarVista());

            registrarSwipe(document.getElementById('form-registro'), () => toggleModoLote(), { ignoreInputs: true });

            const anchor = document.getElementById('stat-items-tipos-anchor');
            if (anchor) {
                TiposRegistro.obtenerTodosLosTipos().forEach(t => {
                    const item = document.createElement('div');
                    item.className = 'stat-item';
                    const label = document.createElement('div');
                    label.className = 'stat-label';
                    label.textContent = t.labelPlural;
                    const value = document.createElement('div');
                    value.className = 'stat-value';
                    value.id = `stat-${t.labelPlural.toLowerCase()}`;
                    value.textContent = '0';
                    item.appendChild(label);
                    item.appendChild(value);
                    anchor.parentNode.insertBefore(item, anchor);
                });
            }
            _bindStatItemPopups(document.querySelector('.stats-grid'));

            const config = D.cargarConfiguracion();
            const temaOscuro = config.temaOscuro;
            D.setVistaActual(config.vistaActual);
            D.setIgnorarTiempoFuera(config.ignorarTiempoFuera || false);
            UILogic.actualizarEstadoBotonIgnorarTF();
            UILogic.poblarSelectoresTipos();
            UILogic.actualizarEstadoBotonHoverPopup();
            UILogic.actualizarEstadoBotonSaldoDesdeEnero();
            UILogic.actualizarEstadoBotonSaldoDesdePrimeroDiaMes();
            UILogic.aplicarVisibilidadCards();
            UILogic.aplicarOrdenCards(UILogic.obtenerOrdenCards());
            UILogic.iniciarDragOrdenCards();
            UILogic.setFondoCard(config.fondoCard || 'golden-gate');
            if (config.modoEstadisticas === 'anual') UILogic.togglePeriodoStats();
            else if (config.modoEstadisticas === 'semanal') { UILogic.togglePeriodoStats(); UILogic.togglePeriodoStats(); }

            const perfilActual = PerfilManager.obtenerDatosPerfil();
            const diasArraySeguro = Array.isArray(perfilActual.diasHabiles) ? perfilActual.diasHabiles : [1, 2, 3, 4, 5];
            D.setDiasHabiles(diasArraySeguro);
            D.setHorasDiarias(perfilActual.horasDiarias !== undefined ? perfilActual.horasDiarias : 7);

            const registrosCargados = perfilActual.registros || [];
            D.registros().splice(0, D.registros().length, ...registrosCargados);

            const historialCargado = HistoryManager.loadFromLocalStorage();

            if (historialCargado) {
                const estadoActual = HistoryManager.getCurrentState();
                if (estadoActual !== null && estadoActual !== undefined) {
                    D.registros().splice(0, D.registros().length, ...estadoActual);
                    console.log('Registros restaurados desde historial');
                } else {
                    console.warn('Historial corrupto, descartado. Usando registros del perfil.');
                    HistoryManager.clear();
                }
            }
            D.recalcularTotalesEnMemoria();
            if (!historialCargado) {
                HistoryManager.saveState(D.registros());
                console.log('Nuevo historial inicializado');
            }

            HistoryManager.updateButtons();

            if (temaOscuro) {
                document.documentElement.classList.add('dark-mode');
            }
            const toggleBtnEl = $('theme-toggle');
            if (toggleBtnEl) {
                const tBtn = toggleBtnEl.querySelector('use');
                if (tBtn) tBtn.setAttribute('href', temaOscuro ? '#icon-sun' : '#icon-moon');
            }
            const toggleBtnModal = $('theme-toggle-modal');
            if (toggleBtnModal) {
                const tBtnM = toggleBtnModal.querySelector('use');
                if (tBtnM) tBtnM.setAttribute('href', temaOscuro ? '#icon-sun' : '#icon-moon');
            }

            $('fecha').value = obtenerFechaHoy();

            try {
                const persistir = StorageHelper.getBoolean(STORAGE_KEYS.PERSISTIR_TARJETAS, true);
                if (persistir && StorageHelper.getBoolean(STORAGE_KEYS.FORMULARIO_EXPANDIDO)) toggleFormulario();
                if (persistir && StorageHelper.getBoolean(STORAGE_KEYS.STATS_EXPANDIDO)) toggleStats();

                const estadoHistorico = persistir ? StorageHelper.getItem(STORAGE_KEYS.HISTORICO_EXPANDIDO, 'cerrado') : 'cerrado';
                if (estadoHistorico === 'meses' || estadoHistorico === 'completo') {
                    const contenido = $('contenido-historico');
                    const icon = $('icon-indicator-historico');
                    if (contenido) contenido.classList.add('expanded');

                    if (estadoHistorico === 'meses') {
                        if (icon) { icon.style.transform = ''; icon.classList.add('rotated'); }
                    } else if (estadoHistorico === 'completo') {
                        const botones = $('botones-historico');
                        if (botones) { botones.classList.add('expanded'); tiempoExpansionBotones = Date.now(); }
                        if (icon) { icon.classList.remove('rotated'); icon.style.transform = 'rotate(-90deg)'; }
                    }
                }

                const usarCalendario = StorageHelper.getBoolean(STORAGE_KEYS.VISTA_HISTORICO_CAL, true);
                if (usarCalendario) {
                    if ($('contenido-historico')?.classList.contains('expanded')) {
                        _vistaHistoricoCalendario = false;
                        toggleVistaHistorico();
                    } else {
                        _vistaHistoricoCalendario = true;
                    }
                }
            } catch (e) {
                console.warn('Error restaurando estado visual:', e);
            }

            PWAInstaller.init();

            actualizarUI();
            _iniciarCicloStats();
            actualizarBotonesHistorico();

            if (D.vistaActual() === 'semana') {
                _timerAutoVista = setTimeout(() => {
                    _timerAutoVista = null;
                    alternarVista();
                    setTimeout(() => { _iniciarCicloStats(); }, 350);
                }, 2500);
            }

            const _autoSyncEstado = GistSync.getAutoSync();
            const _tieneCredenciales = GistSync.getToken() && GistSync.esGistIdValido(GistSync.getGistId());
            if (_tieneCredenciales) {
                if (_autoSyncEstado === 1) {
                    if (GistSync.dentroDelRangoHorario() && !GistSync.superaLimite('bajar')) {
                        setTimeout(async () => {
                            await gistBajar(true);
                            GistSync.marcarSync('bajar');
                        }, 2000);
                    }
                } else if (_autoSyncEstado === 2) {
                    if (GistSync.dentroDelRangoHorario() && !GistSync.superaLimite('subir')) {
                        setTimeout(async () => {
                            await gistSubir();
                            GistSync.marcarSync('subir');
                        }, 2000);
                    }
                }
            }

            setInterval(() => actualizarUI(null, true), 20000);
            console.log('Sistema iniciado correctamente');

            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                const modal = document.querySelector('.modal.show');
                if (!modal) return;
                e.preventDefault();
                const acciones = {
                    'modal-gist': () => cerrarModalGist(),
                    'modal-gist-merge': () => gistMergeCancelar(),
                    'modal-config': () => UILogic.cerrarConfig(),
                    'modal-selector-perfiles': () => UILogic.cerrarSelectorPerfiles(),
                    'modal-editar': () => UILogic.cerrarEdicion(),
                    'modal-importar': () => UILogic.cerrarImportar(),
                    'modal-exportar': () => UILogic.cerrarExportar(),
                    'modal-filtros': () => UILogic.cerrarFiltros(),
                    'modal-editar-perfil': () => UILogic.cerrarEditorPerfil(),
                    'modal-editar-grupo': () => UILogic.cerrarEdicionGrupo(),
                    'modal-confirmar': () => document.getElementById('modal-confirmar-cancel')?.click(),
                };
                const accion = acciones[modal.id];
                if (accion) accion();
            });

            const lista = document.getElementById('lista-registros');
            if (lista) {
                lista.addEventListener('click', (e) => {
                    const target = e.target.closest('[data-accion]');
                    if (!target) return;

                    const accion = target.dataset.accion;

                    if (accion === 'editar-registro') {
                        const id = target.dataset.registroId;
                        if (id) D.editarRegistro(id);
                    }
                    else if (accion === 'editar-grupo') {
                        try {
                            const grupoData = JSON.parse(target.dataset.grupoData);
                            const registrosCompletos = D.registros().filter(r =>
                                grupoData.registros.includes(r.id)
                            );

                            D.editarGrupo({
                                registros: registrosCompletos,
                                subtipo: grupoData.subtipo
                            });
                        } catch (err) {
                            console.error('Error al abrir grupo:', err);
                        }
                    }
                });
            }

            lista.addEventListener('click', (e) => {
                const headerAnio = e.target.closest('.registro-mes-header[data-accion="toggle-anio"]');
                if (!headerAnio) return;

                e.stopPropagation();

                const contenedorAnio = headerAnio.closest('.registro-mes-container');
                if (!contenedorAnio) return;

                const detalleAnio = contenedorAnio.querySelector(':scope > .registro-mes-detalle');
                const chevronAnio = headerAnio.querySelector('.chevron-mes');
                const anioId = headerAnio.dataset.anioId;
                const estaExpandido = detalleAnio.classList.contains('expanded');

                if (estaExpandido) {
                    detalleAnio.classList.remove('expanded');
                    if (chevronAnio) chevronAnio.style.transform = 'rotate(0deg)';
                    try { StorageHelper.setItem(STORAGE_KEYS.ANIO_EXPANDIDO(anioId), 'false'); } catch (e) { }
                } else {
                    detalleAnio.classList.add('expanded');
                    if (chevronAnio) chevronAnio.style.transform = 'rotate(180deg)';
                    try { StorageHelper.setItem(STORAGE_KEYS.ANIO_EXPANDIDO(anioId), 'true'); } catch (e) { }
                }
            });

            lista.addEventListener('click', (e) => {
                const header = e.target.closest('.registro-mes-header');
                if (!header || header.dataset.accion !== 'toggle-mes') return;

                e.stopPropagation();

                const contenedor = header.closest('.registro-mes-container');
                if (!contenedor) return;

                const detalle = contenedor.querySelector('.registro-mes-detalle');
                const chevronIcon = header.querySelector('.chevron-mes');

                const estaExpandido = detalle.classList.contains('expanded');

                if (estaExpandido) {
                    detalle.classList.remove('expanded');
                    chevronIcon.style.transform = 'rotate(0deg)';

                    try {
                        StorageHelper.setItem(STORAGE_KEYS.MES_EXPANDIDO(header.dataset.mesId), 'false');
                    } catch (e) { }

                } else {
                    const otrosMesesAbiertos = lista.querySelectorAll('.registro-mes-detalle.expanded');
                    const esContenedorAnio = (el) => {
                        const h = el.closest('.registro-mes-container')?.querySelector('.registro-mes-header');
                        return h && h.dataset.accion === 'toggle-anio';
                    };
                    const detalleAnioPadre = contenedor.parentElement?.closest('.registro-mes-detalle') || null;

                    otrosMesesAbiertos.forEach(otroDetalle => {
                        if (esContenedorAnio(otroDetalle) && otroDetalle !== detalleAnioPadre) {
                            otroDetalle.classList.remove('expanded');
                            const otroContenedor = otroDetalle.closest('.registro-mes-container');
                            const otroChevron = otroContenedor?.querySelector('.chevron-mes');
                            const otroHeader = otroContenedor?.querySelector('.registro-mes-header');
                            if (otroChevron) otroChevron.style.transform = 'rotate(0deg)';
                            if (otroHeader?.dataset.anioId) {
                                try { StorageHelper.setItem(STORAGE_KEYS.ANIO_EXPANDIDO(otroHeader.dataset.anioId), 'false'); } catch (e) { }
                            }
                        }
                    });

                    const hayOtrosAbiertos = Array.from(otrosMesesAbiertos).some(otro => otro !== detalle && !esContenedorAnio(otro));

                    if (hayOtrosAbiertos) {
                        otrosMesesAbiertos.forEach(otroDetalle => {
                            if (otroDetalle !== detalle && !esContenedorAnio(otroDetalle)) {
                                const alturaActual = otroDetalle.scrollHeight;

                                otroDetalle.style.minHeight = `${alturaActual}px`;

                                otroDetalle.classList.remove('expanded');
                                const otroContainer = otroDetalle.closest('.registro-mes-container');
                                const otroChevron = otroContainer?.querySelector('.chevron-mes');
                                const otroHeader = otroContainer?.querySelector('.registro-mes-header');

                                if (otroChevron) otroChevron.style.transform = 'rotate(0deg)';

                                if (otroHeader && otroHeader.dataset.mesId) {
                                    try {
                                        StorageHelper.setItem(STORAGE_KEYS.MES_EXPANDIDO(otroHeader.dataset.mesId), 'false');
                                    } catch (e) { }
                                }

                                setTimeout(() => {
                                    otroDetalle.style.minHeight = '';
                                }, 350);
                            }
                        });

                        setTimeout(() => {
                            detalle.classList.add('expanded');
                            chevronIcon.style.transform = 'rotate(180deg)';

                            try {
                                StorageHelper.setItem(STORAGE_KEYS.MES_EXPANDIDO(header.dataset.mesId), 'true');
                            } catch (e) { }

                            setTimeout(() => {
                                const margenHeader = 80;
                                const alturaVentana = window.innerHeight;
                                const registros = detalle.querySelectorAll('.registro-item');

                                if (registros.length > 0) {
                                    const primerRegistro = registros[0];
                                    const rectPrimero = primerRegistro.getBoundingClientRect();
                                    const segundoRegistro = registros.length > 1 ? registros[1] : null;
                                    const rectSegundo = segundoRegistro ? segundoRegistro.getBoundingClientRect() : null;

                                    const primeroCortado = rectPrimero.top < margenHeader || rectPrimero.bottom > alturaVentana;
                                    const segundoCortado = rectSegundo && (rectSegundo.top < margenHeader || rectSegundo.bottom > alturaVentana);

                                    if (primeroCortado || segundoCortado) {
                                        contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                }
                            }, 310);
                        }, 300);

                    } else {
                        detalle.classList.add('expanded');
                        chevronIcon.style.transform = 'rotate(180deg)';

                        try {
                            StorageHelper.setItem(STORAGE_KEYS.MES_EXPANDIDO(header.dataset.mesId), 'true');
                        } catch (e) { }

                        setTimeout(() => {
                            const margenHeader = 80;
                            const alturaVentana = window.innerHeight;
                            const registros = detalle.querySelectorAll('.registro-item');

                            if (registros.length > 0) {
                                const primerRegistro = registros[0];
                                const rectPrimero = primerRegistro.getBoundingClientRect();
                                const segundoRegistro = registros.length > 1 ? registros[1] : null;
                                const rectSegundo = segundoRegistro ? segundoRegistro.getBoundingClientRect() : null;

                                const primeroCortado = rectPrimero.top < margenHeader || rectPrimero.bottom > alturaVentana;
                                const segundoCortado = rectSegundo && (rectSegundo.top < margenHeader || rectSegundo.bottom > alturaVentana);

                                if (primeroCortado || segundoCortado) {
                                    contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            }
                        }, 310);
                    }
                }
            });

            const loteDesde = document.getElementById('lote-fecha-desde');
            const loteHasta = document.getElementById('lote-fecha-hasta');
            const actualizarBotonLoteDebounced = debounce(actualizarBotonLote, 300);

            const agregarListenersFecha = (el) => {
                if (!el) return;
                el.addEventListener('change', () => actualizarBotonLote());
                el.addEventListener('input', () => actualizarBotonLoteDebounced());
            };
            agregarListenersFecha(loteDesde);
            agregarListenersFecha(loteHasta);

            const tipoExportSelect = document.getElementById('tipo-exportacion');
            if (tipoExportSelect) {
                tipoExportSelect.addEventListener('change', () => {
                    UILogic.toggleCamposRangoExport();
                });
            }
            const fileInput = document.getElementById('file-import');
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    const nombreEl = document.getElementById('nombre-archivo-seleccionado');
                    const btnCombinar = document.getElementById('btn-combinar');
                    const btnReemplazar = document.getElementById('btn-reemplazar');

                    if (e.target.files.length > 0) {
                        if (nombreEl) {
                            const nombreArchivo = e.target.files[0].name;
                            nombreEl.textContent = `✓ ${nombreArchivo}`;
                            nombreEl.style.display = 'block';
                        }

                        if (btnCombinar) {
                            btnCombinar.disabled = false;
                            btnCombinar.style.opacity = '1';
                        }
                        if (btnReemplazar) {
                            btnReemplazar.disabled = false;
                            btnReemplazar.style.opacity = '1';
                        }
                    } else {
                        if (nombreEl) {
                            nombreEl.style.display = 'none';
                            nombreEl.textContent = '';
                        }
                        if (btnCombinar) {
                            btnCombinar.disabled = true;
                        }
                        if (btnReemplazar) {
                            btnReemplazar.disabled = true;
                        }
                    }
                });
            }
        }

        function actualizarHintGrupo() {
            const hint = document.getElementById('edit-grupo-hint');
            if (!hint) return;
            const desde = document.getElementById('edit-grupo-desde')?.value;
            const hasta = document.getElementById('edit-grupo-hasta')?.value;
            if (!desde && !hasta) { hint.textContent = ''; return; }
            if (desde && !hasta) {
                hint.textContent = `1 día`;
                return;
            }
            if (!TimeUtils.validarFecha(desde) || !TimeUtils.validarFecha(hasta) || desde > hasta) {
                hint.textContent = 'Rango inválido';
                return;
            }
            const fechaInicio = TimeUtils.parsearFechaLocal(desde);
            const fechaFin = TimeUtils.parsearFechaLocal(hasta);
            const diasTotales = Math.ceil(Math.abs(fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
            hint.textContent = `${diasTotales} día${diasTotales !== 1 ? 's' : ''}`;
        }
        ['edit-grupo-desde', 'edit-grupo-hasta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', actualizarHintGrupo);
        });

        function mostrarFiltros() {
            if (D.obtenerRegistrosFiltrados().length !== D.registros().length) {
                D.limpiarFiltros();
                return;
            }

            ModalManager.abrir('modal-filtros');

            const aplicarInmediato = () => {
                const desde = $('filtro-fecha-desde').value;
                const hasta = $('filtro-fecha-hasta').value;
                const tipo = $('filtro-tipo').value;
                D.aplicarFiltrosInmediato(desde, hasta, tipo);
            };

            ['filtro-fecha-desde', 'filtro-fecha-hasta', 'filtro-tipo'].forEach(id => {
                const el = $(id);
                if (el) {
                    el.removeEventListener('change', aplicarInmediato);
                    el.addEventListener('change', aplicarInmediato);
                }
            });
        }

        function cerrarFiltros() {
            ModalManager.cerrar('modal-filtros');
        }

        function toggleSeccionGen(elementId, iconId, storageKey, callback = null) {
            const el = $(elementId);
            const icon = $(iconId);
            if (!el) return;

            el.classList.toggle('expanded');
            const isExpanded = el.classList.contains('expanded');
            if (icon) {
                if (isExpanded) icon.classList.add('rotated');
                else icon.classList.remove('rotated');
            }

            if (StorageHelper.getBoolean(STORAGE_KEYS.PERSISTIR_TARJETAS, true)) {
                StorageHelper.setItem(storageKey, isExpanded);
            }
            if (isExpanded && callback) callback();
        }

        function toggleFormulario() {
            const el = $('form-registro');
            const estabaExpandido = el.classList.contains('expanded');

            toggleSeccionGen('form-registro', 'icon-indicator-form', STORAGE_KEYS.FORMULARIO_EXPANDIDO);

            if (estabaExpandido) {

                $('entrada').value = '';
                $('salida').value = '';
                $('fecha').value = obtenerFechaHoy();

                const loteDesde = $('lote-fecha-desde');
                const loteHasta = $('lote-fecha-hasta');
                const loteTipo = $('lote-tipo');

                if (loteDesde) loteDesde.value = '';
                if (loteHasta) loteHasta.value = '';
                if (loteTipo) loteTipo.value = 'feriado';

                if (modoLoteActivo) {
                    toggleModoLote();
                } else {
                    actualizarEstadoBotonTimerMain();
                }
            }
        }

        function toggleHistorico() {
            cancelarTimerAutoCierreBotones();

            const contenido = $('contenido-historico');
            const botones = $('botones-historico');
            const icon = $('icon-indicator-historico');


            if (!contenido) return;

            const contenidoExpandido = contenido.classList.contains('expanded');
            const botonesExpandidos = botones.classList.contains('expanded');

            try {
                if (!contenidoExpandido) {
                    contenido.classList.add('expanded');
                    if (icon) {
                        icon.style.transform = '';
                        icon.classList.add('rotated');
                    }
                    StorageHelper.setItem(STORAGE_KEYS.HISTORICO_EXPANDIDO, 'meses');
                    tiempoExpansionBotones = null;

                    if (_vistaHistoricoCalendario) {
                        const lista = document.getElementById('lista-registros');
                        const cal = document.getElementById('vista-calendario-historico');
                        const btnFiltro = document.getElementById('btn-filtro');
                        const btnVista = document.getElementById('btn-vista-calendario');
                        if (lista) lista.classList.add('hidden');
                        if (cal) cal.classList.remove('hidden');
                        if (btnFiltro) { btnFiltro.disabled = false; btnFiltro.style.opacity = ''; }
                        _renderizarCalendario();
                    }

                } else if (contenidoExpandido && !botonesExpandidos) {
                    botones.classList.add('expanded');
                    if (icon) {
                        icon.classList.remove('rotated');
                        icon.style.transform = 'rotate(-90deg)';
                    }
                    StorageHelper.setItem(STORAGE_KEYS.HISTORICO_EXPANDIDO, 'completo');
                    tiempoExpansionBotones = Date.now();

                } else {
                    const tiempoTranscurrido = Date.now() - (tiempoExpansionBotones || 0);
                    const history_toggle_timer = tiempoTranscurrido > 500;

                    if (history_toggle_timer) {
                        botones.classList.remove('expanded');
                        if (icon) {
                            icon.style.transform = '';
                            icon.classList.add('rotated');
                        }
                        StorageHelper.setItem(STORAGE_KEYS.HISTORICO_EXPANDIDO, 'meses');
                        tiempoExpansionBotones = null;
                    } else {
                        botones.classList.remove('expanded');
                        contenido.classList.remove('expanded');
                        if (icon) {
                            icon.classList.remove('rotated');
                            icon.style.transform = '';
                        }
                        StorageHelper.setItem(STORAGE_KEYS.HISTORICO_EXPANDIDO, 'cerrado');
                        tiempoExpansionBotones = null;
                    }
                }
            } catch (e) {
                console.warn('Error guardando estado histórico:', e);
            }
        }

        function iniciarTimerAutoCierreBotones() {
            if (timerAutoCierreBotones) {
                clearTimeout(timerAutoCierreBotones);
                timerAutoCierreBotones = null;
            }

            timerAutoCierreBotones = setTimeout(() => {
                const botones = $('botones-historico');
                const contenido = $('contenido-historico');
                const icon = $('icon-indicator-historico');

                if (botones && botones.classList.contains('expanded')) {
                    botones.classList.remove('expanded');

                    if (icon) {
                        icon.style.transform = '';
                        icon.classList.add('rotated');
                    }

                    try {
                        StorageHelper.setItem(STORAGE_KEYS.HISTORICO_EXPANDIDO, 'meses');
                    } catch (e) {
                        console.warn('Error guardando estado histórico:', e);
                    }

                    tiempoExpansionBotones = null;
                }

                timerAutoCierreBotones = null;
            }, 3000);
        }

        function cancelarTimerAutoCierreBotones() {
            if (timerAutoCierreBotones) {
                clearTimeout(timerAutoCierreBotones);
                timerAutoCierreBotones = null;
            }
        }

        let _calendarioMes = null;

        function _renderizarCalendario(idResaltar = null) {
            const grid = document.getElementById('calendario-grid');
            const titulo = document.getElementById('calendario-titulo-mes');
            if (!grid) return;

            if (grid.parentNode) {
                registrarSwipe(grid.parentNode, dir => navegarCalendario(dir));
            } else {
                registrarSwipe(grid, dir => navegarCalendario(dir));
            }

            const hoy = new Date();
            const anio = _calendarioMes ? _calendarioMes.anio : hoy.getFullYear();
            const mes = _calendarioMes ? _calendarioMes.mes : hoy.getMonth();
            const nombresMes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            if (titulo) titulo.textContent = `${nombresMes[mes]} ${anio}`;
            const fechaStr = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const registrosFiltrados = D.obtenerRegistrosFiltrados();
            const todosLosRegistros = D.registros();
            const regsPorFecha = {};
            registrosFiltrados.forEach(r => { regsPorFecha[r.fecha] = r; });
            const todosRegsPorFecha = {};
            todosLosRegistros.forEach(r => { todosRegsPorFecha[r.fecha] = r; });
            const horasDiariasObj = D.horasDiarias();
            const filtroActivo = D.obtenerRegistrosFiltrados().length !== D.registros().length;
            const claseDelDia = (fecha) => {
                const r = regsPorFecha[fecha];
                if (!r && filtroActivo && todosRegsPorFecha[fecha]) return 'dia-filtrado';
                if (!r) return 'dia-sin-registro';
                if (TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) {
                    const tipo = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
                    return `dia-especial-${tipo ? tipo.color : 'purple'}`;
                }
                if (r.entrada && !r.salida) {
                    const fechaHoy = obtenerFechaHoy();
                    return fecha === fechaHoy ? 'dia-en-curso' : 'dia-sin-salida';
                }
                if (r.total >= horasDiariasObj) return 'dia-normal';
                return 'dia-incompleto';
            };

            const diasNombre = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const primerDia = new Date(anio, mes, 1);
            const ultimoDia = new Date(anio, mes + 1, 0);
            const frag = document.createDocumentFragment();

            diasNombre.forEach(d => {
                const cell = document.createElement('div');
                cell.className = 'calendario-dia-nombre';
                cell.textContent = d;
                frag.appendChild(cell);
            });

            const offsetInicio = primerDia.getDay();
            for (let i = 0; i < offsetInicio; i++) {
                const vacio = document.createElement('div');
                vacio.className = 'calendario-dia vacio';
                frag.appendChild(vacio);
            }

            for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
                const fecha = fechaStr(anio, mes, dia);
                const clase = claseDelDia(fecha);
                const esHoy = anio === hoy.getFullYear() && mes === hoy.getMonth() && dia === hoy.getDate();
                const reg = regsPorFecha[fecha];
                const esNuevo = idResaltar && reg && reg.id === idResaltar;

                const cell = document.createElement('div');
                let clases = `calendario-dia ${clase}`;
                if (esHoy) clases += ' hoy';
                if (esNuevo) clases += ' nuevo-registro-animacion';
                if (reg) clases += ' cursor-pointer';
                cell.className = clases;
                cell.textContent = dia;

                if (reg) {
                    cell.dataset.regId = reg.id;
                    cell.addEventListener('click', (e) => UILogic._onclickCalendarioDia(e, reg.id));
                    cell.addEventListener('mouseenter', (e) => UILogic._popupCalendarioHover(e, reg.id));
                    cell.addEventListener('mouseleave', (e) => UILogic._cerrarPopupCalendarioHover(e));
                } else if (clase === 'dia-sin-registro') {
                    cell.classList.add('cursor-pointer');
                    cell.dataset.fecha = fecha;
                    cell.addEventListener('click', (e) => UILogic._popupCalendarioDiaSinRegistro(e, fecha));
                }

                frag.appendChild(cell);
            }

            if (filtroActivo) {
                grid.classList.add('calendario-filtro-activo');
            } else {
                grid.classList.remove('calendario-filtro-activo');
            }
            grid.innerHTML = '';
            grid.appendChild(frag);

        }

        let _vistaHistoricoCalendario = false;

        function toggleVistaHistorico() {
            _vistaHistoricoCalendario = !_vistaHistoricoCalendario;
            try { StorageHelper.setItem(STORAGE_KEYS.VISTA_HISTORICO_CAL, _vistaHistoricoCalendario); } catch (e) { }

            const lista = document.getElementById('lista-registros');
            const cal = document.getElementById('vista-calendario-historico');
            const btnFiltro = document.getElementById('btn-filtro');
            const saliente = _vistaHistoricoCalendario ? lista : cal;
            const entrante = _vistaHistoricoCalendario ? cal : lista;
            _animarFadeSwap(saliente, () => {
                if (saliente) { saliente.classList.add('hidden'); }
                if (entrante) {
                    entrante.classList.remove('hidden');
                    entrante.classList.add('fade-out');
                    entrante.offsetHeight;
                    entrante.classList.remove('fade-out');
                }

                if (_vistaHistoricoCalendario) {
                    if (btnFiltro) { btnFiltro.disabled = false; btnFiltro.style.opacity = ''; }
                    _renderizarCalendario();
                } else {
                    if (btnFiltro) { btnFiltro.disabled = false; btnFiltro.style.opacity = ''; }
                }
            });

            const selector = document.getElementById('calendario-selector-meses');
            const grid = document.getElementById('calendario-grid');
            const navBotones = document.getElementById('calendario-nav-botones');
            if (selector && !selector.classList.contains('hidden') && selector.style.display !== 'none') {
                selector.style.display = 'none';
                if (grid) grid.style.display = 'grid';
                if (navBotones) navBotones.style.display = 'flex';
            }
        }

        let _popupCalendarioEl = null;

        function _popupCalendario(event, registroId) {
            event.stopPropagation();

            if (_popupCalendarioEl) {
                _popupCalendarioEl.remove();
                _popupCalendarioEl = null;
            }

            const reg = D.registros().find(r => r.id === registroId);
            if (!reg) return;

            const _esc = s => s == null ? '' : String(s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            const claveMes = reg.fecha.substring(0, 7);
            const registrosDelMes = D.registros().filter(r => r.fecha.substring(0, 7) === claveMes);
            const grupos = agruparRegistrosConsecutivos(registrosDelMes);
            const grupoDelRegistro = grupos.find(g =>
                g.tipo === 'grupo' && g.registros.some(r => r.id === registroId)
            );

            const esEspecial = TiposRegistro.esRegistroEspecial(reg.entrada, reg.salida);
            const fechaObj = new Date(reg.fecha + 'T12:00:00');
            const opcFecha = { weekday: 'long', day: 'numeric', month: 'long' };
            const fechaLabel = _esc(fechaObj.toLocaleDateString('es-AR', opcFecha));

            let infoHtml = '';
            if (esEspecial) {
                const tipoConfig = TiposRegistro.obtenerTipoPorCodigo(reg.entrada, reg.salida);
                const emoji = _esc(tipoConfig ? tipoConfig.emoji : '');
                const label = tipoConfig ? _esc(tipoConfig.label) : _esc(reg.entrada);
                const colorSafe = /^[a-z]+$/.test(tipoConfig?.color || '') ? tipoConfig.color : 'purple';
                infoHtml = `<span class="cal-popup-badge cal-popup-badge--${colorSafe}">${emoji} ${label}</span>`;
            } else if (reg.entrada && !reg.salida) {
                const esHoy = reg.fecha === obtenerFechaHoy();
                infoHtml = esHoy
                    ? `<div class="cal-popup-info cal-popup-info--blue">En curso</div>
                               <div class="cal-popup-3l">Entrada: ${_esc(reg.entrada)}</div>`
                    : `<div class="cal-popup-info cal-popup-info--gold">Incompleto</div>
                               <div class="cal-popup-3l">Entrada: ${_esc(reg.entrada)}</div>`;
            } else {
                const totalHoras = reg.total || 0;
                const h = Math.floor(totalHoras);
                const m = Math.round((totalHoras - h) * 60);
                const totalStr = `${h}h${m > 0 ? ' ' + m + 'm' : ''}`;
                let tfStr = '';
                if (reg.tiempoFuera && reg.tiempoFuera !== '00:00') {
                    const [tfH, tfM] = reg.tiempoFuera.split(':').map(Number);
                    tfStr = tfH > 0 ? `${tfH}h${tfM > 0 ? ' ' + tfM + 'm' : ''} fuera` : `${tfM}m fuera`;
                }
                const horasDiarias = D.horasDiarias();
                let totalConDiff = totalStr;
                let diffColor = '';
                if (horasDiarias > 0) {
                    const diffText = formatoDiferencia(totalHoras);
                    if (diffText) totalConDiff += ` (${diffText})`;
                    diffColor = totalHoras >= horasDiarias ? 'var(--c-green)' : 'var(--c-red)';
                }
                infoHtml = `<div class="cal-popup-info${diffColor ? ' cal-popup-info--dynamic' : ''}" ${diffColor ? `data-color="${diffColor}"` : ''}>${totalConDiff}</div>
                    <div class="cal-popup-3l">${_esc(reg.entrada)} – ${_esc(reg.salida)}</div>
                    ${tfStr ? `<div class="cal-popup-3l">${_esc(tfStr)}</div>` : ''}`;
            }

            const btnGrupoHtml = grupoDelRegistro ? `
        <button class="cal-popup-btn-edit" id="_cal-popup-btn-grupo">
            <svg class="icon"><use href="#icon-grid-group"/></svg>
            Editar grupo
        </button>` : '';

            if (grupoDelRegistro) {
                window._calPopupGrupo = grupoDelRegistro;
            }

            const popup = document.createElement('div');
            popup.className = 'cal-popup';
            popup.id = '_cal-popup';
            popup.dataset.registroId = reg.id;
            popup.innerHTML = `
        <div class="cal-popup-fecha">${fechaLabel}</div>
        ${infoHtml}
        <button class="cal-popup-btn-edit" id="_cal-popup-btn-edit">
            <svg class="icon"><use href="#icon-edit"/></svg>
            Editar
        </button>
        ${btnGrupoHtml}
    `;

            _applyDataColors(popup);
            popup.style.visibility = 'hidden';

            document.body.appendChild(popup);
            _popupCalendarioEl = popup;

            const btnEditPopup = popup.querySelector('#_cal-popup-btn-edit');
            if (btnEditPopup) {
                btnEditPopup.addEventListener('click', () => {
                    DataManagement.editarRegistro(reg.id);
                    document.getElementById('_cal-popup')?.remove();
                });
            }
            const btnGrupoPopup = popup.querySelector('#_cal-popup-btn-grupo');
            if (btnGrupoPopup) {
                btnGrupoPopup.addEventListener('click', () => {
                    DataManagement.editarGrupo(window._calPopupGrupo);
                    document.getElementById('_cal-popup')?.remove();
                });
            }

            popup.addEventListener('mouseenter', () => {
                clearTimeout(_popupCalendarioHoverTimer);
            });
            popup.addEventListener('mouseleave', () => {
                if (_popupCalendarioEsHover) {
                    _popupCalendarioHoverTimer = setTimeout(() => {
                        if (_popupCalendarioEl) {
                            _popupCalendarioEl.remove();
                            _popupCalendarioEl = null;
                        }
                        _popupCalendarioEsHover = false;
                    }, 500);
                }
            });

            const cerrarPorScroll = () => {
                popup.remove();
                _popupCalendarioEl = null;
                document.removeEventListener('click', cerrar, true);
                document.removeEventListener('scroll', cerrarPorScroll, true);
            };
            const cerrarPopup = () => {
                popup.remove();
                _popupCalendarioEl = null;
                document.removeEventListener('click', cerrar, true);
                document.removeEventListener('scroll', cerrarPorScroll, true);
            };
            const cerrar = (e) => {
                const diaClickeado = e.target.closest('.calendario-dia');
                if (diaClickeado && diaClickeado.dataset.regId === popup.dataset.registroId) return;
                if (!popup.contains(e.target)) cerrarPopup();
            };
            setTimeout(() => {
                document.addEventListener('click', cerrar, true);
                document.addEventListener('scroll', cerrarPorScroll, true);
            }, 10);

            const el = event.currentTarget || event.target;
            const rect = el.getBoundingClientRect();
            const margin = 8;

            requestAnimationFrame(() => {
                const pw = popup.offsetWidth;
                const ph = popup.offsetHeight;

                let top = rect.bottom + 12;
                let left = rect.left + (rect.width / 2) - (pw / 2);

                if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
                if (left < margin) left = margin;
                if (top + ph > window.innerHeight - margin) {
                    top = rect.top - ph - 12;
                }
                if (top < margin) top = margin;

                popup.style.top = top + 'px';
                popup.style.left = left + 'px';
                popup.style.visibility = '';

                setTimeout(() => popup.classList.add('listo'), 350);
            });
        }

        let _popupCalendarioEsHover = false;
        let _popupCalendarioHoverTimer = null;

        function _popupCalendarioDiaSinRegistro(event, fecha) {
            event.stopPropagation();

            clearTimeout(_popupCalendarioHoverTimer);
            _popupCalendarioEsHover = false;

            if (_popupCalendarioEl) {
                const mismaFecha = _popupCalendarioEl.dataset.fecha === fecha;
                _popupCalendarioEl.remove();
                _popupCalendarioEl = null;
                if (mismaFecha) return;
            }

            const esFechaFutura = fecha > TimeUtils.obtenerFechaHoy();
            const fechaObj = new Date(fecha + 'T12:00:00');
            const opcFecha = { weekday: 'long', day: 'numeric', month: 'long' };
            const fechaLabel = S.sanitizeString(fechaObj.toLocaleDateString('es-AR', opcFecha), 60);

            const popup = document.createElement('div');
            popup.className = 'cal-popup';
            popup.id = '_cal-popup';
            popup.dataset.fecha = fecha;
            popup.innerHTML = `
        <div class="cal-popup-fecha">${fechaLabel}</div>
        <div class="cal-popup-sin-reg">Sin registros</div>
        ${esFechaFutura ? '' : `<button class="cal-popup-btn-edit cal-popup-btn-accion--normal" id="_cal-popup-btn-normal">
            <svg class="icon"><use href="#icon-clock"/></svg>
            Jornada regular
        </button>`}
        <button class="cal-popup-btn-edit cal-popup-btn-accion--especial" id="_cal-popup-btn-especial">
            <svg class="icon"><use href="#icon-calendar-simple"/></svg>
            Jornada especial
        </button>
    `;

            popup.style.visibility = 'hidden';
            document.body.appendChild(popup);
            _popupCalendarioEl = popup;

            const cerrarPopup = () => {
                popup.remove();
                _popupCalendarioEl = null;
                document.removeEventListener('click', cerrar, true);
                document.removeEventListener('scroll', cerrarPopup, true);
            };
            const cerrar = (e) => {
                const diaClickeado = e.target.closest('.calendario-dia');
                if (diaClickeado && diaClickeado.dataset.fecha === fecha) return;
                if (!popup.contains(e.target)) cerrarPopup();
            };

            popup.querySelector('#_cal-popup-btn-normal')?.addEventListener('click', () => {
                cerrarPopup();
                _irAFicharConFecha(fecha, false);
            });
            popup.querySelector('#_cal-popup-btn-especial').addEventListener('click', () => {
                cerrarPopup();
                _irAFicharConFecha(fecha, true);
            });

            setTimeout(() => {
                document.addEventListener('click', cerrar, true);
                document.addEventListener('scroll', cerrarPopup, true);
            }, 10);

            const el = event.currentTarget || event.target;
            const rect = el.getBoundingClientRect();
            const margin = 8;

            requestAnimationFrame(() => {
                const pw = popup.offsetWidth;
                const ph = popup.offsetHeight;
                let top = rect.bottom + 12;
                let left = rect.left + (rect.width / 2) - (pw / 2);
                if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
                if (left < margin) left = margin;
                if (top + ph > window.innerHeight - margin) top = rect.top - ph - 12;
                if (top < margin) top = margin;
                popup.style.top = top + 'px';
                popup.style.left = left + 'px';
                popup.style.visibility = '';
                setTimeout(() => popup.classList.add('listo'), 350);
            });
        }

        function _flashCampo(...ids) {
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.classList.remove('campo-flash');
                void el.offsetWidth;
                el.classList.add('campo-flash');
                el.addEventListener('animationend', () => el.classList.remove('campo-flash'), { once: true });
            });
        }

        const _FLASH_SCROLL_DELAY = 380;

        function _irAFicharConFecha(fecha, esEspecial) {
            const tarjeta = document.getElementById('card-registrar');
            const formulario = document.getElementById('form-registro');
            const estaExpandido = formulario && formulario.classList.contains('expanded');

            if (!estaExpandido) toggleFormulario();

            _scrollACardFichar(tarjeta);

            const retraso = estaExpandido ? 0 : DUR_ANIM() + 80;

            setTimeout(() => {
                if (esEspecial) {
                    if (!modoLoteActivo) {
                        toggleModoLote();
                        setTimeout(() => {
                            const desde = document.getElementById('lote-fecha-desde');
                            const hasta = document.getElementById('lote-fecha-hasta');
                            if (desde) desde.value = fecha;
                            if (hasta) hasta.value = fecha;
                            setTimeout(() => _flashCampo('lote-fecha-desde', 'lote-fecha-hasta'), _FLASH_SCROLL_DELAY);
                        }, DUR_ANIM() + 50);
                    } else {
                        const desde = document.getElementById('lote-fecha-desde');
                        const hasta = document.getElementById('lote-fecha-hasta');
                        if (desde) desde.value = fecha;
                        if (hasta) hasta.value = fecha;
                        setTimeout(() => _flashCampo('lote-fecha-desde', 'lote-fecha-hasta'), _FLASH_SCROLL_DELAY);
                    }
                } else {
                    if (modoLoteActivo) {
                        toggleModoLote();
                        setTimeout(() => {
                            const input = document.getElementById('fecha');
                            if (input) input.value = fecha;
                            setTimeout(() => _flashCampo('fecha'), _FLASH_SCROLL_DELAY);
                        }, DUR_ANIM() + 50);
                    } else {
                        const input = document.getElementById('fecha');
                        if (input) input.value = fecha;
                        setTimeout(() => _flashCampo('fecha'), _FLASH_SCROLL_DELAY);
                    }
                }
            }, retraso);
        }

        function _scrollACardFichar(el) {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const headerEl = document.querySelector('.header');
            const headerH = headerEl ? headerEl.offsetHeight : 0;
            const margen = headerH + 8;
            // Si la tarjeta ya es completamente visible, no scrollear
            if (rect.top >= margen && rect.bottom <= window.innerHeight) return;
            // Scroll manual para que el borde superior de la tarjeta quede justo bajo el header
            window.scrollTo({ top: window.scrollY + rect.top - margen, behavior: 'smooth' });
        }

        function _popupCalendarioHover(event, registroId) {
            if (event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents) return;
            if (!window.matchMedia('(hover: hover)').matches) return;
            const stored = StorageHelper.getItem(STORAGE_KEYS.HOVER_POPUP, null);
            const esHover = window.matchMedia('(hover: hover)').matches;
            if (stored === null ? !esHover : stored !== 'true') return;
            if (_popupCalendarioEl && _popupCalendarioEl.dataset.registroId === registroId) return;
            if (_popupCalendarioEl && !_popupCalendarioEsHover) return;
            clearTimeout(_popupCalendarioHoverTimer);
            _popupCalendarioHoverTimer = setTimeout(() => {
                _popupCalendarioEsHover = true;
                _popupCalendario(event, registroId);
            }, 150);
        }

        function _onclickCalendarioDia(event, registroId) {
            const esDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
            const stored = StorageHelper.getItem(STORAGE_KEYS.HOVER_POPUP, null);
            const hoverActivo = esDesktop && (stored === null ? true : stored === 'true');

            if (hoverActivo) {
                if (_popupCalendarioEl) {
                    _popupCalendarioEl.remove();
                    _popupCalendarioEl = null;
                }
                clearTimeout(_popupCalendarioHoverTimer);
                DataManagement.editarRegistro(registroId);
            } else {
                if (_popupCalendarioEl && _popupCalendarioEl.dataset.registroId === registroId) {
                    _popupCalendarioEl.remove();
                    _popupCalendarioEl = null;
                    return;
                }
                _popupCalendario(event, registroId);
            }
        }

        function _cerrarPopupCalendarioHover(event) {
            if (!_popupCalendarioEsHover) return;
            const related = event.relatedTarget;
            if (related && _popupCalendarioEl && _popupCalendarioEl.contains(related)) return;
            clearTimeout(_popupCalendarioHoverTimer);
            _popupCalendarioHoverTimer = setTimeout(() => {
                if (_popupCalendarioEl) {
                    _popupCalendarioEl.remove();
                    _popupCalendarioEl = null;
                }
                _popupCalendarioEsHover = false;
            }, 500);
        }

        // ── Popup descriptivo de stat-item ─────────────────────────────────
        const DESCRIPCIONES_STATS = {
            'stat-tiempo-total': { titulo: 'Tiempo Total', desc: 'Suma de todas las horas trabajadas en el período seleccionado.' },
            'stat-promedio-diario': { titulo: 'Promedio Diario', desc: 'Promedio de horas trabajadas por jornada en el período.' },
            'stat-entrada-promedio': { titulo: 'Entrada Promedio', desc: 'Hora de entrada promedio entre todas las jornadas del período.' },
            'stat-salida-promedio': { titulo: 'Salida Promedio', desc: 'Hora de salida promedio entre todas las jornadas del período.' },
            'stat-regularidad-entrada': { titulo: 'Entrada Regular', desc: 'Qué tan constante es tu hora de entrada. Muestra la desviación promedio en minutos respecto al horario habitual: hasta 20m es Alta, hasta 40m Media, y más de 40m Baja.' },
            'stat-regularidad-jornada': { titulo: 'Jornada Regular', desc: 'Qué tan constante es la duración de tu jornada. Muestra la desviación promedio en minutos respecto a la duración habitual: hasta 20m es Alta, hasta 40m Media, y más de 40m Baja.' },
            'stat-tiempo-fuera-total': { titulo: 'Tiempo Fuera', desc: 'Suma de los tiempos fuera (salidas del establecimiento, almuerzo, etc.) registrados en las jornadas del período.' },
            'stat-saldo': { titulo: 'Saldo', desc: 'Diferencia entre las horas trabajadas y las horas objetivo del período, según tus ajustes de horas diarias, días hábiles y cálculos de saldo.' },
            'stat-dias-trabajados': { titulo: 'Jornadas', desc: 'Cantidad de jornadas con entrada y salida completas registradas en el período.' },
            'stat-compensaciones': { titulo: 'Salidas Temprano', desc: 'Cantidad de jornadas en las que se registró un crédito por salida anticipada.' },
        };

        let _popupStatEl = null;

        const _escHtml = s => s == null ? '' : String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        function _popupStat(event, statId) {
            event.stopPropagation();

            if (_popupStatEl) {
                _popupStatEl.remove();
                _popupStatEl = null;
            }

            let info = DESCRIPCIONES_STATS[statId];
            if (statId === 'stat-saldo' && info) {
                if (modoEstadisticas === 'anual') {
                    const desdeEnero = StorageHelper.getBoolean(STORAGE_KEYS.SALDO_DESDE_ENERO, false);
                    const modoTexto = desdeEnero
                        ? 'Actualmente el saldo se calcula a partir del PRIMER DÍA del año.'
                        : 'Actualmente el saldo se calcula a partir del PRIMER REGISTRO del año.';
                    info = { titulo: info.titulo, desc: `${info.desc}<hr class="stat-popup-sep"><strong>${modoTexto}</strong>` };
                } else if (modoEstadisticas === 'mensual') {
                    const desdePrimero = StorageHelper.getBoolean(STORAGE_KEYS.SALDO_DESDE_PRIMERO_MES, false);
                    const modoTexto = desdePrimero
                        ? 'Actualmente el saldo se calcula a partir del PRIMER DÍA del mes.'
                        : 'Actualmente el saldo se calcula a partir del PRIMER REGISTRO del mes.';
                    info = { titulo: info.titulo, desc: `${info.desc}<hr class="stat-popup-sep"><strong>${modoTexto}</strong>` };
                }
            }
            if (statId === 'stat-tiempo-fuera-total' && info) {
                const ignorarTF = StorageHelper.getBoolean(STORAGE_KEYS.IGNORAR_TF, false, true);
                const modoTexto = ignorarTF
                    ? 'Actualmente NO SE RESTA el tiempo fuera del tiempo total.'
                    : 'Actualmente SE RESTA el tiempo fuera del tiempo total.';
                info = { titulo: info.titulo, desc: `${info.desc}<hr class="stat-popup-sep"><strong>${modoTexto}</strong>` };
            }
            if (statId === 'stat-promedio-diario' && info) {
                const horasDiarias = D.horasDiarias();
                const modoTexto = `Actualmente las horas diarias objetivo son ${horasDiarias}h.`;
                info = { titulo: info.titulo, desc: `${info.desc}<hr class="stat-popup-sep"><strong>${modoTexto}</strong>` };
            }
            if (!info) {
                const valueEl = $(statId);
                const label = valueEl?.closest('.stat-item')?.querySelector('.stat-label');
                const tipoMatch = TiposRegistro.obtenerTodosLosTipos().find(t => statId === `stat-${t.labelPlural.toLowerCase()}`);
                info = {
                    titulo: _escHtml(label ? label.textContent : 'Estadística'),
                    desc: tipoMatch
                        ? `Cantidad de jornadas registradas como "${_escHtml(tipoMatch.label)}" en el período.`
                        : 'Detalle de esta estadística.'
                };
            }

            const popup = document.createElement('div');
            popup.className = 'stat-popup';
            popup.id = '_stat-popup';
            popup.dataset.statId = statId;
            popup.innerHTML = `
        <div class="stat-popup-titulo">${_escHtml(info.titulo)}</div>
        <div class="stat-popup-desc">${info.desc}</div>
    `;

            popup.style.visibility = 'hidden';
            document.body.appendChild(popup);
            _popupStatEl = popup;

            const cerrarPorScroll = () => {
                popup.remove();
                _popupStatEl = null;
                document.removeEventListener('click', cerrar, true);
                document.removeEventListener('scroll', cerrarPorScroll, true);
            };
            const cerrarPopup = () => {
                popup.remove();
                _popupStatEl = null;
                document.removeEventListener('click', cerrar, true);
                document.removeEventListener('scroll', cerrarPorScroll, true);
            };
            const cerrar = (e) => {
                const itemClickeado = e.target.closest('.stat-item');
                if (itemClickeado && itemClickeado.dataset.statId === popup.dataset.statId) return;
                if (!popup.contains(e.target)) cerrarPopup();
            };
            setTimeout(() => {
                document.addEventListener('click', cerrar, true);
                document.addEventListener('scroll', cerrarPorScroll, true);
            }, 10);

            const el = event.currentTarget || event.target;
            const rect = el.getBoundingClientRect();
            const margin = 8;

            requestAnimationFrame(() => {
                const pw = popup.offsetWidth;
                const ph = popup.offsetHeight;

                let top = rect.bottom + 12;
                let left = rect.left + (rect.width / 2) - (pw / 2);

                if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
                if (left < margin) left = margin;
                if (top + ph > window.innerHeight - margin) {
                    top = rect.top - ph - 12;
                }
                if (top < margin) top = margin;

                popup.style.top = top + 'px';
                popup.style.left = left + 'px';
                popup.style.visibility = '';

                setTimeout(() => popup.classList.add('listo'), 350);
            });
        }

        function _onclickStatItem(event) {
            const item = event.currentTarget;
            const valueEl = item.querySelector('.stat-value');
            if (!valueEl || !valueEl.id) return;
            if (_popupStatEl && _popupStatEl.dataset.statId === valueEl.id) {
                _popupStatEl.remove();
                _popupStatEl = null;
                return;
            }
            item.dataset.statId = valueEl.id;
            _popupStat(event, valueEl.id);
        }

        function _bindStatItemPopups(container) {
            const root = container || document;
            root.querySelectorAll('.stat-item').forEach(item => {
                if (item._statPopupBound) return;
                item._statPopupBound = true;
                item.addEventListener('click', _onclickStatItem);
            });
        }

        let _calendarioAnimTimeout = null;
        let _calendarioWrapperActual = null;

        function _finalizarAnimacionCalendarioPendiente() {
            if (_calendarioAnimTimeout) {
                clearTimeout(_calendarioAnimTimeout);
                _calendarioAnimTimeout = null;
            }
            if (_calendarioWrapperActual) {
                const grid = document.getElementById('calendario-grid');
                if (grid) {
                    grid.style.display = '';
                    _calendarioWrapperActual.parentNode?.insertBefore(grid, _calendarioWrapperActual);
                }
                _calendarioWrapperActual.remove();
                _calendarioWrapperActual = null;
            }
        }

        function _animarCalendario(delta, renderFn) {
            const grid = document.getElementById('calendario-grid');
            if (!grid) { renderFn(); return; }

            _finalizarAnimacionCalendarioPendiente();

            const anchoGrid = grid.offsetWidth;
            const altoGrid = grid.offsetHeight;
            const margenTopGrid = getComputedStyle(grid).marginTop;

            const snapViejo = grid.cloneNode(true);
            snapViejo.removeAttribute('id');
            snapViejo.style.cssText = 'position:absolute;top:0;left:0;width:' + anchoGrid + 'px;pointer-events:none;';

            grid.style.position = 'absolute';
            grid.style.visibility = 'hidden';
            renderFn();
            const snapNuevo = grid.cloneNode(true);
            snapNuevo.removeAttribute('id');
            snapNuevo.style.cssText = 'position:absolute;top:0;width:' + anchoGrid + 'px;pointer-events:none;left:' + (delta > 0 ? anchoGrid : -anchoGrid) + 'px;';

            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative;overflow:hidden;pointer-events:none;width:' + anchoGrid + 'px;height:calc(' + altoGrid + 'px + ' + margenTopGrid + ');';
            wrapper.appendChild(snapViejo);
            wrapper.appendChild(snapNuevo);

            grid.parentNode.insertBefore(wrapper, grid);
            grid.style.display = 'none';
            grid.style.position = '';
            grid.style.visibility = '';
            _calendarioWrapperActual = wrapper;

            wrapper.offsetHeight;
            const tx = (delta > 0 ? -anchoGrid : anchoGrid) + 'px';
            const durCal = DUR_CALENDARIO();
            const easing = 'transform ' + durCal + 'ms cubic-bezier(0.4, 0, 0.2, 1)';
            snapViejo.style.transition = easing;
            snapNuevo.style.transition = easing;
            snapViejo.style.transform = 'translateX(' + tx + ')';
            snapNuevo.style.transform = 'translateX(' + tx + ')';

            _calendarioAnimTimeout = setTimeout(() => {
                grid.style.display = '';
                wrapper.parentNode.insertBefore(grid, wrapper);
                wrapper.remove();
                _calendarioAnimTimeout = null;
                _calendarioWrapperActual = null;
            }, durCal + 20);
        }

        function navegarCalendario(delta) {
            if (_popupCalendarioEl) {
                _popupCalendarioEl.remove();
                _popupCalendarioEl = null;
            }

            const hoy = new Date();
            const base = _calendarioMes || { anio: hoy.getFullYear(), mes: hoy.getMonth() };
            let nuevoMes = base.mes + delta;
            let nuevoAnio = base.anio;
            if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio++; }
            if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio--; }
            _calendarioMes = { anio: nuevoAnio, mes: nuevoMes };
            _animarCalendario(delta, () => _renderizarCalendario());
        }

        function irHoyCalendario() {
            const hoy = new Date();
            if (_calendarioMes === null ||
                (_calendarioMes.anio === hoy.getFullYear() && _calendarioMes.mes === hoy.getMonth())) {
                return;
            }
            const base = _calendarioMes;
            const delta = (base.anio * 12 + base.mes) > (hoy.getFullYear() * 12 + hoy.getMonth()) ? -1 : 1;
            _calendarioMes = null;
            _animarCalendario(delta, () => _renderizarCalendario());
        }

        function toggleStats() {
            toggleSeccionGen('form-stats', 'icon-indicator-stats', STORAGE_KEYS.STATS_EXPANDIDO, () => {
                registrarSwipe($('form-stats'), dir => togglePeriodoStats(dir));
                if (modoEstadisticas === 'anual') {
                    poblarSelectorAnios();
                } else if (modoEstadisticas === 'semanal') {
                    poblarSelectorSemanas();
                    actualizarEstadisticasSemana($('select-semana-stats')?.value);
                } else {
                    poblarSelectorMeses();
                    const selectMes = $('select-mes-stats');
                    if (selectMes && selectMes.value) {
                        actualizarEstadisticas(selectMes.value);
                    } else {
                        actualizarEstadisticas();
                    }
                }
            });
        }

        function alternarFechaActual(id) {
            const c = document.getElementById(id);
            if (!c) return;
            if (c.value.trim() !== '') {
                c.value = '';
            } else {
                c.value = obtenerFechaHoy();
            }

            actualizarBotonLote();
            if (id === 'edit-grupo-desde' || id === 'edit-grupo-hasta') {
                c.dispatchEvent(new Event('change'));
            }
        }

        function verificarBloqueoCredito() {
            const btnCredito = document.getElementById('btn-toggle-credito');
            if (!btnCredito) return;

            const _bloquear = () => {
                btnCredito.disabled = true;
                btnCredito.style.cursor = 'not-allowed';
            };
            const _habilitar = () => {
                btnCredito.disabled = false;
                btnCredito.style.cursor = 'pointer';
            };

            if (document.getElementById('edit-fecha').disabled) return _bloquear();

            const e = document.getElementById('edit-entrada').value.trim();
            const s = document.getElementById('edit-salida').value.trim();
            const tf = document.getElementById('edit-tiempo-fuera').value.trim() || null;

            const horarioCompleto = e.length === 5 && s.length === 5;
            if (!horarioCompleto) {
                if (btnCredito.dataset.activo === "true") toggleCredito();
                return _bloquear();
            }

            if (TiposRegistro.esRegistroEspecial(e, s)) return _bloquear();

            const calcTemp = D.calcularHoras(e, s, tf, null);
            if (!calcTemp || calcTemp.total >= D.horasDiarias()) return _bloquear();

            _habilitar();
        }

        function setBloqueoEdicionGrupo(bloqueado) {
            edicionGrupoBloqueada = bloqueado;

            const btnLock = $('btn-lock-grupo-toggle');
            if (btnLock) {
                const icon = btnLock.querySelector('use');
                icon.setAttribute('href', bloqueado ? '#icon-lock' : '#icon-lock-open');
                btnLock.title = bloqueado ? "Desbloquear edición" : "Bloquear edición";
                btnLock.style.color = 'var(--text-main)';
                btnLock.style.background = bloqueado ? 'var(--c-red)' : 'var(--c-green)';
            }

            const inputs = ['edit-grupo-tipo', 'edit-grupo-desde', 'edit-grupo-hasta'];
            inputs.forEach(id => {
                const el = $(id);
                if (el) el.disabled = bloqueado;
            });

            const modal = $('modal-editar-grupo');
            if (modal) {
                const botones = modal.querySelectorAll('button:not(#btn-lock-grupo-toggle):not(.btn-cancel)');
                botones.forEach(btn => {
                    btn.disabled = bloqueado;
                });
            }
        }

        function toggleBloqueoEdicionGrupo() {
            setBloqueoEdicionGrupo(!edicionGrupoBloqueada);
        }

        function cerrarEdicionGrupo() {
            ModalManager.cerrar('modal-editar-grupo', () => {
                D.setGrupoEnEdicion(null);
                document.dispatchEvent(new Event('scroll'));
            });
        }

        function aplicarFeedbackCampos(campos) {
            const cambiarTextoSuave = (label, nuevoTexto, color) => {
                if (!label) return;
                label.style.opacity = '0';
                label.style.transform = 'translateY(-3px)';
                setTimeout(() => {
                    label.textContent = nuevoTexto;
                    label.style.color = color;
                    label.style.opacity = '1';
                    label.style.transform = 'translateY(0)';
                }, 150);
            };

            const activos = campos
                .filter(c => c.mostrar)
                .map(c => {
                    const input = document.getElementById(c.id);
                    const label = input?.closest('.form-group')?.querySelector('label');
                    const textoOriginal = label ? label.textContent : c.fallback;
                    if (input && label) {
                        input.classList.add('input-agregado-animacion');
                        cambiarTextoSuave(label, '✓ Agregado', 'var(--c-green)');
                    }
                    return { input, label, textoOriginal };
                });

            setTimeout(() => {
                activos.forEach(({ input, label, textoOriginal }) => {
                    if (input && label) {
                        input.classList.remove('input-agregado-animacion');
                        cambiarTextoSuave(label, textoOriginal, '');
                    }
                });
            }, 2000);
        }

        function actualizarFeedbackConfig() {
            const checkboxes = document.querySelectorAll('input[name="dia-habil"]:checked');
            const seleccionados = checkboxes.length;
            const horas = parseFloat($('config-horas-diarias').value) || 0;
            const total = seleccionados * horas;

            const el = $('config-total-feedback');
            if (el) {
                if (horas === 0) el.textContent = `(Registro libre sin objetivos)`;
                else el.textContent = `(Total semanal: ${total}hs)`;
            }

            if (seleccionados > 0) {
                const nuevosDias = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => a - b);
                D.setDiasHabiles(nuevosDias);
                const esDefault = window.PerfilManager && PerfilManager.obtenerPerfilActual() === 'default';
                if (esDefault) StorageHelper.setItem(STORAGE_KEYS.DIAS_HABILES, nuevosDias);
                D.guardarYActualizar();
            }
            if (typeof actualizarEstadoBotonPersistir === 'function') {
                actualizarEstadoBotonPersistir();
            }
        }

        function iniciarCambioHoras(incremento) {
            cambiarHorasDiarias(incremento);
            timeoutInicial = setTimeout(() => {
                intervaloPulsacion = setInterval(() => {
                    cambiarHorasDiarias(incremento);
                }, 100);
            }, 500);
        }

        function detenerCambio() {
            if (timeoutInicial) { clearTimeout(timeoutInicial); timeoutInicial = null; }
            if (intervaloPulsacion) { clearInterval(intervaloPulsacion); intervaloPulsacion = null; }
        }

        function cambiarHorasDiarias(incremento) {
            let valorActual = parseFloat($('config-horas-diarias').value);
            if (isNaN(valorActual)) valorActual = D.horasDiarias();
            let nuevoValor = Math.min(24, Math.max(0, valorActual + incremento));
            if (isNaN(nuevoValor)) return;

            $('config-horas-diarias').value = nuevoValor;
            actualizarFeedbackConfig();
            D.setHorasDiarias(nuevoValor);

            const esDefault = window.PerfilManager && PerfilManager.obtenerPerfilActual() === 'default';
            if (esDefault) StorageHelper.setItem(STORAGE_KEYS.HORAS_DIARIAS, nuevoValor);
            D.guardarYActualizar();
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

        return {
            init, obtenerFechaHoy, pegarHoraActual, alternarTema, alternarVista, cerrarConfig, abrirSelectorMesesCalendario,
            cerrarEdicion, mostrarImportar, cerrarImportar, actualizarUI, mostrarToast, mostrarError, actualizarEstadoBotonSaldoDesdeEnero,
            limpiarError, resetearBoton, restaurarBotonGuardarEdicion, toggleFormulario, aplicarOrdenCards, iniciarDragOrdenCards,
            limpiarCampo, mostrarFiltros, cerrarFiltros, registrarLoteDesdeCard, irHoyCalendario, obtenerOrdenCards,
            cambiarMesStats, generarReporte, toggleHistorico, toggleStats, sumarMinutosAHora, actualizarEstadoBotonHoverPopup,
            toggleTimerBreakMain, actualizarEstadoBotonTimerMain, toggleBloqueoEdicion, setBloqueoEdicion, actualizarEstadoBotonSaldoDesdePrimeroDiaMes,
            actualizarFeedbackConfig, poblarSelectorMeses, abrirSelectorPerfiles, actualizarBotonLote, toggleSaldoDesdeEnero, toggleSaldoDesdePrimeroDiaMes,
            cerrarSelectorPerfiles, abrirEditorPerfil, cerrarEditorPerfil, guardarEdicionPerfil, toggleModoLote, toggleHoverPopupCalendario,
            eliminarPerfilDesdeEditor, crearPerfilDesdeSelector, renderizarListaPerfiles, ejecutarAccionRegistro,
            iniciarCambioHoras, detenerCambio, mostrarconfig, alternarFechaActual, verificarBloqueoCredito, gistSubir, gistBajar,
            toggleCredito, setBloqueoEdicionGrupo, toggleBloqueoEdicionGrupo, cerrarEdicionGrupo, poblarSelectoresTipos,
            mostrarExportar, cerrarExportar, ejecutarExportacion, toggleCamposRangoExport, aplicarFeedbackCampos,
            iniciarTimerAutoCierreBotones, cancelarTimerAutoCierreBotones, toggleIgnorarTiempoFuera, actualizarEstadoBotonIgnorarTF,
            togglePeriodoStats, cambiarAnioStats, cambiarSemanaStats, toggleFondoCard, setFondoCard, toggleVisibilidadCard, aplicarVisibilidadCards,
            togglePersistirTarjetas, actualizarEstadoBotonPersistir, toggleVistaHistorico, actualizarHintGrupo,
            navegarCalendario, obtenerNombrePerfilSafe, descargarJSON, actualizarEstadoBotonesGist, actualizarBotonesHistorico,
            abrirModalGist, cerrarModalGist, guardarConfigGist, toggleVerToken, abrirGistEnBrowser, gistMergeCancelar, gistMergeAplicar,             
            toggleGistBackup, toggleGistMerge, cambiarLimiteSync, iniciarCambioLimite, detenerCambioLimite,
            _popupCalendario, _popupCalendarioHover, _onclickCalendarioDia, _cerrarPopupCalendarioHover, 
            _popupCalendarioDiaSinRegistro, _popupStat, _onclickStatItem, _bindStatItemPopups,
        };

    })(SecurityAndUtils, DataManagement, GistSync);

    // ====================================================================
    // FERIADOS MODULE
    // ====================================================================
    const FeriadosAR = (function () {
        'use strict';

        const SK_PROCESADOS = 'feriadosAR_procesados';
        const FERIADOS = {
            2026: [
                { fecha: '2026-01-01', nombre: 'Año Nuevo' },
                { fecha: '2026-02-16', nombre: 'Carnaval' },
                { fecha: '2026-02-17', nombre: 'Carnaval' },
                { fecha: '2026-03-23', nombre: 'Puente Turístico' },
                { fecha: '2026-03-24', nombre: 'Día Nac. de la Memoria' },
                { fecha: '2026-04-02', nombre: 'Día del Veterano y los Caídos en Malvinas' },
                { fecha: '2026-04-03', nombre: 'Viernes Santo' },
                { fecha: '2026-05-01', nombre: 'Día del Trabajador' },
                { fecha: '2026-05-25', nombre: 'Día de la Revolución de Mayo' },
                { fecha: '2026-06-15', nombre: 'Paso a la Inmortalidad del Gral. Güemes' },
                { fecha: '2026-06-20', nombre: 'Paso a la Inmortalidad del Gral. Belgrano' },
                { fecha: '2026-07-09', nombre: 'Día de la Independencia' },
                { fecha: '2026-07-10', nombre: 'Puente turístico' },
                { fecha: '2026-08-17', nombre: 'Paso a la Inmortalidad del Gral. San Martín' },
                { fecha: '2026-10-12', nombre: 'Día del Respeto a la Diversidad Cultural' },
                { fecha: '2026-11-23', nombre: 'Día de la Soberanía Nacional' },
                { fecha: '2026-12-07', nombre: 'Puente Turístico' },
                { fecha: '2026-12-08', nombre: 'Inmaculada Concepción de María' },
                { fecha: '2026-12-25', nombre: 'Navidad' },
            ],
            2027: [
                { fecha: '2027-01-01', nombre: 'Año Nuevo' },
            ],
        };

        function _cargarProcesados() {
            const raw = StorageHelper.getItem(SK_PROCESADOS, null);
            try {
                if (!raw) return new Set();
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return new Set();
                return new Set(parsed.filter(f => typeof f === 'string' && TimeUtils.validarFecha(f)));
            } catch { return new Set(); }
        }

        function _marcarProcesado(fecha) {
            const set = _cargarProcesados();
            set.add(fecha);
            const limite = new Date();
            limite.setDate(limite.getDate() - 60);
            const limiteStr = TimeUtils.formatearFechaLocal(limite);
            set.forEach(f => { if (f < limiteStr) set.delete(f); });
            StorageHelper.setItem(SK_PROCESADOS, JSON.stringify([...set]));
        }

        function _getFeriadosCercanos() {
            const hoy = new Date();
            const anioActual = hoy.getFullYear();
            const fechas = [];
            for (let offset = -1; offset <= 2; offset++) {
                const d = new Date(hoy);
                d.setDate(hoy.getDate() + offset);
                fechas.push(TimeUtils.formatearFechaLocal(d));
            }
            const pool = [...(FERIADOS[anioActual] || []), ...(FERIADOS[anioActual + 1] || [])];
            return pool.filter(f => fechas.includes(f.fecha));
        }

        function _etiquetaFecha(fechaISO) {
            const hoy = new Date();
            const labels = ['ayer', 'hoy', 'mañana', 'pasado mañana'];
            for (let offset = -1; offset <= 2; offset++) {
                const d = new Date(hoy);
                d.setDate(hoy.getDate() + offset);
                if (TimeUtils.formatearFechaLocal(d) === fechaISO) return labels[offset + 1];
            }
            return fechaISO;
        }

        function _buscarFeriado(fechaISO) {
            const anio = parseInt(fechaISO.slice(0, 4), 10);
            const pool = FERIADOS[anio] || [];
            return pool.find(f => f.fecha === fechaISO) || null;
        }

        function _sumarDias(fechaISO, n) {
            const d = TimeUtils.parsearFechaLocal(fechaISO);
            d.setDate(d.getDate() + n);
            return TimeUtils.formatearFechaLocal(d);
        }

        function _expandirGrupoConsecutivo(fechaISO) {
            let desde = fechaISO;
            while (_buscarFeriado(_sumarDias(desde, -1))) desde = _sumarDias(desde, -1);

            let hasta = fechaISO;
            while (_buscarFeriado(_sumarDias(hasta, 1))) hasta = _sumarDias(hasta, 1);

            const dias = [];
            let cursor = desde;
            while (cursor <= hasta) {
                dias.push(_buscarFeriado(cursor));
                cursor = _sumarDias(cursor, 1);
            }
            return dias;
        }

        function _agruparConsecutivos(candidatos) {
            const vistos = new Set();
            const grupos = [];
            for (const candidato of candidatos) {
                const grupo = _expandirGrupoConsecutivo(candidato.fecha);
                const clave = grupo[0].fecha;
                if (vistos.has(clave)) continue;
                vistos.add(clave);
                grupos.push(grupo);
            }
            return grupos;
        }

        function _esRangoContinuo(grupo) {
            for (let i = 1; i < grupo.length; i++) {
                if (_sumarDias(grupo[i - 1].fecha, 1) !== grupo[i].fecha) return false;
            }
            return true;
        }

        async function chequearYNotificar() {
            const candidatos = _getFeriadosCercanos();
            if (!candidatos.length) return;

            const procesados = _cargarProcesados();
            const yaExisteRegistro = fecha => DataManagement.registros().some(r => r.fecha === fecha);

            const grupos = _agruparConsecutivos(candidatos)
                .map(grupo => grupo.filter(f => {
                    if (procesados.has(f.fecha)) return false;
                    if (yaExisteRegistro(f.fecha)) { _marcarProcesado(f.fecha); return false; }
                    return true;
                }))
                .filter(grupo => grupo.length > 0);

            if (!grupos.length) return;
            const _delay = ms => new Promise(r => setTimeout(r, ms));

            for (let _i = 0; _i < grupos.length; _i++) {
                const grupo = grupos[_i];
                const esGrupal = grupo.length > 1;
                const nombres = [...new Set(grupo.map(f => f.nombre))].join(' / ');

                let descripcionFechas;
                if (!esGrupal) {
                    descripcionFechas = `${_etiquetaFecha(grupo[0].fecha)}, ${TimeUtils.obtenerNombreDia(grupo[0].fecha)} (${grupo[0].fecha})`;
                } else if (_esRangoContinuo(grupo)) {
                    descripcionFechas = `del ${TimeUtils.obtenerNombreDia(grupo[0].fecha)} (${grupo[0].fecha}) al ${TimeUtils.obtenerNombreDia(grupo[grupo.length - 1].fecha)} (${grupo[grupo.length - 1].fecha})`;
                } else {
                    descripcionFechas = grupo.map(f => `${TimeUtils.obtenerNombreDia(f.fecha)} (${f.fecha})`).join(', ');
                }

                const texto = esGrupal
                    ? `🎉 ${nombres} — ${descripcionFechas}\n¿Querés agregar estos ${grupo.length} días como Feriado?`
                    : `🎉 ${nombres} — ${descripcionFechas}\n¿Querés agregar este día como Feriado?`;

                const elTitulo = document.getElementById('modal-confirmar-titulo');
                const btnCancel = document.getElementById('modal-confirmar-cancel');
                const cancelTextNode = btnCancel
                    ? [...btnCancel.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
                    : null;
                const labelCancelOriginal = cancelTextNode ? cancelTextNode.textContent : null;
                if (elTitulo) elTitulo.textContent = esGrupal ? 'Feriados Próximos' : 'Feriado Próximo';
                if (cancelTextNode) cancelTextNode.textContent = ' No';

                const confirmo = await confirmarModal(texto, 'Sí', '#icon-save');

                grupo.forEach(f => _marcarProcesado(f.fecha));

                if (confirmo) {
                    for (const feriado of grupo) {
                        try {
                            await DataManagement.registrarDiaEspecial(feriado.fecha, 'feriado');
                        } catch (e) {
                        }
                    }
                }

                if (elTitulo) elTitulo.textContent = 'Atención';
                if (cancelTextNode && labelCancelOriginal !== null) cancelTextNode.textContent = labelCancelOriginal;
                if (_i < grupos.length - 1) await _delay(100);
            }
        }

        return { chequearYNotificar };
    })();

    UILogic.init();

    setTimeout(() => FeriadosAR.chequearYNotificar(), 4000);
})();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('SW registrado:', registration.scope);
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            if (window.UILogic) UILogic.mostrarToast('Se actualizará la versión al recargar', 'info');
                        }
                    });
                });
            })
            .catch(err => console.error('❌ Error SW:', err));
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const $ = id => document.getElementById(id);

    const addHoldEvents = (btn, onStart, onStop) => {
        btn.addEventListener('mousedown', onStart);
        btn.addEventListener('mouseup', onStop);
        btn.addEventListener('mouseleave', onStop);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(); }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); onStop(); }, { passive: false });
    };

    $('btn-install')?.addEventListener('click', () => PWAInstaller.instalarApp());
    document.querySelector('.header-profile-btn')?.addEventListener('click', () => UILogic.abrirSelectorPerfiles());

    $('stats-card')?.addEventListener('click', () => UILogic.alternarVista());

    $('btn-timer-main')?.addEventListener('click', () => UILogic.toggleTimerBreakMain());
    $('btn-agregar')?.addEventListener('click', () => UILogic.ejecutarAccionRegistro());
    $('icon-indicator-form')?.addEventListener('click', () => UILogic.toggleFormulario());

    $('btn-ir-modo-lote')?.addEventListener('click', () => UILogic.toggleModoLote());
    $('btn-pegar-entrada')?.addEventListener('click', () => UILogic.pegarHoraActual('entrada'));
    $('btn-pegar-salida')?.addEventListener('click', () => UILogic.pegarHoraActual('salida'));

    $('lote-tipo')?.addEventListener('change', () => UILogic.actualizarBotonLote());
    $('btn-ir-modo-normal')?.addEventListener('click', () => UILogic.toggleModoLote());
    $('btn-lote-desde')?.addEventListener('click', () => UILogic.alternarFechaActual('lote-fecha-desde'));
    $('btn-lote-hasta')?.addEventListener('click', () => UILogic.alternarFechaActual('lote-fecha-hasta'));

    document.querySelector('#card-estadisticas .card-header-clickable')?.addEventListener('click', () => UILogic.toggleStats());
    $('select-mes-stats')?.addEventListener('change', () => UILogic.cambiarMesStats());
    $('select-anio-stats')?.addEventListener('change', () => UILogic.cambiarAnioStats());
    $('select-semana-stats')?.addEventListener('change', () => UILogic.cambiarSemanaStats());
    $('btn-toggle-periodo')?.addEventListener('click', () => UILogic.togglePeriodoStats());
    $('btn-reporte')?.addEventListener('click', () => UILogic.generarReporte());

    document.querySelector('#card-historico .card-header-clickable')?.addEventListener('click', () => UILogic.toggleHistorico());
    $('btn-vista-calendario')?.addEventListener('click', () => UILogic.toggleVistaHistorico());
    $('btn-filtro')?.addEventListener('click', () => UILogic.mostrarFiltros());
    $('btn-undo')?.addEventListener('click', () => HistoryManager.undo());
    $('btn-redo')?.addEventListener('click', () => HistoryManager.redo());

    $('calendario-titulo-mes')?.addEventListener('click', () => UILogic.abrirSelectorMesesCalendario());
    document.querySelector('.btn-hoy-calendario')?.addEventListener('click', () => UILogic.irHoyCalendario());
    const navBotones = $('calendario-nav-botones');
    if (navBotones) {
        const navBtns = navBotones.querySelectorAll('button:not(.btn-hoy-calendario)');
        if (navBtns[0]) navBtns[0].addEventListener('click', () => UILogic.navegarCalendario(-1));
        if (navBtns[1]) navBtns[1].addEventListener('click', () => UILogic.navegarCalendario(1));
    }

    $('btn-toggle-fondo')?.addEventListener('click', () => UILogic.toggleFondoCard());
    $('btn-toggle-ignorar-tf')?.addEventListener('click', () => UILogic.toggleIgnorarTiempoFuera());
    $('btn-toggle-hover-popup')?.addEventListener('click', () => UILogic.toggleHoverPopupCalendario());
    $('btn-toggle-saldo-enero')?.addEventListener('click', () => UILogic.toggleSaldoDesdeEnero());
    $('btn-toggle-saldo-primero-mes')?.addEventListener('click', () => UILogic.toggleSaldoDesdePrimeroDiaMes());
    $('btn-toggle-persistir-tarjetas')?.addEventListener('click', () => UILogic.togglePersistirTarjetas());
    $('btn-toggle-card-registrar')?.addEventListener('click', () => UILogic.toggleVisibilidadCard('registrar'));
    $('btn-toggle-card-estadisticas')?.addEventListener('click', () => UILogic.toggleVisibilidadCard('estadisticas'));
    $('btn-toggle-card-historico')?.addEventListener('click', () => UILogic.toggleVisibilidadCard('historico'));
    document.querySelector('.config-actions .btn-gist')?.addEventListener('click', () => UILogic.abrirModalGist());
    document.querySelector('.config-actions .btn-backup')?.addEventListener('click', () => UILogic.mostrarImportar());
    document.querySelector('.config-actions .btn-export')?.addEventListener('click', () => UILogic.mostrarExportar());
    document.querySelector('.config-actions .btn-delete')?.addEventListener('click', () => DataManagement.borrarTodoHistorial());
    document.querySelector('#modal-config .modal-panel-footer .btn-cancel')?.addEventListener('click', () => UILogic.cerrarConfig());

    const inputHoras = $('config-horas-diarias');
    if (inputHoras) {
        const btnsHoras = inputHoras.closest('.input-number-group')?.querySelectorAll('.btn-increment');
        if (btnsHoras?.[0]) addHoldEvents(btnsHoras[0], () => UILogic.iniciarCambioHoras(0.5), () => UILogic.detenerCambio());
        if (btnsHoras?.[1]) addHoldEvents(btnsHoras[1], () => UILogic.iniciarCambioHoras(-0.5), () => UILogic.detenerCambio());
    }

    $('gist-token')?.addEventListener('input', () => UILogic.actualizarEstadoBotonesGist());
    $('gist-id')?.addEventListener('input', () => UILogic.actualizarEstadoBotonesGist());
    $('btn-toggle-token')?.addEventListener('click', () => UILogic.toggleVerToken());
    $('btn-crear-token')?.addEventListener('click', () => window.open('https://github.com/settings/tokens/new?description=Horarios+sync&scopes=gist', '_blank', 'noopener,noreferrer'));
    $('btn-gist-abrir')?.addEventListener('click', () => UILogic.abrirGistEnBrowser());
    $('btn-gist-subir')?.addEventListener('click', () => UILogic.gistSubir());
    $('btn-gist-bajar')?.addEventListener('click', () => UILogic.gistBajar());
    $('btn-toggle-gist-backup')?.addEventListener('click', () => UILogic.toggleGistBackup());
    $('btn-toggle-gist-merge')?.addEventListener('click', () => UILogic.toggleGistMerge());

    const inputLimite = $('gist-limite-valor');
    if (inputLimite) {
        const btnsLimite = inputLimite.closest('.input-number-group')?.querySelectorAll('.btn-increment');
        if (btnsLimite?.[0]) addHoldEvents(btnsLimite[0], () => UILogic.iniciarCambioLimite(1), () => UILogic.detenerCambioLimite());
        if (btnsLimite?.[1]) addHoldEvents(btnsLimite[1], () => UILogic.iniciarCambioLimite(-1), () => UILogic.detenerCambioLimite());
    }

    $('btn-gist-guardar')?.addEventListener('click', () => UILogic.guardarConfigGist());
    $('btn-gist-volver')?.addEventListener('click', () => UILogic.cerrarModalGist());

    $('btn-gist-merge-combinar')?.addEventListener('click', () => UILogic.gistMergeAplicar('merge'));
    $('btn-gist-merge-reemplazar')?.addEventListener('click', () => UILogic.gistMergeAplicar('replace'));
    $('btn-gist-merge-cancelar')?.addEventListener('click', () => UILogic.gistMergeCancelar());

    $('btn-toggle-credito')?.addEventListener('click', () => UILogic.toggleCredito());
    $('btn-lock-toggle')?.addEventListener('click', () => UILogic.toggleBloqueoEdicion());
    $('btn-edit-entrada')?.addEventListener('click', () => UILogic.pegarHoraActual('edit-entrada'));
    $('btn-edit-salida')?.addEventListener('click', () => UILogic.pegarHoraActual('edit-salida'));
    $('btn-edit-tf')?.addEventListener('click', () => UILogic.limpiarCampo('edit-tiempo-fuera'));
    $('btn-edit-notas')?.addEventListener('click', () => UILogic.limpiarCampo('edit-notas'));
    document.querySelector('#modal-editar .btn-edit')?.addEventListener('click', () => DataManagement.guardarEdicion());
    document.querySelector('#modal-editar .btn-delete')?.addEventListener('click', () => DataManagement.eliminarRegistroActual());
    document.querySelector('#modal-editar .btn-cancel')?.addEventListener('click', () => UILogic.cerrarEdicion());

    $('btn-seleccionar-archivo')?.addEventListener('click', () => $('file-import').click());
    $('btn-combinar')?.addEventListener('click', () => DataManagement.importarDatos('merge'));
    $('btn-reemplazar')?.addEventListener('click', () => DataManagement.importarDatos('replace'));
    $('btn-volver-importar')?.addEventListener('click', () => UILogic.cerrarImportar());

    document.querySelector('#modal-exportar .btn-export')?.addEventListener('click', () => UILogic.ejecutarExportacion());
    $('btn-volver-exportar')?.addEventListener('click', () => UILogic.cerrarExportar());

    document.querySelector('#modal-filtros .btn-cancel')?.addEventListener('click', () => UILogic.cerrarFiltros());

    document.querySelector('#modal-selector-perfiles .btn-settings')?.addEventListener('click', () => UILogic.mostrarconfig());
    $('theme-toggle-modal')?.addEventListener('click', () => UILogic.alternarTema());
    document.querySelector('#modal-selector-perfiles .btn-cancel')?.addEventListener('click', () => UILogic.cerrarSelectorPerfiles());
    $('btn-crear-perfil')?.addEventListener('click', () => UILogic.crearPerfilDesdeSelector());

    document.querySelector('#modal-editar-perfil .btn-edit')?.addEventListener('click', () => UILogic.guardarEdicionPerfil());
    $('btn-eliminar-perfil-editor')?.addEventListener('click', () => UILogic.eliminarPerfilDesdeEditor());
    document.querySelector('#modal-editar-perfil .btn-cancel')?.addEventListener('click', () => UILogic.cerrarEditorPerfil());

    $('btn-lock-grupo-toggle')?.addEventListener('click', () => UILogic.toggleBloqueoEdicionGrupo());
    $('btn-grupo-desde')?.addEventListener('click', () => UILogic.alternarFechaActual('edit-grupo-desde'));
    $('btn-grupo-hasta')?.addEventListener('click', () => UILogic.alternarFechaActual('edit-grupo-hasta'));
    document.querySelector('#modal-editar-grupo .btn-edit')?.addEventListener('click', () => DataManagement.guardarEdicionGrupo());
    document.querySelector('#modal-editar-grupo .btn-delete')?.addEventListener('click', () => DataManagement.eliminarGrupoActual());
    document.querySelector('#modal-editar-grupo .btn-cancel')?.addEventListener('click', () => UILogic.cerrarEdicionGrupo());
});

// MODULOS:

// STORAGE KEYS — MODULE
// PWA INSTALLER MODULE
// TIME AND DATE UTILITIES MODULE (TimeUtils)
// STORAGE HELPER MODULE
// SECURITY AND UTILS MODULE
// PERFIL MANAGER MODULE
// MODAL MANAGER MODULE
// HISTORY MANAGER MODULE
// TIPOS DE REGISTRO MODULE
// DATA MANAGEMENT MODULE
// LISTENERS PARA TECLA ENTER MODULE
// FERIADOS MODULE
