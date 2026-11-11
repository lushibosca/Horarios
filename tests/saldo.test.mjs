import test from 'node:test';
import assert from 'node:assert/strict';

// Saldo de horas: lo que ve el usuario como "extras" o "faltantes". Los resultados esperados están calculados a mano.
// Fecha fija: miércoles 28/10/2026 a las 10:00. Semana: lunes 26 a domingo 1/11. Jornada de 7 h, de lunes a viernes.
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
};
globalThis.window = globalThis;
globalThis.addEventListener = () => { };
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => { } });

const { SaldoSemanal } = await import('../src/services/saldo-semanal.js');
const { EstadoApp } = await import('../src/services/estado-app.js');
const { Compensatorios } = await import('../src/services/compensatorios.js');
const { Preferencias } = await import('../src/core/preferencias.js');

const LUN = '2026-10-26', MAR = '2026-10-27', MIE = '2026-10-28', JUE = '2026-10-29', SAB = '2026-10-24', VIE_ANT = '2026-10-23';
const FERIADO = '00:00', REMOTO = '16:16', COMPENSATORIO = '18:18';

let n = 0;
function reg(fecha, entrada, salida, extra = {}) {
    const r = { id: `registro${String(++n).padStart(4, '0')}`, fecha, entrada, salida, tiempoFuera: null, objetivoHoras: 7, ...extra };
    const t = EstadoApp.calcularHoras(entrada, salida, r.tiempoFuera, r.credito ?? null);
    return { ...r, horas: t?.horas ?? 0, minutos: t?.minutos ?? 0, total: t?.total ?? 0 };
}
const especial = (fecha, codigo, extra) => reg(fecha, codigo, codigo, extra);

function preparar(t, registros, ahora = new Date(2026, 9, 28, 10, 0)) {
    t.mock.timers.reset();
    t.mock.timers.enable({ apis: ['Date'], now: ahora });
    EstadoApp.setHorasDiarias(7);
    EstadoApp.setDiasHabiles([1, 2, 3, 4, 5]);
    EstadoApp._setHistorialDiasHabilesRaw([]);
    EstadoApp.setIgnorarTiempoFuera(false);
    Preferencias.IGNORAR_OBJETIVO_POR_REGISTRO.set(false);
    Preferencias.IGNORAR_LOGICA_CUBIERTO.set(false);
    EstadoApp._setRegistros(registros);
    EstadoApp.ordenarRegistros();
}
// Saldo de lunes a hoy (miércoles), sin la jornada en curso: lo que usan el aviso y la salida ajustada
const saldoBase = (desde = LUN, hasta = MIE) => SaldoSemanal.calcularBufferPeriodo(desde, hasta, false);
const saldoEnVivo = (minutosFuera = 0, desde = LUN, hasta = MIE) => SaldoSemanal.calcularBufferPeriodo(desde, hasta, true, minutosFuera);

test('Saldo: jornadas cerradas suman lo que sobra y restan lo que falta', (t) => {
    preparar(t, [reg(LUN, '08:00', '16:00'), reg(MAR, '08:00', '14:30')]);
    assert.equal(saldoBase(), 0.5, '+1 h el lunes, -0,5 h el martes');
});

test('Saldo: un día hábil pasado sin registro cuenta como faltante; hoy sin registro todavía no', (t) => {
    preparar(t, []);
    assert.equal(saldoBase(), -14, 'lunes y martes completos; el miércoles sigue en curso');
});

test('Saldo: los días futuros no cuentan', (t) => {
    preparar(t, [reg(LUN, '08:00', '15:00'), reg(MAR, '08:00', '15:00')]);
    assert.equal(saldoBase(LUN, '2026-11-01'), 0);
});

test('Saldo: trabajar en un día no laborable suma todo como extra', (t) => {
    preparar(t, [reg(SAB, '09:00', '12:00')]);
    assert.equal(saldoBase(SAB, SAB), 3);
    preparar(t, [reg(VIE_ANT, '08:00', '15:00'), reg(SAB, '09:00', '12:00')]);
    assert.equal(saldoBase(VIE_ANT, SAB), 3, 'el viernes está justo; el domingo no entra en el rango');
});

