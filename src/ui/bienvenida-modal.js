import { STORAGE_KEYS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { Configuracion } from './configuracion.js';
import { EstadoApp } from '../services/estado-app.js';

// ====================================================================
// WELCOME MODULE
// ====================================================================
async function chequearYMostrar() {
    const yaVista = Almacenamiento.getBoolean(STORAGE_KEYS.BIENVENIDA_VISTA, false, true);
    if (yaVista) return;

    if (EstadoApp.registros().length > 0) {
        Almacenamiento.setItem(STORAGE_KEYS.BIENVENIDA_VISTA, true, true);
        return;
    }

    await TiempoUtils.esperar(1000);
    await Configuracion.mostrarConfigOnboarding();
}

export const BienvenidaModal = { chequearYMostrar };
