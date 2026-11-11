import test from 'node:test';
import assert from 'node:assert/strict';
import { TiempoUtils } from '../src/core/tiempo-utils.js';
import { SeguridadYUtils } from '../src/core/seguridad.js';
import { EventosApp } from '../src/core/eventos.js';
import { TiposRegistro } from '../src/services/tipos-registro.js';
import { EstadoApp } from '../src/services/estado-app.js';
import { Compensatorios } from '../src/services/compensatorios.js';
import { DiasHabiles } from '../src/services/dias-habiles.js';
import { Objetivos } from '../src/services/objetivos.js';

test('TiempoUtils: conversión HH:MM <-> minutos y cruces de medianoche', () => {
    assert.equal(TiempoUtils.horaAMinutos('08:30'), 510);
    assert.equal(TiempoUtils.minutosAHora(510), '08:30');
    assert.equal(TiempoUtils.sumarMinutosAHora('08:45', 30), '09:15');
    assert.equal(TiempoUtils.validarFecha('2026-10-25'), true);
    assert.equal(TiempoUtils.validarFecha('2026-02-30'), false);
    assert.equal(TiempoUtils.validarHora('23:59'), true);
    assert.equal(TiempoUtils.validarHora('24:00'), false);
});

test('SeguridadYUtils: escapeHtml, validarRegistroSeguro y calcularHashSHA256', async () => {
    assert.equal(SeguridadYUtils.escapeHtml('<script>"alert(1)"</script>'), '&lt;script&gt;&quot;alert(1)&quot;&lt;/script&gt;');

    const regValido = {
        id: SeguridadYUtils.generarIDSeguro(),
        fecha: '2026-10-20',
        entrada: '09:00',
        salida: '16:00',
        tiempoFuera: '00:30',
        horas: 6,
        minutos: 30,
        total: 6.5,
        objetivoHoras: 7
    };
    assert.equal(SeguridadYUtils.validarRegistroSeguro(regValido), true);
    assert.equal(SeguridadYUtils.validarRegistroSeguro({ ...regValido, propiedadExtra: 'maliciosa' }), false);

    const hash = await SeguridadYUtils.calcularHashSHA256([regValido]);
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
});

test('SeguridadYUtils.limpiarTexto: quita caracteres de control y conserva comillas (y saltos de línea si se pide)', () => {
    const { limpiarTexto } = SeguridadYUtils;
    assert.equal(limpiarTexto('Salida \nTiempo fuera: "x" data: 1\u0000', 200, { saltos: true }), 'Salida \nTiempo fuera: "x" data: 1');
    assert.equal(limpiarTexto('a\nb\tc'), 'abc');
    assert.equal(limpiarTexto('  abcdef  ', 3), 'abc');
    assert.equal(limpiarTexto(null), '');
});

test('SeguridadYUtils.normalizarNotas: lista blanca, largo máximo y vacía → null', () => {
    const { normalizarNotas, SECURITY_LIMITS } = SeguridadYUtils;
    assert.equal(normalizarNotas(' Reunión <b>&amp; "x" '), 'Reunión bamp x');
    assert.equal(normalizarNotas('a'.repeat(50)).length, SECURITY_LIMITS.MAX_NOTAS_LENGTH);
    assert.equal(normalizarNotas('<>'), null);
    assert.equal(normalizarNotas(undefined), null);
});

test('SeguridadYUtils.esObjetivoHorasValido: número finito entre 0 y 24', () => {
    const { esObjetivoHorasValido: ok } = SeguridadYUtils;
    assert.deepEqual([0, 7.5, 24].map(ok), [true, true, true]);
    assert.deepEqual([-1, 25, NaN, Infinity, '7', null, undefined].map(ok), [false, false, false, false, false, false, false]);
});

test('EventosApp: suscripción, desuscripción y registro de handlers', () => {
    let recibido = null;
    const off = EventosApp.on('test:evento', (payload) => { recibido = payload; });
    EventosApp.emit('test:evento', { ok: 42 });
    assert.deepEqual(recibido, { ok: 42 });

    off();
    EventosApp.emit('test:evento', { ok: 99 });
    assert.deepEqual(recibido, { ok: 42 });
});

test('EstadoApp.calcularHoras y Compensatorios: cálculo de jornada, cruce de medianoche y asignación de compensatorios', () => {
    EstadoApp.setHorasDiarias(7);
    EstadoApp.setDiasHabiles([1, 2, 3, 4, 5]);
    EstadoApp.setIgnorarTiempoFuera(false);

    // Jornada normal con tiempo fuera
    const normal = EstadoApp.calcularHoras('08:00', '15:30', '00:30');
    assert.deepEqual(normal, { horas: 7, minutos: 0, total: 7 });

    // Cruce de medianoche (22:00 a 02:00 = 4h)
    const nocturno = EstadoApp.calcularHoras('22:00', '02:00', null);
    assert.deepEqual(nocturno, { horas: 4, minutos: 0, total: 4 });

    // Día especial (feriado)
    const feriado = EstadoApp.calcularHoras('00:00', '00:00', null);
    assert.equal(feriado.total, 7);
    assert.equal(feriado.esFeriado, true);

    // Asignación automática de compensatorio a un día previo con excedente
    const compCod = TiposRegistro.obtenerCodigosPorTipo('compensatorio');
    const lista = [
        {
            id: 'reg-excedente-1',
            fecha: '2026-10-19', // Lunes hábil con 9h (2h de excedente sobre 7h)
            entrada: '08:00',
            salida: '17:00',
            tiempoFuera: null,
            horas: 9,
            minutos: 0,
            total: 9,
            objetivoHoras: 7
        },
        {
            id: 'reg-comp-1',
            fecha: '2026-10-22', // Jueves compensatorio
            entrada: compCod.entrada,
            salida: compCod.salida,
            tiempoFuera: null,
            horas: 0,
            minutos: 0,
            total: 7,
            objetivoHoras: 7
        }
    ];
    EstadoApp._setRegistros(lista);
    const asignaciones = Compensatorios.calcularAsignacionesCompensatorio(lista);
    assert.equal(asignaciones.length, 1);
    assert.equal(asignaciones[0].compensatorioId, 'reg-comp-1');
    assert.equal(asignaciones[0].referenciaId, 'reg-excedente-1');
    assert.equal(asignaciones[0].excedente, 2);
});

test('Integración: Arranque completo de OrquestadorUI.init() sin errores de ejecución', async (t) => {
    // Fecha fija (miércoles 28/10/2026 10:00, día hábil): el arranque recorre caminos distintos según el día y
    // el resultado no puede depender de cuándo se corren los tests. Solo se simula Date (los timers son reales).
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 28, 10, 0) });
    const noop = () => { };
    const fakeEl = () => ({
        style: { setProperty: noop, removeProperty: noop },
        dataset: {},
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        addEventListener: noop,
        removeEventListener: noop,
        querySelector: () => fakeEl(),
        querySelectorAll: () => [],
        children: [],
        appendChild: noop,
        append: noop,
        replaceChildren: noop,
        insertBefore: noop,
        remove: noop,
        setAttribute: noop,
        removeAttribute: noop,
        getAttribute: () => null,
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
        focus: noop,
        blur: noop,
        contains: () => false,
        closest: () => null,
        cloneNode: () => fakeEl(),
        parentNode: { dataset: {}, addEventListener: noop, replaceChild: noop, insertBefore: noop },
        dispatchEvent: noop,
        value: '',
        textContent: '',
        innerHTML: '',
        files: [],
        options: []
    });

    globalThis.window = globalThis;
    globalThis.addEventListener = noop;
    globalThis.removeEventListener = noop;
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#ffffff' });
    globalThis.DOMParser = class {
        parseFromString() {
            return {
                documentElement: { tagName: 'svg', querySelectorAll: () => [], attributes: [], outerHTML: '<svg></svg>' },
                querySelector: () => null,
                querySelectorAll: () => []
            };
        }
    };
    globalThis.location = { origin: 'http://localhost:8080', reload: noop, href: 'http://localhost:8080/' };
    globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
    Object.defineProperty(globalThis, 'navigator', { value: { standalone: false, onLine: true }, configurable: true });
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k)
    };
    globalThis.requestAnimationFrame = () => 0;
    globalThis.MutationObserver = class { observe() { } };
    globalThis.document = {
        readyState: 'complete',
        body: fakeEl(),
        documentElement: fakeEl(),
        getElementById: () => fakeEl(),
        querySelector: () => fakeEl(),
        querySelectorAll: () => [],
        createElement: () => fakeEl(),
        createElementNS: () => fakeEl(),
        createDocumentFragment: () => fakeEl(),
        addEventListener: noop,
        dispatchEvent: noop
    };

    const origSetInterval = globalThis.setInterval;
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setInterval = (...args) => origSetInterval(...args).unref();
    globalThis.setTimeout = (...args) => origSetTimeout(...args).unref();

    try {
        const { OrquestadorUI } = await import('../src/ui/orquestador.js');
        await assert.doesNotReject(async () => {
            await OrquestadorUI.init();
        });
    } finally {
        globalThis.setInterval = origSetInterval;
        globalThis.setTimeout = origSetTimeout;
    }
});

