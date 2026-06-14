import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { useAuthStore } from "../store/authStore";

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

// Manejo de errores: log en dev + cierre de sesión si el token expiró
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (IS_DEV) {
      console.error(
        `[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
        error.response?.status,
        error.response?.data
      );
    }

    // 401 en cualquier endpoint que no sea el login = token expirado/inválido
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRequest) {
      await useAuthStore.getState().logout();
      router.replace("/login");
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
  codigo_barras: string;
};

export type Caja = {
  id: string;
  nombre: string;
  codigo: string;
  estado: string;
};

export type DatosTransferencia = {
  banco: string;
  numero_cuenta: string;
  tipo_cuenta: string;
  qr_url: string;
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

export const getDatosTransferencia = (cafeteria_id: string) =>
  api.get<{ transferencia: DatosTransferencia | null }>(
    `/ventas/datos-transferencia/?cafeteria_id=${cafeteria_id}`
  );

export type ClientePOS = {
  documento: string;
  nombre: string;
  celular: string;
  correo: string;
};

// Busca un cliente por su cédula para autocompletar los datos en la factura.
export const buscarClientePorDocumento = (cafeteria_id: string, documento: string) =>
  api.get<{ cliente: ClientePOS | null }>(
    `/ventas/cliente/?cafeteria_id=${cafeteria_id}&documento=${encodeURIComponent(documento)}`
  );

export type OrdenDia = {
  id_orden: string;
  monto: number;
  metodo_pago: string;
  nombre_cliente: string;
  fecha_creacion: string;
  caja: string;
  vendedor: string;
  productos: { producto?: string; cantidad?: number; precio?: number }[];
};

export const getOrdenesDia = (cafeteria_id: string, caja_codigo?: string) =>
  api.get<{ ordenes: OrdenDia[]; total_dia: number; cantidad: number }>(
    `/ventas/ordenes-dia/?cafeteria_id=${cafeteria_id}` +
      (caja_codigo ? `&caja_codigo=${encodeURIComponent(caja_codigo)}` : "")
  );

export const actualizarPrecioProducto = (id_producto: string, precio: number) =>
  api.post<{ success: boolean; precio: number }>("/ventas/producto/precio/", {
    id_producto,
    precio,
  });

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
