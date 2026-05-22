import { Stack, router } from "expo-router";
import { useAuthStore } from "../../store/authStore";
import { useEffect } from "react";

export default function AppLayout() {
  const { token } = useAuthStore();

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
