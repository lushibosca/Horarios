import { STORAGE_KEYS } from '../core/constantes.js';
import { SeguridadYUtils } from '../core/seguridad.js';
import { EventosApp } from '../core/eventos.js';
import { Almacenamiento } from '../core/almacenamiento.js';

// ====================================================================
// HISTORY MANAGER MODULE
// ====================================================================
let _stack = [];
let currentIndex = -1;
const MAX_HISTORY = 20;

function deepClone(obj) {
    if (obj === null || obj === undefined) return obj;
    try { return structuredClone(obj); }
    catch (e) {
        return JSON.parse(JSON.stringify(obj), SeguridadYUtils.reviverJSONSeguro);
    }
}

/** @param {any} [descripcion] */
function saveState(registros, descripcion = null) {
    const copiaSegura = deepClone(registros);
    if (currentIndex < _stack.length - 1) _stack.splice(currentIndex + 1);
    _stack.push({ estado: copiaSegura, descripcion });
    if (_stack.length > MAX_HISTORY) {
        _stack.shift();
        currentIndex = MAX_HISTORY - 1;
    } else {
        currentIndex = _stack.length - 1;
    }
    updateButtons();
    saveToLocalStorage();
}

function undo() {
    if (currentIndex > 0) {
        const descripcion = _stack[currentIndex]?.descripcion || null;
        currentIndex--;
        updateButtons();
        saveToLocalStorage();
        return { estado: deepClone(_stack[currentIndex]?.estado), descripcion };
    }
    return null;
}

function redo() {
    if (currentIndex < _stack.length - 1) {
        currentIndex++;
        updateButtons();
        saveToLocalStorage();
        return { estado: deepClone(_stack[currentIndex]?.estado), descripcion: _stack[currentIndex]?.descripcion || null };
    }
    return null;
}

function canUndo() { return currentIndex > 0; }
function canRedo() { return currentIndex < _stack.length - 1; }

function updateButtons() {
    EventosApp.emit('historial:cambio', { canUndo: canUndo(), canRedo: canRedo() });
}

function saveToLocalStorage() {
    const historyData = { history: _stack, currentIndex: currentIndex, timestamp: Date.now() };
    Almacenamiento.setItem(STORAGE_KEYS.HISTORY, historyData, true);
}

function loadFromLocalStorage() {
    const historyData = Almacenamiento.getObject(STORAGE_KEYS.HISTORY, null, true);
    if (historyData) {
        const ahora = Date.now();
        const tiempoTranscurrido = ahora - (historyData.timestamp || 0);
        const limiteEnMs = 24 * 60 * 60 * 1000;

        if (tiempoTranscurrido < limiteEnMs) {
            const historyRaw = historyData.history || [];
            _stack = historyRaw.map(entry => Array.isArray(entry) ? { estado: entry, descripcion: null } : entry);
            currentIndex = historyData.currentIndex !== undefined ? historyData.currentIndex : -1;
            return _stack.length > 0 && currentIndex >= 0;
        } else {
            Almacenamiento.removeItem(STORAGE_KEYS.HISTORY, true);
        }
    }
    _stack = [];
    currentIndex = -1;
    updateButtons();
    return false;
}

function clearStorage() { Almacenamiento.removeItem(STORAGE_KEYS.HISTORY, true); }

function clear() {
    _stack = [];
    currentIndex = -1;
    clearStorage();
    updateButtons();
}

function getCurrentState() {
    if (currentIndex >= 0 && currentIndex < _stack.length) {
        return deepClone(_stack[currentIndex]?.estado);
    }
    return null;
}

function parchearRegistrosEnHistorial(parchadorFn) {
    let totalParcheado = 0;
    _stack.forEach(entry => {
        if (!entry || !Array.isArray(entry.estado)) return;
        entry.estado.forEach(r => {
            if (parchadorFn(r)) totalParcheado++;
        });
    });
    if (totalParcheado > 0) saveToLocalStorage();
    return totalParcheado;
}

export const GestorHistorial = {
    saveState, undo, redo, canUndo, canRedo, updateButtons, clear,
    saveToLocalStorage, loadFromLocalStorage, getCurrentState, parchearRegistrosEnHistorial
};
