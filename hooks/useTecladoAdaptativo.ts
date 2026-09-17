import { useEffect, useRef } from "react";
import { useKeyboardStore } from "../store/keyboardStore";

/**
 * Elige entre el teclado del sistema y el propio de la app según haya o no una
 * pistola lectora conectada (ver store/keyboardStore).
 *
 * Con pistola conectada Android oculta el teclado en pantalla, así que se usa
 * el dibujado por la app. Sin pistola gana el del sistema, que es más cómodo:
 * autocorrector, dictado, gestor de contraseñas y el diseño al que el cajero
 * ya está acostumbrado.
 *
 * Uso en un campo:
 *
 *   const { usarPropio, propsCampo } = useTecladoAdaptativo();
 *   <TextInput {...propsCampo(() => abrirTeclado("cliente"))} />
 *   {usarPropio && campoActivo && <InAppKeyboard ... />}
 */
export function useTecladoAdaptativo() {
  const hayTecladoFisico = useKeyboardStore((s) => s.hayTecladoFisico);
  const notificarFoco = useKeyboardStore((s) => s.notificarFoco);

  const usarPropio = hayTecladoFisico === true;

  // La detección tarda ~700 ms, así que en el primer foco todavía no se sabe y
  // `onFocus` ya pasó. Se guarda cómo abrir el teclado propio para poder
  // hacerlo cuando la detección concluya que sí hay pistola.
  const abrirPendiente = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (usarPropio && abrirPendiente.current) {
      abrirPendiente.current();
      abrirPendiente.current = null;
    }
  }, [usarPropio]);

  const propsCampo = (abrir: () => void) => ({
    showSoftInputOnFocus: !usarPropio,
    onFocus: () => {
      notificarFoco();
      if (usarPropio) {
        abrir();
      } else {
        // Todavía no se sabe (o no hay pistola). Si la detección concluye que
        // sí la hay, el efecto de arriba abre el teclado propio sin que el
        // cajero tenga que volver a tocar el campo.
        abrirPendiente.current = abrir;
      }
    },
    onBlur: () => {
      abrirPendiente.current = null;
    },
  });

  return { usarPropio, propsCampo };
}
