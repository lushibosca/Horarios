import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { UIBase } from './base.js';
import { EstadoApp } from '../services/estado-app.js';
import { FiltrosYPeriodos } from '../services/filtros-periodos.js';
import { resetearBoton, setIconoBtn, cancelarExitoFichaje, animarExitoFichaje, obtenerIconoBtn } from './boton-fichar.js';
import { _scrollHastaVisible } from './scroll.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
//           UI CARD BATCH / FORM & INPUT HELPERS MODULE
// ====================================================================
const { _flashCampo, _avisarFichaje, toggleSeccionGen, _crearOpcion, aplicarFeedbackCampos } = UIBase;
const { _animarFadeSwap, _animarSlideElemento, _esperarAnim, _animarValor, _durSiAnima } = Animaciones;
const actualizarEstadoBotonTimerMain = (...args) => EstadoApp._notify().actualizarEstadoBotonTimerMain(...args);

let modoLoteActivo = false;
let _pintandoSinAnimar = false;

function _alternarValorCampo(id, obtenerValor) {
    const input = $(id);
    if (!input) return null;
    input.value = input.value.trim() !== '' ? '' : obtenerValor();
    return input;
}

function pegarHoraActual(id) {
    _alternarValorCampo(id, TiempoUtils.obtenerHoraActual)?.dispatchEvent(new Event('input'));
}

function limpiarCampo(id) {
    const input = $(id);
    if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
    }
}

function toggleModoLote(deltaSwipe, conAnimacion = true) {
    const modoContenedor = $('modo-contenedor');
    const modoNormal = $('modo-normal');
    const modoLote = $('modo-lote');
    const btnTimer = $('btn-timer-main');
    const btn = $('btn-agregar');

    modoLoteActivo = !modoLoteActivo;
    const delta = deltaSwipe !== undefined ? deltaSwipe : (modoLoteActivo ? 1 : -1);

    const aplicarCambiosLote = () => {
        modoNormal.style.display = 'none';
        modoLote.style.display = 'block';

        $('lote-tipo').value = 'feriado';
        $('lote-fecha-desde').value = '';
        $('lote-fecha-hasta').value = '';

        btnTimer.disabled = true;

        _animarFadeSwap(btn, () => {
            btn.classList.remove('btn-color-muted', 'btn-color-red');
            cancelarExitoFichaje(btn);
            setIconoBtn(btn, '#icon-calendar-simple');
            _pintandoSinAnimar = true;
            try { actualizarBotonLote(); } finally { _pintandoSinAnimar = false; }
        });
    };

    const aplicarCambiosNormal = () => {
        modoLote.style.display = 'none';
        modoNormal.style.display = 'block';
        _animarFadeSwap(btn, () => {
            cancelarExitoFichaje(btn);
            resetearBoton(btn);
        });
        actualizarEstadoBotonTimerMain();
    };

    if (conAnimacion) {
        _animarSlideElemento(modoContenedor, delta, modoLoteActivo ? aplicarCambiosLote : aplicarCambiosNormal);
    } else {
        modoLoteActivo ? aplicarCambiosLote() : aplicarCambiosNormal();
    }
}

async function ejecutarAccionRegistro() {
    if (modoLoteActivo) {
        await registrarLoteDesdeCard();
    } else {
        await GestionDatos.agregarRegistro();
    }
}

function _limpiarCamposLote() {
    $('lote-fecha-desde').value = '';
    $('lote-fecha-hasta').value = '';
}

async function _registrarEspecial(fecha, tipo, mensajeDuplicado, alExito) {
    if (EstadoApp.existeRegistroEnFecha(fecha)) {
        _avisarFichaje(mensajeDuplicado, 'warning'); return;
    }
    try {
        await FiltrosYPeriodos.registrarDiaEspecial(fecha, tipo);
        alExito?.();
        _limpiarCamposLote();
        actualizarBotonLote();
        animarExitoFichaje($('btn-agregar'));
    } catch (e) { console.error('Error al registrar:', e); }
}