test('ImportarExportar: exportación, validación y restauración de flags de configuración', async () => {
    const { ImportarExportar } = await import('../src/services/importar-exportar.js');
    const { Almacenamiento } = await import('../src/core/almacenamiento.js');
    const { Movimiento } = await import('../src/core/movimiento.js');
    const { STORAGE_KEYS } = await import('../src/core/constantes.js');

    EstadoApp.setIgnorarTiempoFuera(false);
    Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_TF, false, true);
    Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, false, true);
    Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true);
    Almacenamiento.setItem(STORAGE_KEYS.HINT_INTEGRADO, false);
    Movimiento.setModo('auto');

    // Simular un registro importado inicialmente con ignorarTiempoFuera = false (descarga 30m de tiempo fuera -> 7.5h)
    const registros = ImportarExportar.normalizarRegistrosImportados([
        {
            id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
            fecha: '2026-10-20',
            entrada: '09:00',
            salida: '17:00',
            tiempoFuera: '00:30',
            horas: 8,
            minutos: 0,
            total: 8
        }
    ]);
    assert.equal(registros[0].total, 7.5);

    const backupData = {
        registros,
        diasHabiles: [1, 2, 3, 4],
        horasDiarias: 8,
        ignorarTiempoFuera: true,
        ignorarLogicaCubierto: true,
        ignorarObjetivoPorRegistro: true,
        reducirAnimaciones: 'on',
        hintIntegrado: true
    };

    assert.equal(ImportarExportar.validarCamposConfigImport(backupData), true);
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...backupData, hintIntegrado: 'si' }), false);
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...backupData, reducirAnimaciones: 'invalido' }), false);
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...backupData, ignorarTiempoFuera: 'si' }), false);

    const cambios = ImportarExportar.calcularCambiosConfigImport(backupData);
    assert.ok(cambios.includes('tiempo fuera'));
    assert.ok(cambios.includes('banco de horas'));
    assert.ok(cambios.includes('objetivo diario global'));
    assert.ok(cambios.includes('animaciones'));
    assert.ok(cambios.includes('hint integrado'));

    // Al aplicar la configuración importada en modo replace, debe recalcular el registro con ignorarTiempoFuera = true (-> 8h)
    ImportarExportar.aplicarConfigImportada(backupData, registros);
    assert.equal(EstadoApp.getIgnorarTiempoFuera(), true);
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, false, true), true);
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true), true);
    assert.equal(Movimiento.modo(), 'on');
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.HINT_INTEGRADO, false), true);
    assert.equal(registros[0].total, 8);

    const exportado = ImportarExportar.obtenerConfigExportable();
    assert.deepEqual(exportado, {
        ignorarTiempoFuera: true,
        ignorarLogicaCubierto: true,
        ignorarObjetivoPorRegistro: true,
        reducirAnimaciones: 'on',
        hintIntegrado: true,
        estiloTarjeta: 'hitos',
        lineaDisposicion: 'arriba',
        lineaMosaicos: 'derecha',
        anilloDisposicion: 'izquierda',
        descHitosNumero: true,
        cicloHintAuto: true,
        formatoCortoStats: false,
        estiloCalendario: 'legacy',
        posicionHeader: 'top',
        posicionHeaderMovil: 'top',
        hoverPopupCalendario: false,
        ruedaCalendario: true,
        persistirTarjetas: true,
        fondoCard: 'golden-gate',
        ordenCards: ['estado', 'registrar', 'estadisticas', 'historico'],
        ordenCardsMovil: ['estado', 'registrar', 'estadisticas', 'historico'],
        columnasCards: [3, 1],
        ordenCards3: ['estado', 'registrar', 'estadisticas', 'historico'],
        columnasCards3: [3, 1],
        tarjetasVisibles: { registrar: true, estadisticas: true, historico: true }
    });
});

test('ImportarExportar: la apariencia (estilo del calendario, fondo, formato corto...) viaja en el respaldo y se restaura; Restablecer cubre los mismos ajustes', async () => {
    const { ImportarExportar } = await import('../src/services/importar-exportar.js');
    const { Almacenamiento } = await import('../src/core/almacenamiento.js');
    const { EstiloCalendario } = await import('../src/core/estilo-calendario.js');
    const { STORAGE_KEYS, CLAVES_AJUSTES_INSTALACION } = await import('../src/core/constantes.js');

    // Todo ajuste de la instalación que "Restablecer" borra tiene que viajar también en el respaldo (y al revés: si se agrega uno a la lista, no se olvida ninguno de los dos lados)
    const exportado = ImportarExportar.obtenerConfigExportable();
    CLAVES_AJUSTES_INSTALACION.forEach(k => assert.ok(k in exportado, `${k} falta en el respaldo`));
    assert.ok(STORAGE_KEYS.FONDO_CARD in exportado, 'el fondo de la tarjeta falta en el respaldo');

    const base = { diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 8 };
    const cambios = { estiloCalendario: 'punto', fondoCard: 'ninguno', formatoCortoStats: true, hoverPopupCalendario: true, ruedaCalendario: false, persistirTarjetas: false };
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...base, ...cambios }), true);
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...base, estiloCalendario: 'inexistente' }), false);
    // la posición del encabezado: en PC valen los cuatro lados; en móvil solo arriba y abajo
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...base, posicionHeader: 'left', posicionHeaderMovil: 'bottom' }), true);
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...base, posicionHeaderMovil: 'left' }), false);
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...base, posicionHeader: 'centro' }), false);
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...base, fondoCard: 'inexistente' }), false);
    assert.equal(ImportarExportar.validarCamposConfigImport({ ...base, formatoCortoStats: 'si' }), false);

    const etiquetas = ImportarExportar.calcularCambiosConfigImport({ ...base, ...cambios });
    ['estilo del calendario', 'fondo de la tarjeta de estado', 'formato de tiempo corto', 'popup del calendario (PC)', 'rueda del calendario (PC)', 'recordar estado de tarjetas']
        .forEach(e => assert.ok(etiquetas.includes(e), `no se informa el cambio de ${e}`));

    ImportarExportar.aplicarConfigImportada({ ...base, ...cambios });
    assert.equal(EstiloCalendario.actual(), 'punto');
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.ESTILO_CALENDARIO, null), 'punto');
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.FONDO_CARD, null, true), 'ninguno');
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.FORMATO_CORTO_STATS, false), true);
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.HOVER_POPUP, false), true);
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.RUEDA_CALENDARIO, true), false);
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.PERSISTIR_TARJETAS, true), false);

    // un respaldo sin esos campos (versiones anteriores) no los toca
    ImportarExportar.aplicarConfigImportada({ ...base });
    assert.equal(EstiloCalendario.actual(), 'punto');
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.FONDO_CARD, null, true), 'ninguno');

    // se deja como estaba para no alterar los demás tests
    ImportarExportar.aplicarConfigImportada({ ...base, estiloCalendario: 'legacy', fondoCard: 'golden-gate', formatoCortoStats: false, hoverPopupCalendario: false, ruedaCalendario: true, persistirTarjetas: true });
    CLAVES_AJUSTES_INSTALACION.forEach(k => Almacenamiento.removeItem(k));
    Almacenamiento.removeItem(STORAGE_KEYS.FONDO_CARD, true);
});

test('ImportarExportar: el diseño de la interfaz (orden y tarjetas visibles) se exporta, valida, compara y restaura', async () => {
    const { ImportarExportar } = await import('../src/services/importar-exportar.js');
    const { Almacenamiento } = await import('../src/core/almacenamiento.js');
    const { STORAGE_KEYS } = await import('../src/core/constantes.js');
    const limpiar = () => {
        Almacenamiento.removeItem(STORAGE_KEYS.ORDEN_CARDS, true);
        Almacenamiento.removeItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL, true);
        ['registrar', 'estadisticas', 'historico'].forEach(c => Almacenamiento.removeItem(STORAGE_KEYS.CARD_VISIBLE(c), true));
    };
    limpiar();
    try {
        const eventos = { tarjetas: 0 };
        const offT = EventosApp.on('config:tarjetas', () => { eventos.tarjetas++; });

        // Un respaldo viejo (sin estas claves) es válido y no toca nada
        assert.equal(ImportarExportar.validarCamposConfigImport({ registros: [] }), true);
        assert.deepEqual(ImportarExportar.calcularCambiosConfigImport({}), []);
        ImportarExportar.aplicarConfigImportada({});
        assert.deepEqual(eventos, { tarjetas: 0 });

        // Forma inválida: se rechaza todo el archivo (como el resto de la configuración)
        const malos = [
            { ordenCards: 'historico' }, { ordenCards: ['historico', 3] }, { ordenCards: [''] }, { ordenCards: ['x'.repeat(41)] },
            { ordenCards: Array.from({ length: 65 }, (_, i) => `a${i}`) }, { ordenCards: [{}] },
            { tarjetasVisibles: { registrar: 'si' } }, { tarjetasVisibles: [true] }, { tarjetasVisibles: null }
        ];
        malos.forEach(m => assert.equal(ImportarExportar.validarCamposConfigImport(m), false, JSON.stringify(m).slice(0, 60)));

        // Ids que esta versión no conoce (de un archivo más nuevo) se aceptan
        const diseno = {
            ordenCards: ['historico', 'registrar', 'tarjeta-del-futuro'],
            tarjetasVisibles: { estadisticas: false, historico: true, 'tarjeta-del-futuro': false }
        };
        assert.equal(ImportarExportar.validarCamposConfigImport(diseno), true);
        assert.deepEqual(ImportarExportar.calcularCambiosConfigImport(diseno), ['orden de tarjetas', 'tarjetas visibles']);

        ImportarExportar.aplicarConfigImportada(diseno);
        assert.deepEqual(eventos, { tarjetas: 1 });
        // el orden queda completo (las tarjetas que faltaban entran en su lugar por defecto, las desconocidas se descartan)
        assert.deepEqual(Almacenamiento.getObject(STORAGE_KEYS.ORDEN_CARDS, null, true), ['estado', 'historico', 'estadisticas', 'registrar']);
        assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.CARD_VISIBLE('estadisticas'), true, true), false);
        assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.CARD_VISIBLE('registrar'), true, true), true);

        // Aplicado, ya no hay diferencias, y exportar devuelve lo mismo que se aplicó
        assert.deepEqual(ImportarExportar.calcularCambiosConfigImport(diseno), []);
        const exportado = ImportarExportar.obtenerConfigExportable();
        assert.deepEqual(exportado.ordenCards, ['estado', 'historico', 'estadisticas', 'registrar']);
        // Sin orden propio para móvil, usa el de escritorio; con uno propio, cada modo conserva el suyo
        assert.deepEqual(exportado.ordenCardsMovil, ['estado', 'historico', 'estadisticas', 'registrar']);
        ImportarExportar.aplicarConfigImportada({ ordenCardsMovil: ['estadisticas', 'registrar'] });
        assert.deepEqual(Almacenamiento.getObject(STORAGE_KEYS.ORDEN_CARDS_MOVIL, null, true), ['estado', 'estadisticas', 'registrar', 'historico']);
        assert.deepEqual(ImportarExportar.obtenerConfigExportable().ordenCards, ['estado', 'historico', 'estadisticas', 'registrar']);
        Almacenamiento.removeItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL, true);
        // 3 columnas: sin orden propio usa el de 2; con uno propio, los de 1 y 2 columnas no cambian
        assert.deepEqual(ImportarExportar.obtenerConfigExportable().ordenCards3, ['estado', 'historico', 'estadisticas', 'registrar']);
        ImportarExportar.aplicarConfigImportada({ ordenCards3: ['registrar', 'estado'] });
        assert.deepEqual(Almacenamiento.getObject(STORAGE_KEYS.ORDEN_CARDS_3, null, true), ['registrar', 'estado', 'estadisticas', 'historico']);
        assert.deepEqual(ImportarExportar.obtenerConfigExportable().ordenCards, ['estado', 'historico', 'estadisticas', 'registrar']);
        Almacenamiento.removeItem(STORAGE_KEYS.ORDEN_CARDS_3, true);
        Almacenamiento.removeItem(STORAGE_KEYS.COLUMNAS_CARDS_3, true);
        assert.deepEqual(exportado.tarjetasVisibles, { registrar: true, estadisticas: false, historico: true });

        // Una clave que esta versión no conoce se rechaza como sospechosa
        assert.notEqual(ImportarExportar.errorEstructuraRespaldo({ registros: [], claveRara: 1 }), null);

        offT();
    } finally {
        limpiar();
    }
});

