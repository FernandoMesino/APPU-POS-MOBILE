import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { actualizarPrecioProducto, type Producto } from "../services/api";

type Props = {
  producto: Producto | null;
  onClose: () => void;
  onSaved: (id_producto: string, nuevoPrecio: number) => void;
};

export default function EditPriceModal({ producto, onClose, onSaved }: Props) {
  const [precio, setPrecio] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (producto) setPrecio(String(producto.precio ?? ""));
  }, [producto]);

  const handleGuardar = async () => {
    if (!producto) return;
    const valor = Number(precio.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(valor) || valor < 0) {
      Alert.alert("Precio inválido", "Ingresa un número válido");
      return;
    }
    setLoading(true);
    try {
      await actualizarPrecioProducto(producto.id_producto, valor);
      onSaved(producto.id_producto, valor);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "No se pudo actualizar el precio";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={!!producto}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="bg-white rounded-3xl p-6 w-full">
            <Text className="text-appu-text text-lg font-bold mb-1">
              Editar precio
            </Text>
            <Text className="text-gray-500 text-sm mb-5" numberOfLines={2}>
              {producto?.producto}
            </Text>

            <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">
              Precio
            </Text>
            <View className="border border-gray-200 rounded-xl flex-row items-center px-4 mb-6">
              <Text className="text-appu-text text-lg font-bold mr-1">$</Text>
              <TextInput
                className="flex-1 text-appu-text text-lg"
                style={{ paddingTop: 6, paddingBottom: 17, textAlignVertical: "center", includeFontPadding: false }}
                keyboardType="numeric"
                value={precio}
                onChangeText={setPrecio}
                autoFocus
                selectTextOnFocus
                placeholder="0"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={onClose}
                disabled={loading}
                className="flex-1 border border-gray-200 rounded-xl py-4 items-center"
              >
                <Text className="text-gray-600 font-semibold">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleGuardar}
                disabled={loading}
                className="flex-1 bg-appu-blue rounded-xl py-4 items-center active:opacity-80"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold">Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
