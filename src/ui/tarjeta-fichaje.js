import { TarjetaFondos } from './tarjeta-fondos.js';
import { TarjetaTiempoFuera } from './tarjeta-tiempo-fuera.js';
import { TarjetaLote } from './tarjeta-lote.js';
import { STORAGE_KEYS, MARGEN_HORAS } from '../core/constantes.js';
import { $, superaUnaLinea, alClic } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { BarraHitos } from './barra-hitos.js';
import { Animaciones } from './animaciones.js';
import { TarjetaFichajeVista } from './tarjeta-fichaje-vista.js';
import { EstadoTarjeta } from '../services/estado-tarjeta.js';
import { TiempoFuera } from '../services/tiempo-fuera.js';
import { Calendario } from './calendario.js';
import { Historico } from './historico.js';
import { Estadisticas } from './estadisticas.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { esHtmlSeguro, montar } from '../core/html.js';
import { CicloStats } from './tarjeta-ciclo-stats.js';
import { FocoHitos } from './foco-hitos.js';
import { HoverBarra } from './hover-barra.js';
import { TarjetaEstilos } from './tarjeta-estilos.js';
import { EstiloTarjeta } from '../core/estilo-tarjeta.js';

// ====================================================================
//                     UI CLOCK-IN CARD MODULE
// ====================================================================
const {
    _renderConFirma, _conRendersSinAnimar, _rendersSinAnimarActivos, _animarFadeSwap,
    _animarMutacion, _animarConteo, _conteoEnCurso, _cancelarConteo, _durSiAnima
} = Animaciones;
const { _cantidadHoras, _cantidadHorasCorta, _modoTextoStats, _hintIntegradoActivo, _estiloPropioActivo, _descHitosEnNumero, _cicloAutoActivo } = TarjetaFichajeVista;

const { setProgressBarColor, actualizarFondoCard } = TarjetaFondos;
const {
    _formatearMinutosCorto,
    _obtenerOCrearLabelTF, _quitarLabelTF, actualizarEstadoBotonTimerMain, toggleTimerBreakMain
} = TarjetaTiempoFuera;
const {
    pegarHoraActual, limpiarCampo, toggleModoLote, ejecutarAccionRegistro, actualizarBotonLote,
    toggleFormulario, alternarFechaActual
} = TarjetaLote;
let _timerAutoVista = null;

// Al cerrar la jornada abierta de ayer, la tarjeta sigue mostrando ese registro (salida y total) antes de pasar a hoy.
// Dura lo que un ciclo completo de la salida (fase "Salida" + total); fichar de nuevo lo anula y pasa a hoy al instante.
let _retencionAyer = null;
const _RETENCION_AYER_MS = 4000;

function _cancelarRetencionAyer() {
    if (!_retencionAyer) return;
    clearTimeout(_retencionAyer.timer);
    _retencionAyer = null;
}

/** @param {string | null} id registro de ayer recién cerrado; null anula la retención */
function _retenerRegistroAyer(id) {
    _cancelarRetencionAyer();
    if (id === null) return;
    _retencionAyer = {
        id,
        timer: setTimeout(() => { _retencionAyer = null; actualizarUI(null, false, true); }, _RETENCION_AYER_MS),
    };
}

function _registroRetenidoAyer(registros, regHoy) {
    if (!_retencionAyer) return null;
    const reg = registros.find(r => r.id === _retencionAyer?.id);
    if (regHoy?.entrada || !reg?.salida) { _cancelarRetencionAyer(); return null; }
    return reg;
}

/** @param {any} [asignacionesPrecalculadas] */
function _calcularEstadoCard(asignacionesPrecalculadas = null) {
    return EstadoTarjeta.calcularEstadoCard({
        asignacionesPrecalculadas,
        resolverRetenido: _registroRetenidoAyer
    });
}

const _COLORES_BORDE = ['blue', 'green', 'red', 'purple', 'orange', 'gold', 'transparent'];

/** @param {any} [est] */
function _renderTitulo(vista, sinAnimar = false, est = null) {
    const el = $('stats-titulo');
    const aplicarExtra = () => _actualizarTiempoFueraConsolidado(el, est);
    _renderConFirma(el, vista.titulo, aplicarExtra, { forzar: sinAnimar });
}

