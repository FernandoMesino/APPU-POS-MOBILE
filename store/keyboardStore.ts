import { create } from "zustand";
import { Keyboard } from "react-native";

/**
 * Detecta si hay un teclado físico conectado (la pistola lectora).
 *
 * Android no expone ese dato a JavaScript, así que se deduce por observación:
 * al enfocar un campo, el teclado en pantalla debería aparecer. Si no aparece
 * dentro de una ventana corta, es porque el sistema lo está ocultando — y el
 * único motivo por el que lo oculta es que hay un teclado físico emparejado.
 *
 * La deducción se corrige sola en los dos sentidos:
 *  - Si el teclado del sistema aparece en cualquier momento → no hay pistola.
 *  - Si se enfoca un campo y no aparece → hay pistola.
 * Así, desconectar o conectar el lector a mitad del turno se refleja solo.
 */

// Margen para que el teclado del sistema se anuncie. En Android el evento
// `keyboardDidShow` llega recién cuando termina la animación (~300 ms), así que
// hay que dejar holgura para no confundir un teléfono lento con una pistola.
const MS_ESPERA = 700;

type KeyboardState = {
  /** null = todavía no se sabe. true = hay teclado físico (pistola). */
  hayTecladoFisico: boolean | null;
  /** Llamar al enfocar un campo: arranca o repite la detección. */
  notificarFoco: () => void;
  /** Suscribe los listeners globales. Devuelve la función de limpieza. */
  iniciarDeteccion: () => () => void;
};

let temporizador: ReturnType<typeof setTimeout> | null = null;

const cancelarTemporizador = () => {
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
};

export const useKeyboardStore = create<KeyboardState>((set) => ({
  hayTecladoFisico: null,

  notificarFoco: () => {
    // Si el teclado ya está abierto, no hay nada que deducir: el del sistema
    // funciona. Pasa al saltar de un campo a otro, donde `keyboardDidShow` no
    // se vuelve a disparar.
    if (Keyboard.isVisible()) {
      cancelarTemporizador();
      set({ hayTecladoFisico: false });
      return;
    }

    cancelarTemporizador();
    temporizador = setTimeout(() => {
      temporizador = null;
      // Si pasada la ventana el teclado sigue sin verse, el sistema lo está
      // suprimiendo por el teclado físico.
      if (!Keyboard.isVisible()) set({ hayTecladoFisico: true });
    }, MS_ESPERA);
  },

  iniciarDeteccion: () => {
    const alMostrarse = Keyboard.addListener("keyboardDidShow", () => {
      cancelarTemporizador();
      set({ hayTecladoFisico: false });
    });
    return () => {
      cancelarTemporizador();
      alMostrarse.remove();
    };
  },
}));
