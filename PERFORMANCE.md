# Optimizaciones de rendimiento

Cambios aplicados para que la app corra fluida en la mayoría de celulares, con foco
en **gama baja** (RAM limitada y CPU lenta). El cuello de botella en estos dispositivos
no es el tamaño del APK (~30–45 MB, instalable sin problema), sino los **re-renders** y
el **manejo de memoria de imágenes**.

> Ningún cambio toca la capa de API ni el contrato con el backend, por lo que no hay
> riesgo para el "POS normal" web.

---

## 🔴 Re-renders (mayor impacto)

### Selectores de Zustand
Antes los componentes se suscribían al **store completo** y se re-renderizaban ante
cualquier cambio de estado, aunque no usaran ese dato.

```diff
- const { items, total, addItem, clearCart } = useCartStore();
+ const items = useCartStore((s) => s.items);
+ const total = useCartStore((s) => s.total);
+ const addItem = useCartStore((s) => s.addItem);
```

**Archivos:** `app/(app)/pos.tsx`, `components/CartTab.tsx`,
`components/CheckoutModal.tsx`, `app/_layout.tsx`.

### `ProductCard` memoizado
- Envuelto en `React.memo`.
- `onPress` ahora es estable (`useCallback` interno + la acción `addItem`, que es una
  referencia estable en Zustand). Esto permite que `memo` realmente salte renders.

**Resultado:** al agregar un producto al carrito **solo se re-renderiza la tarjeta cuya
cantidad cambió**, no las ~60 visibles.

### Cálculo de cantidad O(n) → O(1)
`cantidadEnCarrito` recorría el carrito por cada tarjeta. Reemplazado por un mapa
memoizado que se recalcula solo cuando cambia el carrito:

```ts
const cantidadPorProducto = useMemo(() => {
  const map: Record<string, number> = {};
  for (const i of items) map[i.id_producto] = i.cantidad;
  return map;
}, [items]);
```

### `renderItem` y `keyExtractor` estables
Ambos envueltos en `useCallback` en el grid de productos para no recrearlos en cada render.

---

## 🟠 Imágenes — `expo-image` (clave para RAM)

Migrado de `<Image>` de React Native a **`expo-image`** (incluido en Expo 54) en:
- `components/ProductCard.tsx` (fotos de productos)
- `components/CheckoutModal.tsx` (QR de transferencia)

Ventajas en gama baja:
- Caché en **memoria + disco** (`cachePolicy="memory-disk"`).
- `recyclingKey` para reciclar vistas durante el scroll.
- `blurhash` como placeholder + transición suave (evita parpadeos).
- Mejor manejo de memoria → menos riesgo de **crash por OOM** con muchos productos.

```diff
- import { Image } from "react-native";
- <Image source={{ uri }} resizeMode="cover" />
+ import { Image } from "expo-image";
+ <Image source={{ uri }} contentFit="cover" cachePolicy="memory-disk"
+        recyclingKey={producto.id_producto} transition={150} />
```

**Dependencia añadida:** `expo-image ~3.0.11` (instalada con `npx expo install`).

---

## 🟠 Virtualización del `FlatList` — **descartada**

Se probó afinar la virtualización (`initialNumToRender`, `maxToRenderPerBatch`,
`windowSize`, `removeClippedSubviews`) pero se **revirtió por completo**: las tarjetas
tienen **altura variable** (nombres de 1–2 líneas), así que forzar lotes pequeños hacía
que el `FlatList` re-midiera constantemente y corrigiera la posición del scroll →
"baja y sube", lag severo y tarjetas "fantasma" (sombras sin limpiar durante el salto).

Se dejaron los **defaults de FlatList**, que con altura variable se comportan mejor.

> ⚠️ Lección: con celdas de altura variable + sombras, **no** tunear la virtualización
> a mano. Si en el futuro se necesita, la vía correcta es darles **altura fija** y usar
> `getItemLayout`, o migrar a `@shopify/flash-list`.

---

## 🟡 Limpieza de peso muerto

Eliminados los archivos del template default de Expo, que **no se usaban** (el entry real
es `expo-router/entry`, definido en `package.json`):

- `App.tsx`
- `index.ts`

---

## Verificación

- `npx tsc --noEmit` pasa **sin errores**.
- No quedaron referencias obsoletas (`onPress` viejo de ProductCard, `cantidadEnCarrito`,
  `resizeMode`, imports de `Image` de react-native, etc.).

---

## Resumen de archivos tocados

| Archivo | Cambio |
|---|---|
| `app/(app)/pos.tsx` | Selectores Zustand · mapa de cantidades O(1) · `renderItem`/`keyExtractor` estables · props de virtualización |
| `components/ProductCard.tsx` | `React.memo` · `onAdd` con `onPress` estable · `expo-image` |
| `components/CartTab.tsx` | Selectores Zustand |
| `components/CheckoutModal.tsx` | Selectores Zustand · `expo-image` para el QR |
| `app/_layout.tsx` | Selectores Zustand |
| `App.tsx`, `index.ts` | Eliminados (código muerto) |
| `package.json` | + `expo-image` |