function _actualizarTiempoFueraConsolidado(el, est) {
    if (!el) return;

    const regHoy = est?.regVigente;
    const mostrar = !!regHoy && EstadoApp.vistaActual() !== 'semana'
        && !TiempoFuera.corriendo()
        && TiposRegistro.tieneTiempoFuera(regHoy);

    if (!mostrar) { _quitarLabelTF(el); return; }

    const minutos = TiempoUtils.horaAMinutos(regHoy.tiempoFuera);
    if (!minutos) { _quitarLabelTF(el); return; }

    const label = _obtenerOCrearLabelTF(el);
    const textEl = label.querySelector('.break-counter-label-text');
    const texto = _formatearMinutosCorto(minutos);
    if (textEl) { textEl.textContent = texto; } else { label.textContent = texto; }
    label.title = 'Tiempo fuera registrado hoy';
}

// Texto del número grande del último render: lo que se restaura al salir el cursor de un tramo de la vista semanal (ver HoverBarra)
let _statsActual = '';

/**
 * Si el número grande en formato largo ("19 horas 59 minutos") no entra en una línea, pasa a la variante corta ("19h 59m"). Se mide en una copia oculta
 * para no tocar el número mientras se anima. Parte siempre del texto largo (`statsLargo`), así vuelve solo cuando vuelve a entrar (ej. al girar el celular).
 * @param {any} vista
 */
function _ajustarStatsAlAncho(vista) {
    vista.statsLargo ??= vista.stats;
    vista.stats = vista.statsLargo;
    vista.statsAjustado = false;
    const el = $('stats-semana');
    const ancho = el?.clientWidth;
    if (!vista.statsCorto || !el?.parentElement || !(ancho > 0)) return;
    const sonda = document.createElement('div');
    sonda.className = 'stats-number';
    Object.assign(sonda.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: `${ancho}px`, minHeight: '0' });
    sonda.textContent = vista.statsLargo;
    el.parentElement.appendChild(sonda);
    const entra = !superaUnaLinea(sonda, sonda.getBoundingClientRect().height);
    sonda.remove();
    if (!entra) { vista.stats = vista.statsCorto; vista.statsAjustado = true; }
}

// Último estado y vista renderizados, para reevaluar si el número entra en una línea al cambiar el ancho (rotar, redimensionar)
let _statsVista = null;
let _statsEst = null;

/** @param {any} [conteo] */
function _renderStats(vista, est, conteo = null) {
    const el = $('stats-semana');
    if (!el) return;
    _statsActual = vista.stats;

    const esDiaria = EstadoApp.vistaActual() !== 'semana';
    // En el cruce de medianoche (ayer sigue abierto y hoy aún no tiene entrada) la barra muestra los hitos de esa jornada, y el ciclo también
    const regHoy = est.regVigente;
    const esEspecial = !!est.tipoEspecialHoy;
    const entradaHoy = (esDiaria && regHoy && regHoy.entrada && !esEspecial) ? regHoy.entrada : '';
    const salidaHoy = (esDiaria && regHoy && regHoy.salida && !esEspecial) ? regHoy.salida : '';
    const tiempoFueraHoy = (esDiaria && regHoy && TiposRegistro.tieneTiempoFuera(regHoy) && !esEspecial) ? regHoy.tiempoFuera : '';

    // con el hint integrado la barra muestra los hitos: el ciclo los resalta en lugar de repetir su texto, y con la jornada abierta suma la salida estimada y, si hay banda, la salida con banco
    const linea = _hintIntegradoActivo() && esDiaria && !esEspecial ? vista.linea : null;
    const salidaEstimada = linea && !linea.cerrado ? linea.horaSalida : '';
    const salidaBanco = linea && !linea.cerrado && linea.hayBanda ? linea.horaBuffer : '';

    // variante B: el nombre del hito va en el número grande y el CSS oculta su descripción en la barra
    const nombreEnNumero = !!linea && _descHitosEnNumero();
    $('stats-card')?.classList.toggle('desc-en-numero', nombreEnNumero);
    CicloStats.actualizarDatos({ valorHoras: vista.stats, entrada: entradaHoy, salida: salidaHoy, tiempoFuera: tiempoFueraHoy, salidaEstimada, salidaBanco, hitosEnBarra: !!linea, nombreEnNumero });

    const fase = CicloStats.tomarFasePendiente();
    if (fase && _cicloAutoActivo() && CicloStats.iniciarEnFase(fase)) return;

    if (!CicloStats.activo()) {
        if (conteo) {
            _animarConteo(el, conteo.texto);
        } else if (_conteoEnCurso(el) === vista.stats) {
            return;
        } else {
            _cancelarConteo(el);
            el.textContent = vista.stats;
        }
    }
}