async function registrarLoteDesdeCard() {
    const inputDesde = $('lote-fecha-desde');
    const inputHasta = $('lote-fecha-hasta');
    const tipo = $('lote-tipo').value;

    if ((inputDesde.value === '' && inputDesde.validity && !inputDesde.validity.valid) ||
        (inputHasta.value === '' && inputHasta.validity && !inputHasta.validity.valid)) {
        _avisarFichaje('Fecha inválida'); return;
    }

    const desde = inputDesde.value;
    const hasta = inputHasta.value;

    if (!desde && !hasta) {
        if (!inputDesde.checkValidity() || !inputHasta.checkValidity()) {
            _avisarFichaje('Revisá las fechas ingresadas'); return;
        }
        if (tipo === 'normal') { _avisarFichaje('Completá ambos campos', 'info'); return; }
        await _registrarEspecial(TiempoUtils.obtenerFechaHoy(), tipo, 'Ya existe un registro para hoy'); return;
    }

    if (desde && !hasta) {
        if (tipo === 'normal') { _avisarFichaje('Completá ambos campos', 'info'); return; }
        await _registrarEspecial(desde, tipo, 'Ya existe un registro para esa fecha', () => aplicarFeedbackCampos([
            { id: 'lote-fecha-desde', fallback: 'Desde', mostrar: true },
            { id: 'lote-fecha-hasta', fallback: 'Hasta', mostrar: false }
        ])); return;
    }

    if (!desde && hasta) { _avisarFichaje('Completá ambos campos', 'info'); return; }
    if (desde > hasta) { _avisarFichaje('La fecha inicial debe ser inferior a la final'); return; }

    if (tipo !== 'normal' && !TiposRegistro.obtenerCodigosPorTipo(tipo)) {
        _avisarFichaje('Tipo de registro inválido'); return;
    }

    try {
        if (tipo === 'normal') await FiltrosYPeriodos.borrarPeriodoDirecto(desde, hasta);
        else await FiltrosYPeriodos.registrarVacacionesDirecto(desde, hasta, tipo);
        aplicarFeedbackCampos(
            [
                { id: 'lote-fecha-desde', fallback: 'Desde', mostrar: true },
                { id: 'lote-fecha-hasta', fallback: 'Hasta', mostrar: true }
            ],
            tipo === 'normal' ? '✓ Borrado' : '✓ Agregado',
            tipo === 'normal' ? 'label-feedback--red' : 'label-feedback--green'
        );
        _limpiarCamposLote();
        actualizarBotonLote();
        animarExitoFichaje($('btn-agregar'));
    } catch (e) { console.error('Error en operación de lote:', e); }
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

// Ícono por defecto del botón en modo lote: escoba al borrar jornadas, calendario en el resto
const _iconoLoteDefecto = () => ($('lote-tipo')?.value === 'normal' ? '#icon-broom' : '#icon-calendar-simple');

const _CLASES_COLOR_LOTE = ['btn-color-muted', 'btn-color-red'];

// "Fichar (3 - 1)" → { base: 'Fichar', cont: '3 - 1' }; sin paréntesis → cont: null
const _partesTexto = t => {
    const m = /^(.*?)\s*\((.*)\)$/.exec(t);
    return m ? { base: m[1], cont: m[2] } : { base: t, cont: null };
};

// Dibuja el texto separando el contador (textContent sigue dando el texto completo)
function _renderTextoLote(el, texto) {
    const { base, cont } = _partesTexto(texto);
    el.textContent = base;
    if (cont !== null) {
        const c = document.createElement('span');
        const n = document.createElement('span');
        c.className = 'btn-cont';
        n.className = 'btn-num';
        n.textContent = cont;
        c.append('(', n, ')');
        el.append(' ', c);
    }
    el.dataset.texto = texto;
}

const _ANIM_CONT_OPTS = dur => ({ duration: dur, easing: 'ease-out', fill: 'both' });

function _entrarContador(el) {
    const dur = _durSiAnima('--dur-valor', el);
    const c = el.querySelector('.btn-cont');
    if (dur && c) c.animate([{ opacity: 0, transform: 'translateY(40%)' }, { opacity: 1, transform: 'translateY(0)' }], _ANIM_CONT_OPTS(dur));
}

function _salirContador(el, texto) {
    const dur = _durSiAnima('--dur-valor', el);
    const c = el.querySelector('.btn-cont');
    if (!dur || !c) { _renderTextoLote(el, texto); return; }
    c.classList.add('btn-cont--sale');
    c.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-40%)' }], _ANIM_CONT_OPTS(dur));
    el.dataset.texto = texto;
    setTimeout(() => { if (c.isConnected) c.remove(); }, dur);
}

