import { HistoricoEdicion } from './historico-edicion.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { $, alClic } from '../core/dom.js';
import { EventosApp } from '../core/eventos.js';
import { Movimiento } from '../core/movimiento.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { UIBase } from './base.js';
import { Calendario } from './calendario.js';
import { RespaldoLocal } from './respaldo-local.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { _scrollA } from './scroll.js';
import { Animaciones } from './animaciones.js';
import { icono, html, montar } from '../core/html.js';
import { HistoricoItems } from './historico-items.js';
import { IconosAnimados } from './iconos-animados.js';
import { EdicionRegistro } from '../services/edicion-registro.js';
import { EdicionGrupo } from '../services/edicion-grupo.js';
import { Filtros } from '../services/filtros.js';

// ====================================================================
//                     UI HISTORY MODULE
// ====================================================================
const { _actualizarOffsetsStickyMes } = UIBase;
const { _crearFantasmaSiVisible, DUR_ANIM, _aArray, _estaColapsado } = Animaciones;

const {
    cerrarEdicion, toggleBloqueoEdicion, toggleCredito, guardarEdicionGrupoDesdeFormulario,
    mostrarFiltros, toggleHistorico, iniciarTimerAutoCierreBotones, toggleBloqueoEdicionGrupo,
    cerrarEdicionGrupo
} = HistoricoEdicion;
const _guardarExpandido = (storageKeyFn, id, abierto) => Almacenamiento.setItem(storageKeyFn(id), String(abierto));

/** @param {any} [asignacionesCompensatorio] */
function crearContenedorMes(claveMes, registrosDelMes, idNuevo, mesHoy, hoy, asignacionesCompensatorio = null) {
    const grupos = TiposRegistro.agruparConsecutivos(registrosDelMes);

    const contenedorMesActual = document.createElement('div');
    contenedorMesActual.className = 'registro-mes-container';

    const headerMes = document.createElement('h3');
    headerMes.className = 'registro-mes-header';
    headerMes.dataset.mesId = claveMes;
    headerMes.dataset.accion = 'toggle-mes';
    headerMes.dataset.mesContainer = claveMes;

    const chevron = HistoricoItems.crearChevron();
    headerMes.appendChild(chevron);
    headerMes.appendChild(document.createTextNode(' ' + TiempoUtils.formatoTituloMes(claveMes)));

    const detalleMesActual = document.createElement('div');
    detalleMesActual.className = 'registro-mes-detalle collapsible';
    const innerMesActual = document.createElement('div');
    innerMesActual.className = 'detalle-inner';
    detalleMesActual.appendChild(innerMesActual);

    let debeEstarExpandido = false;
    try {
        const estadoGuardado = Almacenamiento.getItem(STORAGE_KEYS.MES_EXPANDIDO(claveMes));
        debeEstarExpandido = estadoGuardado !== null ? estadoGuardado === 'true' : claveMes === mesHoy;
    } catch (e) {
        debeEstarExpandido = claveMes === mesHoy;
    }

    if (debeEstarExpandido) {
        detalleMesActual.classList.add('expanded');
        chevron.classList.add('rotated');
    }

    // cada semana es un contenedor (como los grupos de Ajustes) con sus días adentro
    let semanaAnterior = null;
    /** @type {HTMLElement | null} */
    let contenedorSemana = null;
    grupos.forEach(grupo => {
        const esGrupo = grupo.tipo === 'grupo';
        const r = esGrupo ? grupo.registros[grupo.registros.length - 1] : grupo.registros[0];
        const semanaActual = TiempoUtils.obtenerLunesSemanaISO(r.fecha);

        if (!contenedorSemana || semanaActual !== semanaAnterior) {
            contenedorSemana = document.createElement('div');
            contenedorSemana.className = 'registro-semana';
            innerMesActual.appendChild(contenedorSemana);
        }

        contenedorSemana.appendChild(
            esGrupo
                ? HistoricoItems.crearGrupoExpandible(grupo, idNuevo, asignacionesCompensatorio)
                : HistoricoItems.crearItemRegistroIndividual(r, idNuevo, hoy, asignacionesCompensatorio)
        );
        semanaAnterior = semanaActual;
    });

    contenedorMesActual.appendChild(headerMes);
    contenedorMesActual.appendChild(detalleMesActual);
    return contenedorMesActual;
}