test('Saldo: un día especial no cuenta para ningún lado', (t) => {
    preparar(t, [especial(LUN, FERIADO), reg(MAR, '08:00', '15:00')]);
    assert.equal(saldoBase(), 0);
});

test('Saldo: un día remoto cuenta como cumplido', (t) => {
    preparar(t, [especial(LUN, REMOTO), reg(MAR, '08:00', '15:00')]);
    assert.equal(saldoBase(), 0);
    preparar(t, [especial(LUN, REMOTO, { objetivoHoras: 5 }), reg(MAR, '08:00', '14:00')]);
    assert.equal(saldoBase(), -1, 'el remoto usa su propio objetivo y queda en cero; el martes faltó 1 h');
});

test('Saldo: cada jornada se mide contra su propio objetivo, salvo que la opción global lo ignore', (t) => {
    preparar(t, [reg(LUN, '08:00', '14:00', { objetivoHoras: 6 }), reg(MAR, '08:00', '15:00')]);
    assert.equal(saldoBase(), 0, 'el lunes cumplió sus 6 h');
    Preferencias.IGNORAR_OBJETIVO_POR_REGISTRO.set(true);
    assert.equal(saldoBase(), -1, 'con la opción global se mide contra las 7 h');
});

test('Saldo: la salida temprana cuenta como trabajada', (t) => {
    preparar(t, [reg(LUN, '08:00', '12:00', { credito: '03:00' }), reg(MAR, '08:00', '15:00')]);
    assert.equal(saldoBase(), 0, '4 h trabajadas + 3 h de salida temprana');
});

test('Saldo: el tiempo fuera se descuenta', (t) => {
    preparar(t, [reg(LUN, '08:00', '15:00', { tiempoFuera: '00:30' }), reg(MAR, '08:00', '15:00')]);
    assert.equal(saldoBase(), -0.5);
});

test('Saldo: un compensatorio descuenta el excedente que consume y no pide objetivo', (t) => {
    // Lunes: 2 h de más. El compensatorio del martes consume ese excedente completo: no queda saldo extra.
    const excedente = reg(LUN, '08:00', '17:00');
    preparar(t, [excedente, especial(MAR, COMPENSATORIO)]);
    assert.equal(Compensatorios.fechaCompensadaPorRegistro(EstadoApp.registroPorFecha(MAR)), LUN);
    assert.equal(saldoBase(), 0);
});

test('Saldo: una jornada de un día pasado que quedó abierta cuenta como faltante', (t) => {
    preparar(t, [reg(LUN, '08:00', null), reg(MAR, '08:00', '15:00')]);
    assert.equal(saldoBase(), -7);
});

test('Saldo: la jornada de ayer abierta dentro de las 24 h todavía no cuenta', (t) => {
    preparar(t, [reg(LUN, '08:00', '15:00'), reg(MAR, '22:00', null)]);
    assert.equal(saldoBase(), 0, 'abierta hace 12 h: sigue en curso');
    preparar(t, [reg(LUN, '08:00', '15:00'), reg(MAR, '09:00', null)], new Date(2026, 9, 28, 10, 0));
    assert.equal(saldoBase(), -7, 'abierta hace 25 h: ya se considera olvidada');
});

test('Saldo en vivo: la jornada en curso no cuenta hasta superar su objetivo; después suma solo lo que sobra', (t) => {
    preparar(t, [reg(MIE, '08:00', null)]);
    assert.equal(saldoEnVivo(0, MIE, MIE), 0, 'lleva 2 h de 7');
    preparar(t, [reg(MIE, '08:00', null)], new Date(2026, 9, 28, 16, 0));
    assert.equal(saldoEnVivo(0, MIE, MIE), 1, 'lleva 8 h de 7');
    assert.equal(saldoEnVivo(30, MIE, MIE), 0.5, 'con 30 min de pausa en curso');
    assert.equal(saldoEnVivo(120, MIE, MIE), 0, 'la pausa la deja por debajo del objetivo');
    assert.equal(saldoBase(MIE, MIE), 0, 'sin incluir la jornada en curso no cambia');
});

test('Saldo: el resultado no arrastra errores de punto flotante', (t) => {
    preparar(t, [reg(LUN, '08:00', '15:01'), reg(MAR, '08:00', '15:01')]);
    assert.equal(saldoBase(), Math.round((2 / 60) * 1e6) / 1e6);
});

