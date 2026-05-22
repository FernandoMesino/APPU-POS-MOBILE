import "../global.css";
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useAuthStore } from "../store/authStore";

export default function RootLayout() {
  const { loadToken, token, isLoading } = useAuthStore();

  useEffect(() => {
    loadToken().then((hasToken) => {
      if (!hasToken) {
        router.replace("/login");
      }
    });
  }, []);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="select-cafeteria" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