function _renderEmptyStateLista(lista) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    if (EstadoApp.registros().length === 0) {
        const msg = Object.assign(document.createElement('p'), { textContent: 'No hay registros' });
        const btn = Object.assign(document.createElement('button'), { className: 'btn-backup empty-state__btn-restaurar' });
        montar(btn, html`${icono('#icon-upload')} Restaurar desde archivo`);
        btn.addEventListener('click', () => RespaldoLocal.mostrarImportar(true));
        emptyDiv.appendChild(msg);
        emptyDiv.appendChild(btn);
    } else {
        emptyDiv.textContent = 'No hay registros para los filtros aplicados';
    }
    lista.appendChild(emptyDiv);
}

/** @param {any} [asignacionesCompensatorio] */
function _crearContenedorAnio(anio, mesesDelAnio, idNuevo, mesHoy, hoy, asignacionesCompensatorio = null) {
    const contenedor = document.createElement('div');
    contenedor.className = 'registro-mes-container';

    const header = Object.assign(document.createElement('h3'), { className: 'registro-mes-header' });
    Object.assign(header.dataset, { anioId: anio, accion: 'toggle-anio' });
    const chevron = HistoricoItems.crearChevron();
    header.appendChild(chevron);
    header.appendChild(document.createTextNode(' ' + anio));

    const detalle = Object.assign(document.createElement('div'), { className: 'registro-mes-detalle collapsible' });
    const innerAnio = Object.assign(document.createElement('div'), { className: 'detalle-inner' });
    detalle.appendChild(innerAnio);
    const expandido = Almacenamiento.getBoolean(STORAGE_KEYS.ANIO_EXPANDIDO(anio));
    if (expandido) { detalle.classList.add('expanded'); chevron.classList.add('rotated'); }

    mesesDelAnio.forEach((registrosDelMes, claveMes) =>
        innerAnio.appendChild(crearContenedorMes(claveMes, registrosDelMes, idNuevo, mesHoy, hoy, asignacionesCompensatorio))
    );

    contenedor.appendChild(header);
    contenedor.appendChild(detalle);
    return contenedor;
}

function _consolidarMesesAbiertos(lista, mesHoy) {
    const abiertos = Array.from(lista.querySelectorAll('.registro-mes-detalle.expanded'))
        .map(det => ({ det, header: det.closest('.registro-mes-container')?.querySelector('.registro-mes-header') }))
        .filter(o => o.header && o.header.dataset.accion === 'toggle-mes');

    if (abiertos.length <= 1) return;
    const preferido = abiertos.find(o => o.header.dataset.mesId === mesHoy)
        || abiertos.reduce((a, b) => (a.header.dataset.mesId > b.header.dataset.mesId ? a : b));

    abiertos.forEach(({ det, header }) => {
        if (det === preferido.det) return;
        det.classList.remove('expanded');
        header.querySelector('.chevron-mes')?.classList.remove('rotated');
        _guardarExpandido(STORAGE_KEYS.MES_EXPANDIDO, header.dataset.mesId, false);
    });
}

const _MAX_BLOQUES_EXPANDIDOS = 12;

function _clavesItemLista(item) {
    if (!item) return [];
    if (item.dataset.registroId) return ['r:' + item.dataset.registroId];
    if (item.dataset.accion === 'editar-grupo') {
        return (HistoricoItems.grupoDeCabecera(item)?.registros ?? []).map(id => 'r:' + id);
    }
    return [];
}

function _clavesBloqueLista(el) {
    if (el.classList.contains('registro-item')) return _clavesItemLista(el);
    if (el.dataset.mesId) return ['m:' + el.dataset.mesId];
    if (el.dataset.anioId) return ['a:' + el.dataset.anioId];
    return [];
}