// Cambia texto/ícono/color del botón en modo lote con animación:
// - solo cambia el valor del contador ("Fichar (3)" → "Fichar (5)"): se desplaza solo el número
// - aparece o desaparece el contador: entra/sale solo el contador
// - cambia el texto o el estado (ícono/color): cross-fade del botón
// - sin cambios: no hace nada, así no parpadea mientras se escribe en los campos
function _pintarBotonLote(btn, btnTexto, texto, claseColor = '', icono = _iconoLoteDefecto()) {
    const aplicarEstilo = () => {
        btn.classList.remove(..._CLASES_COLOR_LOTE);
        if (claseColor) btn.classList.add(claseColor);
        setIconoBtn(btn, icono);
    };
    const textoActual = btnTexto.dataset.texto ?? btnTexto.textContent;
    const mismoEstilo = (_CLASES_COLOR_LOTE.find(c => btn.classList.contains(c)) || '') === claseColor
        && obtenerIconoBtn(btn) === icono;

    if (texto === textoActual && mismoEstilo) return;
    btnTexto.querySelectorAll('.btn-cont--sale').forEach(n => n.remove());

    if (_pintandoSinAnimar) { _renderTextoLote(btnTexto, texto); aplicarEstilo(); return; }

    const antes = _partesTexto(textoActual), ahora = _partesTexto(texto);
    if (mismoEstilo && antes.base === ahora.base) {
        if (antes.cont !== null && ahora.cont !== null) {
            const num = btnTexto.querySelector('.btn-num');
            if (num) {
                btnTexto.dataset.texto = texto;
                _animarValor(num, ahora.cont, Math.sign((parseInt(ahora.cont, 10) || 0) - (parseInt(antes.cont, 10) || 0)) || 1);
                return;
            }
        } else if (antes.cont !== null) { _salirContador(btnTexto, texto); return; }
        else if (ahora.cont !== null) { _renderTextoLote(btnTexto, texto); _entrarContador(btnTexto); return; }
    }
    _animarFadeSwap(btn, () => { _renderTextoLote(btnTexto, texto); aplicarEstilo(); });
}

function _setBtnError(btn, btnTexto, mensaje) {
    _pintarBotonLote(btn, btnTexto, mensaje, 'btn-color-muted');
}

function _actualizarBtnNormal(btn, btnTexto, desde, hasta) {
    const n = EstadoApp.registros().filter(r =>
        r.fecha >= desde && r.fecha <= hasta && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)
    ).length;
    n > 0
        ? _pintarBotonLote(btn, btnTexto, `Borrar (${n})`, 'btn-color-red', '#icon-trash')
        : _pintarBotonLote(btn, btnTexto, 'Sin Registros', 'btn-color-muted');
}

function _actualizarBtnEspecial(btn, btnTexto, desde, hasta, tipo, diasTotales) {
    const codigosTipo = TiposRegistro.obtenerCodigosPorTipo(tipo);
    if (!codigosTipo) return _pintarBotonLote(btn, btnTexto, 'Fichar');

    const yaRegistrados = EstadoApp.registros().filter(r =>
        r.fecha >= desde && r.fecha <= hasta &&
        r.entrada === codigosTipo.entrada && r.salida === codigosTipo.salida
    ).length;
    const diasOcupados = EstadoApp.registros().filter(r => r.fecha >= desde && r.fecha <= hasta).length;
    const disponibles = diasTotales - diasOcupados;
    const sobreescribirOtros = diasOcupados - yaRegistrados;

    if (disponibles === 0 && yaRegistrados === diasTotales) return _pintarBotonLote(btn, btnTexto, `Fichado (${diasTotales})`, 'btn-color-muted');
    if (disponibles === diasTotales) return _pintarBotonLote(btn, btnTexto, `Fichar (${diasTotales})`);
    if (sobreescribirOtros > 0) return _pintarBotonLote(btn, btnTexto, `Fichar (${disponibles} - ${sobreescribirOtros})`);
    return _pintarBotonLote(btn, btnTexto, `Fichar (${disponibles})`);
}

