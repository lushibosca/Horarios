import { HistoricoEdicion } from './historico-edicion.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { Movimiento } from '../core/movimiento.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { SaldoSemanal } from '../services/saldo-semanal.js';
import { UIBase } from './base.js';
import { Calendario } from './calendario.js';
import { RespaldoLocal } from './respaldo-local.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { FiltrosYPeriodos } from '../services/filtros-periodos.js';
import { _scrollA } from './scroll.js';
import { Animaciones } from './animaciones.js';
import { icono } from '../core/html.js';

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

function _crearIconoSvg(href, clase) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `icon ${clase}`);
    svg.setAttribute('viewBox', '0 0 24 24');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', href);
    svg.appendChild(use);
    return svg;
}

const _crearChevron = () => _crearIconoSvg('#icon-chevron-down', 'chevron-mes chevron-mes-icon');

/** @param {{ fechaText?: any, horasText?: any, totalText?: any, totalClase?: string, badgesExtra?: { texto: any, clase: string }[], comentarioText?: any }} datos */
function _crearInfoRegistro({ fechaText, horasText, totalText, totalClase = '', badgesExtra = [], comentarioText = '' }) {
    const info = document.createElement('div');
    info.className = 'registro-info';

    const fechaEl = document.createElement('div');
    fechaEl.className = 'registro-fecha';

    const fechaTextoEl = document.createElement('span');
    fechaTextoEl.className = 'registro-fecha-texto';
    fechaTextoEl.textContent = fechaText;
    fechaEl.appendChild(fechaTextoEl);

    if (comentarioText) {
        const comEl = document.createElement('span');
        comEl.className = 'registro-comentario';
        comEl.title = `Comentario: ${comentarioText}`;

        const txt = document.createElement('span');
        txt.className = 'registro-comentario-texto';
        txt.textContent = comentarioText;

        comEl.appendChild(_crearIconoSvg('#icon-comment', 'icon-comentario'));
        comEl.appendChild(txt);
        fechaEl.appendChild(comEl);
    }

    const horasEl = document.createElement('div');
    horasEl.className = 'registro-horas';
    horasEl.textContent = horasText;

    const totalEl = document.createElement('div');
    totalEl.className = totalClase ? `registro-total ${totalClase}` : 'registro-total';
    totalEl.textContent = totalText;

    const badgesEl = document.createElement('div');
    badgesEl.className = 'registro-badges';
    badgesEl.appendChild(totalEl);
    badgesExtra.forEach(({ texto, clase }) => {
        const badgeEl = document.createElement('div');
        badgeEl.className = `registro-total ${clase}`;
        badgeEl.textContent = texto;
        badgesEl.appendChild(badgeEl);
    });

    info.appendChild(fechaEl);
    info.appendChild(horasEl);
    info.appendChild(badgesEl);
    return info;
}

