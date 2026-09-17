import { useState } from "react";
import { View, Text, TextInput, Alert, Keyboard } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import FullScreenForm, { CampoFormulario, type CampoTeclado } from "./FullScreenForm";
import { crearCaja, type Caja } from "../services/api";
import { useTecladoAdaptativo } from "../hooks/useTecladoAdaptativo";

type Props = {
  visible: boolean;
  cafeteriaId: string | null;
  onClose: () => void;
  onCreated: (caja: Caja) => void;
};

type Campo = "nombre" | "codigo";

const CAMPOS: Record<Campo, string> = {
  nombre: "Nombre de la caja",
  codigo: "Código",
};

const inputClass =
  "border border-gray-200 rounded-2xl px-4 py-3.5 text-base text-appu-text bg-gray-50";

export default function NewCajaModal({
  visible,
  cafeteriaId,
  onClose,
  onCreated,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [campoActivo, setCampoActivo] = useState<Campo | null>(null);
  // Teclado del sistema si no hay pistola conectada; el propio si la hay.
  const { usarPropio, propsCampo } = useTecladoAdaptativo();

  const valorCampo: Record<Campo, string> = { nombre, codigo };
  const setterCampo: Record<Campo, (v: string) => void> = {
    nombre: setNombre,
    codigo: setCodigo,
  };

  const abrirTeclado = (campo: Campo) => {
    Keyboard.dismiss();
    setCampoActivo(campo);
  };

  const cerrar = () => {
    setNombre("");
    setCodigo("");
    setCampoActivo(null);
    onClose();
  };

  const handleGuardar = async () => {
    if (!cafeteriaId) return;
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Escribe un nombre para la caja.");
      return;
    }
    if (!codigo.trim()) {
      Alert.alert("Falta el código", "Escribe un código para la caja.");
      return;
    }

    setGuardando(true);
    try {
      const { data } = await crearCaja({
        cafeteria_id: cafeteriaId,
        nombre: nombre.trim(),
        codigo: codigo.trim(),
      });
      onCreated(data.caja);
      cerrar();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "No se pudo crear la caja";
      Alert.alert("Error", msg);
    } finally {
      setGuardando(false);
    }
  };

  const campoTeclado: CampoTeclado | null = campoActivo
    ? {
        label: CAMPOS[campoActivo],
        mode: "text",
        value: valorCampo[campoActivo],
        onChange: setterCampo[campoActivo],
      }
    : null;

  return (
    <FullScreenForm
      visible={visible}
      titulo="Nueva caja"
      subtitulo="Se agrega a esta cafetería"
      onClose={cerrar}
      accion="Crear caja"
      onAccion={handleGuardar}
      guardando={guardando}
      campoTeclado={campoTeclado}
      onCerrarTeclado={() => setCampoActivo(null)}
    >
      <CampoFormulario label="Nombre">
        <TextInput
          className={inputClass}
          placeholder="Ej. Caja principal"
          placeholderTextColor="#9ca3af"
          value={nombre}
          onChangeText={setNombre}
          {...propsCampo(() => abrirTeclado("nombre"))}
        />
      </CampoFormulario>

      <CampoFormulario
        label="Código"
        hint="Queda grabado en cada venta y sirve para filtrar el reporte del día. No puede repetirse en esta cafetería."
      >
        <TextInput
          className={inputClass}
          placeholder="Ej. CAJA1"
          placeholderTextColor="#9ca3af"
          value={codigo}
          onChangeText={setCodigo}
          autoCapitalize="characters"
          {...propsCampo(() => abrirTeclado("codigo"))}
        />
      </CampoFormulario>

      <View className="flex-row items-start bg-blue-50 rounded-2xl p-4 mt-1">
        <Ionicons name="information-circle-outline" size={20} color="#2f2c59" />
        <Text className="text-appu-blue text-xs ml-2.5 flex-1 leading-4">
          La caja nueva queda seleccionada al crearla, así que la siguiente venta
          ya se registra en ella.
        </Text>
      </View>
    </FullScreenForm>
  );
}
