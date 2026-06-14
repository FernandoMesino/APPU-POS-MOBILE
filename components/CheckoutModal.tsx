import { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardProvider,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useCartStore } from "../store/cartStore";
import { useAuthStore } from "../store/authStore";
import {
  crearOrden,
  getDatosTransferencia,
  buscarClientePorDocumento,
  DatosTransferencia,
} from "../services/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: (idOrden: string) => void;
  cajaActiva: { codigo: string; nombre: string } | null;
};

const formatPrice = (n: number) => "$" + n.toLocaleString("es-CO");

export default function CheckoutModal({
  visible,
  onClose,
  onSuccess,
  cajaActiva,
}: Props) {
  const insets = useSafeAreaInsets();
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const clearCart = useCartStore((s) => s.clearCart);
  const selectedCafeteria = useAuthStore((s) => s.selectedCafeteria);

  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [celular, setCelular] = useState("");
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [loading, setLoading] = useState(false);
  const [datosTransf, setDatosTransf] = useState<DatosTransferencia | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const [qrCargado, setQrCargado] = useState(false);

  // Estado de la búsqueda del cliente por cédula: "idle" | "buscando" | "encontrado" | "no_encontrado"
  const [clienteEstado, setClienteEstado] = useState<
    "idle" | "buscando" | "encontrado" | "no_encontrado"
  >("idle");
  // Documento de la última búsqueda en curso; descarta respuestas obsoletas.
  const docBuscadoRef = useRef("");

  // Al digitar la cédula, busca el cliente en AWS y autocompleta nombre y celular.
  useEffect(() => {
    const doc = documento.replace(/\D/g, "");
    if (!selectedCafeteria || doc.length < 5) {
      docBuscadoRef.current = "";
      setClienteEstado("idle");
      return;
    }

    let cancelado = false;
    docBuscadoRef.current = doc;
    setClienteEstado("buscando");

    const timer = setTimeout(async () => {
      try {
        const { data } = await buscarClientePorDocumento(selectedCafeteria.id, doc);
        // Ignora si el usuario siguió escribiendo (respuesta de otra cédula).
        if (cancelado || docBuscadoRef.current !== doc) return;

        if (data.cliente) {
          if (data.cliente.nombre) setNombre(data.cliente.nombre);
          if (data.cliente.celular) setCelular(data.cliente.celular);
          setClienteEstado("encontrado");
        } else {
          setClienteEstado("no_encontrado");
        }
      } catch {
        if (!cancelado && docBuscadoRef.current === doc) setClienteEstado("idle");
      }
    }, 450);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [documento, selectedCafeteria]);

  const seleccionarMetodo = async (metodo: string) => {
    setMetodoPago(metodo);
    if (metodo !== "Transferencia" || qrCargado || !selectedCafeteria) return;
    setLoadingQR(true);
    try {
      const { data } = await getDatosTransferencia(selectedCafeteria.id);
      setDatosTransf(data.transferencia);
    } catch {
      setDatosTransf(null);
    } finally {
      setLoadingQR(false);
      setQrCargado(true);
    }
  };

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
      setClienteEstado("idle");
      docBuscadoRef.current = "";
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
      <KeyboardProvider>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl px-6 pt-6" style={{ maxHeight: "85%" }}>
            <KeyboardAwareScrollView
              bottomOffset={24}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
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
              <View className="mb-3">
                <View className="flex-row items-center border border-gray-200 rounded-xl px-4">
                  <TextInput
                    className="flex-1 py-3 text-sm"
                    placeholder="Documento (cédula)"
                    keyboardType="numeric"
                    value={documento}
                    onChangeText={setDocumento}
                  />
                  {clienteEstado === "buscando" && (
                    <ActivityIndicator size="small" color="#2f2c59" />
                  )}
                </View>
                {clienteEstado === "encontrado" && (
                  <Text className="text-appu-green text-xs mt-1 ml-1">
                    ✓ Cliente encontrado, datos autocompletados
                  </Text>
                )}
                {clienteEstado === "no_encontrado" && (
                  <Text className="text-gray-400 text-xs mt-1 ml-1">
                    Cliente nuevo — completa los datos manualmente
                  </Text>
                )}
              </View>
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm"
                placeholder="Nombre"
                value={nombre}
                onChangeText={setNombre}
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
              <View className="flex-row gap-3 mb-4">
                {["Efectivo", "Transferencia"].map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => seleccionarMetodo(m)}
                    className={`flex-1 py-3 rounded-xl border items-center ${
                      metodoPago === m
                        ? "bg-appu-blue border-appu-blue"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        metodoPago === m ? "text-white" : "text-gray-600"
                      }`}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* QR de transferencia */}
              {metodoPago === "Transferencia" && (
                <View className="bg-gray-50 rounded-2xl p-4 mb-6 items-center">
                  {loadingQR ? (
                    <ActivityIndicator color="#2f2c59" />
                  ) : datosTransf?.qr_url ? (
                    <>
                      <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                        Escanea para pagar
                      </Text>
                      <Image
                        source={{ uri: datosTransf.qr_url }}
                        style={{ width: 220, height: 220 }}
                        contentFit="contain"
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                      {!!datosTransf.banco && (
                        <View className="mt-3 items-center">
                          <Text className="text-appu-text font-semibold text-sm">
                            {datosTransf.banco}
                          </Text>
                          {!!datosTransf.numero_cuenta && (
                            <Text className="text-gray-500 text-xs mt-0.5">
                              {datosTransf.tipo_cuenta} · {datosTransf.numero_cuenta}
                            </Text>
                          )}
                        </View>
                      )}
                    </>
                  ) : (
                    <Text className="text-gray-400 text-sm text-center">
                      El comercio aún no ha registrado un QR de transferencia.
                    </Text>
                  )}
                </View>
              )}

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
            </KeyboardAwareScrollView>
          </View>
        </View>
      </KeyboardProvider>
    </Modal>
  );
}
