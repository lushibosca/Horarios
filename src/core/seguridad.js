import { TiempoUtils } from './tiempo-utils.js';

// ====================================================================
// SECURITY AND UTILS MODULE
// ====================================================================
const SECURITY_LIMITS = {
    MAX_REGISTROS: 1000,
    MAX_REGISTROS_POR_OPERACION: 30,
    MAX_HISTORIAL_DIAS_HABILES: 20,
    MAX_STRING_LENGTH: 100,
    MAX_NOTAS_LENGTH: 35,
    MAX_JSON_SIZE: 4 * 1024 * 1024,
    SCHEMA_VERSION: 4,
};

const REGEX_PATTERNS = {
    ID: /^[a-zA-Z0-9-_]{10,100}$/,
    NOTAS: /[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ ]/g
};

function sanitizeString(str, maxLength = SECURITY_LIMITS.MAX_STRING_LENGTH) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/[<>"'`]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/data:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/&lt;/gi, '')
        .replace(/&gt;/gi, '')
        .replace(/&#/g, '')
        .trim()
        .substring(0, maxLength);
}

function sanitizeNotas(str, trim = false) {
    if (typeof str !== 'string') return '';
    const r = str.replace(REGEX_PATTERNS.NOTAS, '').substring(0, SECURITY_LIMITS.MAX_NOTAS_LENGTH);
    return trim ? r.trim() : r;
}

function escapeHtml(s) {
    return s == null ? '' : String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const CLAVES_PROTO_PELIGROSAS = ['__proto__', 'constructor', 'prototype'];

function reviverJSONSeguro(key, value) {
    return CLAVES_PROTO_PELIGROSAS.includes(key) ? undefined : value;
}

function generarIDSeguro() {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        const array = new Uint32Array(4);
        globalThis.crypto.getRandomValues(array);
        return Array.from(array, num => num.toString(36)).join('');
    }
    const timestamp = Date.now().toString(36);
    const random1 = Math.random().toString(36).substring(2, 11);
    const random2 = Math.random().toString(36).substring(2, 11);
    return `${timestamp}-${random1}${random2}`;
}

function _sha256Fallback(bytes) {
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const rotr = (n, x) => (x >>> n) | (x << (32 - n));
    const l = bytes.length;
    const bitLen = l * 8;
    const padLen = ((l + 9 + 63) & ~63);
    const buf = new Uint8Array(padLen);
    buf.set(bytes);
    buf[l] = 0x80;
    const view = new DataView(buf.buffer);
    view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
    view.setUint32(padLen - 4, bitLen >>> 0, false);
    let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
    let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;
    const W = new Uint32Array(64);
    for (let i = 0; i < padLen; i += 64) {
        for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
        for (let t = 16; t < 64; t++) {
            const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
            const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
            W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
        }
        let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
        for (let t = 0; t < 64; t++) {
            const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
            const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + temp1) >>> 0;
            d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
        }
        H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0; H2 = (H2 + c) >>> 0; H3 = (H3 + d) >>> 0;
        H4 = (H4 + e) >>> 0; H5 = (H5 + f) >>> 0; H6 = (H6 + g) >>> 0; H7 = (H7 + h) >>> 0;
    }
    return [H0, H1, H2, H3, H4, H5, H6, H7].map(v => v.toString(16).padStart(8, '0')).join('');
}

async function calcularHashSHA256(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    if (globalThis.crypto?.subtle?.digest) {
        const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return _sha256Fallback(dataBuffer);
}

function validarRegistroSeguro(r) {
    if (!r || typeof r !== 'object') return false;
    if (Array.isArray(r) || r instanceof Date) return false;
    if (typeof r.id !== 'string' || !REGEX_PATTERNS.ID.test(r.id)) return false;
    if (typeof r.fecha !== 'string' || !TiempoUtils.validarFecha(r.fecha)) return false;
    if (r.entrada !== null) {
        if (typeof r.entrada !== 'string' || !TiempoUtils.validarHora(r.entrada)) return false;
    }
    if (r.salida !== null) {
        if (typeof r.salida !== 'string' || !TiempoUtils.validarHora(r.salida)) return false;
    }
    if (r.tiempoFuera !== null && r.tiempoFuera !== '') {
        if (typeof r.tiempoFuera !== 'string' || !TiempoUtils.validarHora(r.tiempoFuera)) return false;
    }
    if (r.credito !== null && r.credito !== undefined && r.credito !== '') {
        if (typeof r.credito !== 'string' || !TiempoUtils.validarHora(r.credito)) return false;
    }
    if (r.notas !== null && r.notas !== undefined && r.notas !== '') {
        if (typeof r.notas !== 'string' || r.notas.length > SECURITY_LIMITS.MAX_NOTAS_LENGTH) return false;
    }
    if (r.objetivoHoras !== null && r.objetivoHoras !== undefined) {
        if (!Number.isFinite(r.objetivoHoras) || r.objetivoHoras < 0 || r.objetivoHoras > 24) return false;
    }
    if (r.referenciaCompensatorio !== null && r.referenciaCompensatorio !== undefined) {
        if (typeof r.referenciaCompensatorio !== 'string' || !TiempoUtils.validarFecha(r.referenciaCompensatorio)) return false;
    }
    if (!Number.isFinite(r.horas) || r.horas < 0 || r.horas > 24) return false;
    if (!Number.isFinite(r.minutos) || r.minutos < 0 || r.minutos > 59) return false;
    if (!Number.isFinite(r.total) || r.total < 0 || r.total > 24) return false;

    const propiedadesPermitidas = ['id', 'fecha', 'entrada', 'salida', 'tiempoFuera', 'horas', 'minutos', 'total', 'credito', 'notas', 'objetivoHoras', 'referenciaCompensatorio'];
    const propiedadesActuales = Object.keys(r);
    const tienePropiedadesSospechosas = propiedadesActuales.some(prop => !propiedadesPermitidas.includes(prop));
    if (tienePropiedadesSospechosas) return false;

    return true;
}

export const SeguridadYUtils = {
    SECURITY_LIMITS,
    REGEX_PATTERNS,
    sanitizeString,
    sanitizeNotas,
    escapeHtml,
    generarIDSeguro,
    calcularHashSHA256,
    validarRegistroSeguro,
    reviverJSONSeguro
};
