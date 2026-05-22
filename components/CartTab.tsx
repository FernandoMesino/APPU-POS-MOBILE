import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { useCartStore } from "../store/cartStore";

const formatPrice = (n: number) => "$" + n.toLocaleString("es-CO");

export default function CartTab() {
  const { items, updateQuantity, removeItem } = useCartStore();

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-4xl mb-3">🛒</Text>
        <Text className="text-gray-400 text-base">El carrito está vacío</Text>
        <Text className="text-gray-300 text-sm mt-1">
          Toca un producto para agregarlo
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id_producto}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      renderItem={({ item }) => (
        <View className="bg-white rounded-2xl p-4 flex-row items-center shadow-sm">
          <View className="flex-1">
            <Text className="text-appu-text font-semibold text-sm" numberOfLines={2}>
              {item.producto}
            </Text>
            <Text className="text-appu-blue font-bold text-sm mt-1">
              {formatPrice(item.precio * item.cantidad)}
            </Text>
            <Text className="text-gray-400 text-xs">
              {formatPrice(item.precio)} × {item.cantidad}
            </Text>
          </View>

          {/* Controles de cantidad */}
          <View className="flex-row items-center gap-3 ml-4">
            <TouchableOpacity
              onPress={() => updateQuantity(item.id_producto, item.cantidad - 1)}
              className="bg-red-100 w-8 h-8 rounded-full items-center justify-center"
            >
              <Text className="text-red-500 font-bold text-base">−</Text>
            </TouchableOpacity>

            <Text className="text-appu-text font-bold text-base w-6 text-center">
              {item.cantidad}
            </Text>

            <TouchableOpacity
              onPress={() => updateQuantity(item.id_producto, item.cantidad + 1)}
              className="bg-green-100 w-8 h-8 rounded-full items-center justify-center"
            >
              <Text className="text-green-600 font-bold text-base">+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );
}