function _renderBarra(vista, desdeCero = false) {
    const el = $('progress-bar');
    if (!el) return;
    const card = $('stats-card');
    const punto = $('progress-punto');
    const pista = el.closest('.progress-pista');
    const esDiaria = EstadoApp.vistaActual() !== 'semana';
    const conLinea = !!(_hintIntegradoActivo() && esDiaria && vista.linea && pista);
    const conSemana = !!(_hintIntegradoActivo() && !esDiaria && vista.tramosSemana?.length && vista.anchoBarra > 0 && pista);
    pista?.classList.toggle('con-linea', conLinea || conSemana);
    pista?.classList.toggle('linea-semanal', conSemana);
    // con el hint integrado la pista reserva siempre el alto de la línea (vista diaria o semanal), así nada se corre al cambiar de vista o crear el registro
    pista?.classList.toggle('reserva-linea', _hintIntegradoActivo());
    const anchoBarra = conLinea ? BarraHitos.escalaLinea(vista.linea)(vista.linea.ahoraRel) : vista.anchoBarra;
    const dur = desdeCero && card ? _durSiAnima('--dur-conteo') : 0;
    if (dur > 1) {
        card.classList.add('conteo-inicial');
        el.style.width = '0%';
        if (punto) punto.style.left = '0%';
        void el.offsetWidth;
        TiempoUtils.esperar(dur + 100).then(() => card.classList.remove('conteo-inicial'));
    }
    el.style.width = `${anchoBarra}%`;
    // vista semanal con hint integrado: la parte llena es un degradé a cortes netos por día (el relleno de cada franja con el color de su estado, huecos transparentes)
    el.style.backgroundImage = conSemana ? BarraHitos.gradienteSemana(vista.tramosSemana, vista.anchoBarra / 100) : '';
    el.style.backgroundColor = conSemana ? 'transparent' : '';   // los tramos sin color dejan ver la pista
    if (punto) {
        punto.style.left = `${anchoBarra}%`;
        const esVisible = (vista.estadoFondo === 'en_curso' || !!vista.cerrado) && anchoBarra > 0;
        punto.classList.toggle('visible', esVisible);
        punto.classList.toggle('cerrado', !!vista.cerrado);
        // abierto: el remate toma el color del tramo donde está; cerrado: el color final del registro
        punto.dataset.color = conSemana ? vista.colorFinSemana : vista.cerrado ? (vista.colorCierre ?? vista.colorBarra) : vista.colorBarra;
        // el último tramo de la barra se degrada hacia el color del remate
        el.style.setProperty('--color-remate', `var(--c-${punto.dataset.color})`);
        el.style.setProperty('--color-barra', `var(--c-${vista.colorBarra})`);
    }
    // remate del comienzo: acompaña al del final y toma el color del primer tramo
    const inicio = $('progress-punto-inicio');
    if (inicio && punto) {
        inicio.classList.toggle('visible', punto.classList.contains('visible'));
        inicio.classList.add('cerrado'); // siempre relleno: marca el hito del comienzo
        inicio.dataset.color = conSemana ? vista.colorInicioSemana : (conLinea && !vista.cerrado ? 'blue' : vista.colorBarra);
    }
    const enProgreso = esDiaria && vista.colorBarra === 'green' && vista.estadoFondo === 'en_curso';
    setProgressBarColor(el, vista.colorBarra, vista.colorBorde, enProgreso);
    // La clase que oculta la descripción en la barra (Texto: el ciclo pone el nombre en el número grande) se quita para medir las descripciones
    // (con display:none miden 0) porque al pasar el cursor por un hito siempre se despliegan en la barra, y se vuelve a poner al terminar.
    card?.classList.remove('desc-en-numero');
    const colorTramo = BarraHitos.render({ vista, pista: /** @type {HTMLElement} */ (pista), fill: el, conLinea, conSemana });
    card?.classList.toggle('desc-en-numero', conLinea && _descHitosEnNumero());
    if (colorTramo && punto && !vista.cerrado) punto.dataset.color = colorTramo(anchoBarra);
    el.classList.toggle('con-remate', !conLinea && !conSemana && vista.estadoFondo === 'en_curso' && !!punto && punto.classList.contains('visible'));
    HoverBarra.actualizarDatos(conSemana ? { hitos: vista.hitosSemana ?? [], fin: vista.anchoBarra / 100 } : null);
}

