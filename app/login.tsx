import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router } from "expo-router";
import { useAuthStore } from "../store/authStore";
import { loginRequest } from "../services/api";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Campos requeridos", "Ingresa tu usuario y contraseña");
      return;
    }
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

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: "#1a1a4e" }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="px-8">
        {/* Logo / título */}
        <View className="items-center mb-12">
          <Text className="text-white text-5xl font-bold tracking-widest">appu</Text>
          <Text className="text-white/60 text-sm mt-1 tracking-wider uppercase">
            Punto de Venta
          </Text>
        </View>

        {/* Formulario */}
        <View className="gap-4">
          <View>
            <Text className="text-white/80 text-sm mb-1 font-medium">Usuario</Text>
            <TextInput
              className="bg-white/10 text-white rounded-xl px-4 text-base border border-white/20"
              style={{ paddingTop: 10, paddingBottom: 14, textAlignVertical: "center", includeFontPadding: false }}
              placeholder="Tu usuario"
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              returnKeyType="next"
            />
          </View>

          <View>
            <Text className="text-white/80 text-sm mb-1 font-medium">Contraseña</Text>
            <TextInput
              className="bg-white/10 text-white rounded-xl px-4 text-base border border-white/20"
              style={{ paddingTop: 10, paddingBottom: 14, textAlignVertical: "center", includeFontPadding: false }}
              placeholder="Tu contraseña"
              placeholderTextColor="rgba(255,255,255,0.4)"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            className="bg-appu-orange rounded-xl py-4 items-center mt-2 active:opacity-80"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base tracking-wide">
                Ingresar
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}
