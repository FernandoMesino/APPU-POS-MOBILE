import axios from "axios";
import * as SecureStore from "expo-secure-store";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api/mobile";
const IS_DEV = process.env.EXPO_PUBLIC_ENV === "development";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    // Evita la pantalla de advertencia de ngrok en desarrollo
    ...(IS_DEV && { "ngrok-skip-browser-warning": "true" }),
  },
});

// Inyecta el token automáticamente en cada request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Log de errores en desarrollo
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (IS_DEV) {
      console.error(
        `[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
        error.response?.status,
        error.response?.data
      );
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────

export type LoginResponse = {
  success: boolean;
  token: string;
  user: { username: string; permission: string };
  cafeterias: { id: string; nombre: string }[];
};

export const loginRequest = (username: string, password: string) =>
  api.post<LoginResponse>("/auth/login/", { username, password });

// ─── Ventas ──────────────────────────────────────────────────────────────────

export type Producto = {
  id_producto: string;
  producto: string;
  precio: number;
  cantidad: number;
  categoria: string;
  foto_url: string;
  descripcion: string;
};

export type Caja = {
  id: string;
  nombre: string;
  codigo: string;
  estado: string;
};

export type MetodoPago = {
  id: string;
  nombre: string;
};

export type CartItem = {
  id_producto: string;
  producto: string;
  precio: number;
  cantidad: number;
};

export const getProductos = (cafeteria_id: string) =>
  api.get<{ productos: Producto[]; categorias: string[] }>(
    `/ventas/productos/?cafeteria_id=${cafeteria_id}`
  );

export const getCajas = (cafeteria_id: string) =>
  api.get<{ cajas: Caja[] }>(`/ventas/cajas/?cafeteria_id=${cafeteria_id}`);

export const getMetodosPago = (cafeteria_id: string) =>
  api.get<{ metodos_pago: MetodoPago[] }>(
    `/ventas/metodos-pago/?cafeteria_id=${cafeteria_id}`
  );

export const crearOrden = (payload: {
  cafeteria_id: string;
  carrito: CartItem[];
  nombre_cliente: string;
  documento_cliente: string;
  celular_cliente: string;
  metodo_pago: string;
  monto: number;
  caja_codigo: string;
}) => api.post<{ success: boolean; id_orden: string }>("/ventas/orden/", payload);
