import "../global.css";
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useAuthStore } from "../store/authStore";
import { useKeyboardStore } from "../store/keyboardStore";

export default function RootLayout() {
  const loadToken = useAuthStore((s) => s.loadToken);
  const isLoading = useAuthStore((s) => s.isLoading);
  const iniciarDeteccion = useKeyboardStore((s) => s.iniciarDeteccion);

  // Detección de pistola lectora: decide, en toda la app, si los campos usan el
  // teclado del sistema o el propio. Ver store/keyboardStore.
  useEffect(() => iniciarDeteccion(), []);

  useEffect(() => {
    loadToken().then((hasToken) => {
      if (!hasToken) {
        router.replace("/login");
      }
    });
  }, []);

  if (isLoading) return null;

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="select-cafeteria" />
          <Stack.Screen name="(app)" />
        </Stack>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
