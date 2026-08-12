import { ReactNode } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import InAppKeyboard from "./InAppKeyboard";

/**
 * Armazón de formulario a pantalla completa.
 *
 * Lo comparten las altas de producto y de caja para que se vean iguales y para
 * no repetir la coreografía del teclado propio: cuando el teclado está abierto,
 * el cuerpo se encoge (flexShrink) en vez de quedar tapado, igual que haría el
 * teclado del sistema.
 */

export type CampoTeclado = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mode: "numeric" | "text";
};

type Props = {
  visible: boolean;
  titulo: string;
  subtitulo?: string;
  onClose: () => void;
  /** Texto del botón principal. */
  accion: string;
  onAccion: () => void;
  guardando?: boolean;
  /** Campo que el teclado propio está editando, o null si está cerrado. */
  campoTeclado: CampoTeclado | null;
  onCerrarTeclado: () => void;
  children: ReactNode;
};

export default function FullScreenForm({
  visible,
  titulo,
  subtitulo,
  onClose,
  accion,
  onAccion,
  guardando,
  campoTeclado,
  onCerrarTeclado,
  children,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1a1a4e" />
      <SafeAreaView edges={["top"]} className="flex-1 bg-white">
        {/* Cabecera */}
        <View className="bg-appu-dark px-4 py-4 flex-row items-center">
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            className="mr-3 active:opacity-60"
          >
            <Ionicons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold" numberOfLines={1}>
              {titulo}
            </Text>
            {!!subtitulo && (
              <Text className="text-white/50 text-xs mt-0.5" numberOfLines={1}>
                {subtitulo}
              </Text>
            )}
          </View>
        </View>

        {/* Cuerpo — se encoge para dejarle sitio al teclado */}
        <ScrollView
          style={{ flexShrink: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
        >
          {children}
        </ScrollView>

        {/* Botón principal, siempre visible sobre el teclado */}
        {!campoTeclado && (
          <View className="px-5 pb-5 pt-2 border-t border-gray-100">
            <TouchableOpacity
              onPress={onAccion}
              disabled={guardando}
              className="bg-appu-blue rounded-2xl py-4 items-center active:opacity-80"
            >
              {guardando ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">{accion}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {campoTeclado && (
          <InAppKeyboard
            mode={campoTeclado.mode}
            label={campoTeclado.label}
            value={campoTeclado.value}
            onChange={campoTeclado.onChange}
            onClose={onCerrarTeclado}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

/** Campo de texto del formulario, con el mismo look en las dos pantallas. */
export function CampoFormulario({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-5">
      <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">
        {label}
      </Text>
      {children}
      {!!hint && <Text className="text-gray-400 text-xs mt-1.5">{hint}</Text>}
    </View>
  );
}