function _claveContenedorLista(cont) {
    const header = cont.querySelector(':scope > .registro-mes-header');
    return header ? (_clavesBloqueLista(header)[0] || null) : null;
}

function _expandirElemento(el, dur) {
    el.style.contentVisibility = 'visible';
    el.style.overflow = 'hidden';
    const cs = getComputedStyle(el);
    const final = {
        height: cs.height,
        paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
        marginTop: cs.marginTop, marginBottom: cs.marginBottom,
        borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth
    };
    const inicial = {
        height: '0px',
        paddingTop: '0px', paddingBottom: '0px',
        marginTop: '0px', marginBottom: '0px',
        borderTopWidth: '0px', borderBottomWidth: '0px'
    };
    const limpiar = () => { el.style.contentVisibility = ''; el.style.overflow = ''; };
    const anim = el.animate([inicial, final], { duration: dur, easing: 'ease-out' });
    anim.addEventListener('finish', limpiar, { once: true });
    anim.addEventListener('cancel', limpiar, { once: true });
}

function _expandirBloquesNuevos(lista, clavesPrevias) {
    const dur = DUR_ANIM();
    const objetivos = new Set();
    lista.querySelectorAll('.registro-item.nuevo-registro-animacion').forEach(item => {
        if (_clavesItemLista(item).some(c => clavesPrevias.has(c))) return;
        let objetivo = item;
        for (let cont = item.closest('.registro-mes-container'); cont;
            cont = cont.parentElement ? cont.parentElement.closest('.registro-mes-container') : null) {
            const clave = _claveContenedorLista(cont);
            if (clave && !clavesPrevias.has(clave)) objetivo = cont;
        }
        if (_estaColapsado(objetivo)) return;
        objetivos.add(objetivo);
    });
    if (objetivos.size > _MAX_BLOQUES_EXPANDIDOS) return;
    objetivos.forEach(el => _expandirElemento(el, dur));
}

function _prepararAnimacionLista(lista, idNuevo) {
    const sinAnimacion = { reproducir() { } };
    const ids = _aArray(idNuevo);
    if (ids.length === 0 || Movimiento.reducido() || !lista.offsetParent) return sinAnimacion;

    const elementoPorId = new Map();
    lista.querySelectorAll('.registro-item').forEach(item => {
        _clavesItemLista(item).forEach(c => elementoPorId.set(c.slice(2), item));
    });

    const claves = ids.map(String);
    const existentes = claves.filter(id => elementoPorId.has(id));
    const hayNuevos = existentes.length < claves.length;

    const vistos = new Set();
    existentes.forEach(id => {
        const el = elementoPorId.get(id);
        if (vistos.has(el)) return;
        vistos.add(el);
        _crearFantasmaSiVisible(el);
    });

    let clavesPrevias = null;
    if (hayNuevos) {
        clavesPrevias = new Set();
        lista.querySelectorAll('.registro-item, .registro-mes-header').forEach(el => {
            _clavesBloqueLista(el).forEach(c => clavesPrevias.add(c));
        });
    }
    return {
        reproducir() {
            if (clavesPrevias) _expandirBloquesNuevos(lista, clavesPrevias);
        }
    };
}

// Con el calendario a la vista la lista está oculta: no se dibuja hasta que se muestre
let _listaPendiente = false;
EventosApp.on('historico:vista', () => {
    if (_listaPendiente && !Calendario.getVistaHistoricoCalendario()) actualizarListaRegistros(EstadoApp.registros());
});