// Último mensaje renderizado, para reevaluar si entra en una línea al cambiar el ancho (rotar, redimensionar)
let _mensajeActual = null;

// Muestra el mensaje completo y, solo si se parte en dos líneas, la variante corta. Cada render parte del texto completo,
// así que si en el minuto siguiente entra, vuelve solo; sin variante corta (o con el formato corto activo) no cambia nada.
function _renderMensaje(vista = _mensajeActual) {
    const el = $('stats-mensaje');
    if (!el || !vista) return;
    _mensajeActual = vista;
    el.classList.toggle('hidden', !vista.mostrarMensaje);
    el.textContent = vista.mensaje;
    if (!vista.mostrarMensaje || !vista.mensajeCorto || vista.mensajeCorto === vista.mensaje) return;
    if (superaUnaLinea(el, el.scrollHeight)) el.textContent = vista.mensajeCorto;
}

function _renderCard(vista) {
    const card = $('stats-card');
    if (!card) return;
    card.classList.remove(..._COLORES_BORDE.map(c => `border-${c}`));
    card.classList.add(`border-${vista.colorBorde}`);
    actualizarFondoCard(vista.estadoFondo, vista.estadoFondoColor ?? null);
}

/**
 * Estilos con diseño propio (anillo, línea de tiempo y filas): en la vista diaria #stats-estilo reemplaza al número, la barra y los textos
 * (el CSS los oculta con .estilo-propio; siguen actualizándose sin dibujar nada, así volver a otro estilo no tiene nada que reconstruir).
 * Sin resumen (p. ej. jornada de ayer ya retenida) se queda la barra de siempre.
 */

/**
 * Marca si la tarjeta usa un diseño propio (.estilo-propio oculta el número, la barra y los textos de siempre). Tiene que hacerse ANTES de dibujar la barra: si la
 * barra sigue oculta (display: none) cuando se dibuja, mide ancho cero y sus marcas quedan apiladas (pasa al volver de un estilo propio a la barra con hitos).
 * @param {any} vista
 */
function _marcarEstiloPropio(vista) {
    const propio = _estiloPropioActivo() && !!vista.resumen;
    $('stats-card')?.classList.toggle('estilo-propio', propio);
    // también el contenido: el fantasma de la animación (ver _fantasmaDe) cuelga del body y es una copia de #stats-card-content, sin el ancestro #stats-card;
    // sin la clase propia mostraría un instante la barra de siempre en vez del diseño
    $('stats-card-content')?.classList.toggle('estilo-propio', propio);
    return propio;
}

/** @param {any} vista @param {any} est @param {any} [conteo] plan del conteo inicial (ver _planConteoInicial) @param {boolean} [cargaInicial] es la carga de la página (la línea entra aunque el número no cuente) */
function _renderEstilo(vista, est, conteo = null, cargaInicial = false) {
    const propio = _marcarEstiloPropio(vista);
    // en la vista semanal la vista dibujada ya es la semana; en la diaria se deriva la semana solo si el diseño reserva su alto (ver TarjetaEstilos)
    const resumenSemana = () => (EstadoApp.vistaActual() === 'semana' ? vista : TarjetaFichajeVista.derivarVistaSemana(est)).resumen;
    // en la carga (conteo) el aro, la regla y el número crecen de cero, igual que el número y la barra de los estilos clásicos
    TarjetaEstilos.actualizar(propio ? vista.resumen : null, { conteoInicial: !!conteo, cargaInicial, duracion: _durSiAnima('--dur-conteo'), resumenSemana });
}

// Estilo con que se dibujó la tarjeta la última vez (null hasta el primer dibujo): sirve para animar el cambio de estilo y para no animar el primer dibujo
/** @type {string | null} */
let _estiloDibujado = null;

/** Alto actual de la tarjeta (de donde parte la animación del alto); 0 antes del primer dibujo, para que al cargar no se anime. */
function _alturaCard() {
    const card = $('stats-card');
    return card && _estiloDibujado !== null ? card.offsetHeight : 0;
}

