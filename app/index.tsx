import { Redirect } from "expo-router";
import { useAuthStore } from "../store/authStore";

export default function Index() {
  const { token, selectedCafeteria } = useAuthStore();

  if (!token) return <Redirect href="/login" />;
  if (!selectedCafeteria) return <Redirect href="/select-cafeteria" />;
  return <Redirect href="/(app)/pos" />;
}
