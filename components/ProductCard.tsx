import { TouchableOpacity, Text, View, Image } from "react-native";
import type { Producto } from "../services/api";

type Props = {
  producto: Producto;
  cantidad: number;
  onPress: () => void;
};

const formatPrice = (n: number) =>
  "$" + n.toLocaleString("es-CO");

export default function ProductCard({ producto, cantidad, onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white rounded-2xl p-3 flex-1 mx-1 mb-3 shadow-sm active:opacity-75"
      style={{ minHeight: 110 }}
    >
      {producto.foto_url ? (
        <Image
          source={{ uri: producto.foto_url }}
          className="w-full h-14 rounded-lg mb-2"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-14 rounded-lg mb-2 bg-gray-100 items-center justify-center">
          <Text className="text-2xl">🍽️</Text>
        </View>
      )}

      <Text className="text-appu-text font-semibold text-xs leading-tight" numberOfLines={2}>
        {producto.producto}
      </Text>
      <Text className="text-appu-blue text-xs font-bold mt-1">
        {formatPrice(producto.precio)}
      </Text>

      {cantidad > 0 && (
        <View className="absolute top-2 right-2 bg-appu-orange rounded-full w-5 h-5 items-center justify-center">
          <Text className="text-white text-xs font-bold">{cantidad}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