/**
 * Anima el alto de la tarjeta, de `antes` al que tiene ahora con el contenido nuevo ya dibujado, igual que el colapsado de las otras tarjetas
 * (--dur-collapse, ease-out). Los diseños propios tienen alto según su contenido (el día, la semana y cada estado miden distinto) y los estilos clásicos
 * tienen el alto fijo de la barra: al pasar de uno a otro también cambia. `height: auto` no se anima: se fija el alto de partida en px, se fuerza el reflujo
 * y se pasa al de llegada; al terminar vuelve al que mande el CSS.
 * @param {number} antes
 */
function _animarAlturaCard(antes) {
    const card = $('stats-card');
    if (!card || !(antes > 0)) return;
    const dur = _durSiAnima('--dur-collapse', card);
    card.style.height = '';   // alto natural del contenido nuevo (también corta una animación anterior que siguiera en curso)
    const despues = card.offsetHeight;
    if (!(dur > 1) || Math.abs(despues - antes) < 2) return;
    // el alto de partida se fija sin transición (si no, con un alto fijo de por medio, como el de la barra, la transición arrancaría desde el alto nuevo hacia el viejo)
    card.style.transition = 'none';
    card.style.height = `${antes}px`;
    void card.offsetHeight;
    card.style.transition = '';
    card.style.height = `${despues}px`;
    const terminar = () => { card.style.height = ''; };
    card.addEventListener('transitionend', function alTerminar(e) {
        if (e.target !== card || e.propertyName !== 'height') return;
        card.removeEventListener('transitionend', alTerminar);
        terminar();
    });
    setTimeout(terminar, dur + 100);   // red de seguridad (pestaña en segundo plano: no hay transitionend)
}

function _renderHint(vista) {
    const el = $('toggle-hint');
    if (!el) return;
    if (_hintIntegradoActivo()) { el.textContent = vista.aviso || ''; return; }
    if (esHtmlSeguro(vista.hint)) montar(el, vista.hint);
    else el.textContent = vista.hint;
}

// Último estado renderizado, para reevaluar si entra en una línea al cambiar el ancho (rotar, redimensionar)
let _bufferActual = null;

function _dibujarBuffer(est, corto) {
    const el = $('stats-buffer');
    if (!el) return;
    el.replaceChildren();
    const { bufferSemanal, horasDiarias, semanaAbierta } = est;
    if (horasDiarias > 0 && Math.abs(bufferSemanal) > MARGEN_HORAS && semanaAbierta) {
        const esPositivo = bufferSemanal > 0;
        const claseColor = esPositivo ? 'positivo' : 'negativo';
        const punto = document.createElement('span');
        punto.className = `buffer-semanal-punto ${claseColor}`;
        const span = document.createElement('span');
        span.className = `buffer-semanal-texto ${claseColor}`;
        const { texto: textoBuffer, singular } = (corto ? _cantidadHorasCorta : _cantidadHoras)(Math.abs(bufferSemanal));
        const adjetivo = esPositivo ? (singular ? 'extra' : 'extras') : (singular ? 'faltante' : 'faltantes');
        span.textContent = `${textoBuffer} ${adjetivo}`;
        span.insertBefore(punto, span.firstChild);
        // " esta semana" va aparte: si ni con el tiempo abreviado entra en la misma línea, se oculta (ver #stats-buffer)
        const sufijo = document.createElement('span');
        sufijo.className = `buffer-semanal-texto buffer-semanal-sufijo ${claseColor}`;
        sufijo.textContent = 'esta semana';
        el.append(span, sufijo);
    }
}

// Muestra el tiempo completo y, solo si " esta semana" no entra en la línea, lo abrevia ("2h 48m"). Cada render parte del texto completo,
// así que si luego entra, vuelve solo.
function _renderBuffer(est = _bufferActual) {
    const el = $('stats-buffer');
    if (!el || !est) return;
    _bufferActual = est;
    _dibujarBuffer(est, false);
    if (el.scrollHeight > el.clientHeight + 1) _dibujarBuffer(est, true);
}

/** @param {() => void} renderFn */
function _animarCambioCard(renderFn) {
    const els = [
        $('stats-semana'),
        $('stats-mensaje'),
        $('stats-buffer'),
        $('toggle-hint'),
        $('stats-estilo'),
    ];

    CicloStats.detener();
    _animarMutacion(els, renderFn);
}

