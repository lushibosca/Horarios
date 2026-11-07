import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Animaciones } from './animaciones.js';
import { TarjetaTiempoFuera } from './tarjeta-tiempo-fuera.js';

// ====================================================================
//              UI CLOCK-IN CARD STATS CYCLE (#stats-semana)
// ====================================================================
// Ciclo de textos del número grande de la tarjeta en la vista diaria: horas → "Entrada 08:30" → "Salida 17:00" (registro cerrado)
// → (con el registro abierto: salida estimada → salida con banco) → "Tiempo fuera 25m" → horas. Con el hint integrado (`hitosEnBarra`) la barra ya muestra la entrada, la salida y, con el registro abierto,
// la salida estimada y la salida con banco, cada una con su descripción: esas fases no cambian el texto (queda el de las horas) y solo resaltan su hito.
// Con la variante B del hint integrado (Ajustes) cada hito escribe su nombre y su hora en el número grande ("Entrada 08:30", "Salida estimada 17:00" —"S. estimada" si no entra en una línea—, "Salida ajustada 16:52" —"S. ajustada"—) en lugar de desplegarlos en la barra. El tiempo fuera no tiene hito en la barra, siempre se muestra como texto y cierra el ciclo. Sin el hint integrado, entrada y salida se muestran como texto.
// Cada 2 s. tarjeta-fichaje.js le pasa los datos en cada render y lo inicia/detiene.
// Cada vez que cambia la fase avisa su tipo (o null al terminar) a quien se registre con `alCambiarFase`: así la barra resalta el hito correspondiente
// sin que este módulo conozca el DOM de la barra.
const { _animarMutacion } = Animaciones;
const { _formatearMinutosCorto } = TarjetaTiempoFuera;

/** @typedef {{ tipo: string, texto: () => string, corto?: () => string }} FaseCiclo */

let _cicloStatsInterval = null;
let _cicloStatsValorHoras = '';
let _cicloStatsEntrada = '';
let _cicloStatsSalida = '';
let _cicloStatsSalidaEstimada = '';
let _cicloStatsSalidaBanco = '';
let _cicloStatsTiempoFuera = '';
let _cicloStatsHitosEnBarra = false;
let _cicloStatsNombreEnNumero = false;
/** Fase que se muestra fija mientras el cursor está sobre su hito (solo escritorio), o null. */
let _faseFija = null;
let _cicloStatsFaseAlRenderizar = null;
/** @type {((tipo: string | null) => void) | null} */
let _alCambiarFase = null;

// Todas las fases duran lo mismo (el resalte de un hito tarda ~0,5 s en desplegarse y sobra para leerlo)
const _CICLO_DURACION_MS = 1500;

function _emitirFase(tipo) {
    if (_alCambiarFase) _alCambiarFase(tipo);
}

function _detenerCicloStats() {
    clearTimeout(_cicloStatsInterval);
    _cicloStatsInterval = null;
    _faseFija = null;
    const el = $('stats-semana');
    if (el) el.classList.remove('mutacion-entrante');
    _emitirFase(null);
}

function _prepararMostrarFaseAlRenderizar(tipo) {
    _cicloStatsFaseAlRenderizar = tipo;
}

/**
 * Fase de un hito de la barra: con el hint integrado deja el texto de las horas (se despliega la descripción del hito en la barra);
 * con la variante B (o sin el hint integrado) el número grande muestra `texto`.
 * @param {string} tipo
 * @param {() => string} texto
 * @param {() => string} [corto] variante abreviada, para cuando `texto` no entra en una línea
 * @returns {FaseCiclo}
 */
function _faseHito(tipo, texto, corto) {
    return _cicloStatsHitosEnBarra && !_cicloStatsNombreEnNumero
        ? { tipo, texto: () => _cicloStatsValorHoras }
        : { tipo, texto, corto };
}

/** Escribe el texto de la fase en el número grande; si tiene variante corta y la completa no entra en una línea, usa la corta. */
function _escribirTextoFase(el, fase) {
    el.textContent = fase.texto();
    if (!fase.corto) return;
    const estilo = getComputedStyle(el);
    const alto = parseFloat(estilo.lineHeight) || parseFloat(estilo.fontSize) * 1.2;
    if (Math.max(el.scrollHeight, el.getBoundingClientRect().height) > alto * 1.5) el.textContent = fase.corto();
}

/** @returns {FaseCiclo[]} */
function _fasesCiclo() {
    /** @type {FaseCiclo[]} */
    const fases = [
        { tipo: 'horas', texto: () => _cicloStatsValorHoras },
        _faseHito('entrada', () => `Entrada ${_cicloStatsEntrada}`),
    ];
    if (_cicloStatsSalida) {
        fases.push(_faseHito('salida', () => `Salida ${_cicloStatsSalida}`));
    }
    if (_cicloStatsSalidaEstimada) fases.push(_faseHito('salidaEstimada', () => `Salida estimada ${_cicloStatsSalidaEstimada}`, () => `S. estimada ${_cicloStatsSalidaEstimada}`));
    if (_cicloStatsSalidaBanco) fases.push(_faseHito('banco', () => `Salida ajustada ${_cicloStatsSalidaBanco}`, () => `S. ajustada ${_cicloStatsSalidaBanco}`));
    // El tiempo fuera va al final: no es un hito de la barra, y así no corta la secuencia de hitos
    if (_cicloStatsTiempoFuera) {
        fases.push({ tipo: 'tiempoFuera', texto: () => `Tiempo fuera ${_formatearMinutosCorto(TiempoUtils.horaAMinutos(_cicloStatsTiempoFuera))}` });
    }
    return fases;
}