/** @param {any} [idNuevo] @param {any} [asignacionesPrecalculadas] */
function actualizarListaRegistros(registros, idNuevo = null, asignacionesPrecalculadas = null) {
    if (Calendario.getVistaHistoricoCalendario()) { _listaPendiente = true; return; }
    _listaPendiente = false;
    const lista = $('lista-registros');
    const animacionLista = _prepararAnimacionLista(lista, idNuevo);
    lista.replaceChildren();

    const registrosAMostrar = Filtros.obtenerRegistrosFiltrados();
    if (registrosAMostrar.length === 0) { _renderEmptyStateLista(lista); return; }

    const hoy = TiempoUtils.obtenerFechaHoy();
    const mesHoy = TiempoUtils.claveMes(hoy);
    const anioHoy = hoy.substring(0, 4);
    const gruposPorMes = HistoricoItems.agruparRegistrosPorMes(registrosAMostrar);
    const fragmento = document.createDocumentFragment();
    const asignacionesCompensatorio = asignacionesPrecalculadas || Compensatorios.calcularAsignacionesCompensatorio();

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

    mesesAnioActual.forEach((regs, claveMes) =>
        fragmento.appendChild(crearContenedorMes(claveMes, regs, idNuevo, mesHoy, hoy, asignacionesCompensatorio))
    );
    [...mesesPorAnio.keys()].sort().reverse().forEach(anio =>
        fragmento.appendChild(_crearContenedorAnio(anio, mesesPorAnio.get(anio), idNuevo, mesHoy, hoy, asignacionesCompensatorio))
    );

    lista.appendChild(fragmento);
    _consolidarMesesAbiertos(lista, mesHoy);
    _actualizarOffsetsStickyMes();
    animacionLista.reproducir();
}

function _initListenerAccionesLista(lista) {
    lista.addEventListener('click', (e) => {
        const target = e.target.closest('[data-accion]');
        if (!target) return;
        if (target.dataset.accion === 'editar-registro') {
            const id = target.dataset.registroId;
            if (id) EdicionRegistro.editar(id);
        } else if (target.dataset.accion === 'editar-grupo') {
            const grupoData = HistoricoItems.grupoDeCabecera(target);
            if (!grupoData) return;
            const registrosCompletos = EstadoApp.registros().filter(r => grupoData.registros.includes(r.id));
            EdicionGrupo.editarGrupo({ registros: registrosCompletos, subtipo: grupoData.subtipo });
        }
    });
}

function _initListenerToggleAnio(lista) {
    lista.addEventListener('click', (e) => {
        const headerAnio = e.target.closest('.registro-mes-header[data-accion="toggle-anio"]');
        if (!headerAnio) return;
        e.stopPropagation();
        const contenedorAnio = headerAnio.closest('.registro-mes-container');
        if (!contenedorAnio) return;
        const detalleAnio = contenedorAnio.querySelector(':scope > .registro-mes-detalle');
        const chevronAnio = headerAnio.querySelector('.chevron-mes');
        const anioId = headerAnio.dataset.anioId;
        const abierto = detalleAnio.classList.toggle('expanded');
        if (chevronAnio) chevronAnio.classList.toggle('rotated', abierto);
        _guardarExpandido(STORAGE_KEYS.ANIO_EXPANDIDO, anioId, abierto);
    });
}

function _scrollAlExpandir(contenedor, detalle) {
    setTimeout(() => {
        const margenHeader = 80;
        const alturaVentana = window.innerHeight;
        const registros = detalle.querySelectorAll('.registro-item');
        if (!registros.length) return;
        const r0 = registros[0].getBoundingClientRect();
        const r1 = registros.length > 1 ? registros[1].getBoundingClientRect() : null;
        const cortado0 = r0.top < margenHeader || r0.bottom > alturaVentana;
        const cortado1 = r1 && (r1.top < margenHeader || r1.bottom > alturaVentana);
        if (cortado0 || cortado1) _scrollA(contenedor, 'start');
    }, 310);
}