function _planConteoInicial(vista, est) {
    const esSemana = EstadoApp.vistaActual() === 'semana';
    if (!esSemana) {
        const reg = est.regHoy;
        if (!reg || !reg.entrada || est.tipoEspecialHoy) return null;
    }
    const valor = esSemana ? est.totalSemana : est.tiempoHoy;
    if (!(valor > 0)) return null;
    const { horas, minutos } = TiempoUtils.descomponerHorasDecimales(valor);
    const modo = vista.statsAjustado ? 'short' : _modoTextoStats();
    const texto = e => TiempoUtils.partesATexto(Math.round(horas * e), Math.round(minutos * e), modo, { horas, minutos });
    if (texto(1) !== vista.stats) return null;
    return { texto };
}

/** @param {any} [idNuevo] */
function actualizarUI(idNuevo = null, soloReloj = false, animarCard = false, sinAnimarTitulo = false, conteoInicial = false) {
    const alturaAntes = _alturaCard();   // antes de tocar nada: es de donde parte la animación del alto
    const asignacionesCompensatorio = Compensatorios.calcularAsignacionesCompensatorio();

    if (!soloReloj) Historico.actualizarListaRegistros(EstadoApp.registros(), idNuevo, asignacionesCompensatorio);

    const est = _calcularEstadoCard(asignacionesCompensatorio);
    const vista = EstadoApp.vistaActual() === 'semana'
        ? TarjetaFichajeVista.derivarVistaSemana(est)
        : TarjetaFichajeVista.derivarVistaHoy(est);
    _ajustarStatsAlAncho(vista);
    _statsVista = vista;
    _statsEst = est;

    const conteo = conteoInicial ? _planConteoInicial(vista, est) : null;

    if (!TiempoFuera.corriendo()) { _renderTitulo(vista, sinAnimarTitulo, est); }
    _renderCard(vista);
    _estiloDibujado = EstiloTarjeta.actual();
    _marcarEstiloPropio(vista);
    _renderBarra(vista, !!conteo);
    Estadisticas._renderSelectorStats();
    actualizarEstadoBotonTimerMain(sinAnimarTitulo);
    if (TarjetaLote.getModoLoteActivo()) actualizarBotonLote();
    if (Calendario.getVistaHistoricoCalendario()) {
        const selector = $('calendario-selector-meses');
        if (selector && selector.style.display !== 'none') {
            // el reloj no cierra el selector: de eso se encarga su propio temporizador de inactividad (ver calendario.js)
            if (!soloReloj && !Calendario._selectorMesesProtegido()) Calendario._cerrarSelectorMeses(idNuevo);
        } else if (!soloReloj || Calendario._dibujadoOtroDia()) {
            // lo que muestra el calendario no depende de la hora: al reloj solo le importa el cambio de día
            Calendario._renderizarCalendario(idNuevo, asignacionesCompensatorio);
        }
    }

    const debeAnimar = !_rendersSinAnimarActivos() && (animarCard || (idNuevo !== null && !soloReloj));
    const renderResto = () => {
        _renderStats(vista, est, conteo);
        _renderMensaje(vista);
        _renderHint(vista);
        _renderBuffer(est);
        _renderEstilo(vista, est, conteo, conteoInicial);
        _animarAlturaCard(alturaAntes);
    };
    if (debeAnimar) {
        _animarCambioCard(renderResto);
    } else {
        renderResto();
    }
}

/**
 * Redibuja la tarjeta fundiendo todo su contenido (se saca una copia del actual que se desvanece mientras entra el nuevo): el mismo efecto del cambio de
 * día a semana. Lo usa también el cambio de estilo de la tarjeta, para que se vea la salida del diseño anterior además de la entrada del nuevo.
 * @param {() => any} renderFn @param {() => void} [antes] se ejecuta dentro del fundido, antes de redibujar
 */
function _cambiarConFundido(renderFn, antes = undefined) {
    if (_timerAutoVista) { clearTimeout(_timerAutoVista); _timerAutoVista = null; }
    const card = $('stats-card');
    const content = $('stats-card-content');
    if (card) card.classList.add('cambiando-vista');
    return _animarFadeSwap(content, async () => {
        antes?.();
        CicloStats.detener();
        const resultado = await _conRendersSinAnimar(renderFn);
        if (card) card.classList.remove('cambiando-vista');
        return resultado;
    });
}

