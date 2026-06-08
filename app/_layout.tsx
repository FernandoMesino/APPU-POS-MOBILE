import "../global.css";
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useAuthStore } from "../store/authStore";

export default function RootLayout() {
  const loadToken = useAuthStore((s) => s.loadToken);
  const isLoading = useAuthStore((s) => s.isLoading);

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