function actualizarBotonLote() {
    const tipo = $('lote-tipo').value;
    const desde = $('lote-fecha-desde').value;
    const hasta = $('lote-fecha-hasta').value;
    const btn = $('btn-agregar');
    const btnTexto = $('btn-registrar-texto');

    if (!desde && !hasta) {
        if (tipo === 'normal') return _setBtnError(btn, btnTexto, 'Completar rango');

        const hoy = TiempoUtils.obtenerFechaHoy();
        const existeHoy = EstadoApp.existeRegistroEnFecha(hoy);
        return existeHoy
            ? _pintarBotonLote(btn, btnTexto, 'Fichado', 'btn-color-muted')
            : _pintarBotonLote(btn, btnTexto, 'Fichar');
    }

    if (!desde && hasta) return _setBtnError(btn, btnTexto, 'Rango incompleto');
    if (!TiempoUtils.validarFecha(desde)) return _setBtnError(btn, btnTexto, 'Fecha Inicial Inválida');
    if (desde && !hasta) {
        if (tipo === 'normal') return _setBtnError(btn, btnTexto, 'Rango incompleto');
        const existe = EstadoApp.existeRegistroEnFecha(desde);
        return existe
            ? _pintarBotonLote(btn, btnTexto, 'Fichado', 'btn-color-muted')
            : _pintarBotonLote(btn, btnTexto, 'Fichar');
    }

    if (!TiempoUtils.validarFecha(hasta)) return _setBtnError(btn, btnTexto, 'Fecha Final Inválida');
    if (desde > hasta) return _setBtnError(btn, btnTexto, 'Rango Inválido');

    const diasTotales = Math.ceil(Math.abs(TiempoUtils.parsearFechaLocal(hasta).getTime() - TiempoUtils.parsearFechaLocal(desde).getTime()) / 864e5) + 1;

    return tipo === 'normal'
        ? _actualizarBtnNormal(btn, btnTexto, desde, hasta)
        : _actualizarBtnEspecial(btn, btnTexto, desde, hasta, tipo, diasTotales);
}

function toggleFormulario() {
    const el = $('form-registro');
    const estabaExpandido = el.classList.contains('expanded');

    toggleSeccionGen('form-registro', 'icon-indicator-form', STORAGE_KEYS.FORMULARIO_EXPANDIDO);

    if (estabaExpandido) {
        $('entrada').value = '';
        $('salida').value = '';
        $('fecha').value = TiempoUtils.obtenerFechaHoy();

        const loteDesde = $('lote-fecha-desde');
        const loteHasta = $('lote-fecha-hasta');
        const loteTipo = $('lote-tipo');

        if (loteDesde) loteDesde.value = '';
        if (loteHasta) loteHasta.value = '';
        if (loteTipo) loteTipo.value = 'feriado';

        if (modoLoteActivo) {
            setTimeout(() => {
                if (modoLoteActivo) {
                    toggleModoLote(undefined, false);
                }
            }, 350);
        } else {
            actualizarEstadoBotonTimerMain();
        }
    }
}

async function _irAFicharConFecha(fecha, esEspecial) {
    const formulario = $('form-registro');
    const estabaExpandido = !!(formulario && formulario.classList.contains('expanded'));

    if (!estabaExpandido) toggleFormulario();

    const scrollTerminado = _scrollACardFichar($('card-registrar'));

    if (!estabaExpandido) await _esperarAnim(80);

    if (!!esEspecial !== modoLoteActivo) {
        toggleModoLote();
        await _esperarAnim();
    }

    if (esEspecial) {
        const desde = $('lote-fecha-desde');
        const hasta = $('lote-fecha-hasta');
        if (desde) desde.value = fecha;
        if (hasta) hasta.value = fecha;
        actualizarBotonLote();
    } else {
        const input = $('fecha');
        if (input) input.value = fecha;
    }

    await scrollTerminado;
    if (esEspecial) _flashCampo('lote-fecha-desde', 'lote-fecha-hasta', 'lote-tipo');
    else _flashCampo('fecha', 'entrada', 'salida');
}

function _scrollACardFichar(el) {
    const headerEl = /** @type {HTMLElement} */ (document.querySelector('.header'));
    const margen = (headerEl ? headerEl.offsetHeight : 0) + 8;
    return _scrollHastaVisible(el, { margenSuperior: margen });
}

function alternarFechaActual(id) {
    const c = _alternarValorCampo(id, TiempoUtils.obtenerFechaHoy);
    if (!c) return;

    actualizarBotonLote();
    if (id === 'edit-grupo-desde' || id === 'edit-grupo-hasta') {
        c.dispatchEvent(new Event('change'));
    }
}

export const TarjetaLote = {
    getModoLoteActivo: () => modoLoteActivo,
    pegarHoraActual,
    limpiarCampo,
    toggleModoLote,
    ejecutarAccionRegistro,
    registrarLoteDesdeCard,
    poblarSelectoresTipos,
    actualizarBotonLote,
    toggleFormulario,
    _irAFicharConFecha,
    _scrollACardFichar,
    alternarFechaActual
};