test('Almacenamiento: prefijo horarios_ (APP_STORAGE_PREFIX) y migración automática de claves legadas sin tocar otras apps', async () => {
    const { Almacenamiento } = await import('../src/core/almacenamiento.js');
    const { APP_STORAGE_PREFIX, STORAGE_KEYS } = await import('../src/core/constantes.js');

    const rawStore = new Map();
    globalThis.localStorage = {
        get length() { return rawStore.size; },
        key: (i) => Array.from(rawStore.keys())[i] ?? null,
        getItem: (k) => (rawStore.has(k) ? rawStore.get(k) : null),
        setItem: (k, v) => rawStore.set(k, String(v)),
        removeItem: (k) => rawStore.delete(k)
    };

    // 1. Sembrar datos legados de Horarios (estáticos, por perfil y dinámicos) + claves de otras apps del mismo GitHub Pages
    const perfilesLegados = JSON.stringify({
        default: { nombre: 'Principal', registros: [{ id: 'r1', fecha: '2026-10-20' }], diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 7 },
        perfil_custom1: { nombre: ' Guardia ', registros: [], diasHabiles: [6, 0], horasDiarias: 12 }
    });
    rawStore.set('perfiles', perfilesLegados);
    rawStore.set('temaOscuro', 'dark');
    rawStore.set('pushInstallId', 'uuid-instalacion-123');
    rawStore.set('pushOwnerToken', 'a'.repeat(64));
    rawStore.set('ignorarTiempoFuera_default', 'true');
    rawStore.set('history_perfil_custom1', '{"history":[],"currentIndex":-1}');
    rawStore.set('mes-2026-10-expandido', 'true');
    rawStore.set('anio-2026-expandido', 'false');
    rawStore.set('gistSyncLimite_subir', '15');

    // Claves de otras apps en el mismo dominio github.io (NO deben migrarse ni borrarse)
    rawStore.set('gestion_servicios_config', '{"activo":true}');
    rawStore.set('IDR_usuario', 'luis');

    // 2. Ejecutar migración automática
    const migradas = Almacenamiento.migrarClavesLegadas();
    assert.equal(migradas, 9);

    // 3. Verificar que todas las claves legadas de Horarios pasaron al prefijo horarios_ y las viejas se eliminaron
    assert.equal(rawStore.has('perfiles'), false);
    assert.equal(rawStore.get(`${APP_STORAGE_PREFIX}perfiles`), perfilesLegados);
    assert.equal(rawStore.has('temaOscuro'), false);
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.TEMA_OSCURO), 'dark');
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.PUSH_INSTALL_ID), 'uuid-instalacion-123');
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.PUSH_OWNER_TOKEN), 'a'.repeat(64));
    assert.equal(rawStore.get(`${APP_STORAGE_PREFIX}ignorarTiempoFuera_default`), 'true');
    assert.equal(rawStore.get(`${APP_STORAGE_PREFIX}history_perfil_custom1`), '{"history":[],"currentIndex":-1}');
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.MES_EXPANDIDO('2026-10')), true);
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.ANIO_EXPANDIDO('2026')), false);
    assert.equal(Almacenamiento.getNumber(STORAGE_KEYS.GIST_LIMITE('subir')), 15);

    // 4. Verificar que las claves de otras apps del mismo origen quedaron intactas
    assert.equal(rawStore.get('gestion_servicios_config'), '{"activo":true}');
    assert.equal(rawStore.get('IDR_usuario'), 'luis');
    assert.equal(rawStore.has(`${APP_STORAGE_PREFIX}gestion_servicios_config`), false);
});

