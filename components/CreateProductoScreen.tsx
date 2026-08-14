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
import { Image } from "expo-image";
import {
  crearProducto,
  consultarPlantilla,
  productoDesdePlantilla,
  type FichaMaestra,
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
  // "escaneando"  -> esperando el disparo de la pistola.
  // "consultando" -> buscando ese código en la plantilla maestra.
  // "confirmando" -> estaba en la plantilla: falta ponerle precio y stock.
  // "manual"      -> no estaba: se llena todo a mano con el código fijo.
  const [fase, setFase] = useState<
    "escaneando" | "consultando" | "confirmando" | "manual"
  >("escaneando");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [ficha, setFicha] = useState<FichaMaestra | null>(null);

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
    setFicha(null);
    setValores({ producto: "", categoria: "", precio: "", cantidad: "" });
    setCampoActivo(null);
  };

  // Alta del producto que sí estaba en la plantilla maestra: el backend relee
  // la ficha, acá solo se mandan precio y stock.
  const handleConfirmarDesdePlantilla = async () => {
    if (!cafeteriaId || !ficha) return;

    const precio = Number(valores.precio.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(precio) || precio <= 0) {
      Alert.alert("Precio inválido", "El precio debe ser mayor que cero.");
      return;
    }
    const cantidad = Number(valores.cantidad.replace(/[^0-9]/g, "") || "0");

    setGuardando(true);
    try {
      const { data } = await productoDesdePlantilla({
        cafeteria_id: cafeteriaId,
        codigo_barras: ficha.codigo_barras,
        precio,
        cantidad,
      });
      onCreated(data.producto);
      Alert.alert(
        "Producto agregado",
        `"${data.producto.producto}" se agregó desde la plantilla maestra.`
      );
      cerrar();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "No se pudo crear el producto";
      Alert.alert("Error", msg);
    } finally {
      setGuardando(false);
    }
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
      const { data } = await consultarPlantilla({
        cafeteria_id: cafeteriaId,
        codigo_barras: codigo,
      });

      if (data.ya_existia && data.producto) {
        const p = data.producto;
        // No se cierra la pantalla: lo normal es que el cajero siga con el
        // siguiente producto, así que vuelve al escaneo listo para disparar.
        Vibration.vibrate([0, 60, 60, 60]);
        Alert.alert(
          "Ya está en el catálogo",
          `"${p.producto}" ya existe en esta cafetería con ese código.\n\n` +
            `Precio: $${p.precio.toLocaleString("es-CO")}\n` +
            `Stock: ${p.cantidad}\n\n` +
            "Para cambiarle el precio, tócalo en la lista de productos.",
        );
        reiniciar();
        return;
      }

      if (data.encontrado && data.ficha) {
        // Está en la plantilla: se muestra la ficha y se pide precio y stock
        // ANTES de crear nada.
        setFicha(data.ficha);
        setValores((prev) => ({
          ...prev,
          producto: data.ficha!.producto,
          categoria: data.ficha!.categoria,
          precio: data.ficha!.precio_sugerido
            ? String(data.ficha!.precio_sugerido)
            : "",
        }));
        setFase("confirmando");
        return;
      }

      // No está en la plantilla: se llena a mano con el código ya fijado.
      setFase("manual");
    } catch (err: any) {
      // Si la consulta falla (servidor sin el endpoint, sin red, error puntual)
      // NO se deja al cajero bloqueado: se sigue al alta manual con el código
      // ya escaneado. Consultar la plantilla es una comodidad, no un requisito.
      const detalle = err?.response?.data?.error;
      const status = err?.response?.status;
      console.warn(`[plantilla] fallo la consulta (status ${status}):`, detalle);

      setFase("manual");
      Alert.alert(
        "Sigue a mano",
        detalle ??
          "No se pudo consultar la plantilla maestra. Completa los datos del producto manualmente; el código escaneado ya quedó guardado."
      );
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
    (fase === "manual" || fase === "confirmando") && campoActivo
      ? {
          label: CAMPOS[campoActivo].label,
          mode: CAMPOS[campoActivo].mode,
          value: valores[campoActivo],
          onChange: set(campoActivo),
        }
      : null;

  // ── Precio y stock del producto encontrado en la plantilla ─────────────────
  if (fase === "confirmando" && ficha) {
    return (
      <FullScreenForm
        visible={visible}
        titulo="Ponle precio y stock"
        subtitulo="Encontrado en la plantilla maestra"
        onClose={cerrar}
        accion="Agregar al catálogo"
        onAccion={handleConfirmarDesdePlantilla}
        guardando={guardando}
        campoTeclado={campoTeclado}
        onCerrarTeclado={() => setCampoActivo(null)}
      >
        {/* Ficha maestra: informativa, no editable. Viene de la fuente
            compartida y el backend la relee al crear. */}
        <View className="flex-row items-center bg-green-50 rounded-2xl p-4 mb-5">
          {ficha.foto_url ? (
            <Image
              source={{ uri: ficha.foto_url }}
              style={{ width: 56, height: 56, borderRadius: 12 }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="w-14 h-14 rounded-xl bg-white items-center justify-center">
              <Ionicons name="cube-outline" size={26} color="#22c55e" />
            </View>
          )}
          <View className="ml-3 flex-1">
            <Text className="text-appu-text font-bold text-base" numberOfLines={2}>
              {ficha.producto}
            </Text>
            <Text className="text-gray-500 text-xs mt-0.5">
              {ficha.categoria}
              {ficha.marca ? ` · ${ficha.marca}` : ""}
            </Text>
            <Text className="text-gray-400 text-xs mt-0.5">
              {ficha.codigo_barras}
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
        </View>

        <Text className="text-gray-500 text-sm mb-5 leading-5">
          El nombre, la categoría y el resto de la ficha vienen de la plantilla
          maestra. Solo falta lo que es propio de tu cafetería:
        </Text>

        <CampoFormulario label="Precio de venta">
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

        <CampoFormulario
          label="Stock inicial"
          hint="Cuántas unidades entran hoy al inventario."
        >
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
      </FullScreenForm>
    );
  }

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

              {/* Separador */}
              <View className="flex-row items-center w-full mt-8 mb-5">
                <View className="flex-1 h-px bg-gray-200" />
                <Text className="text-gray-400 text-xs font-semibold mx-3">o</Text>
                <View className="flex-1 h-px bg-gray-200" />
              </View>

              {/* Alta sin código: verduras, fruta, granel — cosas que se pesan o
                  se cuentan y nunca traen código impreso. */}
              <TouchableOpacity
                onPress={() => {
                  setCodigoBarras("");
                  setFase("manual");
                }}
                className="w-full flex-row items-center border border-appu-blue rounded-2xl px-4 py-4 active:opacity-70"
              >
                <Ionicons name="leaf-outline" size={22} color="#2f2c59" />
                <View className="ml-3 flex-1">
                  <Text className="text-appu-blue font-bold text-sm">
                    Producto sin código de barras
                  </Text>
                  <Text className="text-gray-500 text-xs mt-0.5 leading-4">
                    Verduras, fruta, granel y todo lo que se vende suelto.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
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
      {/* Producto suelto: se deja constancia de que la falta de código es
          intencional, y se ofrece volver a escanear por si fue un descuido. */}
      {!codigoBarras && (
        <View className="flex-row items-center bg-gray-50 rounded-2xl px-4 py-3.5 mb-5">
          <Ionicons name="leaf-outline" size={22} color="#6b7280" />
          <View className="ml-3 flex-1">
            <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
              Sin código de barras
            </Text>
            <Text className="text-gray-400 text-xs mt-0.5 leading-4">
              Se venderá buscándolo por nombre, no con la pistola.
            </Text>
          </View>
          <TouchableOpacity
            onPress={reiniciar}
            hitSlop={10}
            className="active:opacity-60"
          >
            <Ionicons name="barcode-outline" size={22} color="#2f2c59" />
          </TouchableOpacity>
        </View>
      )}

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
