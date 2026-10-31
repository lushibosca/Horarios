import { $, setColapsable } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { icono } from '../core/html.js';

// ====================================================================
// FORMULARIOS — implementación en DOM del puerto que usan los servicios
// (contrato: typedef FormularioRegistro / FormularioEdicion en services/estado-app.js)
// ====================================================================

/** @type {import('../services/estado-app.js').FormularioRegistro} */
const registro = {
    leer: () => ({ fecha: $('fecha').value, entrada: $('entrada').value, salida: $('salida').value }),
    escribir: (campos) => {
        for (const id of /** @type {const} */ (['fecha', 'entrada', 'salida'])) {
            if (id in campos) $(id).value = campos[id] ?? '';
        }
    },
    bloquearBoton: () => {
        const btn = $('btn-agregar');
        btn.disabled = true;
        return btn;
    },
};

/** @type {import('../services/estado-app.js').FormularioEdicion} */
const edicion = {
    leer: () => ({
        fecha: $('edit-fecha').value,
        entrada: $('edit-entrada').value,
        salida: $('edit-salida').value,
        tiempoFuera: $('edit-tiempo-fuera').value,
        notas: $('edit-notas').value,
        objetivo: parseFloat($('edit-objetivo')?.dataset.valor ?? ''),
        referencia: $('edit-referencia-compensatorio')?.value || '',
        creditoActivo: $('btn-toggle-credito')?.dataset.activo === 'true',
    }),

    poblar: ({ fecha, entrada, salida, tiempoFuera, notas, objetivo, esCompensatorio, referencia, creditoActivo }) => {
        $('edit-fecha').value = fecha;
        $('edit-entrada').value = entrada;
        $('edit-salida').value = salida;
        $('edit-tiempo-fuera').value = tiempoFuera;
        $('edit-notas').value = notas;

        const elObjetivo = $('edit-objetivo');
        if (elObjetivo) {
            elObjetivo.dataset.valor = String(objetivo);
            elObjetivo.textContent = TiempoUtils.horasATexto(objetivo, 'short');
        }

        const elRef = $('edit-referencia-compensatorio');
        if (elRef) {
            setColapsable($('grupo-referencia-compensatorio'), esCompensatorio, { animar: false });
            elRef.value = esCompensatorio ? referencia : '';
        }

        const btnCredito = $('btn-toggle-credito');
        btnCredito.dataset.activo = String(creditoActivo);
        btnCredito.classList.toggle('btn-activo', creditoActivo);
    },

    refrescarHintResumen: () => {
        if ($('edit-hint-resumen')) $('edit-entrada').dispatchEvent(new Event('input'));
    },

    tieneCampoReferencia: () => !!$('edit-referencia-compensatorio'),
    escribirReferencia: (valor) => {
        const el = $('edit-referencia-compensatorio');
        el.value = valor;
        el.dispatchEvent(new Event('input'));
    },

    bloquearGuardar: () => {
        const btn = /** @type {HTMLButtonElement} */ ($('modal-editar').querySelector('.btn-edit'));
        btn.disabled = true;
        return btn;
    },
    bloquearEliminar: () => {
        const btn = /** @type {HTMLButtonElement} */ ($('modal-editar').querySelector('.btn-delete'));
        btn.disabled = true;
        return btn;
    },
    liberarEliminar: (btn) => {
        btn.disabled = false;
        btn.innerHTML = `${icono('#icon-trash')} Eliminar`;
    },
};

export const Formularios = { registro, edicion };
