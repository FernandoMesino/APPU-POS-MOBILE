import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Keyboard,
  ActivityIndicator,
  Vibration,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import FullScreenForm, { CampoFormulario, type CampoTeclado } from "./FullScreenForm";
import {
  crearProducto,
  productoDesdePlantilla,
  type Producto,
} from "../services/api";

type Props = {
  visible: boolean;
  cafeteriaId: string | null;
  /** Categorías ya existentes en la cafetería, para no inventar duplicados. */
  categorias: string[];
  onClose: () => void;
  onCreated: (producto: Producto) => void;
};

/** Campos que se llenan a mano. El código de barras NO está: solo entra por pistola. */
type Campo = "producto" | "categoria" | "precio" | "cantidad";

const CAMPOS: Record<Campo, { label: string; mode: "numeric" | "text" }> = {
  producto: { label: "Nombre del producto", mode: "text" },
  categoria: { label: "Categoría", mode: "text" },
  precio: { label: "Precio", mode: "numeric" },
  cantidad: { label: "Cantidad en stock", mode: "numeric" },
};

const inputClass =
  "border border-gray-200 rounded-2xl px-4 py-3.5 text-base text-appu-text bg-gray-50";

export default function CreateProductoScreen({
  visible,
  cafeteriaId,
  categorias,
  onClose,
  onCreated,
}: Props) {
  // "escaneando" -> esperando el disparo de la pistola.
  // "consultando" -> buscando ese código en la plantilla maestra.
  // "manual"      -> no estaba en la plantilla: se llena a mano con el código fijo.
  const [fase, setFase] = useState<"escaneando" | "consultando" | "manual">(
    "escaneando"
  );
  const [codigoBarras, setCodigoBarras] = useState("");

  const [valores, setValores] = useState<Record<Campo, string>>({
    producto: "",
    categoria: "",
    precio: "",
    cantidad: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [campoActivo, setCampoActivo] = useState<Campo | null>(null);

  // Input invisible que captura la pistola (teclado físico HID), igual que en
  // el POS: "teclea" el código y manda un Enter.
  const scanRef = useRef<TextInput>(null);
  const [scanBuffer, setScanBuffer] = useState("");

  const escaneoActivo = visible && fase === "escaneando";

  useEffect(() => {
    if (!escaneoActivo) return;
    const t = setTimeout(() => scanRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [escaneoActivo]);

  const reiniciar = () => {
    setFase("escaneando");
    setCodigoBarras("");
    setScanBuffer("");
    setValores({ producto: "", categoria: "", precio: "", cantidad: "" });
    setCampoActivo(null);
  };

  const cerrar = () => {
    reiniciar();
    onClose();
  };

  // ── Escaneo ────────────────────────────────────────────────────────────────
  const handleScan = async (codigoRaw: string) => {
    const codigo = codigoRaw.trim();
    setScanBuffer("");
    if (!codigo || !cafeteriaId) {
      setTimeout(() => scanRef.current?.focus(), 10);
      return;
    }

    Vibration.vibrate(40);
    setCodigoBarras(codigo);
    setFase("consultando");

    try {
      const { data } = await productoDesdePlantilla({
        cafeteria_id: cafeteriaId,
        codigo_barras: codigo,
      });

      if (data.encontrado && data.producto) {
        if (data.ya_existia) {
          Alert.alert(
            "Ya lo tienes",
            `"${data.producto.producto}" ya está en el catálogo de esta cafetería.`
          );
          cerrar();
          return;
        }

        onCreated(data.producto);
        Alert.alert(
          "Producto agregado",
          `"${data.producto.producto}" se agregó desde la plantilla maestra.` +
            (data.sin_precio
              ? "\n\nLa plantilla no trae precio: asígnaselo desde el catálogo antes de venderlo."
              : ""),
        );
        cerrar();
        return;
      }

      // No está en la plantilla: se llena a mano con el código ya fijado.
      setFase("manual");
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "No se pudo consultar la plantilla";
      Alert.alert("Error", msg);
      setFase("escaneando");
      setTimeout(() => scanRef.current?.focus(), 10);
    }
  };

  // ── Alta manual ────────────────────────────────────────────────────────────
  const set = (campo: Campo) => (v: string) =>
    setValores((prev) => ({ ...prev, [campo]: v }));

  const abrirTeclado = (campo: Campo) => {
    Keyboard.dismiss();
    setCampoActivo(campo);
  };

  const handleGuardar = async () => {
    if (!cafeteriaId) return;

    if (!valores.producto.trim()) {
      Alert.alert("Falta el nombre", "Escribe el nombre del producto.");
      return;
    }
    if (!valores.categoria.trim()) {
      Alert.alert("Falta la categoría", "Elige o escribe una categoría.");
      return;
    }
    const precio = Number(valores.precio.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(precio) || precio <= 0) {
      Alert.alert("Precio inválido", "El precio debe ser mayor que cero.");
      return;
    }
    const cantidad = Number(valores.cantidad.replace(/[^0-9]/g, "") || "0");

    setGuardando(true);
    try {
      const { data } = await crearProducto({
        cafeteria_id: cafeteriaId,
        producto: valores.producto.trim(),
        categoria: valores.categoria.trim(),
        precio,
        cantidad,
        codigo_barras: codigoBarras || undefined,
      });
      onCreated(data.producto);
      cerrar();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "No se pudo crear el producto";
      Alert.alert("Error", msg);
    } finally {
      setGuardando(false);
    }
  };

  const campoTeclado: CampoTeclado | null =
    fase === "manual" && campoActivo
      ? {
          label: CAMPOS[campoActivo].label,
          mode: CAMPOS[campoActivo].mode,
          value: valores[campoActivo],
          onChange: set(campoActivo),
        }
      : null;

  // ── Fase de escaneo ────────────────────────────────────────────────────────
  if (fase !== "manual") {
    return (
      <FullScreenForm
        visible={visible}
        titulo="Nuevo producto"
        subtitulo="Escanea el código de barras"
        onClose={cerrar}
        accion=""
        onAccion={() => {}}
        ocultarAccion
        campoTeclado={null}
        onCerrarTeclado={() => {}}
      >
        {/* Captura de la pistola. Invisible y siempre enfocado. */}
        {escaneoActivo && (
          <TextInput
            ref={scanRef}
            value={scanBuffer}
            onChangeText={setScanBuffer}
            onSubmitEditing={(e) => handleScan(e.nativeEvent.text)}
            onBlur={() => {
              setTimeout(() => {
                if (escaneoActivo) scanRef.current?.focus();
              }, 80);
            }}
            showSoftInputOnFocus={false}
            blurOnSubmit={false}
            caretHidden
            autoCorrect={false}
            autoCapitalize="none"
            style={{ height: 0, width: 0, opacity: 0, position: "absolute" }}
          />
        )}

        <View className="items-center justify-center py-10">
          {fase === "consultando" ? (
            <>
              <ActivityIndicator size="large" color="#2f2c59" />
              <Text className="text-appu-text font-semibold text-base mt-5">
                Buscando en la plantilla maestra…
              </Text>
              <Text className="text-gray-400 text-sm mt-1">{codigoBarras}</Text>
            </>
          ) : (
            <>
              <View className="w-28 h-28 rounded-full bg-blue-50 items-center justify-center mb-6">
                <Ionicons name="barcode-outline" size={56} color="#2f2c59" />
              </View>
              <Text className="text-appu-text font-bold text-lg text-center">
                Dispara la pistola
              </Text>
              <Text className="text-gray-500 text-sm text-center mt-2 px-6 leading-5">
                Escanea el código de barras del producto que quieres agregar. Si
                ya está en la plantilla maestra, se agrega solo con toda su ficha.
              </Text>

              <View className="flex-row items-center bg-gray-50 rounded-2xl px-4 py-3 mt-8">
                <Ionicons name="information-circle-outline" size={18} color="#6b7280" />
                <Text className="text-gray-500 text-xs ml-2 flex-1 leading-4">
                  El código de barras solo se puede capturar con la pistola, no a
                  mano, para que no se registre mal.
                </Text>
              </View>

              {/* Salida para productos que no tienen código de barras. */}
              <TouchableOpacity
                onPress={() => {
                  setCodigoBarras("");
                  setFase("manual");
                }}
                className="mt-6 py-2 active:opacity-60"
              >
                <Text className="text-appu-blue text-sm font-semibold underline">
                  El producto no tiene código de barras
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </FullScreenForm>
    );
  }

  // ── Fase manual ────────────────────────────────────────────────────────────
  return (
    <FullScreenForm
      visible={visible}
      titulo="Nuevo producto"
      subtitulo={
        codigoBarras ? "No estaba en la plantilla maestra" : "Sin código de barras"
      }
      onClose={cerrar}
      accion="Crear producto"
      onAccion={handleGuardar}
      guardando={guardando}
      campoTeclado={campoTeclado}
      onCerrarTeclado={() => setCampoActivo(null)}
    >
      {/* Código escaneado: fijo, no editable. */}
      {!!codigoBarras && (
        <View className="flex-row items-center bg-blue-50 rounded-2xl px-4 py-3.5 mb-5">
          <Ionicons name="barcode-outline" size={22} color="#2f2c59" />
          <View className="ml-3 flex-1">
            <Text className="text-appu-blue text-xs font-semibold uppercase tracking-wider">
              Código escaneado
            </Text>
            <Text className="text-appu-text text-base font-bold mt-0.5">
              {codigoBarras}
            </Text>
          </View>
          <TouchableOpacity
            onPress={reiniciar}
            hitSlop={10}
            className="active:opacity-60"
          >
            <Ionicons name="refresh" size={20} color="#2f2c59" />
          </TouchableOpacity>
        </View>
      )}

      <CampoFormulario label="Nombre">
        <TextInput
          className={inputClass}
          placeholder="Ej. Café americano"
          placeholderTextColor="#9ca3af"
          value={valores.producto}
          onChangeText={set("producto")}
          showSoftInputOnFocus={false}
          onFocus={() => abrirTeclado("producto")}
        />
      </CampoFormulario>

      <CampoFormulario
        label="Categoría"
        hint={
          categorias.length > 0
            ? "Toca una existente o escribe una nueva."
            : "Escribe una categoría para agrupar el producto."
        }
      >
        <TextInput
          className={inputClass}
          placeholder="Ej. Bebidas"
          placeholderTextColor="#9ca3af"
          value={valores.categoria}
          onChangeText={set("categoria")}
          showSoftInputOnFocus={false}
          onFocus={() => abrirTeclado("categoria")}
        />

        {categorias.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mt-3">
            {categorias.map((c) => {
              const activa = valores.categoria.trim().toLowerCase() === c.toLowerCase();
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => set("categoria")(c)}
                  className={`px-3.5 py-2 rounded-full border ${
                    activa ? "bg-appu-blue border-appu-blue" : "bg-white border-gray-200"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      activa ? "text-white" : "text-gray-600"
                    }`}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </CampoFormulario>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <CampoFormulario label="Precio">
            <View className="border border-gray-200 rounded-2xl bg-gray-50 flex-row items-center px-4">
              <Text className="text-appu-text text-base font-bold mr-1">$</Text>
              <TextInput
                className="flex-1 py-3.5 text-base text-appu-text"
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={valores.precio}
                onChangeText={set("precio")}
                showSoftInputOnFocus={false}
                onFocus={() => abrirTeclado("precio")}
              />
            </View>
          </CampoFormulario>
        </View>

        <View className="flex-1">
          <CampoFormulario label="Stock">
            <TextInput
              className={inputClass}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={valores.cantidad}
              onChangeText={set("cantidad")}
              showSoftInputOnFocus={false}
              onFocus={() => abrirTeclado("cantidad")}
            />
          </CampoFormulario>
        </View>
      </View>
    </FullScreenForm>
  );
}