/** @param {any} [idResaltar] @param {any} [asignacionesCompensatorio] */
function crearItemRegistroIndividual(r, idResaltar = null, hoy = TiempoUtils.obtenerFechaHoy(), asignacionesCompensatorio = null) {
    const item = document.createElement('div');

    let className = r.fecha === hoy ? 'registro-item hoy' : 'registro-item';
    const idsResaltar = _aArray(idResaltar);
    const esNuevo = idsResaltar.includes(r.id);
    if (esNuevo) {
        className += ' nuevo-registro-animacion';
        item.addEventListener('animationend', () => item.classList.remove('nuevo-registro-animacion'), { once: true });
    }
    item.className = className;
    item.dataset.registroId = r.id;
    item.dataset.accion = 'editar-registro';

    const est = SaldoSemanal.estadoDeRegistro(r, asignacionesCompensatorio);
    const tipoEspecial = est.tipo;

    const etiqueta = tipoEspecial ? ` ${tipoEspecial.emoji} (${tipoEspecial.label})` : '';
    const fechaText = `${TiempoUtils.obtenerNombreDia(r.fecha)} ${r.fecha.substring(8)}${etiqueta}`;

    const tfText = (() => {
        if (!r.tiempoFuera || r.tiempoFuera === '' || r.tiempoFuera === '00:00') return '';
        const tfStr = TiempoUtils.horasATexto(TiempoUtils.horaAMinutos(r.tiempoFuera) / 60, 'short');
        return ` (${tfStr} Fuera)`;
    })();
    const crText = r.credito && r.credito !== '00:00' ? ' (Salida Temprana)' : '';
    const horasText = tipoEspecial
        ? tipoEspecial.descripcion
        : `${r.entrada || '-'} → ${r.salida || '-'}${tfText}${crText}`;

    let totalText, totalClase = '';
    if (tipoEspecial) {
        totalText = 'Justificado';
        totalClase = `${tipoEspecial.color}-text`;
    } else if (est.estado === 'en-curso') {
        totalText = r.fecha === hoy ? 'En curso . . .' : 'Incompleto';
        totalClase = 'blue-text';
    } else if (est.estado === 'sin-datos') {
        totalText = 'Sin datos';
    } else {
        totalText = TiempoUtils.horasATexto(r.total, 'short') + (est.diffText ? ` (${est.diffText})` : '');
        totalClase = { cumplido: 'green-text', cubierto: 'gold-text', incompleto: 'red-text', neutro: 'neutro-text' }[est.estado] || '';
    }

    /** @type {{ texto: any, clase: string }[]} */
    const badgesExtra = [];
    if (est.estado === 'cubierto') badgesExtra.push({ texto: 'Cubierto', clase: 'gold-text' });
    if (tipoEspecial?.id === 'compensatorio') {
        badgesExtra.push(est.fechaCompensada
            ? { texto: TiempoUtils.fechaCorta(est.fechaCompensada), clase: `${tipoEspecial.color}-text` }
            : { texto: '⚠ Sin referencia', clase: 'red-text' });
    }
    if (est.fechaCompensado) badgesExtra.push({ texto: `→ ${TiempoUtils.fechaCorta(est.fechaCompensado)}`, clase: 'purple-text' });

    item.appendChild(_crearInfoRegistro({
        fechaText,
        horasText,
        totalText,
        totalClase,
        badgesExtra,
        comentarioText: r.notas
    }));

    return item;
}

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

    const chevron = _crearChevron();
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

    let semanaAnterior = null;
    grupos.forEach(grupo => {
        const esGrupo = grupo.tipo === 'grupo';
        const r = esGrupo ? grupo.registros[grupo.registros.length - 1] : grupo.registros[0];
        const semanaActual = TiempoUtils.obtenerLunesSemanaISO(r.fecha);

        if (semanaAnterior && semanaActual !== semanaAnterior) {
            const sep = document.createElement('div');
            sep.className = 'separador-semana';
            innerMesActual.appendChild(sep);
        }

        innerMesActual.appendChild(
            esGrupo
                ? crearGrupoExpandible(grupo, idNuevo, asignacionesCompensatorio)
                : crearItemRegistroIndividual(r, idNuevo, hoy, asignacionesCompensatorio)
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
        const btn = Object.assign(document.createElement('button'), {
            className: 'btn-backup empty-state__btn-restaurar',
            innerHTML: `${icono('#icon-upload')} Restaurar desde archivo`
        });
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
    const chevron = _crearChevron();
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

// Datos de cada cabecera de grupo, sin pasar por el DOM (se libera junto con el elemento)
const _grupoPorCabecera = new WeakMap();

function _clavesItemLista(item) {
    if (!item) return [];
    if (item.dataset.registroId) return ['r:' + item.dataset.registroId];
    if (item.dataset.accion === 'editar-grupo') {
        return (_grupoPorCabecera.get(item)?.registros ?? []).map(id => 'r:' + id);
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

/** @param {any} [idNuevo] @param {any} [asignacionesPrecalculadas] */
function actualizarListaRegistros(registros, idNuevo = null, asignacionesPrecalculadas = null) {
    const lista = $('lista-registros');
    const animacionLista = _prepararAnimacionLista(lista, idNuevo);
    lista.innerHTML = '';

    const registrosAMostrar = FiltrosYPeriodos.obtenerRegistrosFiltrados();
    if (registrosAMostrar.length === 0) { _renderEmptyStateLista(lista); return; }

    const hoy = TiempoUtils.obtenerFechaHoy();
    const mesHoy = hoy.substring(0, 7);
    const anioHoy = hoy.substring(0, 4);
    const gruposPorMes = agruparRegistrosPorMes(registrosAMostrar);
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

/** @param {any} [idResaltar] @param {any} [asignacionesCompensatorio] */
function crearGrupoExpandible(grupo, idResaltar = null, asignacionesCompensatorio = null) {
    const primerReg = grupo.registros[0];
    const ultimoReg = grupo.registros[grupo.registros.length - 1];

    const container = document.createElement('div');
    container.className = 'registro-grupo-container';

    const header = document.createElement('div');

    let className = 'registro-item';
    let animarGrupo = false;

    if (idResaltar) {
        const idsNuevos = _aArray(idResaltar);
        const contieneNuevo = grupo.registros.some(r => idsNuevos.includes(r.id));
        if (contieneNuevo) {
            animarGrupo = true;
        }
    }

    if (animarGrupo) {
        className += ' nuevo-registro-animacion';
        header.addEventListener('animationend', () => header.classList.remove('nuevo-registro-animacion'), { once: true });
    }
    header.className = className;

    const tipoConfig = TiposRegistro.obtenerTipoPorId(grupo.subtipo);
    const emoji = tipoConfig ? tipoConfig.emoji : '📅';
    const label = tipoConfig ? tipoConfig.labelPlural : 'Registros';
    const fechaText = `${emoji} ${label} (${grupo.registros.length} días)`;

    const horasText = `${ultimoReg.fecha.substring(8)} al ${primerReg.fecha.substring(8)}`;

    const colorClase = tipoConfig ? `${tipoConfig.color}-text` : 'purple-text';

    /** @type {{ texto: any, clase: string }[]} */
    const badgesExtra = [];
    if (tipoConfig?.id === 'compensatorio') {
        const fechasCompensadas = [...new Set(grupo.registros.map(r => Compensatorios.fechaCompensadaPorRegistro(r, asignacionesCompensatorio)).filter(Boolean))];
        if (fechasCompensadas.length === 1) {
            badgesExtra.push({ texto: TiempoUtils.fechaCorta(fechasCompensadas[0]), clase: colorClase });
        }
    }

    header.appendChild(_crearInfoRegistro({
        fechaText,
        horasText,
        totalText: 'Justificado',
        totalClase: colorClase,
        badgesExtra,
        comentarioText: TiposRegistro.notaDeGrupo(grupo)
    }));

    header.dataset.accion = 'editar-grupo';
    _grupoPorCabecera.set(header, { registros: grupo.registros.map(r => r.id), subtipo: grupo.subtipo });

    container.appendChild(header);
    return container;
}


function _initListenerAccionesLista(lista) {
    lista.addEventListener('click', (e) => {
        const target = e.target.closest('[data-accion]');
        if (!target) return;
        if (target.dataset.accion === 'editar-registro') {
            const id = target.dataset.registroId;
            if (id) GestionDatos.editarRegistro(id);
        } else if (target.dataset.accion === 'editar-grupo') {
            const grupoData = _grupoPorCabecera.get(target);
            if (!grupoData) return;
            const registrosCompletos = EstadoApp.registros().filter(r => grupoData.registros.includes(r.id));
            FiltrosYPeriodos.editarGrupo({ registros: registrosCompletos, subtipo: grupoData.subtipo });
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
    $('btn-filtro')?.addEventListener('click', (e) => mostrarFiltros(e));
    $('btn-undo')?.addEventListener('click', () => GestionDatos.undoAction());
    $('btn-redo')?.addEventListener('click', () => GestionDatos.redoAction());

    $('btn-toggle-credito')?.addEventListener('click', () => toggleCredito());
    $('btn-lock-toggle')?.addEventListener('click', () => toggleBloqueoEdicion());
    $('btn-edit-referencia-compensatorio')?.addEventListener('click', () => GestionDatos.pegarReferenciaAutomatica());
    document.querySelector('#modal-editar .btn-edit')?.addEventListener('click', () => GestionDatos.guardarEdicion());
    document.querySelector('#modal-editar .btn-delete')?.addEventListener('click', () => GestionDatos.eliminarRegistroActual());
    document.querySelector('#modal-editar .btn-cancel')?.addEventListener('click', () => cerrarEdicion());

    $('btn-lock-grupo-toggle')?.addEventListener('click', () => toggleBloqueoEdicionGrupo());
    document.querySelector('#modal-editar-grupo .btn-edit')?.addEventListener('click', () => guardarEdicionGrupoDesdeFormulario());
    document.querySelector('#modal-editar-grupo .btn-delete')?.addEventListener('click', () => FiltrosYPeriodos.eliminarGrupoActual());
    document.querySelector('#modal-editar-grupo .btn-cancel')?.addEventListener('click', () => cerrarEdicionGrupo());

}

export const Historico = {
    bindEventos,
    actualizarListaRegistros,
    _initListenerAccionesLista,
    _initListenerToggleAnio,
    _initListenerToggleMes
};
