import { TiempoUtils } from '../core/tiempo-utils.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { SaldoSemanal } from '../services/saldo-semanal.js';
import { Compensatorios } from '../services/compensatorios.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
//              UI HISTORY ITEMS (filas de la lista de registros)
// ====================================================================
// Construye los elementos de cada fila: registro individual y cabecera de un grupo de licencias consecutivas.
// historico.js los ubica en los contenedores de mes y año, y maneja la animación y los clicks.
const { _aArray } = Animaciones;

// Datos de cada cabecera de grupo, sin pasar por el DOM (se libera junto con el elemento)
const _grupoPorCabecera = new WeakMap();

/** @returns {{ registros: string[], subtipo: string } | undefined} */
const grupoDeCabecera = (el) => _grupoPorCabecera.get(el);

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

export const HistoricoItems = {
    agruparRegistrosPorMes,
    crearChevron: _crearChevron,
    crearItemRegistroIndividual,
    crearGrupoExpandible,
    grupoDeCabecera,
};