function _initListenerToggleMes(lista) {
    lista.addEventListener('click', (e) => {
        const header = e.target.closest('.registro-mes-header');
        if (!header || header.dataset.accion !== 'toggle-mes') return;
        e.stopPropagation();
        const contenedor = header.closest('.registro-mes-container');
        if (!contenedor) return;
        const detalle = contenedor.querySelector('.registro-mes-detalle');
        const chevronIcon = header.querySelector('.chevron-mes');

        if (detalle.classList.contains('expanded')) {
            detalle.classList.remove('expanded');
            chevronIcon.classList.remove('rotated');
            _guardarExpandido(STORAGE_KEYS.MES_EXPANDIDO, header.dataset.mesId, false);
            return;
        }

        const esContenedorAnio = (el) => {
            const h = el.closest('.registro-mes-container')?.querySelector('.registro-mes-header');
            return h && h.dataset.accion === 'toggle-anio';
        };
        const detalleAnioPadre = contenedor.parentElement?.closest('.registro-mes-detalle') || null;
        const otrosMesesAbiertos = lista.querySelectorAll('.registro-mes-detalle.expanded');

        const _colapsarContenedor = (otro, { datasetKey, storageKeyFn }) => {
            otro.classList.remove('expanded');
            const oc = otro.closest('.registro-mes-container');
            const och = oc?.querySelector('.chevron-mes');
            const oHeader = oc?.querySelector('.registro-mes-header');
            if (och) och.classList.remove('rotated');
            const id = oHeader?.dataset[datasetKey];
            if (id) _guardarExpandido(storageKeyFn, id, false);
        };

        otrosMesesAbiertos.forEach(otro => {
            if (!esContenedorAnio(otro) || otro === detalleAnioPadre) return;
            _colapsarContenedor(otro, { datasetKey: 'anioId', storageKeyFn: STORAGE_KEYS.ANIO_EXPANDIDO });
        });

        const _abrirDetalle = () => {
            detalle.classList.add('expanded');
            chevronIcon.classList.add('rotated');
            _guardarExpandido(STORAGE_KEYS.MES_EXPANDIDO, header.dataset.mesId, true);
            _scrollAlExpandir(contenedor, detalle);
        };

        const hayOtrosAbiertos = Array.from(otrosMesesAbiertos).some(o => o !== detalle && !esContenedorAnio(o));
        if (hayOtrosAbiertos) {
            otrosMesesAbiertos.forEach(otro => {
                if (otro === detalle || esContenedorAnio(otro)) return;
                _colapsarContenedor(otro, { datasetKey: 'mesId', storageKeyFn: STORAGE_KEYS.MES_EXPANDIDO });
            });
        }
        _abrirDetalle();
    });
}

function bindEventos() {
    document.querySelector('#card-historico .card-header-clickable')?.addEventListener('click', () => toggleHistorico());
    $('btn-vista-calendario')?.addEventListener('click', () => {
        iniciarTimerAutoCierreBotones();
        Calendario.toggleVistaHistorico();
    });
    alClic({
        'btn-filtro': (e) => mostrarFiltros(e),
        'btn-undo': () => { IconosAnimados.girarIcono($('btn-undo'), -1); GestionDatos.undoAction(); },
        'btn-redo': () => { IconosAnimados.girarIcono($('btn-redo'), 1); GestionDatos.redoAction(); },
    });

    alClic({
        'btn-toggle-credito': () => toggleCredito(),
        'btn-lock-toggle': () => toggleBloqueoEdicion(),
        'btn-edit-referencia-compensatorio': () => EdicionRegistro.pegarReferencia(),
    });
    document.querySelector('#modal-editar .btn-edit')?.addEventListener('click', () => EdicionRegistro.guardar());
    document.querySelector('#modal-editar .btn-delete')?.addEventListener('click', () => EdicionRegistro.eliminar());
    document.querySelector('#modal-editar .btn-cancel')?.addEventListener('click', () => cerrarEdicion());

    $('btn-lock-grupo-toggle')?.addEventListener('click', () => toggleBloqueoEdicionGrupo());
    document.querySelector('#modal-editar-grupo .btn-edit')?.addEventListener('click', () => guardarEdicionGrupoDesdeFormulario());
    document.querySelector('#modal-editar-grupo .btn-delete')?.addEventListener('click', () => EdicionGrupo.eliminarGrupoActual());
    document.querySelector('#modal-editar-grupo .btn-cancel')?.addEventListener('click', () => cerrarEdicionGrupo());

}

export const Historico = {
    bindEventos,
    actualizarListaRegistros,
    _initListenerAccionesLista,
    _initListenerToggleAnio,
    _initListenerToggleMes
};
