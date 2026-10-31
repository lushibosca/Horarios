import { TiempoUtils } from '../core/tiempo-utils.js';

// ====================================================================
// RECORD TYPES MODULE
// ====================================================================
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
        descripcion: 'Fuerza mayor',
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
        descripcion: 'Formación profesional',
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

const TIPOS_ARRAY = Object.values(TIPOS);

function esRegistroEspecial(entrada, salida) {
    if (!entrada || !salida) return false;
    return entrada === salida && TIPOS_ARRAY.some(t => t.codigo === entrada);
}

function obtenerTipoPorCodigo(entrada, salida) {
    if (!entrada || !salida || entrada !== salida) return null;
    return TIPOS_ARRAY.find(t => t.codigo === entrada) || null;
}

function obtenerTipoPorId(id) {
    return TIPOS_ARRAY.find(t => t.id === id) || null;
}

function validarTipoPermitido(id) {
    return TIPOS_ARRAY.some(t => t.id === id);
}

function obtenerTodosLosTipos() {
    return TIPOS_ARRAY;
}

function labelSegunCantidad(tipo, cantidad) {
    return (cantidad === 1 ? tipo.label : tipo.labelPlural).toLowerCase();
}

function claveStat(tipo) {
    return tipo.labelPlural.toLowerCase();
}

function obtenerCodigosPorTipo(id) {
    const tipo = obtenerTipoPorId(id);
    return tipo ? { entrada: tipo.codigo, salida: tipo.codigo } : null;
}

function agruparConsecutivos(registros) {
    if (!registros || registros.length === 0) return [];
    const idTipo = (r) => obtenerTipoPorCodigo(r.entrada, r.salida)?.id ?? null;

    const resultado = [];
    let i = 0;
    while (i < registros.length) {
        const actual = registros[i];
        const tipoActual = idTipo(actual);
        if (tipoActual === null) {
            resultado.push({ tipo: 'individual', registros: [actual] });
            i++; continue;
        }

        const grupo = [actual];
        let j = i + 1;
        while (j < registros.length) {
            const siguiente = registros[j];
            if (idTipo(siguiente) !== tipoActual) break;
            if (!TiempoUtils.esDiaAnterior(grupo[grupo.length - 1].fecha, siguiente.fecha)) break;
            grupo.push(siguiente);
            j++;
        }

        resultado.push(grupo.length > 1
            ? { tipo: 'grupo', subtipo: tipoActual, registros: grupo }
            : { tipo: 'individual', registros: grupo }
        );
        i = j;
    }
    return resultado;
}

const notaDeGrupo = (grupo) => grupo.registros.find(r => r.notas)?.notas || '';

function mapaNotasPorRegistro(registros) {
    const mapa = new Map();
    agruparConsecutivos(registros).forEach(g => {
        const notaGrupo = g.tipo === 'grupo' ? notaDeGrupo(g) : '';
        g.registros.forEach(r => { if (r.notas || notaGrupo) mapa.set(r.id, r.notas || notaGrupo); });
    });
    return mapa;
}

export const TiposRegistro = {
    TIPOS,
    agruparConsecutivos,
    notaDeGrupo,
    mapaNotasPorRegistro,
    esRegistroEspecial,
    obtenerTipoPorCodigo,
    obtenerTipoPorId,
    validarTipoPermitido,
    obtenerTodosLosTipos,
    obtenerCodigosPorTipo,
    labelSegunCantidad,
    claveStat
};
