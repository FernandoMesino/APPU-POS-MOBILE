import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Keyboard } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import FullScreenForm, { CampoFormulario, type CampoTeclado } from "./FullScreenForm";
import { crearProducto, type Producto } from "../services/api";

type Props = {
  visible: boolean;
  cafeteriaId: string | null;
  /** Categorías ya existentes en la cafetería, para no inventar duplicados. */
  categorias: string[];
  onClose: () => void;
  onCreated: (producto: Producto) => void;
};

type Campo = "producto" | "categoria" | "precio" | "cantidad" | "codigo_barras";

const CAMPOS: Record<Campo, { label: string; mode: "numeric" | "text" }> = {
  producto: { label: "Nombre del producto", mode: "text" },
  categoria: { label: "Categoría", mode: "text" },
  precio: { label: "Precio", mode: "numeric" },
  cantidad: { label: "Cantidad en stock", mode: "numeric" },
  codigo_barras: { label: "Código de barras", mode: "numeric" },
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
  const [valores, setValores] = useState<Record<Campo, string>>({
    producto: "",
    categoria: "",
    precio: "",
    cantidad: "",
    codigo_barras: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [campoActivo, setCampoActivo] = useState<Campo | null>(null);

  const set = (campo: Campo) => (v: string) =>
    setValores((prev) => ({ ...prev, [campo]: v }));

  const abrirTeclado = (campo: Campo) => {
    Keyboard.dismiss();
    setCampoActivo(campo);
  };

  const limpiar = () => {
    setValores({
      producto: "",
      categoria: "",
      precio: "",
      cantidad: "",
      codigo_barras: "",
    });
    setCampoActivo(null);
  };

  const cerrar = () => {
    limpiar();
    onClose();
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
        codigo_barras: valores.codigo_barras.trim() || undefined,
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

  const campoTeclado: CampoTeclado | null = campoActivo
    ? {
        label: CAMPOS[campoActivo].label,
        mode: CAMPOS[campoActivo].mode,
        value: valores[campoActivo],
        onChange: set(campoActivo),
      }
    : null;

  return (
    <FullScreenForm
      visible={visible}
      titulo="Nuevo producto"
      subtitulo="Se agrega al catálogo de esta cafetería"
      onClose={cerrar}
      accion="Crear producto"
      onAccion={handleGuardar}
      guardando={guardando}
      campoTeclado={campoTeclado}
      onCerrarTeclado={() => setCampoActivo(null)}
    >
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
                    activa
                      ? "bg-appu-blue border-appu-blue"
                      : "bg-white border-gray-200"
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

      <CampoFormulario
        label="Código de barras"
        hint="Opcional. Puedes dispararlo con la pistola sobre este campo."
      >
        <View className="border border-gray-200 rounded-2xl bg-gray-50 flex-row items-center px-4">
          <Ionicons name="barcode-outline" size={20} color="#9ca3af" />
          <TextInput
            className="flex-1 py-3.5 px-3 text-base text-appu-text"
            placeholder="Escanea o escribe"
            placeholderTextColor="#9ca3af"
            value={valores.codigo_barras}
            onChangeText={set("codigo_barras")}
            showSoftInputOnFocus={false}
            onFocus={() => abrirTeclado("codigo_barras")}
          />
          {valores.codigo_barras.length > 0 && (
            <TouchableOpacity onPress={() => set("codigo_barras")("")} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </CampoFormulario>
    </FullScreenForm>
  );
}
