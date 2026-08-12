/**
 * Shim de `react-native-keyboard-controller` para poder correr la app en Expo Go.
 *
 * La librería real trae código nativo (android/, ios/, .podspec) y no forma parte
 * del SDK de Expo, así que NO viene incluida en Expo Go: con ella, la app crashea
 * al arrancar porque `KeyboardProvider` está en el layout raíz.
 *
 * Este archivo la reemplaza por equivalentes de React Native puro. Metro lo activa
 * solo cuando `EXPO_GO_SHIM=1` (ver metro.config.js), variable que vive en
 * .env.local — que está en .gitignore. Los builds de EAS y el resto del equipo
 * siguen usando la librería nativa real, sin enterarse de esto.
 *
 * Limitación conocida: el seguimiento del teclado es menos fino que el nativo
 * (no hay animación acoplada al gesto). Sirve para desarrollar, no para validar
 * el comportamiento final del teclado.
 */
import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

/** En la librería real instala el módulo nativo. Aquí no hace falta nada. */
export function KeyboardProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  /** Espacio entre el input enfocado y el teclado. Se mapea a keyboardVerticalOffset. */
  bottomOffset?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function KeyboardAwareScrollView({
  bottomOffset = 0,
  style,
  children,
  ...props
}: KeyboardAwareScrollViewProps) {
  return (
    <KeyboardAvoidingView
      // En Android el `adjustResize` nativo ya reacomoda la ventana; forzar
      // "height" aquí pelea con eso y da saltos.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={bottomOffset}
      // `flex: 1` por defecto: sin él la vista queda con altura 0 cuando el
      // consumidor solo pasa `contentContainerStyle`, y el ScrollView de adentro
      // colapsa — se ve el contenido pero no responde a los toques.
      style={[styles.fill, style]}
    >
      <ScrollView {...props}>{children}</ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Exports adicionales de la librería, por si alguna pantalla los usa más adelante. */
export const KeyboardAwareScrollViewProvider = KeyboardProvider;
export default { KeyboardProvider, KeyboardAwareScrollView };
