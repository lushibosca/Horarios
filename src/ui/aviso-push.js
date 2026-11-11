import { TiempoUtils } from '../core/tiempo-utils.js';
import { RecordatorioPush } from '../services/recordatorio-push.js';
import { Notificaciones } from './notificaciones.js';
import { mostrarToast } from './toast.js';

// ====================================================================
// AVISO PUSH — recordatorio discreto de la función de notificaciones
// ====================================================================
async function chequearYAvisar() {
    if (!RecordatorioPush.avisoPendiente()) return;

    while (
        document.querySelector('.modal.show') ||
        document.body.classList.contains('config-onboarding')
    ) {
        await TiempoUtils.esperar(2000);
    }

    if (!RecordatorioPush.avisoPendiente()) return;

    RecordatorioPush.consumirAviso();
    mostrarToast(
        'Podés habilitar las notificaciones de salida desde Ajustes o tocando este aviso',
        'info', 6000, null,
        () => Notificaciones.abrirModalNotificaciones()
    );
}

export const AvisoPush = { chequearYAvisar };
