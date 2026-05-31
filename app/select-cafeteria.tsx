import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore } from "../store/authStore";

export default function SelectCafeteriaScreen() {
  const { cafeterias, selectCafeteria, logout, username } = useAuthStore();

  const handleSelect = async (cafeteria: { id: string; nombre: string }) => {
    await selectCafeteria(cafeteria);
    router.replace("/(app)/pos");
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1 bg-appu-dark">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-white text-2xl font-bold mb-1">
          Bienvenido, {username}
        </Text>
        <Text className="text-white/60 text-sm mb-8">
          Selecciona la cafetería donde vas a trabajar hoy
        </Text>

        <FlatList
          data={cafeterias}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleSelect(item)}
              className="bg-white/10 border border-white/20 rounded-2xl p-5 active:opacity-70"
            >
              <Text className="text-white font-semibold text-lg">
                {item.nombre || `Cafetería ${item.id}`}
              </Text>
              <Text className="text-white/50 text-sm mt-1">ID: {item.id}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="items-center mt-20">
              <Text className="text-white/40 text-base text-center">
                No tienes cafeterías asignadas
              </Text>
            </View>
          }
        />
      </View>

      {/* Cerrar sesión */}
      <View className="px-6 pb-6">
        <TouchableOpacity
          onPress={handleLogout}
          className="border border-white/20 rounded-2xl py-4 items-center active:opacity-70"
        >
          <Text className="text-white/70 font-semibold">Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