function _crearCicloTick(fases, estado) {
    const _cicloTick = () => {
        const el = $('stats-semana');
        if (!el) { _detenerCicloStats(); return; }

        const aplicar = () => {
            estado.idx++;
            const terminado = estado.idx >= fases.length;
            if (terminado) el.textContent = _cicloStatsValorHoras;
            else _escribirTextoFase(el, fases[estado.idx]);
            if (terminado) { _detenerCicloStats(); return; }
            _emitirFase(fases[estado.idx].tipo);
            _cicloStatsInterval = setTimeout(_cicloTick, _CICLO_DURACION_MS);
        };
        // si el texto que sigue es el que ya se ve (fases solo de hito) no hay nada que animar
        const siguiente = estado.idx + 1 >= fases.length ? _cicloStatsValorHoras : fases[estado.idx + 1].texto();
        if (siguiente === el.textContent) aplicar();
        else _animarMutacion(el, aplicar);
    };
    return _cicloTick;
}

function _cicloStatsActivo() {
    return !!_cicloStatsInterval || _faseFija !== null;
}

function _iniciarCicloStats(inmediato = false) {
    if (_cicloStatsInterval) return true;
    _detenerCicloStats();
    if (!_cicloStatsEntrada) return false;

    const fases = _fasesCiclo();
    const estado = { idx: 0 };
    const tick = _crearCicloTick(fases, estado);

    _cicloStatsInterval = setTimeout(tick, inmediato ? 0 : _CICLO_DURACION_MS);
    return true;
}

function _iniciarCicloEnFase(tipo) {
    if (!_cicloStatsEntrada) return false;
    clearTimeout(_cicloStatsInterval);

    const fases = _fasesCiclo();
    const idx = fases.findIndex(f => f.tipo === tipo);
    if (idx === -1) return false;

    const estado = { idx };
    const tick = _crearCicloTick(fases, estado);

    const el = $('stats-semana');
    if (el) _escribirTextoFase(el, fases[idx]);
    _emitirFase(fases[idx].tipo);

    _cicloStatsInterval = setTimeout(tick, _CICLO_DURACION_MS);
    return true;
}

/**
 * Muestra y mantiene la fase del primer tipo de `tipos` que exista (cursor sobre su hito): detiene el ciclo, deja las horas en el número grande
 * (la descripción se despliega en la barra, sea cual sea la animación elegida) y resalta el hito en la barra. Devuelve true si había una fase para mostrar.
 * @param {string[]} tipos
 */
function _fijarFase(tipos) {
    if (!_cicloStatsEntrada) return false;
    const fase = _fasesCiclo().find(f => tipos.includes(f.tipo));
    if (!fase) return false;
    clearTimeout(_cicloStatsInterval);
    _cicloStatsInterval = null;
    _faseFija = fase.tipo;
    const el = $('stats-semana');
    // el cursor siempre despliega la descripción en la barra: el número grande queda con las horas aunque el ciclo use el nombre del hito
    if (el) Animaciones._animarTextoHover(el, () => { el.textContent = _cicloStatsValorHoras; });
    _emitirFase(fase.tipo);
    return true;
}

/** El cursor salió del hito: vuelve el número de las horas y se quita el foco. No relanza el ciclo. */
function _soltarFase() {
    if (_faseFija === null) return;
    _faseFija = null;
    const el = $('stats-semana');
    if (el) Animaciones._animarTextoHover(el, () => { el.textContent = _cicloStatsValorHoras; });
    _emitirFase(null);
}

/** Datos del registro de hoy que muestran las fases (strings vacíos si no corresponde). */
function _actualizarDatos({ valorHoras, entrada, salida, tiempoFuera, salidaEstimada = '', salidaBanco = '', hitosEnBarra = false, nombreEnNumero = false }) {
    _cicloStatsValorHoras = valorHoras;
    _cicloStatsEntrada = entrada;
    _cicloStatsSalida = salida;
    _cicloStatsTiempoFuera = tiempoFuera;
    _cicloStatsSalidaEstimada = salidaEstimada;
    _cicloStatsSalidaBanco = salidaBanco;
    _cicloStatsHitosEnBarra = hitosEnBarra;
    _cicloStatsNombreEnNumero = hitosEnBarra && nombreEnNumero;
}

/** Fase pedida para el próximo render (tras fichar), o null; la consume. */
function _tomarFasePendiente() {
    const tipo = _cicloStatsFaseAlRenderizar;
    _cicloStatsFaseAlRenderizar = null;
    return tipo;
}

/** Registra quién recibe el tipo de la fase que se está mostrando ('entrada', 'tiempoFuera', 'salida', 'salidaEstimada', 'banco', 'horas') o null al terminar o detenerse. */
function _registrarAlCambiarFase(fn) {
    _alCambiarFase = fn;
}

export const CicloStats = {
    actualizarDatos: _actualizarDatos,
    tomarFasePendiente: _tomarFasePendiente,
    prepararFase: _prepararMostrarFaseAlRenderizar,
    iniciar: _iniciarCicloStats,
    iniciarEnFase: _iniciarCicloEnFase,
    detener: _detenerCicloStats,
    fijarFase: _fijarFase,
    soltarFase: _soltarFase,
    activo: _cicloStatsActivo,
    alCambiarFase: _registrarAlCambiarFase,
};