test('TarjetaFichajeVista: derivarVistaHoy y derivarVistaSemana marcan estado cerrado y colorCierre', async () => {
    const { TarjetaFichajeVista } = await import('../src/ui/tarjeta-fichaje-vista.js');

    // Semana cerrada cumpliendo objetivo
    const vistaSemanaOk = TarjetaFichajeVista.derivarVistaSemana({
        totalSemana: 35,
        totalSemanaProgreso: 35,
        objetivoSemana: 35,
        semanaAbierta: false,
        horasDiarias: 7,
        todosEspeciales: false
    });
    assert.equal(vistaSemanaOk.cerrado, true);
    assert.equal(vistaSemanaOk.colorCierre, 'green');
    // el número grande trae su variante corta para cuando el texto largo no entra en una línea (la tarjeta decide al medir)
    assert.equal(vistaSemanaOk.stats, '35 horas');
    assert.equal(vistaSemanaOk.statsCorto, '35h');

    // Semana cerrada con faltante
    const vistaSemanaFail = TarjetaFichajeVista.derivarVistaSemana({
        totalSemana: 28,
        totalSemanaProgreso: 28,
        objetivoSemana: 35,
        semanaAbierta: false,
        horasDiarias: 7,
        todosEspeciales: false
    });
    assert.equal(vistaSemanaFail.cerrado, true);
    assert.equal(vistaSemanaFail.colorCierre, 'red');

    // Semana en curso (abierta)
    const vistaSemanaEnCurso = TarjetaFichajeVista.derivarVistaSemana({
        totalSemana: 14,
        totalSemanaProgreso: 14,
        objetivoSemana: 35,
        semanaAbierta: true,
        horasDiarias: 7,
        todosEspeciales: false
    });
    assert.equal(vistaSemanaEnCurso.cerrado, false);

    // Franjas por día: la pista es el objetivo semanal y cada día ocupa un tramo proporcional a las horas que trabajó, relleno entero con el color de su estado
    const base = { totalSemana: 14, totalSemanaProgreso: 14, objetivoSemana: 35, semanaAbierta: true, horasDiarias: 7, todosEspeciales: false };
    const dia = (fecha, estado, extra = {}) => ({ fecha, objetivo: 7, total: 0, activo: false, estado, ...extra });
    const vistaFranjas = TarjetaFichajeVista.derivarVistaSemana({
        ...base,
        diasSemana: [
            dia('2026-10-26', 'cerrado', { total: 7, cumplimiento: 'cumplido', entrada: '08:00', salida: '15:00' }),   // lun: cumplió
            dia('2026-10-27', 'cerrado', { total: 3.5, cumplimiento: 'faltante' }),   // mar: faltó, pero su tramo es más angosto y va entero rojo
            dia('2026-10-28', 'especial', { objetivo: 0, especial: 'purple' }),
            dia('2026-10-29', 'sin-registro'),
            dia('2026-10-30', 'sin-registro'),
            dia('2026-10-31', 'futuro')
        ]
    });
    // el relleno solo existe si el hint integrado está activo (por defecto lo está)
    assert.ok(vistaFranjas.tramosSemana, 'con el hint integrado hay franjas');
    // pista = objetivo (35) + 3 tramos fijos de 1 h (mié, jue, vie) = 38; el futuro (sáb) no entra
    const f = n => Number((n / 38).toFixed(4));
    assert.deepEqual(vistaFranjas.tramosSemana.map(t => [t.color, Number(t.desde.toFixed(4)), Number(t.hasta.toFixed(4))]), [
        ['green', 0, f(7)],
        ['red', f(7), f(10.5)],
        ['purple', f(10.5), f(11.5)]
    ]);
    // los días seguidos del mismo tipo se fusionan: jue–vie (sin registro) es un solo hito; cada hito trae también su inicial para móviles (L M X J V S D)
    assert.deepEqual(vistaFranjas.hitosSemana.map(h => [h.sigla, h.inicial, Number(h.fraccion.toFixed(4))]), [
        ['lun', 'L', f(7)], ['mar', 'M', f(10.5)], ['mié', 'X', f(11.5)], ['jue–vie', 'J–V', f(13.5)]
    ]);
    // cada hito lleva su descripción para lectores de pantalla (con el nombre abreviado del día, no la inicial)
    assert.deepEqual(vistaFranjas.hitosSemana.map(h => h.descripcion), ['lun cumplido', 'mar con faltante', 'mié día especial', 'jue–vie sin registro']);
    assert.equal(vistaFranjas.colorInicioSemana, 'green');
    // al pasar el cursor por el tramo (solo escritorio): con horas, el total y "Lunes · entrada – salida"; sin horas (o fusionado), solo el estado
    const [hoverLun, hoverMar, , hoverFusion] = vistaFranjas.hitosSemana.map(h => h.hover);
    assert.deepEqual(hoverLun, { stats: '7 horas', mensaje: 'Lunes · 08:00 – 15:00' });
    assert.deepEqual(hoverMar, { stats: null, mensaje: 'Martes: con faltante' });
    assert.deepEqual(hoverFusion, { stats: null, mensaje: 'jue–vie: sin registro' });
    assert.equal(typeof vistaFranjas.siglasCortas, 'boolean', 'la vista informa si el formato de tiempo corto pide las iniciales');
    // si la primera franja está vacía, el remate del comienzo es neutro aunque más adelante haya rellenos
    const vistaPrimeraVacia = TarjetaFichajeVista.derivarVistaSemana({
        ...base,
        diasSemana: [dia('2026-10-26', 'sin-registro'), dia('2026-10-27', 'especial', { objetivo: 0, especial: 'orange' })]
    });
    assert.equal(vistaPrimeraVacia.colorInicioSemana, 'vacio');
    assert.equal(vistaPrimeraVacia.colorFinSemana, 'orange');
    assert.equal(vistaFranjas.colorFinSemana, 'purple');
    // la parte llena termina donde termina el último relleno: lo que falta del objetivo queda vacío al final
    assert.ok(Math.abs(vistaFranjas.anchoBarra - f(11.5) * 100) < 0.01);

    // solo lunes y martes con el objetivo sin cumplir: sus tramos son proporcionales a las horas y el resto de la pista queda vacío
    const vistaDosDias = TarjetaFichajeVista.derivarVistaSemana({
        ...base,
        diasSemana: [dia('2026-10-26', 'cerrado', { total: 7, cumplimiento: 'cumplido' }), dia('2026-10-27', 'cerrado', { total: 3.5, cumplimiento: 'faltante' }), dia('2026-10-28', 'futuro')]
    });
    assert.deepEqual(vistaDosDias.hitosSemana.map(h => [h.sigla, Number(h.fraccion.toFixed(6))]), [['lun', 0.2], ['mar', 0.3]]);
    assert.ok(Math.abs(vistaDosDias.anchoBarra - 30) < 1e-6);

    // hoy lleva el badge, no se fusiona con el día anterior del mismo tipo y entra aunque todavía no tenga registro (los demás futuros no)
    const vistaHoy = TarjetaFichajeVista.derivarVistaSemana({
        ...base,
        hoy: '2026-10-28',
        diasSemana: [dia('2026-10-26', 'especial', { objetivo: 0, especial: 'purple' }), dia('2026-10-27', 'especial', { objetivo: 0, especial: 'purple' }),
            dia('2026-10-28', 'especial', { objetivo: 0, especial: 'purple' }), dia('2026-10-29', 'futuro')]
    });
    assert.deepEqual(vistaHoy.hitosSemana.map(h => [h.sigla, !!h.hoy]), [['lun–mar', false], ['mié', true]]);
    assert.equal(vistaHoy.hitosSemana[1].descripcion, 'mié (hoy) día especial');
    const vistaHoySinRegistro = TarjetaFichajeVista.derivarVistaSemana({
        ...base,
        hoy: '2026-10-28',
        diasSemana: [dia('2026-10-26', 'cerrado', { total: 7, cumplimiento: 'cumplido' }), dia('2026-10-27', 'cerrado', { total: 7, cumplimiento: 'cumplido' }), dia('2026-10-28', 'futuro'), dia('2026-10-29', 'futuro')]
    });
    assert.deepEqual(vistaHoySinRegistro.hitosSemana.map(h => [h.sigla, !!h.hoy]), [['lun', false], ['mar', false], ['mié', true]]);
    assert.equal(vistaHoySinRegistro.hitosSemana[2].prioridad, 3);

    // un día sin salida pesa un tramo fijo, no se fusiona y no se rellena
    const vistaSinSalida = TarjetaFichajeVista.derivarVistaSemana({
        ...base,
        diasSemana: [dia('2026-10-26', 'sin-salida'), dia('2026-10-27', 'sin-salida'), dia('2026-10-28', 'cerrado', { total: 7, cumplimiento: 'cumplido' })]
    });
    assert.deepEqual(vistaSinSalida.hitosSemana.map(h => [h.sigla, h.prioridad]), [['lun', 1], ['mar', 1], ['mié', 2]]);
    assert.equal(vistaSinSalida.colorInicioSemana, 'vacio');

    // con más horas que el objetivo la pista se estira hasta lo trabajado: la barra queda llena y el último hito llega al final
    const vistaDeMas = TarjetaFichajeVista.derivarVistaSemana({
        ...base, objetivoSemana: 10,
        diasSemana: [dia('2026-10-26', 'cerrado', { total: 8, cumplimiento: 'cumplido' }), dia('2026-10-27', 'cerrado', { total: 8, cumplimiento: 'cumplido' })]
    });
    assert.deepEqual(vistaDeMas.hitosSemana.map(h => [h.sigla, h.fraccion]), [['lun', 0.5], ['mar', 1]]);
    assert.equal(vistaDeMas.anchoBarra, 100);

    // Día cerrado (con salida registrada)
    const vistaDiaCerrado = TarjetaFichajeVista.derivarVistaHoy({
        regHoy: { fecha: '2026-10-30', entrada: '08:00', salida: '15:00', total: 7, objetivoHoras: 7 },
        tiempoHoy: 7,
        horasDiarias: 7,
        esDiaHabil: true,
        tipoEspecialHoy: null,
        bufferSemanalBase: 0,
        diasHabiles: [1, 2, 3, 4, 5]
    });
    assert.equal(vistaDiaCerrado.cerrado, true);
    assert.equal(vistaDiaCerrado.colorCierre, 'green');

    // Día cerrado con faltante
    const vistaDiaFalto = TarjetaFichajeVista.derivarVistaHoy({
        regHoy: { fecha: '2026-10-30', entrada: '08:00', salida: '09:07', total: 1.12, objetivoHoras: 7 },
        tiempoHoy: 1.12,
        horasDiarias: 7,
        esDiaHabil: true,
        tipoEspecialHoy: null,
        bufferSemanalBase: 0,
        diasHabiles: [1, 2, 3, 4, 5]
    });
    assert.equal(vistaDiaFalto.cerrado, true);
    assert.equal(vistaDiaFalto.colorCierre, 'red');

    // Día en curso (sin salida)
    const vistaDiaEnCurso = TarjetaFichajeVista.derivarVistaHoy({
        regHoy: { fecha: '2026-10-30', entrada: '08:00', salida: null, objetivoHoras: 7 },
        tiempoHoy: 2,
        horasDiarias: 7,
        esDiaHabil: true,
        tipoEspecialHoy: null,
        bufferSemanalBase: 0,
        diasHabiles: [1, 2, 3, 4, 5]
    });
    assert.equal(vistaDiaEnCurso.cerrado, false);
});

test('TarjetaFichajeVista: el badge "En curso" parpadea rápido solo con el objetivo cumplido y la jornada abierta', async () => {
    const { TarjetaFichajeVista } = await import('../src/ui/tarjeta-fichaje-vista.js');
    const estBase = (tiempoHoy, objetivoHoras) => ({
        regHoy: { fecha: '2026-10-29', entrada: '08:00', salida: null, objetivoHoras },
        tiempoHoy, horasDiarias: 7, esDiaHabil: true, tipoEspecialHoy: null,
        bufferSemanalBase: 0, diasHabiles: [1, 2, 3, 4, 5], esRetenido: false
    });

    // objetivo de 7 h todavía sin cumplir: parpadeo normal
    assert.ok(!String(TarjetaFichajeVista.derivarVistaHoy(estBase(3, 7)).titulo).includes('estado-badge--cumplido'));
    // objetivo cumplido con la jornada abierta: parpadeo rápido
    const cumplido = TarjetaFichajeVista.derivarVistaHoy(estBase(7.5, 7));
    assert.ok(String(cumplido.titulo).includes('estado-badge--en-curso'));
    assert.ok(String(cumplido.titulo).includes('estado-badge--cumplido'));
});

test('TarjetaFichajeVista: la línea del día abierta ubica la salida estimada y, cerrada, la mueve a la salida real', async () => {
    const { TarjetaFichajeVista } = await import('../src/ui/tarjeta-fichaje-vista.js');
    const est = (salida) => ({
        regHoy: { fecha: '2026-10-29', entrada: '09:00', salida, total: salida ? 3 : 0, objetivoHoras: 7 },
        tiempoHoy: salida ? 3 : 1, horasDiarias: 7, esDiaHabil: true, tipoEspecialHoy: null,
        bufferSemanalBase: 0, diasHabiles: [1, 2, 3, 4, 5], esRetenido: false
    });

    const abierta = TarjetaFichajeVista.derivarVistaHoy(est(null)).linea;
    assert.equal(abierta.cerrado, false);
    assert.equal(abierta.horaEntrada, '09:00');
    assert.equal(abierta.marcaSalidaRel, abierta.salidaRel);   // la marca queda en la salida estimada

    const cerrada = TarjetaFichajeVista.derivarVistaHoy(est('12:00')).linea;
    assert.equal(cerrada.cerrado, true);
    assert.equal(cerrada.horaSalida, '12:00');                 // la etiqueta muestra la hora real
    assert.equal(cerrada.marcaSalidaRel, cerrada.ahoraRel);    // la marca se mueve a donde cerró
    assert.equal(cerrada.marcaSalidaRel, 180);
    assert.ok(cerrada.salidaRel > cerrada.marcaSalidaRel, 'la escala de la barra sigue basada en la salida estimada');
});

test('TarjetaFichajeVista: un saldo semanal de 1 minuto adelanta la salida ajustada exactamente 1 minuto', async () => {
    const { TarjetaFichajeVista } = await import('../src/ui/tarjeta-fichaje-vista.js');
    const est = {
        regHoy: { fecha: '2026-11-04', entrada: '00:28', salida: null, total: 0, objetivoHoras: 7 },
        tiempoHoy: 0.02, horasDiarias: 7, esDiaHabil: true, tipoEspecialHoy: null,
        bufferSemanalBase: 0.016667, diasHabiles: [1, 2, 3, 4, 5], esRetenido: false
    };
    const linea = TarjetaFichajeVista.derivarVistaHoy(est).linea;
    assert.equal(linea.horaSalida, '07:28');
    assert.equal(linea.horaBuffer, '07:27');
});