function _forzarVista(nuevaVista, renderFn) {
    if (EstadoApp.vistaActual() === nuevaVista) { return Promise.resolve(renderFn()); }
    return _cambiarConFundido(renderFn, () => {
        EstadoApp.setVistaActual(nuevaVista);
        Almacenamiento.setItem(STORAGE_KEYS.VISTA_ACTUAL, nuevaVista);
    });
}

function alternarVista() {
    const nuevaVista = EstadoApp.vistaActual() === 'semana' ? 'diaria' : 'semana';
    _forzarVista(nuevaVista, () => actualizarUI());
}

function bindEventos() {
    // el ciclo del número grande avisa qué fase muestra y la barra resalta su hito
    CicloStats.alCambiarFase(tipo => FocoHitos.enfocar(tipo));

    // al pasar el cursor por el tramo de un día de la vista semanal (solo escritorio) se escribe su total y su rango horario; al salir vuelve lo de siempre
    HoverBarra.conectarTextos({
        mostrar: (stats, mensaje) => {
            const num = $('stats-semana');
            if (num && stats !== null) Animaciones._animarTextoHover(num, () => { num.textContent = stats; });
            const msg = $('stats-mensaje');
            if (msg && mensaje !== null) Animaciones._animarTextoHover(msg, () => { msg.classList.remove('hidden'); msg.textContent = mensaje; });
        },
        restaurar: () => {
            const num = $('stats-semana');
            if (num && !CicloStats.activo()) Animaciones._animarTextoHover(num, () => { num.textContent = _statsActual; });
            Animaciones._animarTextoHover($('stats-mensaje'), () => _renderMensaje());
        }
    });
    HoverBarra.bindEventos();

    // Al redimensionar se vuelve a ajustar lo que depende del ancho de la tarjeta de estado
    (function () {
        if (!$('stats-card')) return;
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                BarraHitos.redibujar();
                _renderMensaje();
                _renderBuffer();
                if (_statsVista && _statsEst) { _ajustarStatsAlAncho(_statsVista); _renderStats(_statsVista, _statsEst); }
            }, 200);
        });
    })();

    $('stats-card')?.addEventListener('click', (e) => {
        const enStatsNumber = /** @type {HTMLElement} */ (e.target).closest('#stats-semana');
        if (enStatsNumber && EstadoApp.vistaActual() !== 'semana' && !CicloStats.activo() && _cicloAutoActivo()) {
            const ciclado = CicloStats.iniciar(true);
            if (ciclado) {
                e.stopPropagation();
                return;
            }
        }
        alternarVista();
    });

    alClic({
        'btn-timer-main': () => toggleTimerBreakMain(),
        'btn-agregar': () => ejecutarAccionRegistro(),
        'icon-indicator-form': () => toggleFormulario(),
    });

    alClic({
        'btn-ir-modo-lote': () => toggleModoLote(),
        'btn-pegar-entrada': () => pegarHoraActual('entrada'),
        'btn-pegar-salida': () => pegarHoraActual('salida'),
    });

    $('lote-tipo')?.addEventListener('change', () => actualizarBotonLote());
    alClic({
        'btn-ir-modo-normal': () => toggleModoLote(),
        'btn-lote-desde': () => alternarFechaActual('lote-fecha-desde'),
        'btn-lote-hasta': () => alternarFechaActual('lote-fecha-hasta'),
    });

    alClic({
        'btn-edit-entrada': () => pegarHoraActual('edit-entrada'),
        'btn-edit-salida': () => pegarHoraActual('edit-salida'),
        'btn-edit-tf': () => limpiarCampo('edit-tiempo-fuera'),
        'btn-edit-notas': () => limpiarCampo('edit-notas'),
        'btn-grupo-desde': () => alternarFechaActual('edit-grupo-desde'),
        'btn-grupo-hasta': () => alternarFechaActual('edit-grupo-hasta'),
    });
}

export const TarjetaFichaje = {
    bindEventos,
    actualizarUI,
    alternarVista,
    _forzarVista,
    _cambiarConFundido,
    setTimerAutoVista: (v) => { _timerAutoVista = v; },
    _retenerRegistroAyer,
};
