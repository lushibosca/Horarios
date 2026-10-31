import test from 'node:test';
import assert from 'node:assert/strict';
import { html, crudo, esHtmlSeguro, montar, icono } from '../src/core/html.js';

test('html: escapa interpolaciones de texto', () => {
    const nota = '<img src=x onerror="alert(1)">\'&';
    assert.equal(String(html`<b>${nota}</b>`), '<b>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;</b>');
});

test('html: escapa dentro de atributos entre comillas', () => {
    assert.equal(String(html`<div data-x="${'" onclick="x'}"></div>`), '<div data-x="&quot; onclick=&quot;x"></div>');
});

test('html: no re-escapa html anidado ni crudo()', () => {
    const interno = html`<i>${'a&b'}</i>`;
    assert.equal(String(html`<p>${interno}${crudo('<hr>')}</p>`), '<p><i>a&amp;b</i><hr></p>');
});

test('html: arrays se concatenan, null/undefined/false desaparecen, números se imprimen', () => {
    assert.equal(String(html`${[html`<a>${1}</a>`, '<b>']}${null}${undefined}${false}${0}`), '<a>1</a>&lt;b&gt;0');
});

test('html: un string común no es HtmlSeguro y montar() lo rechaza', () => {
    assert.equal(esHtmlSeguro('<b>x</b>'), false);
    assert.throws(() => montar({}, '<b>x</b>'), TypeError);
    const el = {};
    montar(el, html`<b>${'<'}</b>`);
    assert.equal(el.innerHTML, '<b>&lt;</b>');
});

test('icono: arma el <svg> del sprite, escapa href y clase, y se anida sin re-escapar', () => {
    assert.equal(String(icono('#icon-clock')), '<svg class="icon"><use href="#icon-clock"/></svg>');
    assert.equal(String(icono('#icon-edit', 'extra')), '<svg class="icon extra"><use href="#icon-edit"/></svg>');
    assert.equal(String(icono('"><b>')), '<svg class="icon"><use href="&quot;&gt;&lt;b&gt;"/></svg>');
    assert.equal(String(html`<p>${icono('#icon-x')}</p>`), '<p><svg class="icon"><use href="#icon-x"/></svg></p>');
});