test('TarjetaFichajeVista: con 0 minutos se muestra "Comenzando" o "Sin horas todavía" en lugar del cero', async () => {
    const { TarjetaFichajeVista } = await import('../src/ui/tarjeta-fichaje-vista.js');
    const estDia = (salida, tiempoHoy) => ({
        regHoy: { fecha: '2026-10-29', entrada: '09:00', salida, total: tiempoHoy, objetivoHoras: 7 },
        tiempoHoy, horasDiarias: 7, esDiaHabil: true, tipoEspecialHoy: null,
        bufferSemanalBase: 0, diasHabiles: [1, 2, 3, 4, 5], esRetenido: false
    });

    // Hoy: jornada abierta en su primer minuto -> "Comenzando"; con minutos o ya cerrada se mantiene el tiempo real
    assert.equal(TarjetaFichajeVista.derivarVistaHoy(estDia(null, 0)).stats, 'Comenzando...');
    assert.notEqual(TarjetaFichajeVista.derivarVistaHoy(estDia(null, 0.5)).stats, 'Comenzando...');
    const cerradaEnCero = TarjetaFichajeVista.derivarVistaHoy(estDia('09:00', 0)).stats;
    assert.notEqual(cerradaEnCero, 'Comenzando...');
    assert.match(cerradaEnCero, /^0/);

    // Día libre (no laborable) con registro: no hay objetivo, pero el mensaje aclara por qué; sin objetivo configurado o en un día hábil sin objetivo sigue oculto
    const noLaborable = TarjetaFichajeVista.derivarVistaHoy({ ...estDia('16:00', 7), esDiaHabil: false });
    assert.equal(noLaborable.mensaje, 'Día libre');
    assert.equal(noLaborable.mostrarMensaje, true);
    assert.equal(TarjetaFichajeVista.derivarVistaHoy({ ...estDia(null, 2), esDiaHabil: false }).mensaje, 'Día libre');
    assert.equal(TarjetaFichajeVista.derivarVistaHoy({ ...estDia('16:00', 7), esDiaHabil: false, horasDiarias: 0 }).mostrarMensaje, false);

    // Semana: 0 minutos con jornada abierta -> "Comenzando"; sin jornada y semana abierta -> "Sin horas todavía"; semana terminada -> el 0 real
    const estSemana = (extra) => ({
        totalSemana: 0, totalSemanaProgreso: 0, objetivoSemana: 35, semanaAbierta: true, horasDiarias: 7, todosEspeciales: false,
        regHoy: null, ayerAbierto: false, tipoEspecialHoy: null, ...extra
    });
    assert.equal(TarjetaFichajeVista.derivarVistaSemana(estSemana({ regHoy: { entrada: '09:00', salida: null } })).stats, 'Comenzando...');
    assert.equal(TarjetaFichajeVista.derivarVistaSemana(estSemana({})).stats, 'Sin horas todavía');
    assert.match(TarjetaFichajeVista.derivarVistaSemana(estSemana({ semanaAbierta: false })).stats, /^0/);
    // con horas trabajadas no cambia nada, y una semana de solo días especiales conserva su 🌞
    assert.notEqual(TarjetaFichajeVista.derivarVistaSemana(estSemana({ totalSemana: 3, totalSemanaProgreso: 3 })).stats, 'Sin horas todavía');
    assert.equal(TarjetaFichajeVista.derivarVistaSemana(estSemana({ todosEspeciales: true })).stats, '🌞');
});

test('GeometriaEtiquetas: conector, reparto de lados y cuándo la entrada pasa arriba (sin DOM)', async () => {
    const { geometriaConector, repartirLados, entradaDebeSubir, ANCHO_CONECTOR, SEPARACION_ETIQUETA } = await import('../src/core/geometria-etiquetas.js');

    // con lugar a la izquierda la etiqueta va a la izquierda del conector; sin lugar se espeja a la derecha
    const normal = geometriaConector(200, 30);
    assert.equal(normal.espejado, false);
    assert.equal(normal.left, 200 - ANCHO_CONECTOR - SEPARACION_ETIQUETA - 30);
    assert.equal(normal.hasta, 203);
    const espejada = geometriaConector(20, 30);
    assert.equal(espejada.espejado, true);
    assert.equal(espejada.left, 20 + ANCHO_CONECTOR + SEPARACION_ETIQUETA);
    assert.equal(espejada.desde, 17);
    // el margen ensancha el tramo ocupado por la etiqueta
    assert.equal(geometriaConector(200, 30, 8).desde, normal.left - 4);

    // reparto de lados: la segunda prueba el lado contrario, la tercera ya no entra y queda como solo punto
    const it = (orden, desde, hasta, preferido, prioridad) => ({ orden, desde, hasta, preferido, prioridad });
    const a = it(0, 100, 150, 'abajo', 2);
    const b = it(1, 120, 170, 'abajo', 2);
    const c = it(2, 130, 180, 'abajo', 2);
    const lados = repartirLados([a, b, c]);
    assert.deepEqual([lados.get(a), lados.get(b), lados.get(c)], ['abajo', 'arriba', null]);
    // con la misma superposición, la de mayor prioridad se queda con su lado
    const baja = it(0, 100, 150, 'abajo', 0);
    const alta = it(1, 110, 160, 'abajo', 2);
    const prioridad = repartirLados([baja, alta]);
    assert.equal(prioridad.get(alta), 'abajo');
    assert.equal(prioridad.get(baja), 'arriba');

    // la entrada sube si la salida la pisa, salvo que arriba esté el buffer en el mismo tramo; sin ancho medido no se decide
    const base = { ancho: 300, entradaLeft: 0, entradaAncho: 40 };
    assert.equal(entradaDebeSubir({ ...base, salidaLeft: 45 }), true);
    assert.equal(entradaDebeSubir({ ...base, salidaLeft: 200 }), false);
    assert.equal(entradaDebeSubir({ ...base, salidaLeft: 45, bufferLeft: 30 }), false);
    assert.equal(entradaDebeSubir({ ...base, salidaLeft: 45, bufferLeft: 250 }), true);
    assert.equal(entradaDebeSubir({ ...base, ancho: 0, salidaLeft: 0 }), false);
});

test('GeometriaEtiquetas: la salida pasa a la derecha cuando la entrada no puede subir (sin DOM)', async () => {
    const { salidaDebeEspejarse, geometriaConector, entradaDebeSubir, ANCHO_CONECTOR, SEPARACION_ETIQUETA } = await import('../src/core/geometria-etiquetas.js');
    // entrada de 0 a 39 px (fin + 12 = 51); la salida a la izquierda de su conector arranca en 41: se pisan
    const base = { ancho: 300, entradaLeft: 0, entradaAncho: 39, salidaLeft: 41 };
    // con la etiqueta del buffer arriba en ese tramo la entrada no puede subir: la salida se espeja
    assert.equal(salidaDebeEspejarse({ ...base, bufferLeft: 12 }), true);
    assert.equal(entradaDebeSubir({ ...base, bufferLeft: 12 }), false);
    // sin buffer (o con el buffer lejos) la entrada sube y la salida se queda donde está
    assert.equal(salidaDebeEspejarse({ ...base, bufferLeft: null }), false);
    assert.equal(salidaDebeEspejarse({ ...base, bufferLeft: 120 }), false);
    assert.equal(entradaDebeSubir({ ...base, bufferLeft: null }), true);
    // sin choque no hace falta
    assert.equal(salidaDebeEspejarse({ ...base, salidaLeft: 80, bufferLeft: 12 }), false);
    // sin ancho medido no se decide nada
    assert.equal(salidaDebeEspejarse({ ...base, ancho: 0, bufferLeft: 12 }), false);
    // forzar el espejo deja la etiqueta a la derecha del conector aunque a la izquierda entre
    const normal = geometriaConector(120, 39);
    assert.equal(normal.espejado, false);
    const forzada = geometriaConector(120, 39, 0, true);
    assert.equal(forzada.espejado, true);
    assert.equal(forzada.left, 120 + ANCHO_CONECTOR + SEPARACION_ETIQUETA);
});

test('GeometriaEtiquetas: lugar libre y versión de la descripción del hito enfocado (sin DOM)', async () => {
    const { holguraDescripcion, nivelDescripcion, holguraHaciaDerecha, MARGEN_DESCRIPCION_DERECHA, SEPARACION_DESCRIPCION } = await import('../src/core/geometria-etiquetas.js');

    // lugar a la derecha de una hora que no se mueve: hasta el final de la pista (más el margen permitido)
    assert.equal(holguraHaciaDerecha(100, 40, 300), 300 + MARGEN_DESCRIPCION_DERECHA - 140);

    // hacia la izquierda cuenta desde el borde izquierdo de la etiqueta; hacia la derecha, hasta el límite a su derecha
    assert.equal(holguraDescripcion('izquierda', 180, 62), 118);
    assert.equal(holguraDescripcion('derecha', 90, 310), 220);
    // sin lugar la holgura es negativa
    assert.ok(holguraDescripcion('izquierda', 40, 62) < 0);

    // larga si entra con su separación, abreviada si solo entra esa y ninguna si ni siquiera esa
    assert.equal(nivelDescripcion(100 + SEPARACION_DESCRIPCION, 100, 50), 'larga');
    assert.equal(nivelDescripcion(100 + SEPARACION_DESCRIPCION - 1, 100, 50), 'corta');
    assert.equal(nivelDescripcion(50 + SEPARACION_DESCRIPCION, 100, 50), 'corta');
    assert.equal(nivelDescripcion(50 + SEPARACION_DESCRIPCION - 1, 100, 50), 'ninguna');
    // sin versión abreviada nunca devuelve 'corta'
    assert.equal(nivelDescripcion(80, 100), 'ninguna');
});

