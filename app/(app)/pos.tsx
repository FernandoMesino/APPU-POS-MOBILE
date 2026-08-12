import { useEffect, useState, useMemo, useRef } from "react";
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
  Modal,
  Pressable,
  Vibration,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore } from "../../store/authStore";
import { useCartStore } from "../../store/cartStore";
import {
  getProductos,
  getCajas,
  getOrdenesDia,
  type Producto,
  type Caja,
  type OrdenDia,
} from "../../services/api";
import ProductCard from "../../components/ProductCard";
import CartTab from "../../components/CartTab";
import CheckoutModal from "../../components/CheckoutModal";
import EditPriceModal from "../../components/EditPriceModal";
import NewCajaModal from "../../components/NewCajaModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import InAppKeyboard from "../../components/InAppKeyboard";
import CreateProductoScreen from "../../components/CreateProductoScreen";

type Tab = "ventas" | "carrito" | "caja";

const COLS = 3;

export default function PosScreen() {
  // Selectores individuales: cada valor se suscribe por separado, evitando
  // re-renders de toda la pantalla cuando cambia una parte no usada del store.
  const selectedCafeteria = useAuthStore((s) => s.selectedCafeteria);
  const username = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);
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
  const [editandoProducto, setEditandoProducto] = useState<Producto | null>(null);

  // Menús del header
  const [cajaMenuVisible, setCajaMenuVisible] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [nuevaCajaVisible, setNuevaCajaVisible] = useState(false);
  const [nuevoProductoVisible, setNuevoProductoVisible] = useState(false);

  // ─── Pistola lectora (Bluetooth HID) ────────────────────────────────────────
  // La pistola se comporta como un teclado: "teclea" el código y manda un Enter.
  // Un TextInput invisible y siempre enfocado captura el código sin abrir el
  // teclado en pantalla (showSoftInputOnFocus={false}).
  const scanRef = useRef<TextInput>(null);
  const [scanBuffer, setScanBuffer] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  // Teclado propio del buscador. Deliberadamente NO entra en `scannerEnabled`:
  // así se puede teclear la búsqueda y disparar la pistola al mismo tiempo.
  const [tecladoBusqueda, setTecladoBusqueda] = useState(false);

  const anyModalOpen =
    checkoutVisible ||
    !!editandoProducto ||
    cajaMenuVisible ||
    profileMenuVisible ||
    nuevaCajaVisible ||
    nuevoProductoVisible;

  // El escáner está activo solo en VENTAS, sin modales abiertos, ya cargado, y
  // mientras el cajero no esté escribiendo manualmente en el buscador.
  const scannerEnabled =
    activeTab === "ventas" && !anyModalOpen && !loading && !searchFocused;

  // Ref espejo para consultarlo dentro de callbacks sin closures obsoletos.
  const scannerEnabledRef = useRef(scannerEnabled);
  scannerEnabledRef.current = scannerEnabled;

  // Enfoca el input oculto cuando el escáner pasa a estar activo.
  useEffect(() => {
    if (!scannerEnabled) return;
    const t = setTimeout(() => scanRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [scannerEnabled]);

  // Procesa un código leído: busca el producto por codigo_barras y lo agrega.
  const handleScan = (codigoRaw: string) => {
    const codigo = codigoRaw.trim();
    setScanBuffer("");
    // Re-enfoca para el siguiente disparo.
    setTimeout(() => scanRef.current?.focus(), 10);
    if (!codigo) return;

    // "vacio" es el valor por defecto en la DB; no debe hacer match.
    const prod = productos.find(
      (p) => p.codigo_barras && p.codigo_barras !== "vacio" && p.codigo_barras === codigo
    );

    if (prod) {
      addItem(prod);
      Vibration.vibrate(40);
    } else {
      Vibration.vibrate([0, 60, 60, 60]);
      Alert.alert("Producto no encontrado", `Código: ${codigo}`);
    }
  };

  // Órdenes del día (pestaña CAJA)
  const [ordenesDia, setOrdenesDia] = useState<OrdenDia[]>([]);
  const [totalDia, setTotalDia] = useState(0);
  const [loadingOrdenes, setLoadingOrdenes] = useState(false);

  useEffect(() => {
    if (!selectedCafeteria) return;
    loadData();
  }, [selectedCafeteria]);

  // Carga las órdenes del día al abrir la pestaña CAJA o al cambiar de caja
  useEffect(() => {
    if (activeTab !== "caja" || !selectedCafeteria) return;
    loadOrdenesDia();
  }, [activeTab, cajaActiva, selectedCafeteria]);

  const loadOrdenesDia = async () => {
    if (!selectedCafeteria) return;
    setLoadingOrdenes(true);
    try {
      const { data } = await getOrdenesDia(selectedCafeteria.id, cajaActiva?.codigo);
      setOrdenesDia(data.ordenes);
      setTotalDia(data.total_dia);
    } catch {
      setOrdenesDia([]);
      setTotalDia(0);
    } finally {
      setLoadingOrdenes(false);
    }
  };

  const handleSelectCaja = (caja: Caja) => {
    setCajaActiva(caja);
    setCajaMenuVisible(false);
  };

  // La caja recién creada se agrega a la lista y queda seleccionada, para no
  // obligar al cajero a volver a abrir el menú.
  const handleCajaCreada = (caja: Caja) => {
    setCajas((prev) => [...prev, caja]);
    setCajaActiva(caja);
  };

  // El producto nuevo entra al catálogo en memoria sin recargar todo, y su
  // categoría se registra si no existía.
  const handleProductoCreado = (producto: Producto) => {
    setProductos((prev) => [producto, ...prev]);
    setCategorias((prev) =>
      producto.categoria && !prev.includes(producto.categoria)
        ? [...prev, producto.categoria].sort()
        : prev
    );
  };

  const handleLogout = async () => {
    setProfileMenuVisible(false);
    await logout();
    router.replace("/login");
  };

  // Refleja el nuevo precio en la lista local tras editarlo en la DB
  const handlePrecioActualizado = (id_producto: string, nuevoPrecio: number) => {
    setProductos((prev) =>
      prev.map((p) =>
        p.id_producto === id_producto ? { ...p, precio: nuevoPrecio } : p
      )
    );
  };

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
    } catch (err: any) {
      // Un 401 significa sesión vencida: el interceptor de api.ts ya desloguea
      // y navega al login. Mostrar además "no se pudieron cargar los productos"
      // solo confunde, porque el problema no es la carga sino la sesión.
      if (err?.response?.status !== 401) {
        Alert.alert("Error", "No se pudieron cargar los productos");
      }
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
        {/* Input invisible que captura la pistola lectora (Bluetooth HID) */}
        {scannerEnabled && (
          <TextInput
            ref={scanRef}
            value={scanBuffer}
            onChangeText={setScanBuffer}
            onSubmitEditing={(e) => handleScan(e.nativeEvent.text)}
            onBlur={() => {
              // Recupera el foco si nada legítimo se lo quitó (modal/buscador).
              setTimeout(() => {
                if (scannerEnabledRef.current) scanRef.current?.focus();
              }, 80);
            }}
            showSoftInputOnFocus={false}
            blurOnSubmit={false}
            autoFocus
            caretHidden
            autoCorrect={false}
            autoCapitalize="none"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
          />
        )}

        {/* Búsqueda */}
        <View className="px-4 py-3">
          <View className="bg-white rounded-2xl flex-row items-center px-4 py-2 shadow-sm">
            <Text className="text-gray-400 mr-2">🔍</Text>
            <TextInput
              className="flex-1 text-sm text-appu-text"
              style={{ paddingTop: 0, paddingBottom: 4, textAlignVertical: "center", includeFontPadding: false }}
              placeholder="Buscar productos..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              onFocus={() => {
                setSearchFocused(true);
                setTecladoBusqueda(true);
              }}
              onBlur={() => setSearchFocused(false)}
              onSubmitEditing={() => Keyboard.dismiss()}
              // Teclado propio: el del sistema no aparece con la pistola
              // conectada. Como este escribe directo al estado, no necesita que
              // el campo conserve el foco — por eso la pistola puede seguir
              // capturando códigos mientras se teclea la búsqueda.
              showSoftInputOnFocus={false}
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
                onLongPress={() => setEditandoProducto(item)}
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

  const renderCajaContent = () => (
    <View className="flex-1">
      {/* Selector de cajas */}
      {cajas.length > 0 && (
        <View className="pl-4 pt-4 pb-2">
          <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">
            Caja
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              {cajas.map((c) => {
                const isActive = cajaActiva?.id === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCajaActiva(c)}
                    className={`px-4 py-2 rounded-full border ${
                      isActive
                        ? "bg-appu-blue border-appu-blue"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isActive ? "text-white" : "text-gray-600"
                      }`}
                    >
                      {c.nombre}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Total del día */}
      <View className="mx-4 my-3 bg-appu-dark rounded-2xl px-5 py-4 flex-row items-center justify-between">
        <View>
          <Text className="text-white/60 text-xs uppercase tracking-wider">
            Ventas del día
          </Text>
          <Text className="text-white text-2xl font-bold mt-0.5">
            ${totalDia.toLocaleString("es-CO")}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-white/60 text-xs uppercase tracking-wider">Órdenes</Text>
          <Text className="text-white text-2xl font-bold mt-0.5">{ordenesDia.length}</Text>
        </View>
      </View>

      {/* Listado de órdenes del día */}
      {loadingOrdenes ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2f2c59" />
        </View>
      ) : (
        <FlatList
          data={ordenesDia}
          keyExtractor={(item) => item.id_orden}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshing={loadingOrdenes}
          onRefresh={loadOrdenesDia}
          renderItem={({ item }) => (
            <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-appu-text font-semibold" numberOfLines={1}>
                    {item.nombre_cliente || "Sin nombre"}
                  </Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    {item.fecha_creacion?.slice(11, 16)} · {item.metodo_pago}
                  </Text>
                </View>
                <Text className="text-appu-green font-bold">
                  ${Number(item.monto).toLocaleString("es-CO")}
                </Text>
              </View>
              {item.productos.length > 0 && (
                <Text className="text-gray-500 text-xs mt-2" numberOfLines={2}>
                  {item.productos
                    .map((p) => `${p.cantidad ?? 1}× ${p.producto ?? ""}`)
                    .join(", ")}
                </Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center mt-16">
              <Text className="text-4xl mb-3">🧾</Text>
              <Text className="text-gray-400 text-base">Sin órdenes hoy</Text>
            </View>
          }
        />
      )}
    </View>
  );

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
            <TouchableOpacity
              onPress={() => setCajaMenuVisible(true)}
              className="bg-white/15 rounded-xl px-3 py-1.5 flex-row items-center active:opacity-70"
            >
              <Text className="text-white text-xs font-medium">
                {cajaActiva?.nombre ?? "Sin caja"}
              </Text>
              <Text className="text-white/60 text-xs ml-1">▾</Text>
            </TouchableOpacity>
          )}

          {/* Avatar usuario */}
          <TouchableOpacity
            onPress={() => setProfileMenuVisible(true)}
            className="w-8 h-8 rounded-full bg-appu-orange items-center justify-center active:opacity-70"
          >
            <Text className="text-white text-xs font-bold">
              {(username ?? "U")[0].toUpperCase()}
            </Text>
          </TouchableOpacity>
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
        {activeTab === "caja" && renderCajaContent()}
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

      {/* Modal editar precio (long-press sobre un producto) */}
      <EditPriceModal
        producto={editandoProducto}
        onClose={() => setEditandoProducto(null)}
        onSaved={handlePrecioActualizado}
      />

      {/* Dropdown selector de caja */}
      <Modal
        visible={cajaMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCajaMenuVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/30"
          onPress={() => setCajaMenuVisible(false)}
        >
          <View
            className="absolute right-4 bg-white rounded-2xl py-2 shadow-lg"
            style={{ top: insets.top + 52, minWidth: 200 }}
          >
            <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-2">
              Seleccionar caja
            </Text>
            {cajas.map((c) => {
              const isActive = cajaActiva?.id === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => handleSelectCaja(c)}
                  className="px-4 py-3 flex-row items-center justify-between active:bg-gray-50"
                >
                  <Text
                    className={`text-sm ${
                      isActive ? "text-appu-blue font-bold" : "text-appu-text"
                    }`}
                  >
                    {c.nombre}
                  </Text>
                  {isActive && <Text className="text-appu-blue ml-3">✓</Text>}
                </TouchableOpacity>
              );
            })}

            {/* Alta de caja */}
            <TouchableOpacity
              onPress={() => {
                setCajaMenuVisible(false);
                setNuevaCajaVisible(true);
              }}
              className="px-4 py-3 flex-row items-center border-t border-gray-100 active:bg-gray-50"
            >
              <Text className="text-appu-blue text-lg mr-2">＋</Text>
              <Text className="text-appu-blue text-sm font-semibold">
                Agregar caja
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Teclado propio del buscador. Va absoluto sobre la barra inferior,
          igual que haría el teclado del sistema. */}
      {tecladoBusqueda && (
        <View className="absolute left-0 right-0 bottom-0 bg-white">
          <InAppKeyboard
            mode="text"
            label="Buscar productos"
            value={search}
            onChange={setSearch}
            onClose={() => {
              setTecladoBusqueda(false);
              setSearchFocused(false);
            }}
          />
        </View>
      )}

      {/* Alta de una caja nueva */}
      <NewCajaModal
        visible={nuevaCajaVisible}
        cafeteriaId={selectedCafeteria?.id ?? null}
        onClose={() => setNuevaCajaVisible(false)}
        onCreated={handleCajaCreada}
      />

      {/* Alta de un producto nuevo */}
      <CreateProductoScreen
        visible={nuevoProductoVisible}
        cafeteriaId={selectedCafeteria?.id ?? null}
        categorias={categorias}
        onClose={() => setNuevoProductoVisible(false)}
        onCreated={handleProductoCreado}
      />

      {/* Dropdown perfil / cerrar sesión */}
      <Modal
        visible={profileMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileMenuVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/30"
          onPress={() => setProfileMenuVisible(false)}
        >
          <View
            className="absolute right-4 bg-white rounded-2xl py-2 shadow-lg"
            style={{ top: insets.top + 52, minWidth: 220 }}
          >
            <View className="px-4 py-3 border-b border-gray-100">
              <Text className="text-gray-400 text-xs uppercase tracking-wider">
                Sesión
              </Text>
              <Text className="text-appu-text font-semibold mt-0.5" numberOfLines={1}>
                {username ?? "Usuario"}
              </Text>
              {!!selectedCafeteria && (
                <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                  {selectedCafeteria.nombre}
                </Text>
              )}
            </View>
            {/* Altas rápidas desde el mostrador */}
            <TouchableOpacity
              onPress={() => {
                setProfileMenuVisible(false);
                setNuevoProductoVisible(true);
              }}
              className="px-4 py-3 flex-row items-center active:bg-gray-50"
            >
              <Ionicons name="cube-outline" size={19} color="#2f2c59" />
              <Text className="text-appu-text font-semibold ml-3">
                Crear producto
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setProfileMenuVisible(false);
                setNuevaCajaVisible(true);
              }}
              className="px-4 py-3 flex-row items-center active:bg-gray-50 border-b border-gray-100"
            >
              <Ionicons name="albums-outline" size={19} color="#2f2c59" />
              <Text className="text-appu-text font-semibold ml-3">Crear caja</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLogout}
              className="px-4 py-3 flex-row items-center active:bg-gray-50"
            >
              <Ionicons name="log-out-outline" size={19} color="#ef4444" />
              <Text className="text-red-500 font-semibold ml-3">Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
