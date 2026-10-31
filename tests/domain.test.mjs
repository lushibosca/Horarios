import test from 'node:test';
import assert from 'node:assert/strict';
import { TiempoUtils } from '../src/core/tiempo-utils.js';
import { SeguridadYUtils } from '../src/core/seguridad.js';
import { EventosApp } from '../src/core/eventos.js';
import { TiposRegistro } from '../src/services/tipos-registro.js';
import { EstadoApp } from '../src/services/estado-app.js';
import { Compensatorios } from '../src/services/compensatorios.js';

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

test('Integración: Arranque completo de OrquestadorUI.init() sin errores de ejecución', async () => {
    const noop = () => { };
    const fakeEl = () => ({
        style: { setProperty: noop, removeProperty: noop },
        dataset: {},
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        addEventListener: noop,
        removeEventListener: noop,
        querySelector: () => fakeEl(),
        querySelectorAll: () => [],
        appendChild: noop,
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
    globalThis.Storage = function () { };
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k)
    };
    globalThis.requestAnimationFrame = () => 0;
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
    ], EstadoApp.calcularHoras);
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
        hintIntegrado: true
    });
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

    // Franjas por día: cada día ocupa una porción fija de la barra (por su objetivo) y lo trabajado la rellena con el color de su estado
    const base = { totalSemana: 14, totalSemanaProgreso: 14, objetivoSemana: 35, semanaAbierta: true, horasDiarias: 7, todosEspeciales: false };
    const dia = (fecha, estado, extra = {}) => ({ fecha, objetivo: 7, total: 0, activo: false, estado, ...extra });
    const vistaFranjas = TarjetaFichajeVista.derivarVistaSemana({
        ...base,
        diasSemana: [
            dia('2026-10-26', 'cerrado', { total: 7, cumplimiento: 'cumplido' }),   // lun: cumplió -> franja entera verde
            dia('2026-10-27', 'cerrado', { total: 3.5, cumplimiento: 'faltante' }),   // mar: faltó -> mitad de la franja
            dia('2026-10-28', 'especial', { objetivo: 0, especial: 'purple' }),
            dia('2026-10-29', 'sin-registro'),
            dia('2026-10-30', 'sin-registro'),
            dia('2026-10-31', 'futuro')
        ]
    });
    // el relleno solo existe si el hint integrado está activo (por defecto lo está)
    assert.ok(vistaFranjas.tramosSemana, 'con el hint integrado hay franjas');
    const sextos = n => n / 6;
    assert.deepEqual(vistaFranjas.tramosSemana.map(t => [t.color, Number(t.desde.toFixed(4)), Number(t.hasta.toFixed(4))]), [
        ['green', 0, Number(sextos(1).toFixed(4))],
        [vistaFranjas.tramosSemana[1].color, Number(sextos(1).toFixed(4)), Number((sextos(1) + sextos(1) / 2).toFixed(4))],
        ['purple', Number(sextos(2).toFixed(4)), Number(sextos(3).toFixed(4))]
    ]);
    // los días seguidos del mismo tipo se fusionan: jue–vie (sin registro) es un solo hito; el futuro (sáb) es otro
    assert.deepEqual(vistaFranjas.hitosSemana.map(h => [h.sigla, Number(h.fraccion.toFixed(4))]), [
        ['lun', Number(sextos(1).toFixed(4))], ['mar', Number(sextos(2).toFixed(4))], ['mié', Number(sextos(3).toFixed(4))],
        ['jue–vie', Number(sextos(5).toFixed(4))], ['sáb', 1]
    ]);
    // cada hito lleva su descripción para lectores de pantalla
    assert.deepEqual(vistaFranjas.hitosSemana.map(h => h.descripcion), ['lun cumplido', 'mar con faltante', 'mié día especial', 'jue–vie sin registro', 'sáb pendiente']);
    assert.equal(vistaFranjas.colorInicioSemana, 'green');
    // si la primera franja está vacía, el remate del comienzo es neutro aunque más adelante haya rellenos
    const vistaPrimeraVacia = TarjetaFichajeVista.derivarVistaSemana({
        ...base,
        diasSemana: [dia('2026-10-26', 'sin-registro'), dia('2026-10-27', 'especial', { objetivo: 0, especial: 'orange' })]
    });
    assert.equal(vistaPrimeraVacia.colorInicioSemana, 'vacio');
    assert.equal(vistaPrimeraVacia.colorFinSemana, 'orange');
    assert.equal(vistaFranjas.colorFinSemana, 'purple');
    // la parte llena termina donde termina el último relleno
    assert.ok(Math.abs(vistaFranjas.anchoBarra - sextos(3) * 100) < 1e-6);

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
    assert.ok(!TarjetaFichajeVista.derivarVistaHoy(estBase(3, 7)).titulo.includes('estado-badge--cumplido'));
    // objetivo cumplido con la jornada abierta: parpadeo rápido
    const cumplido = TarjetaFichajeVista.derivarVistaHoy(estBase(7.5, 7));
    assert.ok(cumplido.titulo.includes('estado-badge--en-curso'));
    assert.ok(cumplido.titulo.includes('estado-badge--cumplido'));
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
