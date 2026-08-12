import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import InAppKeyboard from './InAppKeyboard';
import { useCartStore } from '../store/cartStore';

const formatPrice = (n: number) => '$' + n.toLocaleString('es-CO');

type CartItem = {
  id_producto: string;
  producto: string;
  precio: number;
  cantidad: number;
};

function CartRow({
  item,
  onEditar,
}: {
  item: CartItem;
  /** Abre el teclado propio de la pestaña para editar esta cantidad. */
  onEditar: (id: string) => void;
}) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  // Texto local para permitir borrar/escribir libremente sin perder el foco.
  const [text, setText] = useState(String(item.cantidad));

  useEffect(() => {
    setText(String(item.cantidad));
  }, [item.cantidad]);

  const commit = () => {
    const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) {
      removeItem(item.id_producto);
    } else {
      updateQuantity(item.id_producto, n);
      setText(String(n));
    }
  };

  return (
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
      <View className="flex-row items-center gap-2 ml-4">
        <TouchableOpacity
          onPress={() => updateQuantity(item.id_producto, item.cantidad - 1)}
          className="bg-red-100 w-8 h-8 rounded-full items-center justify-center"
        >
          <Text className="text-red-500 font-bold text-base">−</Text>
        </TouchableOpacity>

        <TextInput
          value={text}
          onChangeText={(t) => setText(t.replace(/[^0-9]/g, ''))}
          onEndEditing={commit}
          onBlur={commit}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          // Teclado propio: con la pistola conectada Android no muestra el del
          // sistema. Ver components/InAppKeyboard.tsx.
          showSoftInputOnFocus={false}
          onFocus={() => onEditar(item.id_producto)}
          className="bg-gray-100 rounded-lg text-appu-text font-bold text-base text-center px-2 py-1"
          style={{ minWidth: 44 }}
        />

        <TouchableOpacity
          onPress={() => updateQuantity(item.id_producto, item.cantidad + 1)}
          className="bg-green-100 w-8 h-8 rounded-full items-center justify-center"
        >
          <Text className="text-green-600 font-bold text-base">+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CartTab() {
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  // Producto cuya cantidad se está editando con el teclado propio. El teclado
  // vive acá y no en cada fila para que quede anclado abajo, como uno real.
  const [editando, setEditando] = useState<string | null>(null);
  const itemEditando = items.find((i) => i.id_producto === editando) ?? null;

  const cambiarCantidad = (texto: string) => {
    if (!itemEditando) return;
    const limpio = texto.replace(/[^0-9]/g, "");
    // Vacío o 0 no borra el producto en caliente: sería destructivo mientras se
    // teclea. La fila se elimina recién al cerrar el teclado.
    const n = parseInt(limpio, 10);
    if (Number.isFinite(n) && n > 0) updateQuantity(itemEditando.id_producto, n);
  };

  const cerrarTeclado = () => {
    setEditando(null);
  };

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-4xl mb-3">🛒</Text>
        <Text className="text-gray-400 text-base">El carrito está vacío</Text>
        <Text className="text-gray-300 text-sm mt-1">Toca un producto para agregarlo</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id_producto}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <CartRow item={item} onEditar={setEditando} />
        )}
      />

      {itemEditando && (
        <InAppKeyboard
          mode="numeric"
          label={`Cantidad · ${itemEditando.producto}`}
          value={String(itemEditando.cantidad)}
          onChange={cambiarCantidad}
          onClose={cerrarTeclado}
        />
      )}
    </View>
  );
}