test('Cubierto: lo que faltó un día lo cubre lo que sobró en la misma semana, aunque sea después', (t) => {
    preparar(t, [reg(LUN, '08:00', '14:00'), reg(MAR, '08:00', '16:00')]);
    assert.equal(SaldoSemanal.cubiertoPorSaldo(LUN), true, 'faltó 1 h y el martes sobró 1 h');
    assert.equal(SaldoSemanal.estadoDeRegistro(EstadoApp.registroPorFecha(LUN)).estado, 'cubierto');
    assert.equal(SaldoSemanal.estadoDeRegistro(EstadoApp.registroPorFecha(MAR)).estado, 'cumplido');
});

test('Cubierto: si lo que sobró no alcanza, o es de otra semana, no se cubre', (t) => {
    preparar(t, [reg(LUN, '08:00', '14:00'), reg(MAR, '08:00', '15:30')]);
    assert.equal(SaldoSemanal.cubiertoPorSaldo(LUN), false, 'faltó 1 h y sobró 0,5 h');
    assert.equal(SaldoSemanal.estadoDeRegistro(EstadoApp.registroPorFecha(LUN)).estado, 'incompleto');
    preparar(t, [reg(VIE_ANT, '08:00', '17:00'), reg(LUN, '08:00', '14:00')]);
    assert.equal(SaldoSemanal.cubiertoPorSaldo(LUN), false, 'el excedente es de la semana anterior');
});

test('Cubierto: con la lógica desactivada nada se cubre', (t) => {
    preparar(t, [reg(LUN, '08:00', '14:00'), reg(MAR, '08:00', '16:00')]);
    Preferencias.IGNORAR_LOGICA_CUBIERTO.set(true);
    assert.equal(SaldoSemanal.cubiertoPorSaldo(LUN), false);
    assert.equal(SaldoSemanal.estadoDeRegistro(EstadoApp.registroPorFecha(LUN)).estado, 'incompleto');
    assert.equal(SaldoSemanal.calcularAprovechamiento(LUN, MIE), null);
});

test('Aprovechamiento: qué parte de lo que sobró se usó para cubrir faltantes', (t) => {
    preparar(t, [reg(LUN, '08:00', '17:00'), reg(MAR, '08:00', '14:00')]);
    assert.deepEqual(SaldoSemanal.calcularAprovechamiento(LUN, MIE), { porcentaje: 50, horas: 1, generado: 2 });
    preparar(t, [reg(LUN, '08:00', '15:00')]);
    assert.equal(SaldoSemanal.calcularAprovechamiento(LUN, MIE), null, 'sin excedente no hay nada que medir');
});

test('Saldo con una pausa en curso: Estadísticas y la tarjeta de fichaje muestran lo mismo', async (t) => {
    const { EstadisticasPeriodo } = await import('../src/services/estadisticas-periodo.js');
    const { EstadoTarjeta } = await import('../src/services/estado-tarjeta.js');
    const { TiempoFuera } = await import('../src/services/tiempo-fuera.js');
    preparar(t, [reg(LUN, '08:00', '15:00'), reg(MAR, '08:00', '15:00'), reg(MIE, '08:00', null)], new Date(2026, 9, 28, 15, 30));
    TiempoFuera.iniciar();
    t.mock.timers.tick(30 * 60_000);   // son las 16:00: 8 h desde la entrada, 30 min de pausa
    try {
        assert.equal(EstadisticasPeriodo.calcularEstadisticasSemana(LUN).bufferPeriodo, 0.5);
        assert.equal(EstadoTarjeta.calcularEstadoCard().bufferSemanal, 0.5);
        EstadoApp.setIgnorarTiempoFuera(true);
        assert.equal(EstadisticasPeriodo.calcularEstadisticasSemana(LUN).bufferPeriodo, 1, 'con la opción activa la pausa no se descuenta');
        assert.equal(EstadoTarjeta.calcularEstadoCard().bufferSemanal, 1);
    } finally {
        EstadoApp.setIgnorarTiempoFuera(false);
        TiempoFuera.descartar();
    }
});
