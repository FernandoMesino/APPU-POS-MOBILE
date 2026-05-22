import { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useCartStore } from "../store/cartStore";
import { useAuthStore } from "../store/authStore";
import { crearOrden, MetodoPago } from "../services/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: (idOrden: string) => void;
  metodosPago: MetodoPago[];
  cajaActiva: { codigo: string; nombre: string } | null;
};

const formatPrice = (n: number) => "$" + n.toLocaleString("es-CO");

export default function CheckoutModal({
  visible,
  onClose,
  onSuccess,
  metodosPago,
  cajaActiva,
}: Props) {
  const { items, total, clearCart } = useCartStore();
  const { selectedCafeteria } = useAuthStore();

  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [celular, setCelular] = useState("");
  const [metodoPago, setMetodoPago] = useState(metodosPago[0]?.nombre ?? "Efectivo");
  const [loading, setLoading] = useState(false);

  const handleFacturar = async () => {
    if (!selectedCafeteria) return;
    setLoading(true);
    try {
      const { data } = await crearOrden({
        cafeteria_id: selectedCafeteria.id,
        carrito: items.map((i) => ({
          id_producto: i.id_producto,
          producto: i.producto,
          precio: i.precio,
          cantidad: i.cantidad,
        })),
        nombre_cliente: nombre.trim() || "Sin nombre",
        documento_cliente: documento.trim() || "0",
        celular_cliente: celular.trim() || "0",
        metodo_pago: metodoPago,
        monto: total,
        caja_codigo: cajaActiva?.codigo ?? "",
      });

      clearCart();
      setNombre("");
      setDocumento("");
      setCelular("");
      onSuccess(data.id_orden);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "No se pudo crear la orden";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl p-6" style={{ maxHeight: "85%" }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="text-appu-text text-xl font-bold mb-5">
                Confirmar venta
              </Text>

              {/* Resumen */}
              <View className="bg-gray-50 rounded-2xl p-4 mb-5">
                {items.map((item) => (
                  <View key={item.id_producto} className="flex-row justify-between mb-2">
                    <Text className="text-gray-600 text-sm flex-1" numberOfLines={1}>
                      {item.cantidad}× {item.producto}
                    </Text>
                    <Text className="text-appu-text font-semibold text-sm ml-2">
                      {formatPrice(item.precio * item.cantidad)}
                    </Text>
                  </View>
                ))}
                <View className="border-t border-gray-200 pt-2 mt-2 flex-row justify-between">
                  <Text className="text-appu-text font-bold">Total</Text>
                  <Text className="text-appu-blue font-bold text-lg">
                    {formatPrice(total)}
                  </Text>
                </View>
              </View>

              {/* Datos del cliente (opcionales) */}
              <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                Cliente (opcional)
              </Text>
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm"
                placeholder="Nombre"
                value={nombre}
                onChangeText={setNombre}
              />
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm"
                placeholder="Documento"
                keyboardType="numeric"
                value={documento}
                onChangeText={setDocumento}
              />
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3 mb-5 text-sm"
                placeholder="Celular"
                keyboardType="phone-pad"
                value={celular}
                onChangeText={setCelular}
              />

              {/* Método de pago */}
              <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                Método de pago
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                <View className="flex-row gap-2 pr-4">
                  {metodosPago.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setMetodoPago(m.nombre)}
                      className={`px-4 py-2 rounded-full border ${
                        metodoPago === m.nombre
                          ? "bg-appu-blue border-appu-blue"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          metodoPago === m.nombre ? "text-white" : "text-gray-600"
                        }`}
                      >
                        {m.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Botones */}
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={onClose}
                  disabled={loading}
                  className="flex-1 border border-gray-200 rounded-xl py-4 items-center"
                >
                  <Text className="text-gray-600 font-semibold">Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleFacturar}
                  disabled={loading}
                  className="flex-1 bg-appu-green rounded-xl py-4 items-center active:opacity-80"
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold">Facturar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