test('BusquedaTexto: coincidencias sin distinguir mayúsculas ni acentos y rangos sobre el texto original (sin DOM)', async () => {
    const { normalizarBusqueda, terminosDeBusqueda, textoCoincide, rangosCoincidencia, teclaIniciaBusqueda } = await import('../src/core/busqueda-texto.js');

    assert.equal(normalizarBusqueda('Compensación ÁÉÍ'), 'compensacion aei');
    // las palabras de un solo carácter se ignoran
    assert.deepEqual(terminosDeBusqueda('  Tiempo   a fuera '), ['tiempo', 'fuera']);

    // todas las palabras deben estar, en cualquier orden y sin importar acentos
    const texto = 'El tipo Compensatorio sirve para tomarte un día libre';
    assert.equal(textoCoincide(texto, terminosDeBusqueda('compensatorio dia')), true);
    assert.equal(textoCoincide(texto, terminosDeBusqueda('compensatorio vacaciones')), false);
    assert.equal(textoCoincide(texto, []), false);

    // los rangos apuntan al texto original (con acentos) y se unen si se superponen
    const rangos = rangosCoincidencia(texto, ['dia', 'libre', 'ia li']);
    assert.deepEqual(rangos.map(([i, f]) => texto.slice(i, f)), ['día libre']);
    assert.deepEqual(rangosCoincidencia('Banco de horas, banco', ['banco']).map(([i, f]) => [i, f]), [[0, 5], [16, 21]]);

    // escribir una letra suelta empieza la búsqueda; con modificadores, con otras teclas o con el foco ya en un campo, no
    assert.equal(teclaIniciaBusqueda({ key: 'a' }, false), true);
    assert.equal(teclaIniciaBusqueda({ key: 'Ñ' }, false), true);
    assert.equal(teclaIniciaBusqueda({ key: 'é' }, false), true);
    assert.equal(teclaIniciaBusqueda({ key: 'c', ctrlKey: true }, false), false);
    assert.equal(teclaIniciaBusqueda({ key: 'a', altKey: true }, false), false);
    assert.equal(teclaIniciaBusqueda({ key: 'Enter' }, false), false);
    assert.equal(teclaIniciaBusqueda({ key: ' ' }, false), false);
    assert.equal(teclaIniciaBusqueda({ key: '5' }, false), false);
    assert.equal(teclaIniciaBusqueda({ key: 'a' }, true), false);
});

test('AvisoActualizacion: porcentajeValido acota y redondea el avance que informa el Service Worker', async () => {
    const { porcentajeValido } = await import('../src/ui/aviso-actualizacion.js');
    assert.equal(porcentajeValido(45.6), 46);
    assert.equal(porcentajeValido(0), 0);
    assert.equal(porcentajeValido(150), 100);
    assert.equal(porcentajeValido(-3), 0);
    assert.equal(porcentajeValido('72'), 72);
    assert.equal(porcentajeValido(undefined), null);
    assert.equal(porcentajeValido(null), null);
    assert.equal(porcentajeValido('abc'), null);
});

test('PosicionHeader: en PC valen las cuatro posiciones y en móvil solo arriba y abajo; lo inválido vuelve a arriba', async () => {
    const { POSICIONES_HEADER, posicionesPermitidas, normalizarPosicion, etiquetaPosicion } = await import('../src/core/posicion-header.js');
    assert.deepEqual(POSICIONES_HEADER.map(p => p.id), ['top', 'bottom', 'left', 'right']);
    assert.deepEqual(posicionesPermitidas(true), ['top', 'bottom', 'left', 'right']);
    assert.deepEqual(posicionesPermitidas(false), ['top', 'bottom']);

    assert.equal(normalizarPosicion('left', true), 'left');
    assert.equal(normalizarPosicion('bottom', false), 'bottom');
    // un costado guardado no vale en móvil, ni un valor desconocido en ningún modo
    assert.equal(normalizarPosicion('right', false), 'top');
    assert.equal(normalizarPosicion('inventada', true), 'top');
    assert.equal(normalizarPosicion(undefined, false), 'top');

    assert.equal(etiquetaPosicion('bottom'), 'Abajo');
    assert.equal(etiquetaPosicion('inventada'), 'Arriba');
});

test('EstiloCalendario: el ciclo recorre todos los estilos, vuelve al original y tolera ids desconocidos', async () => {
    const { ESTILOS_CALENDARIO, siguienteEstilo, etiquetaEstilo } = await import('../src/core/estilo-calendario.js');
    const ids = ESTILOS_CALENDARIO.map(e => e.id);
    assert.equal(ids[0], 'legacy', 'el estilo original es el primero y el valor por defecto');
    assert.equal(new Set(ids).size, ids.length, 'sin ids repetidos');
    assert.deepEqual(ids, ['legacy', 'relleno-aro', 'cuadrado-aro', 'aro-tinte', 'aro-grueso', 'contorno-brillo', 'subrayado', 'punto']);

    // dando la vuelta completa se vuelve al punto de partida y se pasa por todos
    const visitados = [];
    let id = 'legacy';
    for (let i = 0; i < ids.length; i++) { visitados.push(id); id = siguienteEstilo(id); }
    assert.deepEqual(visitados, ids);
    assert.equal(id, 'legacy');

    // un valor guardado que ya no existe se trata como el original
    assert.equal(siguienteEstilo('inventado'), 'relleno-aro');
    assert.equal(etiquetaEstilo('inventado'), 'Legacy');
    // el estilo que se quitó ('solo-contorno') guardado por una versión anterior vuelve al original
    assert.equal(etiquetaEstilo('solo-contorno'), 'Legacy');
    assert.equal(etiquetaEstilo('aro-grueso'), 'Aro grueso');
});

test('TiempoUtils.msHastaProximoMinuto: lo que falta para el próximo cambio de minuto', () => {
    const { msHastaProximoMinuto: ms } = TiempoUtils;
    assert.equal(ms(0), 60000);
    assert.equal(ms(1000), 59000);
    assert.equal(ms(59999), 1);
    assert.equal(ms(60000), 60000);
});

test('TiempoUtils.sumarDias: cruza meses y años, en ambos sentidos', () => {
    const { sumarDias } = TiempoUtils;
    assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');
    assert.equal(sumarDias('2026-01-01', -1), '2025-12-31');
    assert.equal(sumarDias('2028-02-28', 1), '2028-02-29');
    assert.equal(sumarDias('2026-10-26', 6), '2026-11-01');
    assert.equal(sumarDias('2026-10-26', 0), '2026-10-26');
});

test('DiasHabiles.esDiaLaboral: usa el tramo de días hábiles que rige en esa fecha', () => {
    EstadoApp._setHistorialDiasHabilesRaw([{ desde: '0001-01-01', dias: [1, 2, 3, 4, 5] }, { desde: '2026-06-01', dias: [6] }]);
    assert.equal(DiasHabiles.esDiaLaboral('2026-05-25'), true, 'lunes en el primer tramo');
    assert.equal(DiasHabiles.esDiaLaboral('2026-05-30'), false, 'sábado en el primer tramo');
    assert.equal(DiasHabiles.esDiaLaboral('2026-06-01'), false, 'lunes en el segundo tramo');
    assert.equal(DiasHabiles.esDiaLaboral('2026-06-06'), true, 'sábado en el segundo tramo');
    EstadoApp._setHistorialDiasHabilesRaw([]);
});

test('Objetivos.creditoPara: lo que falta para el objetivo, sin perder minutos por redondeo', () => {
    EstadoApp.setIgnorarTiempoFuera(false);
    assert.equal(Objetivos.creditoPara('08:00', '12:00', null, 7), '03:00');
    assert.equal(Objetivos.creditoPara('08:00', '12:00', '00:30', 7), '03:30');
    assert.equal(Objetivos.creditoPara('08:00', '15:00', null, 7), null, 'cumplió');
    assert.equal(Objetivos.creditoPara('08:00', '14:59', null, 7), '00:01', 'un minuto');
    assert.equal(Objetivos.creditoPara('08:00', '12:00', null, 7.125), '03:08', 'objetivo con decimales');
    assert.equal(Objetivos.creditoPara('08:00', null, null, 7), null, 'sin salida');
});

test('Helpers de presentación: contar, claveMes, tieneTiempoFuera y tieneCredito', () => {
    assert.equal(TiempoUtils.contar(1, 'día'), '1 día');
    assert.equal(TiempoUtils.contar(0, 'registro'), '0 registros');
    assert.equal(TiempoUtils.contar(3, 'registro'), '3 registros');
    assert.equal(TiempoUtils.claveMes('2026-10-28'), '2026-10');
    assert.deepEqual(['00:30', '00:00', '', null, undefined].map(v => TiposRegistro.tieneTiempoFuera({ tiempoFuera: v })), [true, false, false, false, false]);
    assert.deepEqual(['00:30', '00:00', '', null, undefined].map(v => TiposRegistro.tieneCredito({ credito: v })), [true, false, false, false, false]);
});

test('alClic: enlaza cada id a su manejador e ignora los que no existen', async () => {
    const { alClic } = await import('../src/core/dom.js');
    const docOriginal = globalThis.document;
    const oyentes = {};
    globalThis.document = { getElementById: id => (id === 'no-existe' ? null : { addEventListener: (tipo, fn) => { oyentes[`${id}:${tipo}`] = fn; } }) };
    try {
        const a = () => { }, b = () => { };
        alClic({ 'btn-a': a, 'btn-b': b, 'no-existe': () => { } });
        assert.deepEqual(oyentes, { 'btn-a:click': a, 'btn-b:click': b });
    } finally {
        globalThis.document = docOriginal;
    }
});

test('Preferencias: leen y guardan con su valor por defecto, por perfil solo las que corresponde', async () => {
    const { Preferencias: P } = await import('../src/core/preferencias.js');
    const { Almacenamiento } = await import('../src/core/almacenamiento.js');
    const { STORAGE_KEYS } = await import('../src/core/constantes.js');
    Almacenamiento.removeItem(STORAGE_KEYS.HOVER_POPUP);
    Almacenamiento.removeItem(STORAGE_KEYS.PERSISTIR_TARJETAS);
    assert.equal(P.HOVER_POPUP.get(), false);
    assert.equal(P.PERSISTIR_TARJETAS.get(), true);
    P.HOVER_POPUP.set(true);
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.HOVER_POPUP), true);
    Almacenamiento.removeItem(STORAGE_KEYS.HOVER_POPUP);

    Almacenamiento.removeItem(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, true);
    P.IGNORAR_LOGICA_CUBIERTO.set(true);
    assert.equal(Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, false, true), true, 'se guarda por perfil');
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO), null, 'no en la clave global');
    Almacenamiento.removeItem(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, true);
});

