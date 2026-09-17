import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  getCuentaPorCobrar,
  getDetallePorCobrar,
  marcarCobrado,
  type CuentaPorCobrar,
  type EmpresaPorCobrar,
  type FilaPorCobrar,
} from "../services/api";

/**
 * "¿Cuánto me deben por las promociones?"
 *
 * Cuando una promoción descuenta plata de una venta, ese descuento lo pone el
 * comercio de su bolsillo y la marca que patrocina la campaña se lo reembolsa.
 * Esta pantalla es el estado de cuenta de eso: total por empresa, desglose por
 * campaña, y el detalle venta por venta para poder reclamarlo.
 *
 * El cálculo sale del libro de usos del backend
 * (`/promociones/por-cobrar/`), no de sumar el carrito acá.
 */

const formatPrice = (n: number) => "$" + (n ?? 0).toLocaleString("es-CO");

const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (dias: number) =>
  new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

type Rango = "30" | "90" | "todo";

const RANGOS: { valor: Rango; etiqueta: string }[] = [
  { valor: "30", etiqueta: "30 días" },
  { valor: "90", etiqueta: "90 días" },
  { valor: "todo", etiqueta: "Todo" },
];

type Props = {
  visible: boolean;
  cafeteriaId: string | null;
  cafeteriaNombre?: string;
  onClose: () => void;
};

