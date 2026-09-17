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
  calcularPromociones,
  CarritoConPromociones,
  DatosTransferencia,
  SugerenciaCliente,
} from "../services/api";
import { useTecladoAdaptativo } from "../hooks/useTecladoAdaptativo";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: (idOrden: string) => void;
  cajaActiva: { codigo: string; nombre: string } | null;
};

const formatPrice = (n: number) => "$" + n.toLocaleString("es-CO");

// ¿"q" parece una cédula (solo dígitos) o un nombre (trae letras)? Decide qué
// campo llenar cuando no hay selección y determina si vale la pena, además de
// las sugerencias por prefijo/nombre, pedir también el match exacto (que sí
// consulta subsidios, algo que las sugerencias no hacen).
const esSoloDigitos = (texto: string) => /^[0-9]+$/.test(texto);

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
  // Teclado del sistema si no hay pistola conectada; el propio si la hay.
  const { usarPropio, propsCampo } = useTecladoAdaptativo();

  // ── Búsqueda de cliente (un solo campo: nombre o cédula) ────────────────────
  // Un único TextInput dispara la búsqueda; el backend ya decide solo si "q"
  // es un prefijo de documento o un fragmento de nombre (ver
  // MobileAdmin.views.ventas_views.sugerencias_clientes).
  const [clienteQuery, setClienteQuery] = useState("");
  // Cliente elegido de la lista, o registrado con el alta rápida. Mientras
  // haya uno, se deja de buscar: editar el campo lo descarta.
  const [clienteSeleccionado, setClienteSeleccionado] = useState<{
    documento: string;
    nombre: string;
  } | null>(null);
  const [celular, setCelular] = useState("");
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [loading, setLoading] = useState(false);
  const [datosTransf, setDatosTransf] = useState<DatosTransferencia | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const [qrCargado, setQrCargado] = useState(false);

  const [sugerencias, setSugerencias] = useState<SugerenciaCliente[]>([]);
  const [buscando, setBuscando] = useState(false);

  // ── Promociones ────────────────────────────────────────────────────────────
  // El descuento lo calcula el backend (services/api.calcularPromociones):
  // depende de quién es el cliente, de cupos acumulados entre órdenes y de
  // reglas de combo que no tiene sentido duplicar acá. Se recalcula al abrir la
  // hoja y cada vez que cambia el cliente o el carrito.
  const [promo, setPromo] = useState<CarritoConPromociones | null>(null);
  const [calculandoPromo, setCalculandoPromo] = useState(false);

  // Cédula con la que se piden las promociones: la del cliente elegido o, si
  // todavía no eligió, lo escrito cuando ya parece una cédula. Vacío = solo
  // aplican las campañas masivas de la cafetería.
  const documentoParaPromos = clienteSeleccionado
    ? clienteSeleccionado.documento
    : esSoloDigitos(clienteQuery.trim()) && clienteQuery.trim().length >= 5
      ? clienteQuery.trim()
      : "";

  // Alta rápida: solo se ofrece cuando la búsqueda no encontró coincidencias.
  const [crearVisible, setCrearVisible] = useState(false);
  const [nuevoDocumento, setNuevoDocumento] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [clienteCreado, setClienteCreado] = useState(false);

  // ── Teclado propio ─────────────────────────────────────────────────────────
  // La pistola lectora se empareja como teclado físico HID y Android oculta el
  // teclado en pantalla mientras esté conectada. Estos campos usan el teclado
  // dibujado por la app, así el cajero escribe siempre, con pistola o sin ella.
  type Campo = "cliente" | "celular" | "nuevoDocumento" | "nuevoNombre";
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

  // ── Búsqueda mientras escribe (por nombre o por cédula, un solo campo) ─────
  // Sale de dos fuentes en paralelo:
  //  1. Sugerencias por prefijo/nombre, siempre — rápidas, solo la caché.
  //  2. Si "q" parece una cédula completa, además el match exacto, que sí
  //     consulta subsidios (la caché sola no alcanza para clientes que nunca
  //     se le facturaron a esta cafetería pero sí tienen subsidio activo).
  // Mientras haya un cliente seleccionado no se busca: editar el campo lo
  // descarta (ver onCambiarClienteQuery) y recién ahí se reactiva.
  useEffect(() => {
    const q = clienteQuery.trim();
    setClienteCreado(false);

    if (clienteSeleccionado || q.length < 3 || !selectedCafeteria) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }

    let cancelado = false;
    setBuscando(true);

    const timer = setTimeout(async () => {
      const soloDigitos = esSoloDigitos(q);
      try {
        const [sugRes, exactoRes] = await Promise.all([
          buscarSugerenciasClientes(q, selectedCafeteria.id),
          soloDigitos && q.length >= 5
            ? buscarClientePorDocumento(q, selectedCafeteria.id).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelado) return;

        let lista = sugRes.data.sugerencias;
        const exacto = exactoRes?.data?.cliente;
        if (exacto && !lista.some((s) => s.documento === exacto.documento)) {
          lista = [
            {
              documento: exacto.documento,
              nombre: exacto.nombre,
              celular: exacto.celular,
              correo: exacto.correo,
            },
            ...lista,
          ];
        }
        setSugerencias(lista);
      } catch {
        if (!cancelado) setSugerencias([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 350);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [clienteQuery, clienteSeleccionado, selectedCafeteria]);

  // Sin cliente elegido igual se pide: las campañas masivas de la cafetería
  // aplican a cualquiera, incluido un cliente nuevo o uno sin registrar.
  useEffect(() => {
    if (!visible || !selectedCafeteria || items.length === 0) {
      setPromo(null);
      // Si no, un "calculando" quedaría colgado y el botón de facturar
      // deshabilitado la próxima vez que se abra la hoja.
      setCalculandoPromo(false);
      return;
    }

    let cancelado = false;
    setCalculandoPromo(true);

    // El retraso evita una llamada por cada tecla mientras se escribe la cédula.
    const timer = setTimeout(async () => {
      try {
        const { data } = await calcularPromociones({
          cafeteria_id: selectedCafeteria.id,
          documento: documentoParaPromos,
          carrito: items.map((i) => ({
            id_producto: i.id_producto,
            producto: i.producto,
            precio: i.precio,
            cantidad: i.cantidad,
          })),
        });
        if (!cancelado) setPromo(data);
      } catch {
        // Si falla, se factura a precio de lista: nunca se bloquea la venta.
        if (!cancelado) setPromo(null);
      } finally {
        if (!cancelado) setCalculandoPromo(false);
      }
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [visible, selectedCafeteria, items, documentoParaPromos]);

  // Lo que realmente se va a cobrar y a guardar en la orden.
  const hayDescuento = !!promo && promo.total_descuento > 0;
  const totalACobrar = hayDescuento ? promo!.total : total;
  const carritoFinal = hayDescuento ? promo!.items : items;

  const elegirSugerencia = (s: SugerenciaCliente) => {
    setClienteSeleccionado({ documento: s.documento, nombre: s.nombre });
    setClienteQuery(s.nombre || s.documento);
    if (s.celular) setCelular(s.celular);
    setSugerencias([]);
    setCrearVisible(false);
    setCampoActivo(null);
    Keyboard.dismiss();
  };

  const onCambiarClienteQuery = (v: string) => {
    // Cualquier edición descarta la selección: si no, el campo mostraría un
    // nombre desactualizado mientras la búsqueda ya apunta a otra cosa.
    if (clienteSeleccionado) setClienteSeleccionado(null);
    setCrearVisible(false);
    setClienteQuery(v);
  };

  // Cuando la búsqueda no encuentra nada, se ofrece el alta rápida en vez de
  // dejar al cajero sin salida.
  const sinCoincidencias =
    !clienteSeleccionado &&
    !buscando &&
    clienteQuery.trim().length >= 3 &&
    sugerencias.length === 0;

  const abrirFormularioCrear = () => {
    const q = clienteQuery.trim();
    const soloDigitos = esSoloDigitos(q);
    // Precarga con lo que ya se escribió: si eran puros dígitos, es el
    // documento; si no, es el nombre. El otro campo queda para completar.
    setNuevoDocumento(soloDigitos ? q : "");
    setNuevoNombre(soloDigitos ? "" : q);
    setCrearVisible(true);
  };

  // Mapas del teclado propio.
  const valorCampo: Record<Campo, string> = {
    cliente: clienteQuery,
    celular,
    nuevoDocumento,
    nuevoNombre,
  };
  const setterCampo: Record<Campo, (v: string) => void> = {
    cliente: onCambiarClienteQuery,
    celular: setCelular,
    nuevoDocumento: setNuevoDocumento,
    nuevoNombre: setNuevoNombre,
  };
  const etiquetaCampo: Record<Campo, string> = {
    cliente: "Cliente",
    celular: "Celular",
    nuevoDocumento: "Documento",
    nuevoNombre: "Nombre",
  };
  const modoCampo: Record<Campo, "numeric" | "text"> = {
    // El pad de texto ya trae su propia fila de dígitos (ver InAppKeyboard),
    // así que sirve igual para escribir un nombre o una cédula.
    cliente: "text",
    celular: "numeric",
    nuevoDocumento: "numeric",
    nuevoNombre: "text",
  };

  // Al enfocar un campo con el teclado propio, cerramos el del sistema por si
  // llegó a abrirse (p. ej. si la pistola no está conectada).
  const abrirTeclado = (campo: Campo) => {
    Keyboard.dismiss();
    setCampoActivo(campo);
  };

  const handleCrearCliente = async () => {
    if (!selectedCafeteria) return;
    const doc = nuevoDocumento.replace(/\D/g, "");
    if (!doc) {
      Alert.alert("Falta el documento", "Escribe el número de documento del cliente.");
      return;
    }
    if (!nuevoNombre.trim()) {
      Alert.alert("Falta el nombre", "Escribe el nombre del cliente.");
      return;
    }
    setCreandoCliente(true);
    try {
      await crearCliente({
        cafeteria_id: selectedCafeteria.id,
        documento: doc,
        nombre: nuevoNombre.trim(),
        celular: celular.trim(),
      });
      setClienteSeleccionado({ documento: doc, nombre: nuevoNombre.trim() });
      setClienteQuery(nuevoNombre.trim());
      setClienteCreado(true);
      setCrearVisible(false);
      setSugerencias([]);
      setCampoActivo(null);
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

  // Documento/nombre finales para la orden: el cliente seleccionado si lo
  // hay, o lo que se haya escrito sin llegar a elegir/crear nada — permite
  // seguir facturando "a mano" con solo un nombre suelto, como antes.
  const datosClienteFinal = () => {
    if (clienteSeleccionado) return clienteSeleccionado;
    const q = clienteQuery.trim();
    if (!q) return { documento: "", nombre: "" };
    return esSoloDigitos(q) ? { documento: q, nombre: "" } : { documento: "", nombre: q };
  };

  const handleFacturar = async () => {
    if (!selectedCafeteria) return;
    const { documento: doc, nombre: nom } = datosClienteFinal();
    setLoading(true);
    try {
      const { data } = await crearOrden({
        cafeteria_id: selectedCafeteria.id,
        // `carritoFinal` son las líneas que devolvió el backend con el
        // descuento aplicado (promocionId, descuentoTotal, precio original).
        // Esos campos viajan a la orden tal cual: son los que leen el reporte
        // de promociones de Costos y el del SuperAdmin. Sin promociones es el
        // carrito normal.
        carrito: carritoFinal.map((i) => ({
          id_producto: i.id_producto,
          producto: i.producto,
          precio: i.precio,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          precio_unitario_original: i.precio_unitario_original,
          precioTotal: i.precioTotal,
          descuentoTotal: i.descuentoTotal,
          promocionId: i.promocionId,
          unidadesPromocion: i.unidadesPromocion,
          promocion_aplicada: i.promocion_aplicada,
          combo_aplicado: i.combo_aplicado,
        })),
        nombre_cliente: nom.trim() || "Sin nombre",
        documento_cliente: doc.trim() || "0",
        celular_cliente: celular.trim() || "0",
        metodo_pago: metodoPago,
        monto: totalACobrar,
        caja_codigo: cajaActiva?.codigo ?? "",
      });

      clearCart();
      setPromo(null);
      setClienteQuery("");
      setClienteSeleccionado(null);
      setCelular("");
      setClienteCreado(false);
      setSugerencias([]);
      setCrearVisible(false);
      setNuevoDocumento("");
      setNuevoNombre("");
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

  const listaSugerencias = sugerencias.length > 0 && (
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
  );

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
            <View className="bg-gray-50 rounded-2xl p-4 mb-3">
              {carritoFinal.map((item) => {
                const descuentoLinea = item.descuentoTotal ?? 0;
                const bruto =
                  (item.precio_unitario_original ?? item.precio) * item.cantidad;
                return (
                  <View key={item.id_producto} className="mb-2">
                    <View className="flex-row justify-between">
                      <Text className="text-gray-600 text-sm flex-1" numberOfLines={1}>
                        {item.cantidad}× {item.producto}
                        {item.agregado_por_promocion ? "  🎁" : ""}
                      </Text>
                      <View className="ml-2 items-end">
                        {descuentoLinea > 0 && (
                          <Text
                            className="text-gray-400 text-xs"
                            style={{ textDecorationLine: "line-through" }}
                          >
                            {formatPrice(bruto)}
                          </Text>
                        )}
                        <Text className="text-appu-text font-semibold text-sm">
                          {formatPrice(item.precio * item.cantidad)}
                        </Text>
                      </View>
                    </View>
                    {descuentoLinea > 0 && (
                      <Text className="text-appu-green text-xs mt-0.5">
                        {item.promocion_aplicada?.nombre ??
                          item.combo_aplicado?.nombre ??
                          "Promoción"}
                        {" · −"}
                        {formatPrice(descuentoLinea)}
                      </Text>
                    )}
                  </View>
                );
              })}

              {hayDescuento && (
                <>
                  <View className="border-t border-gray-200 pt-2 mt-2 flex-row justify-between">
                    <Text className="text-gray-500 text-sm">Subtotal</Text>
                    <Text className="text-gray-500 text-sm">
                      {formatPrice(promo!.total_sin_descuento)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-appu-green text-sm font-semibold">
                      Descuento por promociones
                    </Text>
                    <Text className="text-appu-green text-sm font-semibold">
                      −{formatPrice(promo!.total_descuento)}
                    </Text>
                  </View>
                </>
              )}

              <View
                className={`${
                  hayDescuento ? "mt-2" : "border-t border-gray-200 pt-2 mt-2"
                } flex-row justify-between items-center`}
              >
                <Text className="text-appu-text font-bold">Total</Text>
                <View className="flex-row items-center">
                  {calculandoPromo && (
                    <ActivityIndicator size="small" color="#2f2c59" style={{ marginRight: 8 }} />
                  )}
                  <Text className="text-appu-blue font-bold text-lg">
                    {formatPrice(totalACobrar)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Promociones aplicadas: qué marca las patrocina (a quien el
                comercio le va a cobrar ese descuento). */}
            {hayDescuento && (
              <View className="border border-appu-green/30 bg-green-50 rounded-2xl p-4 mb-5">
                <Text className="text-appu-green text-xs font-semibold uppercase tracking-wider mb-2">
                  🎯 Promociones aplicadas
                </Text>
                {promo!.promociones_aplicadas.map((pr) => (
                  <View key={pr.id} className="mb-2">
                    <View className="flex-row justify-between">
                      <Text className="text-appu-text text-sm font-semibold flex-1" numberOfLines={2}>
                        {pr.nombre}
                      </Text>
                      <Text className="text-appu-green text-sm font-bold ml-2">
                        −{formatPrice(pr.descuento_total)}
                      </Text>
                    </View>
                    <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={2}>
                      {pr.empresa_patrocinadora
                        ? `🏢 Lo paga ${pr.empresa_patrocinadora}`
                        : "🏪 Lo asume el comercio"}
                      {pr.productos.length > 0 ? ` · ${pr.productos.join(", ")}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Promos vigentes que aún no aplican: le dicen al cajero qué le
                falta al carrito para que el cliente se las lleve. */}
            {!!promo && promo.promociones_disponibles.length > 0 && !hayDescuento && (
              <View className="border border-amber-200 bg-amber-50 rounded-2xl p-4 mb-5">
                <Text className="text-amber-700 text-xs font-semibold uppercase tracking-wider mb-2">
                  Promociones disponibles
                </Text>
                {promo.promociones_disponibles.slice(0, 4).map((pr) => (
                  <Text key={pr.id} className="text-amber-800 text-xs mb-1" numberOfLines={2}>
                    • {pr.descripcion || pr.nombre}
                    {pr.empresa_patrocinadora ? ` (${pr.empresa_patrocinadora})` : ""}
                  </Text>
                ))}
              </View>
            )}

            {/* Cliente: un solo campo busca por nombre o por cédula */}
            <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
              Cliente (opcional)
            </Text>
            <View className="mb-3">
              <View className="flex-row items-center border border-gray-200 rounded-xl px-4">
                <Ionicons name="search-outline" size={18} color="#9ca3af" />
                <TextInput
                  className="flex-1 py-3 px-2 text-sm"
                  placeholder="Nombre o cédula del cliente"
                  placeholderTextColor="#9ca3af"
                  value={clienteQuery}
                  onChangeText={onCambiarClienteQuery}
                  // El teclado del sistema no abre: escribe el teclado propio.
                  // Sigue aceptando texto para que la pistola pueda disparar
                  // una cédula directamente sobre el campo.
                  {...propsCampo(() => abrirTeclado("cliente"))}
                />
                {buscando && <ActivityIndicator size="small" color="#2f2c59" />}
                {!buscando && clienteQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => onCambiarClienteQuery("")}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                )}
              </View>

              {listaSugerencias}

              {clienteSeleccionado && !clienteCreado && (
                <Text className="text-appu-green text-xs mt-1 ml-1">
                  ✓ Cliente encontrado · {clienteSeleccionado.documento}
                </Text>
              )}
              {clienteCreado && (
                <Text className="text-appu-green text-xs mt-1 ml-1">
                  ✓ Cliente registrado
                </Text>
              )}
              {sinCoincidencias && !crearVisible && (
                <TouchableOpacity
                  onPress={abrirFormularioCrear}
                  className="flex-row items-center mt-1.5 ml-1 active:opacity-70"
                >
                  <Ionicons name="person-add-outline" size={15} color="#2f2c59" />
                  <Text className="text-appu-blue text-xs font-semibold ml-1.5">
                    No encontrado — crear cliente nuevo
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Alta rápida: solo aparece cuando la búsqueda no encontró nada */}
            {crearVisible && (
              <View className="border border-appu-blue/30 bg-blue-50 rounded-2xl p-4 mb-3">
                <Text className="text-appu-blue text-xs font-semibold uppercase tracking-wider mb-3">
                  Registrar cliente nuevo
                </Text>
                <TextInput
                  className="border border-gray-200 rounded-xl px-4 py-3 mb-2 text-sm bg-white"
                  placeholder="Documento (cédula)"
                  placeholderTextColor="#9ca3af"
                  value={nuevoDocumento}
                  onChangeText={setNuevoDocumento}
                  {...propsCampo(() => abrirTeclado("nuevoDocumento"))}
                />
                <TextInput
                  className="border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm bg-white"
                  placeholder="Nombre"
                  placeholderTextColor="#9ca3af"
                  value={nuevoNombre}
                  onChangeText={setNuevoNombre}
                  {...propsCampo(() => abrirTeclado("nuevoNombre"))}
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setCrearVisible(false)}
                    disabled={creandoCliente}
                    className="flex-1 border border-gray-200 rounded-xl py-2.5 items-center bg-white"
                  >
                    <Text className="text-gray-600 text-sm font-semibold">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCrearCliente}
                    disabled={creandoCliente}
                    className="flex-1 bg-appu-blue rounded-xl py-2.5 items-center"
                  >
                    {creandoCliente ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-white text-sm font-semibold">Guardar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 mb-5 text-sm"
              placeholder="Celular"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              value={celular}
              onChangeText={setCelular}
              {...propsCampo(() => abrirTeclado("celular"))}
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

              {/* Deshabilitado mientras se calculan las promociones: facturar
                  en ese instante cobraría precio de lista y el cliente perdería
                  el descuento que sí le correspondía. */}
              <TouchableOpacity
                onPress={handleFacturar}
                disabled={loading || calculandoPromo}
                className={`flex-1 rounded-xl py-4 items-center ${
                  loading || calculandoPromo
                    ? "bg-appu-green/50"
                    : "bg-appu-green active:opacity-80"
                }`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold">
                    {calculandoPromo ? "Calculando..." : "Facturar"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Teclado propio: reemplaza al del sistema, que Android oculta
              mientras la pistola lectora esté conectada. `-mx-6` lo saca del
              padding de la hoja para que ocupe todo el ancho. */}
          {usarPropio && campoActivo && (
            <View className="-mx-6">
              <InAppKeyboard
                mode={modoCampo[campoActivo]}
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
