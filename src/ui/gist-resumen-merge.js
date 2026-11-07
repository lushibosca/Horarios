import { $, setColapsable } from '../core/dom.js';
import { icono, montar } from '../core/html.js';

// ====================================================================
//              UI GIST MERGE SUMMARY (modal "Datos del Gist")
// ====================================================================
// Arma el resumen que se muestra antes de aplicar lo bajado del Gist: selector Combinar/Reemplazar, cuántos
// registros quedan en cada caso, qué configuración cambia y la alerta de registros locales que se perderían.
// Solo construye DOM; gist-respaldo.js decide qué hacer con la elección.

const _mkEl = (tag, cls, texto) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = String(texto);
    return e;
};

const _mkColapsable = (contenido) => {
    const wrap = _mkEl('div', 'collapsible');
    const inner = _mkEl('div', 'collapsible-inner');
    inner.appendChild(contenido);
    wrap.appendChild(inner);
    return wrap;
};

function _crearSelectorModoMerge(onCambio) {
    const el = _mkEl('div', 'btn-group');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Cómo aplicar los datos del Gist');
    const btns = [['merge', '#icon-combine', 'Combinar'], ['replace', '#icon-replace-swap', 'Reemplazar']].map(([modo, href, texto]) => {
        const btn = _mkEl('button');
        btn.type = 'button';
        btn.dataset.modo = modo;
        montar(btn, icono(href));
        btn.appendChild(document.createTextNode(texto));
        btn.addEventListener('click', () => onCambio(modo));
        el.appendChild(btn);
        return btn;
    });
    return {
        el,
        pintar(modo) {
            btns.forEach(b => {
                const activo = b.dataset.modo === modo;
                b.classList.toggle('btn-activo', activo);
                b.setAttribute('aria-pressed', String(activo));
            });
        }
    };
}

function _crearTarjetaResultadoMerge({ nLocal, nGist, nNuevos, nComp }, configCambios) {
    const el = _mkEl('div', 'gist-res');
    const fila = (label, valorEl, conBorde) => {
        const f = _mkEl('div', 'gist-res-fila' + (conBorde ? ' con-borde' : ''));
        f.append(_mkEl('span', 'gist-res-label', label), valorEl);
        return f;
    };

    const antesEl = _mkEl('em');
    const despuesEl = _mkEl('span');
    const deltaEl = _mkEl('span');
    const valorReg = _mkEl('span', 'gist-res-valor');
    valorReg.append(antesEl, despuesEl, deltaEl);
    el.appendChild(fila('Registros', valorReg, false));

    let wrapComp = null;
    if (nComp > 0) {
        const valorComp = _mkEl('span', 'gist-res-valor');
        valorComp.append(_mkEl('span', null, nComp), _mkEl('span', 'gist-delta is-info', 'datos faltantes'));
        wrapComp = _mkColapsable(fila('Se completan', valorComp, true));
        el.appendChild(wrapComp);
    }

    let cfgValor = null;
    if (configCambios.length > 0) {
        cfgValor = _mkEl('span', 'gist-res-valor');
        el.appendChild(fila('Configuración', cfgValor, true));
    }

    return {
        el,
        pintar(esMerge, animar) {
            const despues = esMerge ? nLocal + nNuevos : nGist;
            const delta = despues - nLocal;
            antesEl.textContent = `${nLocal} →`;
            despuesEl.textContent = String(despues);
            deltaEl.className = 'gist-delta' + (delta > 0 ? ' is-mas' : delta < 0 ? ' is-menos' : '');
            deltaEl.textContent = delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : 'sin cambios';
            cfgValor?.replaceChildren(esMerge ? _mkEl('em', null, 'sin cambios') : document.createTextNode(configCambios.join(', ')));
            setColapsable(wrapComp, esMerge, { animar });
        }
    };
}

function _crearAlertaReemplazoMerge(nSoloLocal) {
    if (nSoloLocal === 0) return null;
    const alerta = _mkEl('div', 'gist-alerta');
    montar(alerta, icono('#icon-alert-triangle'));
    const txt = _mkEl('span');
    txt.append(
        'Se eliminan ',
        _mkEl('strong', null, `${nSoloLocal} ${nSoloLocal === 1 ? 'registro local' : 'registros locales'}`),
        ` que no ${nSoloLocal === 1 ? 'está' : 'están'} en el Gist.`
    );
    alerta.appendChild(txt);
    const el = _mkColapsable(alerta);
    el.classList.add('gist-alerta-wrap');
    return { el, pintar: (esMerge, animar) => setColapsable(el, !esMerge, { animar }) };
}

function _buildResumenMerge(resumenEl, { soloImportados, enAmbos, soloLocal, complementarios }, registrosNormalizados, configCambios) {
    const cantidades = {
        nLocal: enAmbos.length + soloLocal.length,
        nGist: registrosNormalizados.length,
        nNuevos: soloImportados.length,
        nComp: complementarios.length
    };
    resumenEl.replaceChildren();
    resumenEl.dataset.modo = 'merge';

    const selector = _crearSelectorModoMerge(modo => {
        if (resumenEl.dataset.modo === modo) return;
        resumenEl.dataset.modo = modo;
        pintar(true);
    });
    const tarjeta = _crearTarjetaResultadoMerge(cantidades, configCambios);
    const alerta = _crearAlertaReemplazoMerge(soloLocal.length);
    resumenEl.append(selector.el, tarjeta.el);
    if (alerta) resumenEl.appendChild(alerta.el);

    function pintar(animar) {
        const modo = resumenEl.dataset.modo;
        const esMerge = modo === 'merge';
        selector.pintar(modo);
        tarjeta.pintar(esMerge, animar);
        alerta?.pintar(esMerge, animar);

        const btnAplicar = $('btn-gist-merge-aplicar');
        if (btnAplicar) {
            btnAplicar.classList.toggle('btn-edit', esMerge);
            btnAplicar.classList.toggle('btn-delete', !esMerge);
        }
    }
    pintar(false);
}

export const GistResumenMerge = { construir: _buildResumenMerge };
