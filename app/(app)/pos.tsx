import { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Keyboard,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/authStore";
import { useCartStore } from "../../store/cartStore";
import {
  getProductos,
  getCajas,
  type Producto,
  type Caja,
} from "../../services/api";
import ProductCard from "../../components/ProductCard";
import CartTab from "../../components/CartTab";
import CheckoutModal from "../../components/CheckoutModal";

type Tab = "ventas" | "carrito" | "caja";

const COLS = 3;

export default function PosScreen() {
  // Selectores individuales: cada valor se suscribe por separado, evitando
  // re-renders de toda la pantalla cuando cambia una parte no usada del store.
  const selectedCafeteria = useAuthStore((s) => s.selectedCafeteria);
  const username = useAuthStore((s) => s.username);
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const addItem = useCartStore((s) => s.addItem);
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<Tab>("ventas");
  const [search, setSearch] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaActiva, setCajaActiva] = useState<Caja | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCafeteria) return;
    loadData();
  }, [selectedCafeteria]);

  const loadData = async () => {
    if (!selectedCafeteria) return;
    setLoading(true);
    try {
      const [prodRes, cajaRes] = await Promise.all([
        getProductos(selectedCafeteria.id),
        getCajas(selectedCafeteria.id),
      ]);
      setProductos(prodRes.data.productos);
      setCategorias(prodRes.data.categorias);
      setCajas(cajaRes.data.cajas);
      if (cajaRes.data.cajas.length > 0) setCajaActiva(cajaRes.data.cajas[0]);
    } catch {
      Alert.alert("Error", "No se pudieron cargar los productos");
    } finally {
      setLoading(false);
    }
  };

  // Filtrado de productos
  const productosFiltrados = useMemo(() => {
    let list = productos;
    if (categoriaActiva) list = list.filter((p) => p.categoria === categoriaActiva);
    if (search.trim())
      list = list.filter((p) =>
        p.producto.toLowerCase().includes(search.toLowerCase())
      );
    return list;
  }, [productos, categoriaActiva, search]);

  // Cantidad de un producto en el carrito
  const cantidadEnCarrito = (id: string) =>
    items.find((i) => i.id_producto === id)?.cantidad ?? 0;

  const handleOrdenExitosa = (idOrden: string) => {
    setCheckoutVisible(false);
    setLastOrder(idOrden);
    setActiveTab("ventas");
    Alert.alert(
      "¡Venta creada!",
      `Orden ${idOrden} registrada correctamente.`,
      [{ text: "OK" }]
    );
  };

  // ─── Render tabs content ────────────────────────────────────────────────────

  const renderVentasContent = () => {
    if (loading) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2f2c59" />
          <Text className="text-gray-400 mt-3">Cargando productos...</Text>
        </View>
      );
    }

    return (
      <View className="flex-1">
        {/* Búsqueda */}
        <View className="px-4 py-3">
          <View className="bg-white rounded-2xl flex-row items-center px-4 py-2 shadow-sm">
            <Text className="text-gray-400 mr-2">🔍</Text>
            <TextInput
              className="flex-1 text-sm text-appu-text"
              placeholder="Buscar productos..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Text className="text-gray-400 ml-2">✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Categorías */}
        {categorias.length > 0 && (
          <View className="pl-4 mb-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pr-4">
                <TouchableOpacity
                  onPress={() => setCategoriaActiva(null)}
                  className={`px-4 py-2 rounded-full border ${
                    categoriaActiva === null
                      ? "bg-appu-blue border-appu-blue"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      categoriaActiva === null ? "text-white" : "text-gray-600"
                    }`}
                  >
                    Todos
                  </Text>
                </TouchableOpacity>
                {categorias.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() =>
                      setCategoriaActiva(cat === categoriaActiva ? null : cat)
                    }
                    className={`px-4 py-2 rounded-full border ${
                      categoriaActiva === cat
                        ? "bg-appu-blue border-appu-blue"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        categoriaActiva === cat ? "text-white" : "text-gray-600"
                      }`}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Grid de productos */}
        <FlatList
          data={productosFiltrados}
          keyExtractor={(item) => item.id_producto}
          numColumns={COLS}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
          columnWrapperStyle={{ justifyContent: "flex-start" }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={{ flex: 1 / COLS }}>
              <ProductCard
                producto={item}
                cantidad={cantidadEnCarrito(item.id_producto)}
                onPress={() => addItem(item)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center mt-16">
              <Text className="text-4xl mb-3">📭</Text>
              <Text className="text-gray-400 text-base">Sin productos</Text>
            </View>
          }
        />
      </View>
    );
  };

  // ─── UI ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-appu-dark">
      <StatusBar barStyle="light-content" backgroundColor="#1a1a4e" />

      {/* Header */}
      <View className="bg-appu-dark px-4 py-3 flex-row items-center justify-between">
        <Text className="text-white text-2xl font-bold tracking-wider">appu</Text>

        <View className="flex-row items-center gap-3">
          {/* Selector de caja */}
          {cajas.length > 0 && (
            <View className="bg-white/15 rounded-xl px-3 py-1.5 flex-row items-center">
              <Text className="text-white text-xs font-medium">
                {cajaActiva?.nombre ?? "Sin caja"}
              </Text>
              <Text className="text-white/60 text-xs ml-1">▾</Text>
            </View>
          )}

          {/* Avatar usuario */}
          <View className="w-8 h-8 rounded-full bg-appu-orange items-center justify-center">
            <Text className="text-white text-xs font-bold">
              {(username ?? "U")[0].toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View className="bg-appu-dark px-4 pb-3 flex-row gap-2">
        {(["ventas", "carrito", "caja"] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = {
            ventas: "🏠 VENTAS",
            carrito: "🛒 CARRITO",
            caja: "💰 CAJA",
          };
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl items-center ${
                isActive ? "bg-white/20" : "bg-appu-orange"
              }`}
            >
              <Text className="text-white text-xs font-bold">{labels[tab]}</Text>
              {tab === "carrito" && items.length > 0 && !isActive && (
                <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-4 h-4 items-center justify-center">
                  <Text className="text-white text-xs font-bold" style={{ fontSize: 9 }}>
                    {items.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <View className="flex-1 bg-gray-50">
        {activeTab === "ventas" && renderVentasContent()}
        {activeTab === "carrito" && <CartTab />}
        {activeTab === "caja" && (
          <View className="flex-1 items-center justify-center">
            <Text className="text-4xl mb-3">🔧</Text>
            <Text className="text-gray-400 text-base">Próximamente</Text>
          </View>
        )}
      </View>

      {/* Barra inferior — siempre visible en VENTAS y CARRITO */}
      {activeTab !== "caja" && (
        <View
          className="bg-white border-t border-gray-100 px-4 pt-3 shadow-lg"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-appu-text text-base font-semibold">Total:</Text>
            <Text className="text-appu-text text-xl font-bold">
              ${total.toLocaleString("es-CO")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (items.length === 0) {
                Alert.alert("Carrito vacío", "Agrega productos antes de facturar");
                return;
              }
              setCheckoutVisible(true);
            }}
            className="bg-appu-green rounded-2xl py-4 items-center active:opacity-80"
          >
            <Text className="text-white font-bold text-base tracking-widest uppercase">
              Facturar
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de checkout */}
      <CheckoutModal
        visible={checkoutVisible}
        onClose={() => setCheckoutVisible(false)}
        onSuccess={handleOrdenExitosa}
        cajaActiva={cajaActiva ? { codigo: cajaActiva.codigo, nombre: cajaActiva.nombre } : null}
      />
    </SafeAreaView>
  );
}
