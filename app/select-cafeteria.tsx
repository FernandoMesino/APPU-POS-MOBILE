import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "../store/authStore";

export default function SelectCafeteriaScreen() {
  const { cafeterias, selectCafeteria, username } = useAuthStore();

  const handleSelect = (cafeteria: { id: string; nombre: string }) => {
    selectCafeteria(cafeteria);
    router.replace("/(app)/pos");
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
              <Text className="text-white/40 text-base">
                No tienes cafeterías asignadas
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
