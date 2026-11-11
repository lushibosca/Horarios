import { CORTES_LAYOUT } from '../core/constantes.js';
import { PosicionHeader, posicionesPermitidas } from '../core/posicion-header.js';
import { uiAnimarReubicacion, uiArrastreLargo } from './arrastre.js';
import { elementosDelLayout, claveDelLayout } from './transicion-layout.js';
import { VistaPrevia, VENTANA_PERSONALIZAR_MS, AVISO_PERSONALIZAR_MS } from './vista-previa.js';
import { EventosApp } from '../core/eventos.js';
import { mostrarToast, _cerrarToastActual } from './toast.js';

// ====================================================================
// UI REUBICAR EL ENCABEZADO (mantener presionado y arrastrar, como las tarjetas)
// ====================================================================
// Se mantiene presionado el encabezado (en un lugar que no sea un botón) y, ya levantado, se arrastra: el encabezado se va a poner en vivo en el borde más
// cercano al puntero (arriba, abajo, a la izquierda o a la derecha; en móvil solo arriba y abajo), con el mismo deslizamiento que las tarjetas, y las tarjetas
// se acomodan al lugar que deja. Al soltar queda ahí (Escape cancela y vuelve a donde estaba). El dibujo de cada posición es del CSS (<html data-header-pos>,
// ver core/posicion-header.js).
// Atajo para el tema (igual que el de las tarjetas, ver orden-tarjetas.js): mantener presionado y soltar sin mover dentro de VENTANA_PERSONALIZAR_MS abre la vista previa del tema.
const _consultaEscritorio = window.matchMedia(CORTES_LAYOUT.ESCRITORIO);   // mismo corte que el CSS

// Controles del encabezado que conservan su toque o clic normal: no inician el arrastre
const _SELECTOR_CONTROLES = 'button, a, input, select, textarea';

/** Lo que más cerca del borde nuevo tiene que estar el puntero, respecto del actual, para que el encabezado cambie de lugar (evita saltos en las diagonales). */
const HISTERESIS_PX = 24;

/** De los lugares permitidos, el del borde de la ventana más cercano al puntero; el actual solo se deja si otro gana por más que la histéresis. */
function _posicionMasCercana(x, y, permitidas, actual) {
    const distancia = { top: y, bottom: window.innerHeight - y, left: x, right: window.innerWidth - x };
    const mejor = permitidas.reduce((m, id) => (distancia[id] < distancia[m] ? id : m), permitidas[0]);
    if (!permitidas.includes(actual)) return mejor;
    return distancia[mejor] < distancia[actual] - HISTERESIS_PX ? mejor : actual;
}

function iniciar() {
    let permitidas = [];
    let destino = null;

    // El encabezado se muestra en `id` en el acto (sin guardarlo), animando su deslizamiento y el de las tarjetas
    const mostrarEn = (id, header) => uiAnimarReubicacion(elementosDelLayout, claveDelLayout, () => PosicionHeader.previsualizar(id), { encima: header });

    uiArrastreLargo(document, {
        elegir: (e) => {
            const el = e.target instanceof Element ? e.target : null;
            if (!el) return null;
            const header = el.closest('.header');
            if (!header || el.closest(_SELECTOR_CONTROLES)) return null;
            // con la vista previa de estilo abierta no se puede reubicar: son modos excluyentes (igual que con las tarjetas)
            if (VistaPrevia.activa()) return null;
            return header;
        },
        alEmpezar: (header) => {
            permitidas = posicionesPermitidas(_consultaEscritorio.matches);
            destino = PosicionHeader.actual();
            header.classList.add('reubicando');
            document.body.classList.add('header-arrastrando-activa');
            mostrarToast('Soltá para personalizar', 'info', AVISO_PERSONALIZAR_MS);
            // igual que al arrastrar tarjetas: sin la animación de entrada, que pisaría el deslizamiento
            /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.animated-card')).forEach(c => c.style.animation = 'none');
        },
        // en cuanto el dedo se mueve es una reubicación: el aviso de personalizar ya no corresponde
        alPrimerMovimiento: () => _cerrarToastActual(),
        alMover: (e, header) => {
            const nueva = _posicionMasCercana(e.clientX, e.clientY, permitidas, destino);
            if (nueva === destino) return;
            destino = nueva;
            mostrarEn(destino, header);
        },
        alTerminar: (header, confirmar, { movido, duracion }) => {
            header.classList.remove('reubicando');
            document.body.classList.remove('header-arrastrando-activa');
            if (confirmar && destino) PosicionHeader.setPosicion(destino);   // ya se ve ahí: solo se guarda
            else uiAnimarReubicacion(elementosDelLayout, claveDelLayout, () => PosicionHeader.restaurar(), { encima: header });
            destino = null;
            // mantener y soltar sin mover (y dentro de la ventana) = personalizar el tema
            if (confirmar && !movido && duracion <= VENTANA_PERSONALIZAR_MS) {
                _cerrarToastActual();
                if (navigator.vibrate) { try { navigator.vibrate(20); } catch (_) { /* la vibración es opcional */ } }
                EventosApp.emit('tarjeta:personalizar', { tarjeta: 'tema' });
            }
        }
    });
}

export const HeaderPosicion = { iniciar };