test('EstiloTarjeta: ciclo, valor deducido del hint integrado y respaldos viejos y nuevos', async () => {
    const { ESTILOS_TARJETA, siguienteEstilo, etiquetaEstilo, esEstiloPropio, EstiloTarjeta } = await import('../src/core/estilo-tarjeta.js');
    const { Almacenamiento } = await import('../src/core/almacenamiento.js');
    const { ImportarExportar } = await import('../src/services/importar-exportar.js');
    const { STORAGE_KEYS } = await import('../src/core/constantes.js');

    const ids = ESTILOS_TARJETA.map(e => e.id);
    assert.deepEqual(ids, ['clasica', 'linea', 'filas', 'anillo', 'hitos']);
    let id = 'clasica';
    for (let i = 0; i < ids.length; i++) id = siguienteEstilo(id);
    assert.equal(id, 'clasica', 'dando la vuelta completa se vuelve al punto de partida');
    assert.equal(siguienteEstilo('desconocido'), 'clasica');
    assert.equal(etiquetaEstilo('desconocido'), 'Clásica');
    assert.deepEqual(ids.filter(esEstiloPropio), ['linea', 'filas', 'anillo']);

    // sin estilo guardado se deduce del hint integrado: quien ya usaba la app ve lo mismo que antes
    Almacenamiento.removeItem(STORAGE_KEYS.ESTILO_TARJETA);
    Almacenamiento.setItem(STORAGE_KEYS.HINT_INTEGRADO, false);
    EstiloTarjeta.releer();
    assert.equal(EstiloTarjeta.actual(), 'clasica');
    Almacenamiento.setItem(STORAGE_KEYS.HINT_INTEGRADO, true);
    EstiloTarjeta.releer();
    assert.equal(EstiloTarjeta.actual(), 'hitos');

    // un valor guardado inválido se ignora
    Almacenamiento.setItem(STORAGE_KEYS.ESTILO_TARJETA, 'inexistente');
    EstiloTarjeta.releer();
    assert.equal(EstiloTarjeta.actual(), 'hitos');

    EstiloTarjeta.setEstilo('anillo');
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.ESTILO_TARJETA), 'anillo');
    assert.equal(EstiloTarjeta.propio(), true);
    assert.equal(EstiloTarjeta.hintIntegrado(), false);
    EstiloTarjeta.setEstilo('mal');
    assert.equal(EstiloTarjeta.actual(), 'anillo', 'un estilo inválido no cambia nada');

    // respaldo viejo: solo trae el interruptor del hint integrado
    ImportarExportar.aplicarConfigImportada({ diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 8, hintIntegrado: false });
    assert.equal(EstiloTarjeta.actual(), 'clasica');
    ImportarExportar.aplicarConfigImportada({ diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 8, hintIntegrado: true });
    assert.equal(EstiloTarjeta.actual(), 'hitos');
    // respaldo nuevo: trae el estilo y manda sobre el interruptor
    ImportarExportar.aplicarConfigImportada({ diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 8, hintIntegrado: false, estiloTarjeta: 'filas' });
    assert.equal(EstiloTarjeta.actual(), 'filas');
    assert.equal(ImportarExportar.validarCamposConfigImport({ estiloTarjeta: 'filas' }), true);
    assert.equal(ImportarExportar.validarCamposConfigImport({ estiloTarjeta: 'otro' }), false);

    // disposición del tiempo trabajado en la línea de tiempo (subvariante para tarjetas anchas)
    const { DISPOSICIONES_LINEA, siguienteDisposicion, etiquetaDisposicion } = await import('../src/core/estilo-tarjeta.js');
    assert.deepEqual(DISPOSICIONES_LINEA.map(d => d.id), ['arriba', 'izquierda', 'derecha', 'mosaicos-izquierda', 'mosaicos-derecha']);
    assert.equal(siguienteDisposicion('arriba'), 'izquierda');
    assert.equal(siguienteDisposicion('mosaicos-derecha'), 'arriba');
    assert.equal(siguienteDisposicion('x'), 'arriba');
    assert.equal(etiquetaDisposicion('x'), 'Arriba');
    Almacenamiento.removeItem(STORAGE_KEYS.LINEA_DISPOSICION);
    EstiloTarjeta.releer();
    assert.equal(EstiloTarjeta.disposicion(), 'arriba', 'por defecto el tiempo va arriba, como en el móvil');
    EstiloTarjeta.siguienteDisposicion();
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.LINEA_DISPOSICION), 'izquierda');
    EstiloTarjeta.setDisposicion('inválida');
    assert.equal(EstiloTarjeta.disposicion(), 'izquierda');
    ImportarExportar.aplicarConfigImportada({ diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 8, lineaDisposicion: 'derecha' });
    assert.equal(EstiloTarjeta.disposicion(), 'derecha');
    assert.equal(ImportarExportar.validarCamposConfigImport({ lineaDisposicion: 'derecha' }), true);
    assert.equal(ImportarExportar.validarCamposConfigImport({ lineaDisposicion: 'mosaicos-izquierda' }), true);
    assert.equal(ImportarExportar.validarCamposConfigImport({ lineaDisposicion: 'abajo' }), false);

    // posición de los mosaicos de la línea de tiempo con la tarjeta angosta (móvil)
    const { MOSAICOS_LINEA, siguienteMosaicos, etiquetaMosaicos } = await import('../src/core/estilo-tarjeta.js');
    assert.deepEqual(MOSAICOS_LINEA.map(m => m.id), ['abajo', 'derecha']);
    assert.equal(siguienteMosaicos('abajo'), 'derecha');
    assert.equal(siguienteMosaicos('derecha'), 'abajo');
    assert.equal(etiquetaMosaicos('x'), 'Vertical', 'un id desconocido cuenta como la posición por defecto');
    Almacenamiento.removeItem(STORAGE_KEYS.LINEA_MOSAICOS);
    EstiloTarjeta.releer();
    assert.equal(EstiloTarjeta.mosaicos(), 'derecha', 'por defecto vertical (apilados a la derecha de la línea)');
    EstiloTarjeta.siguienteMosaicos();
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.LINEA_MOSAICOS), 'abajo');
    EstiloTarjeta.setMosaicos('izquierda');
    assert.equal(EstiloTarjeta.mosaicos(), 'abajo', 'un valor inválido no cambia nada');
    ImportarExportar.aplicarConfigImportada({ diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 8, lineaMosaicos: 'derecha' });
    assert.equal(EstiloTarjeta.mosaicos(), 'derecha');
    assert.equal(ImportarExportar.validarCamposConfigImport({ lineaMosaicos: 'derecha' }), true);
    assert.equal(ImportarExportar.validarCamposConfigImport({ lineaMosaicos: 'izquierda' }), false);

    // variantes del estilo anillo: aro a la izquierda o a la derecha, fila de abajo o arriba
    const { DISPOSICIONES_ANILLO, siguienteAnillo, etiquetaAnillo } = await import('../src/core/estilo-tarjeta.js');
    assert.deepEqual(DISPOSICIONES_ANILLO.map(d => d.id), ['izquierda', 'derecha', 'arriba-izquierda', 'arriba-derecha']);
    assert.equal(siguienteAnillo('izquierda'), 'derecha');
    assert.equal(siguienteAnillo('arriba-derecha'), 'izquierda');
    assert.equal(siguienteAnillo('x'), 'izquierda');
    assert.equal(etiquetaAnillo('x'), 'Anillo a la izquierda');
    Almacenamiento.removeItem(STORAGE_KEYS.ANILLO_DISPOSICION);
    EstiloTarjeta.releer();
    assert.equal(EstiloTarjeta.anillo(), 'izquierda', 'por defecto el aro a la izquierda y la fila abajo');
    EstiloTarjeta.siguienteAnillo();
    assert.equal(Almacenamiento.getItem(STORAGE_KEYS.ANILLO_DISPOSICION), 'derecha');
    EstiloTarjeta.setAnillo('abajo');
    assert.equal(EstiloTarjeta.anillo(), 'derecha', 'un valor inválido no cambia nada');
    ImportarExportar.aplicarConfigImportada({ diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 8, anilloDisposicion: 'arriba-izquierda' });
    assert.equal(EstiloTarjeta.anillo(), 'arriba-izquierda');
    assert.equal(ImportarExportar.validarCamposConfigImport({ anilloDisposicion: 'arriba-derecha' }), true);
    assert.equal(ImportarExportar.validarCamposConfigImport({ anilloDisposicion: 'abajo' }), false);

    // se deja como estaba para no alterar los demás tests
    Almacenamiento.removeItem(STORAGE_KEYS.ANILLO_DISPOSICION);
    Almacenamiento.removeItem(STORAGE_KEYS.LINEA_MOSAICOS);
    Almacenamiento.removeItem(STORAGE_KEYS.ESTILO_TARJETA);
    Almacenamiento.removeItem(STORAGE_KEYS.LINEA_DISPOSICION);
    EstiloTarjeta.releer();
});

test('ResumenTarjeta: duraciones compactas y orden de los hitos (sin DOM)', async () => {
    const { partesDuracion, duracionCompacta, duracionConSigno, hitosOrdenados } = await import('../src/core/resumen-tarjeta.js');

    assert.deepEqual(partesDuracion(398), { horas: 6, minutos: 38 });
    assert.deepEqual(partesDuracion(-5), { horas: 0, minutos: 0 });
    assert.equal(duracionCompacta(22), '22 min');
    assert.equal(duracionCompacta(480), '8 h');
    assert.equal(duracionCompacta(398), '6 h 38 min');
    assert.equal(duracionConSigno(19), '+19 min');
    assert.equal(duracionConSigno(-35), '−35 min');

    // abierta con banco a favor: la salida con banco llega antes que la estimada
    const abierta = { cerrado: false, ahoraRel: 22, salidaRel: 420, bufferRel: 401, hayBanda: true };
    assert.deepEqual(hitosOrdenados(abierta).map(h => h.tipo), ['entrada', 'ahora', 'banco', 'salida']);
    // banco en contra: llega después
    assert.deepEqual(hitosOrdenados({ ...abierta, bufferRel: 455 }).map(h => h.tipo), ['entrada', 'ahora', 'salida', 'banco']);
    // "ahora" se ordena entre los demás según la hora
    assert.deepEqual(hitosOrdenados({ ...abierta, ahoraRel: 410 }).map(h => h.tipo), ['entrada', 'banco', 'ahora', 'salida']);
    // sin banda no hay hito de banco; cerrada solo quedan entrada y salida
    assert.deepEqual(hitosOrdenados({ ...abierta, hayBanda: false, bufferRel: null }).map(h => h.tipo), ['entrada', 'ahora', 'salida']);
    assert.deepEqual(hitosOrdenados({ ...abierta, cerrado: true }).map(h => h.tipo), ['entrada', 'salida']);
});

