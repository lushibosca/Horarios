import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

// El servidor de desarrollo solo debe entregar los archivos de la app: la carpeta tiene .env, .git y datos personales.
const hayPython = spawnSync('python3', ['--version']).status === 0;

const puertoLibre = () => new Promise((ok, no) => {
    const s = net.createServer();
    s.once('error', no);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

// Por socket crudo: fetch normaliza la ruta (quita los "..") y no deja elegir el Host, justo lo que hay que probar
const pedir = (puerto, ruta, host = `127.0.0.1:${puerto}`, metodo = 'GET') => new Promise((ok, no) => {
    const c = net.connect(puerto, '127.0.0.1', () => c.write(`${metodo} ${ruta} HTTP/1.0\r\nHost: ${host}\r\n\r\n`));
    let datos = '';
    c.on('data', d => { datos += d; });
    c.on('end', () => ok({ estado: Number(datos.split(' ')[1]), datos }));
    c.on('error', no);
});

test('Servidor de desarrollo: entrega la app y nada más', { skip: !hayPython && 'sin python3' }, async (t) => {
    const puerto = await puertoLibre();
    const servidor = spawn('python3', ['scripts/servidor.py', String(puerto), '127.0.0.1', process.cwd()], { stdio: 'ignore' });
    t.after(() => servidor.kill());
    for (let i = 0; i < 50; i++) {
        try { await pedir(puerto, '/'); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }

    // Todo lo que la app necesita, incluida la lista completa del Service Worker
    const sw = fs.readFileSync('sw.js', 'utf8');
    const lista = [...sw.match(/const\s+urlsToCache\s*=\s*\[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)].map(m => `/${m[1]}`);
    assert.ok(lista.length > 50);
    for (const ruta of ['/', '/index.html', '/sw.js', ...lista, '/src/main.js?v=1']) {
        assert.equal((await pedir(puerto, ruta)).estado, 200, ruta);
    }

    // Lo sensible no sale, aunque exista en disco y se pida con rodeos
    const prohibidas = [
        '/.env', '/.git/config', '/.git/HEAD', '/registros.json', '/package.json',
        '/horarios-push/wrangler.toml', '/horarios-push/src/index.js', '/tests/domain.test.mjs', '/docs/ARQUITECTURA.md',
        '/src/../.env', '/assets/../.env', '/src/%2e%2e/.env', '/src/..%2f.env', '/src/%2e%2e%2f.git/config',
        '//.env', '/./.env', '/src/.env', '/assets/.git/config', '/src/..\\.env', '/src/..%5c.env',
    ];
    for (const ruta of prohibidas) {
        const { estado, datos } = await pedir(puerto, ruta);
        assert.equal(estado, 404, ruta);
        assert.doesNotMatch(datos, /CF_API_TOKEN|\[core\]/, ruta);
    }
    assert.equal((await pedir(puerto, '/.env', undefined, 'HEAD')).estado, 404, 'HEAD');

    // Sin listados de carpetas
    for (const ruta of ['/src/', '/assets/', '/src/core/']) assert.equal((await pedir(puerto, ruta)).estado, 404, ruta);

    // DNS rebinding: un nombre de dominio ajeno no se atiende; localhost y las IP (probar desde el celular) sí
    for (const host of ['evil.example', 'evil.example:8080', 'localhost.evil.example', '127.0.0.1.evil.example']) {
        assert.equal((await pedir(puerto, '/index.html', host)).estado, 403, host);
    }
    for (const host of ['localhost', `localhost:${puerto}`, `127.0.0.1:${puerto}`, '192.168.0.10:8001', '[::1]:8001']) {
        assert.equal((await pedir(puerto, '/index.html', host)).estado, 200, host);
    }
});
