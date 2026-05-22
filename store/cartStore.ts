import { create } from "zustand";
import type { Producto } from "../services/api";

type CartItem = {
  id_producto: string;
  producto: string;
  precio: number;
  cantidad: number;
};

type CartState = {
  items: CartItem[];
  total: number;

  addItem: (producto: Producto) => void;
  removeItem: (id_producto: string) => void;
  updateQuantity: (id_producto: string, cantidad: number) => void;
  clearCart: () => void;
};

const calcTotal = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

export const useCartStore = create<CartState>((set) => ({
  items: [],
  total: 0,

  addItem: (producto) => {
    set((state) => {
      const existing = state.items.find((i) => i.id_producto === producto.id_producto);
      let items: CartItem[];
      if (existing) {
        items = state.items.map((i) =>
          i.id_producto === producto.id_producto
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      } else {
        items = [
          ...state.items,
          {
            id_producto: producto.id_producto,
            producto: producto.producto,
            precio: producto.precio,
            cantidad: 1,
          },
        ];
      }
      return { items, total: calcTotal(items) };
    });
  },

  removeItem: (id_producto) => {
    set((state) => {
      const items = state.items.filter((i) => i.id_producto !== id_producto);
      return { items, total: calcTotal(items) };
    });
  },

  updateQuantity: (id_producto, cantidad) => {
    set((state) => {
      const items =
        cantidad <= 0
          ? state.items.filter((i) => i.id_producto !== id_producto)
          : state.items.map((i) =>
              i.id_producto === id_producto ? { ...i, cantidad } : i
            );
      return { items, total: calcTotal(items) };
    });
  },

  clearCart: () => set({ items: [], total: 0 }),
}));