test('TarjetaFichajeVista: el resumen del día alimenta los diseños propios (registro abierto y cerrado, sin registro y día especial)', async () => {
    const { TarjetaFichajeVista } = await import('../src/ui/tarjeta-fichaje-vista.js');
    const { TiempoUtils } = await import('../src/core/tiempo-utils.js');
    const hoy = TiempoUtils.obtenerFechaHoy();
    const base = {
        horasDiarias: 8, esDiaHabil: true, diasHabiles: [0, 1, 2, 3, 4, 5, 6], tipoEspecialHoy: null,
        bufferSemanal: 0.5, bufferSemanalBase: 0.5, semanaAbierta: true, hoy, ayerAbierto: false, regAyer: null
    };

    const sin = TarjetaFichajeVista.derivarVistaHoy({ ...base, regHoy: null, tiempoHoy: 0 }).resumen;
    assert.equal(sin.tipo, 'espera');
    assert.equal(sin.mensaje, 'Esperando registro…');
    assert.equal(sin.banco.texto, '+30 min');
    assert.equal(sin.banco.positivo, true);

    const especial = TarjetaFichajeVista.derivarVistaHoy({
        ...base, regHoy: { fecha: hoy, entrada: 'VAC', salida: 'VAC' }, tiempoHoy: 0,
        tipoEspecialHoy: { emoji: '🏖️', label: 'Vacaciones', descripcion: 'Vacaciones', color: 'orange' }
    }).resumen;
    assert.deepEqual(especial, { tipo: 'especial', emoji: '🏖️', etiqueta: 'Vacaciones', descripcion: '¡Vacaciones!', color: 'orange' });

    const abierto = TarjetaFichajeVista.derivarVistaHoy({ ...base, regHoy: { fecha: hoy, entrada: '09:00', salida: '' }, tiempoHoy: 0.5 }).resumen;
    assert.equal(abierto.tipo, 'registro');
    assert.equal(abierto.cerrado, false);
    assert.deepEqual(abierto.trabajado, { horas: 0, minutos: 30 });
    assert.equal(abierto.entrada, '09:00');
    assert.equal(abierto.salida, '');
    assert.deepEqual(abierto.balance, { etiqueta: 'Faltan', texto: '7 h 30 min', tono: 'neutro' });
    assert.equal(abierto.banco.texto, '+30 min');
    // tramos del anillo (como la barra con hitos): azul hasta la salida con banco (7:30 de 8:00), el color del banco hasta la salida estimada
    assert.equal(abierto.anillo.tramos.length, 2);
    assert.deepEqual(abierto.anillo.tramos[0], { desde: 0, hasta: 93.75, color: 'blue' });
    assert.equal(abierto.anillo.tramos[1].hasta, 100);
    assert.equal(abierto.anillo.progreso, 6.25);

    // con lo trabajado más allá de la última marca el aro se estira: azul hasta el objetivo y verde el resto
    const extra = TarjetaFichajeVista.derivarVistaHoy({ ...base, bufferSemanal: 0, bufferSemanalBase: 0, regHoy: { fecha: hoy, entrada: '09:00', salida: '' }, tiempoHoy: 10 }).resumen;
    assert.deepEqual(extra.anillo.tramos.map(t => t.color), ['blue', 'green']);
    assert.equal(extra.anillo.progreso, 100);
    assert.equal(extra.anillo.tramos[0].hasta, 80);

    const cerrado = TarjetaFichajeVista.derivarVistaHoy({ ...base, regHoy: { fecha: hoy, entrada: '09:00', salida: '17:00' }, tiempoHoy: 8 }).resumen;
    assert.equal(cerrado.cerrado, true);
    assert.equal(cerrado.salida, '17:00');
    assert.equal(cerrado.salidaEstimada, '');
    assert.equal(cerrado.anillo, null, 'cerrado el aro va de un solo color');
    assert.deepEqual(cerrado.balance, { etiqueta: 'Objetivo', texto: 'Cumplido', tono: 'green' });
});

test('TarjetaFichajeVista: el resumen de la semana lista los días con su color y lo que falta', async () => {
    const { TarjetaFichajeVista } = await import('../src/ui/tarjeta-fichaje-vista.js');
    const { horaCorta, resumenesDeMedida } = await import('../src/core/resumen-tarjeta.js');
    assert.equal(horaCorta(450), '7:30');
    assert.equal(horaCorta(0), '—');

    const dia = (fecha, estado, extra = {}) => ({ fecha, objetivo: 7, total: 0, activo: false, estado, ...extra });
    const est = {
        totalSemana: 10.5, totalSemanaProgreso: 10.5, objetivoSemana: 35, semanaAbierta: true, horasDiarias: 7, todosEspeciales: false,
        hoy: '2026-10-28', bufferSemanal: -2, diasSemana: [
            dia('2026-10-26', 'cerrado', { total: 7, cumplimiento: 'cumplido' }),
            dia('2026-10-27', 'cerrado', { total: 3.5, cumplimiento: 'faltante' }),
            dia('2026-10-28', 'especial', { objetivo: 0, especial: 'orange', emoji: '🏖️', etiqueta: 'Vacaciones' }),
            dia('2026-10-29', 'futuro')
        ]
    };
    const r = TarjetaFichajeVista.derivarVistaSemana(est).resumen;
    assert.equal(r.tipo, 'semana');
    assert.deepEqual(r.trabajado, { horas: 10, minutos: 30 });
    assert.equal(r.objetivoMin, 2100);
    assert.deepEqual(r.balance, { etiqueta: 'Faltan', texto: '24 h 30 min', tono: 'neutro' });
    assert.equal(r.banco.texto, '−2 h');
    assert.deepEqual(r.dias.map(d => [d.sigla, d.estado, d.color, d.totalMin, d.hoy]), [
        ['lun', 'cerrado', 'green', 420, false],
        ['mar', 'cerrado', 'red', 210, false],
        ['mié', 'especial', 'orange', 0, true],
        ['jue', 'futuro', null, 0, false]
    ]);
    assert.equal(r.dias[1].fraccion, 0.5);
    // el aro lleva los tramos de la barra semanal: un tramo por día (el especial, de 1 h, con su color; el futuro no entra) sobre el objetivo de 35 h más esa hora fija
    assert.deepEqual(r.anillo.tramos.map(t => [t.color, Math.round(t.desde * 100) / 100, Math.round(t.hasta * 100) / 100]), [
        ['green', 0, 19.44], ['red', 19.44, 29.17], ['orange', 29.17, 31.94]
    ]);
    assert.equal(Math.round(r.anillo.progreso * 100) / 100, 31.94);
    assert.equal(r.dias[2].emoji, '🏖️');

    // una semana sin días laborables se muestra como "sin registro" (emoji y mensaje)
    const vacia = TarjetaFichajeVista.derivarVistaSemana({ ...est, todosEspeciales: true, diasSemana: [] }).resumen;
    assert.equal(vacia.tipo, 'espera');
    assert.equal(vacia.emoji, '🌞');

    // los resúmenes de medida (alto reservado del anillo) cubren todos los estados
    const medidas = resumenesDeMedida();
    assert.deepEqual(medidas.map(m => m.tipo), ['registro', 'espera', 'especial', 'semana']);
    assert.equal(medidas[3].dias.length, 7);

});

test('SeguridadYUtils.notasHastaPalabra: respeta la lista blanca y el largo máximo cortando en la última palabra completa', async () => {
    const { SeguridadYUtils: S } = await import('../src/core/seguridad.js');
    const MAX = S.SECURITY_LIMITS.MAX_NOTAS_LENGTH;

    assert.equal(S.notasHastaPalabra('Año Nuevo'), 'Año Nuevo');
    assert.equal(S.notasHastaPalabra('Día Nac. de la Memoria'), 'Día Nac de la Memoria', 'los signos fuera de la lista blanca se quitan');
    assert.equal(S.notasHastaPalabra('Paso a la Inmortalidad del Gral. Güemes'), 'Paso a la Inmortalidad del Gral', 'se corta antes de la palabra que no entra');
    assert.equal(S.notasHastaPalabra('Visita de Su Santidad el Papa León XIV (CABA)'), 'Visita de Su Santidad el Papa León');

    // una palabra que llega justo al máximo se conserva completa; si la siguiente ya no entra, se descarta entera
    const justo = 'a'.repeat(MAX - 5) + ' bcde';
    assert.equal(justo.length, MAX);
    assert.equal(S.notasHastaPalabra(`${justo} fgh`), justo);
    // una palabra que se pasa del máximo no queda partida
    assert.equal(S.notasHastaPalabra('a'.repeat(MAX - 5) + ' bcdefg'), 'a'.repeat(MAX - 5));
    // una sola palabra más larga que el máximo no tiene dónde cortarse: se recorta en el máximo
    assert.equal(S.notasHastaPalabra('x'.repeat(MAX + 15)), 'x'.repeat(MAX));

    assert.equal(S.notasHastaPalabra(''), null);
    assert.equal(S.notasHastaPalabra('...'), null);
    assert.equal(S.notasHastaPalabra(undefined), null);
    for (const t of ['Feriado con un nombre bastante largo para el campo', 'Paso a la Inmortalidad del Gral. San Martín']) {
        assert.ok((S.notasHastaPalabra(t) ?? '').length <= MAX);
    }
});
