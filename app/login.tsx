import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
// Import directo al set: `from "@expo/vector-icons"` empaqueta las 20 fuentes
// del paquete (~4 MB) aunque solo se use una.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import InAppKeyboard from "../components/InAppKeyboard";
import { useAuthStore } from "../store/authStore";
import { loginRequest } from "../services/api";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secureText, setSecureText] = useState(true);
  const [userError, setUserError] = useState("");
  const [passError, setPassError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const { setAuth } = useAuthStore();

  // Teclado propio: la pistola lectora se empareja como teclado físico HID y
  // Android oculta el teclado en pantalla mientras esté conectada. Con este,
  // se puede escribir y escanear a la vez, sin tocar ajustes del sistema.
  type Campo = "username" | "password";
  const [campoActivo, setCampoActivo] = useState<Campo | null>(null);

  const valorCampo: Record<Campo, string> = { username, password };
  const setterCampo: Record<Campo, (v: string) => void> = {
    username: (v) => {
      setUsername(v);
      setUserError("");
    },
    password: (v) => {
      setPassword(v);
      setPassError("");
    },
  };
  const etiquetaCampo: Record<Campo, string> = {
    username: "Usuario",
    password: "Contraseña",
  };

  const abrirTeclado = (campo: Campo) => {
    Keyboard.dismiss();
    setCampoActivo(campo);
  };

  const handleLogin = async () => {
    let valid = true;
    if (!username.trim()) {
      setUserError("El usuario es obligatorio");
      valid = false;
    }
    if (!password.trim()) {
      setPassError("La contraseña es obligatoria");
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      const { data } = await loginRequest(username.trim(), password.trim());
      await setAuth(data.token, data.user.username, data.cafeterias);

      if (data.cafeterias.length === 1) {
        // Solo una cafetería → ir directo al POS
        useAuthStore.getState().selectCafeteria(data.cafeterias[0]);
        router.replace("/(app)/pos");
      } else {
        router.replace("/select-cafeteria");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? "Error de conexión. Intenta de nuevo.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  const tecladoAbierto = campoActivo !== null;

  return (
    // edges solo arriba: el borde inferior lo maneja el teclado propio con su
    // propio inset. Con "bottom" acá quedaba una franja morada bajo el teclado
    // y el espacio de seguridad contado dos veces.
    <SafeAreaView edges={["top"]} style={styles.safe}>
      {/* Ojo: NO envolver esto en <TouchableWithoutFeedback onPress={Keyboard.dismiss}>.
          El padre captura el toque de los TextInput y cierra el teclado antes de
          que el input tome el foco → no se puede escribir. Para cerrar el
          teclado alcanza con keyboardDismissMode="on-drag". */}
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, tecladoAbierto && styles.scrollCompacto]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
          {/* Logo — el PNG trae el fondo #2d2c59 incrustado, por eso `safe`
              usa exactamente ese color: si no, se ve el recuadro del logo. */}
          {/* Con el teclado abierto el logo se encoge: si no, empuja el
              formulario fuera de la pantalla en teléfonos chicos. */}
          <Image
            source={require("../assets/logo-appu.png")}
            style={[styles.logo, tecladoAbierto && styles.logoCompacto]}
          />

          {!tecladoAbierto && <Text style={styles.tagline}>Punto de Venta</Text>}

          {/* Usuario */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputWrap, !!userError && styles.inputWrapError]}>
              <Ionicons
                name="person-outline"
                size={18}
                color="#94a3b8"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Usuario"
                placeholderTextColor="#94a3b8"
                value={username}
                onChangeText={(v) => {
                  setUsername(v);
                  setUserError("");
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
                showSoftInputOnFocus={false}
                onFocus={() => abrirTeclado("username")}
              />
            </View>
            {!!userError && <Text style={styles.errorText}>{userError}</Text>}
          </View>

          {/* Contraseña */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputWrap, !!passError && styles.inputWrapError]}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color="#94a3b8"
                style={styles.inputIcon}
              />
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1 }]}
                placeholder="Contraseña"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setPassError("");
                }}
                secureTextEntry={secureText}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                showSoftInputOnFocus={false}
                onFocus={() => abrirTeclado("password")}
              />
              <TouchableOpacity
                onPress={() => setSecureText(!secureText)}
                style={styles.eyeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={secureText ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#94a3b8"
                />
              </TouchableOpacity>
            </View>
            {!!passError && <Text style={styles.errorText}>{passError}</Text>}
          </View>

          {/* Ingresar */}
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Ingresar</Text>
            )}
          </TouchableOpacity>
      </KeyboardAwareScrollView>

      {/* Teclado propio, anclado abajo. Reemplaza al del sistema, que Android
          oculta mientras la pistola lectora esté emparejada. */}
      {campoActivo && (
        <InAppKeyboard
          mode="text"
          variant="oscuro"
          label={etiquetaCampo[campoActivo]}
          value={valorCampo[campoActivo]}
          onChange={setterCampo[campoActivo]}
          onClose={() => setCampoActivo(null)}
        />
      )}
    </SafeAreaView>
  );
}

// Valores tomados 1:1 de Appu-app/App/screens/SignInScreen.js para que ambas
// apps se vean como la misma familia.
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#2d2c59",
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  // Con el teclado abierto sobra poco alto: se recortan los márgenes para que
  // el formulario entre completo también en teléfonos chicos.
  scrollCompacto: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  logo: {
    width: 220,
    height: 220,
    resizeMode: "contain",
    marginBottom: 8,
  },
  logoCompacto: {
    width: 110,
    height: 110,
    marginBottom: 16,
  },
  tagline: {
    color: "#c7c6e8",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 32,
    fontWeight: "500",
  },

  // ── Inputs ──
  inputGroup: {
    width: "100%",
    marginBottom: 14,
  },
  inputWrap: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 14,
    height: 52,
  },
  inputWrapError: {
    borderColor: "#FF4444",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
  },
  eyeBtn: {
    paddingLeft: 8,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 12,
    marginTop: 5,
    marginLeft: 4,
  },

  // ── Botón ──
  loginBtn: {
    width: "100%",
    height: 54,
    backgroundColor: "#ff6600",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    shadowColor: "#ff6600",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