export default function PorCobrarScreen(props: Props) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={props.onClose}
    >
      {/* SafeAreaProvider propio: los insets no se propagan dentro de un Modal
          de React Native (mismo motivo que en FullScreenForm). */}
      <SafeAreaProvider>
        <Contenido {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Contenido({ visible, cafeteriaId, cafeteriaNombre, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const [rango, setRango] = useState<Rango>("30");
  const [incluirPagados, setIncluirPagados] = useState(false);
  const [cuenta, setCuenta] = useState<CuentaPorCobrar | null>(null);
  const [cargando, setCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  // Empresa desplegada y su detalle venta por venta (se pide al abrirla, no de
  // entrada: el detalle de todas las marcas sería un listado enorme).
  const [empresaAbierta, setEmpresaAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<FilaPorCobrar[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [marcando, setMarcando] = useState(false);

  const fechaInicio = rango === "todo" ? undefined : haceDias(Number(rango));
  const fechaFin = rango === "todo" ? undefined : hoy();

  const cargar = useCallback(async () => {
    if (!cafeteriaId) return;
    setCargando(true);
    try {
      const { data } = await getCuentaPorCobrar({
        cafeteria_id: cafeteriaId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        incluir_pagados: incluirPagados,
      });
      setCuenta(data);
    } catch {
      setCuenta(null);
    } finally {
      setCargando(false);
    }
  }, [cafeteriaId, fechaInicio, fechaFin, incluirPagados]);

  useEffect(() => {
    if (!visible) return;
    // Cambiar de filtro invalida el detalle abierto.
    setEmpresaAbierta(null);
    setDetalle([]);
    cargar();
  }, [visible, cargar]);

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  };

  const abrirEmpresa = async (empresa: EmpresaPorCobrar) => {
    if (empresaAbierta === empresa.empresa) {
      setEmpresaAbierta(null);
      setDetalle([]);
      return;
    }
    setEmpresaAbierta(empresa.empresa);
    setDetalle([]);
    if (!cafeteriaId) return;

    setCargandoDetalle(true);
    try {
      const { data } = await getDetallePorCobrar({
        cafeteria_id: cafeteriaId,
        // El backend representa "sin patrocinador" con la cadena vacía; "-" es
        // el comodín acordado para pedir justo esas filas.
        empresa: empresa.patrocinada ? empresa.empresa : "-",
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        incluir_pagados: incluirPagados,
      });
      setDetalle(data.filas);
    } catch {
      setDetalle([]);
    } finally {
      setCargandoDetalle(false);
    }
  };

  const confirmarCobro = (empresa: EmpresaPorCobrar) => {
    const ids = detalle.filter((f) => f.estado_pago !== "pagado").map((f) => f.id);
    if (ids.length === 0) {
      Alert.alert("Nada por marcar", "No hay movimientos pendientes en esta lista.");
      return;
    }
    Alert.alert(
      "Marcar como cobrado",
      `¿Ya te reembolsaron ${formatPrice(empresa.total)} de ${empresa.empresa}?\n\n` +
        `Se marcarán ${ids.length} movimiento${ids.length === 1 ? "" : "s"} como cobrados. ` +
        "No cambia ninguna venta ni el descuento que ya se le hizo al cliente.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, ya me pagaron",
          onPress: async () => {
            setMarcando(true);
            try {
              await marcarCobrado(ids, true);
              setEmpresaAbierta(null);
              setDetalle([]);
              await cargar();
            } catch {
              Alert.alert("Error", "No se pudo marcar como cobrado. Intenta de nuevo.");
            } finally {
              setMarcando(false);
            }
          },
        },
      ]
    );
  };

  const empresas = cuenta?.empresas ?? [];

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar barStyle="light-content" />

      {/* Cabecera */}
      <View className="bg-appu-dark px-4 pb-4" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={26} color="white" />
          </TouchableOpacity>
          <View className="flex-1 ml-3">
            <Text className="text-white font-bold text-base">Promociones por cobrar</Text>
            {!!cafeteriaNombre && (
              <Text className="text-white/60 text-xs mt-0.5" numberOfLines={1}>
                {cafeteriaNombre}
              </Text>
            )}
          </View>
        </View>

        {/* Total grande: es el número que el tendero viene a ver. */}
        <View className="mt-4">
          <Text className="text-white/60 text-xs uppercase tracking-wider">
            {incluirPagados ? "Total descontado" : "Te deben"}
          </Text>
          <Text className="text-white font-bold" style={{ fontSize: 34 }}>
            {cargando && !cuenta ? "—" : formatPrice(cuenta?.total ?? 0)}
          </Text>
          <Text className="text-white/60 text-xs mt-1">
            {cuenta?.total_usos ?? 0} venta{(cuenta?.total_usos ?? 0) === 1 ? "" : "s"} con
            promoción · {cuenta?.total_empresas ?? 0} empresa
            {(cuenta?.total_empresas ?? 0) === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      {/* Filtros */}
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="flex-row gap-2">
          {RANGOS.map((r) => (
            <TouchableOpacity
              key={r.valor}
              onPress={() => setRango(r.valor)}
              className={`px-3 py-2 rounded-xl border ${
                rango === r.valor
                  ? "bg-appu-blue border-appu-blue"
                  : "bg-white border-gray-200"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  rango === r.valor ? "text-white" : "text-gray-600"
                }`}
              >
                {r.etiqueta}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={() => setIncluirPagados((v) => !v)}
            className={`px-3 py-2 rounded-xl border flex-row items-center ${
              incluirPagados ? "bg-appu-blue border-appu-blue" : "bg-white border-gray-200"
            }`}
          >
            <Ionicons
              name={incluirPagados ? "checkbox" : "square-outline"}
              size={14}
              color={incluirPagados ? "white" : "#6b7280"}
            />
            <Text
              className={`text-xs font-semibold ml-1.5 ${
                incluirPagados ? "text-white" : "text-gray-600"
              }`}
            >
              Ver cobrados
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor="#2f2c59" />
        }
      >
        {cargando && !cuenta ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="#2f2c59" />
          </View>
        ) : empresas.length === 0 ? (
          <View className="py-16 items-center">
            <Text className="text-4xl mb-3">🧾</Text>
            <Text className="text-gray-400 text-base">Sin promociones por cobrar</Text>
            <Text className="text-gray-300 text-sm mt-1 text-center px-8">
              Cuando vendas con una promoción, acá verás cuánto te debe cada marca.
            </Text>
          </View>
        ) : (
          empresas.map((empresa) => {
            const abierta = empresaAbierta === empresa.empresa;
            return (
              <View
                key={empresa.empresa}
                className="bg-white rounded-2xl mb-3 overflow-hidden shadow-sm"
              >
                <TouchableOpacity
                  onPress={() => abrirEmpresa(empresa)}
                  className="p-4 active:bg-gray-50"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-appu-text font-bold text-base" numberOfLines={2}>
                        {empresa.patrocinada ? `🏢 ${empresa.empresa}` : "🏪 Sin patrocinador"}
                      </Text>
                      <Text className="text-gray-400 text-xs mt-1">
                        {empresa.usos} venta{empresa.usos === 1 ? "" : "s"} ·{" "}
                        {empresa.clientes} cliente{empresa.clientes === 1 ? "" : "s"} ·{" "}
                        {empresa.promociones.length} promoción
                        {empresa.promociones.length === 1 ? "" : "es"}
                      </Text>
                      {!empresa.patrocinada && (
                        <Text className="text-gray-400 text-xs mt-1">
                          Este descuento lo asumió el comercio: no hay a quién cobrárselo.
                        </Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text
                        className={`font-bold text-lg ${
                          empresa.patrocinada ? "text-appu-green" : "text-gray-400"
                        }`}
                      >
                        {formatPrice(empresa.total)}
                      </Text>
                      <Ionicons
                        name={abierta ? "chevron-up" : "chevron-down"}
                        size={16}
                        color="#9ca3af"
                      />
                    </View>
                  </View>

                  {/* Desglose por campaña: siempre visible, es barato y es lo
                      que se reclama ("me debes X por la promo Y"). */}
                  <View className="mt-3 border-t border-gray-100 pt-3">
                    {empresa.promociones.map((pr) => (
                      <View key={pr.promocion_id} className="flex-row justify-between mb-1.5">
                        <View className="flex-1 pr-2">
                          <Text className="text-gray-600 text-sm" numberOfLines={1}>
                            {pr.nombre}
                            {pr.alcance === "masiva" ? "  📣" : ""}
                          </Text>
                          <Text className="text-gray-400 text-xs">
                            {pr.usos} uso{pr.usos === 1 ? "" : "s"}
                            {pr.ultima_fecha
                              ? ` · último ${pr.ultima_fecha.slice(0, 10)}`
                              : ""}
                          </Text>
                        </View>
                        <Text className="text-appu-text text-sm font-semibold">
                          {formatPrice(pr.total)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>

                {/* Detalle venta por venta */}
                {abierta && (
                  <View className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                    {cargandoDetalle ? (
                      <ActivityIndicator color="#2f2c59" />
                    ) : detalle.length === 0 ? (
                      <Text className="text-gray-400 text-xs text-center py-2">
                        Sin movimientos en este rango.
                      </Text>
                    ) : (
                      <>
                        <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">
                          Detalle ({detalle.length})
                        </Text>
                        {detalle.slice(0, 40).map((fila) => (
                          <View
                            key={fila.id}
                            className="flex-row justify-between py-2 border-b border-gray-100"
                          >
                            <View className="flex-1 pr-2">
                              <Text className="text-appu-text text-sm" numberOfLines={1}>
                                {fila.cantidad}× {fila.producto}
                              </Text>
                              <Text className="text-gray-400 text-xs" numberOfLines={1}>
                                {fila.fecha} · {fila.cliente}
                                {fila.documento ? ` (${fila.documento})` : ""}
                              </Text>
                              <Text className="text-gray-400 text-xs" numberOfLines={1}>
                                {fila.promocion}
                              </Text>
                            </View>
                            <View className="items-end">
                              <Text className="text-appu-green text-sm font-semibold">
                                {formatPrice(fila.descuento)}
                              </Text>
                              {fila.estado_pago === "pagado" && (
                                <Text className="text-gray-400 text-xs">cobrado</Text>
                              )}
                            </View>
                          </View>
                        ))}
                        {detalle.length > 40 && (
                          <Text className="text-gray-400 text-xs text-center mt-2">
                            Se muestran los 40 más recientes de {detalle.length}.
                          </Text>
                        )}

                        {empresa.patrocinada && !incluirPagados && (
                          <TouchableOpacity
                            onPress={() => confirmarCobro(empresa)}
                            disabled={marcando}
                            className="bg-appu-blue rounded-xl py-3 items-center mt-3 active:opacity-80"
                          >
                            {marcando ? (
                              <ActivityIndicator size="small" color="white" />
                            ) : (
                              <Text className="text-white font-semibold text-sm">
                                Ya me pagaron esto
                              </Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
