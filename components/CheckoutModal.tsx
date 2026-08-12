import { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Platform,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import InAppKeyboard from "./InAppKeyboard";
import { useCartStore } from "../store/cartStore";
import { useAuthStore } from "../store/authStore";
import {
  crearOrden,
  crearCliente,
  getDatosTransferencia,
  buscarClientePorDocumento,
  buscarSugerenciasClientes,
  DatosTransferencia,
  SugerenciaCliente,
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
  const { height: screenHeight } = useWindowDimensions();
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

  // Estado de la búsqueda exacta: "idle" | "buscando" | "encontrado" | "no_encontrado"
  const [clienteEstado, setClienteEstado] = useState<
    "idle" | "buscando" | "encontrado" | "no_encontrado"
  >("idle");
  // Documento de la última búsqueda en curso; descarta respuestas obsoletas.
  const docBuscadoRef = useRef("");

  // Autocompletado por prefijo mientras se escribe.
  const [sugerencias, setSugerencias] = useState<SugerenciaCliente[]>([]);
  // Se oculta al elegir una sugerencia, para que no reaparezca sobre el campo.
  const [mostrarSugerencias, setMostrarSugerencias] = useState(true);

  // Registro de cliente nuevo.
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [clienteCreado, setClienteCreado] = useState(false);

  // ── Teclado propio ─────────────────────────────────────────────────────────
  // La pistola lectora se empareja como teclado físico HID y Android oculta el
  // teclado en pantalla mientras esté conectada. Estos campos usan el teclado
  // dibujado por la app, así el cajero escribe siempre, con pistola o sin ella.
  type Campo = "documento" | "nombre" | "celular";
  const [campoActivo, setCampoActivo] = useState<Campo | null>(null);

  // ── Teclado ────────────────────────────────────────────────────────────────
  // La hoja está anclada abajo; sin esto el teclado la tapa. Subimos la hoja
  // completa y le recortamos el alto disponible, así el contenido "sube" y
  // sigue siendo scrolleable mientras se escribe.
  // Mismo patrón que Appu-app/App/screens/SignInScreen.js — RN puro, sin
  // depender de react-native-keyboard-controller (que Expo Go no trae).
  const kbAnim = useRef(new Animated.Value(0)).current;
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const show = (e: any) => {
      const h = e.endCoordinates?.height ?? 0;
      setKbHeight(h);
      Animated.timing(kbAnim, {
        toValue: h,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    };
    const hide = (e: any) => {
      setKbHeight(0);
      Animated.timing(kbAnim, {
        toValue: 0,
        duration: e?.duration || 250,
        useNativeDriver: false,
      }).start();
    };

    // iOS avisa antes de animar (will*), Android solo después (did*).
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const sl = Keyboard.addListener(showEvt, show);
    const hl = Keyboard.addListener(hideEvt, hide);
    return () => {
      sl.remove();
      hl.remove();
    };
  }, []);

  // ── Sugerencias por prefijo (mientras escribe) ─────────────────────────────
  useEffect(() => {
    const doc = documento.replace(/\D/g, "");
    if (doc.length < 3 || !mostrarSugerencias) {
      setSugerencias([]);
      return;
    }

    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await buscarSugerenciasClientes(doc);
        if (cancelado) return;
        // Si ya es la cédula completa y exacta, la lista sobra.
        setSugerencias(
          data.sugerencias.filter((s) => s.documento !== doc)
        );
      } catch {
        if (!cancelado) setSugerencias([]);
      }
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [documento, mostrarSugerencias]);

  // ── Búsqueda exacta (autocompleta nombre y celular) ────────────────────────
  // Consulta global: caché + subsidios + app + acudientes + plaza.
  useEffect(() => {
    const doc = documento.replace(/\D/g, "");
    setClienteCreado(false);

    if (doc.length < 5) {
      docBuscadoRef.current = "";
      setClienteEstado("idle");
      return;
    }

    let cancelado = false;
    docBuscadoRef.current = doc;
    setClienteEstado("buscando");

    const timer = setTimeout(async () => {
      try {
        const { data } = await buscarClientePorDocumento(doc);
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
  }, [documento]);

  const elegirSugerencia = (s: SugerenciaCliente) => {
    setMostrarSugerencias(false);
    setSugerencias([]);
    setDocumento(s.documento);
    setNombre(s.nombre);
    if (s.celular) setCelular(s.celular);
    setClienteEstado("encontrado");
    Keyboard.dismiss();
  };

  const onCambiarDocumento = (v: string) => {
    setMostrarSugerencias(true);
    setDocumento(v);
  };

  // Mapas del teclado propio. Van acá abajo porque dependen de
  // `onCambiarDocumento`, que se declara arriba con const.
  const valorCampo: Record<Campo, string> = { documento, nombre, celular };
  const setterCampo: Record<Campo, (v: string) => void> = {
    documento: onCambiarDocumento,
    nombre: setNombre,
    celular: setCelular,
  };
  const etiquetaCampo: Record<Campo, string> = {
    documento: "Documento",
    nombre: "Nombre",
    celular: "Celular",
  };

  // Al enfocar un campo con el teclado propio, cerramos el del sistema por si
  // llegó a abrirse (p. ej. si la pistola no está conectada).
  const abrirTeclado = (campo: Campo) => {
    Keyboard.dismiss();
    setCampoActivo(campo);
  };

  const handleCrearCliente = async () => {
    const doc = documento.replace(/\D/g, "");
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Escribe el nombre del cliente para registrarlo.");
      return;
    }
    setCreandoCliente(true);
    try {
      await crearCliente({
        documento: doc,
        nombre: nombre.trim(),
        celular: celular.trim(),
      });
      setClienteCreado(true);
      setClienteEstado("encontrado");
      Keyboard.dismiss();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "No se pudo registrar el cliente";
      Alert.alert("Error", msg);
    } finally {
      setCreandoCliente(false);
    }
  };

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
      setClienteCreado(false);
      setSugerencias([]);
      docBuscadoRef.current = "";
      onSuccess(data.id_orden);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "No se pudo crear la orden";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  // Con el teclado abierto la hoja sube; su alto máximo se calcula sobre el
  // espacio que queda, si no el contenido se saldría por arriba.
  const maxSheetHeight = (screenHeight - kbHeight) * 0.85;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/40 justify-end">
        <Animated.View
          className="bg-white rounded-t-3xl px-6 pt-6"
          style={{ maxHeight: maxSheetHeight, marginBottom: kbAnim }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            // flexShrink permite que el teclado propio se lleve su espacio en
            // vez de empujar la hoja fuera de la pantalla.
            style={{ flexShrink: 1 }}
            contentContainerStyle={{
              // Con el teclado abierto el safe-area de abajo ya no aplica:
              // ese espacio lo ocupa el teclado y la hoja ya subió.
              paddingBottom: (kbHeight > 0 ? 0 : insets.bottom) + 24,
            }}
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
                  onChangeText={onCambiarDocumento}
                  // El teclado del sistema no abre: escribe el teclado propio.
                  // Sigue aceptando texto para que la pistola pueda disparar
                  // una cédula directamente sobre el campo.
                  showSoftInputOnFocus={false}
                  onFocus={() => abrirTeclado("documento")}
                />
                {clienteEstado === "buscando" && (
                  <ActivityIndicator size="small" color="#2f2c59" />
                )}
              </View>

              {/* Sugerencias mientras escribe */}
              {sugerencias.length > 0 && (
                <View className="border border-gray-200 rounded-xl mt-1 overflow-hidden">
                  {sugerencias.map((s, i) => (
                    <TouchableOpacity
                      key={s.documento}
                      onPress={() => elegirSugerencia(s)}
                      className={`flex-row items-center px-4 py-3 active:bg-gray-100 ${
                        i > 0 ? "border-t border-gray-100" : ""
                      }`}
                    >
                      <Ionicons name="person-circle-outline" size={22} color="#94a3b8" />
                      <View className="ml-3 flex-1">
                        <Text className="text-appu-text text-sm font-semibold" numberOfLines={1}>
                          {s.nombre}
                        </Text>
                        <Text className="text-gray-400 text-xs mt-0.5">
                          {s.documento}
                          {s.celular ? ` · ${s.celular}` : ""}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {clienteEstado === "encontrado" && !clienteCreado && (
                <Text className="text-appu-green text-xs mt-1 ml-1">
                  ✓ Cliente encontrado, datos autocompletados
                </Text>
              )}
              {clienteCreado && (
                <Text className="text-appu-green text-xs mt-1 ml-1">
                  ✓ Cliente registrado
                </Text>
              )}
              {clienteEstado === "no_encontrado" && (
                <Text className="text-gray-400 text-xs mt-1 ml-1">
                  Cliente nuevo — completa los datos y regístralo
                </Text>
              )}
            </View>

            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm"
              placeholder="Nombre"
              value={nombre}
              onChangeText={setNombre}
              showSoftInputOnFocus={false}
              onFocus={() => abrirTeclado("nombre")}
            />
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm"
              placeholder="Celular"
              keyboardType="phone-pad"
              value={celular}
              onChangeText={setCelular}
              showSoftInputOnFocus={false}
              onFocus={() => abrirTeclado("celular")}
            />

            {/* Registrar cliente nuevo: solo cuando la cédula no existe en
                ninguna fuente. Facturar también lo guardaría, pero esto permite
                dejarlo registrado sin venta de por medio. */}
            {clienteEstado === "no_encontrado" && (
              <TouchableOpacity
                onPress={handleCrearCliente}
                disabled={creandoCliente}
                className="flex-row items-center justify-center border border-appu-blue rounded-xl py-3 mb-5 active:opacity-70"
              >
                {creandoCliente ? (
                  <ActivityIndicator size="small" color="#2f2c59" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={18} color="#2f2c59" />
                    <Text className="text-appu-blue font-semibold text-sm ml-2">
                      Crear cliente nuevo
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {clienteEstado !== "no_encontrado" && <View className="mb-2" />}

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
          </ScrollView>

          {/* Teclado propio: reemplaza al del sistema, que Android oculta
              mientras la pistola lectora esté conectada. `-mx-6` lo saca del
              padding de la hoja para que ocupe todo el ancho. */}
          {campoActivo && (
            <View className="-mx-6">
              <InAppKeyboard
                mode={campoActivo === "nombre" ? "text" : "numeric"}
                label={etiquetaCampo[campoActivo]}
                value={valorCampo[campoActivo]}
                onChange={setterCampo[campoActivo]}
                onClose={() => setCampoActivo(null)}
              />
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
