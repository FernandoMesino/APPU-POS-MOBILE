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

// Cuando el backend responde HTML en vez de JSON, la respuesta es una página de
// error entera. Volcarla al log tapa la consola y hace que un simple "ruta no
// encontrada" parezca un fallo grave, así que se resume.
const resumirError = (data: unknown): unknown => {
  if (typeof data !== "string") return data;

  const esHtml = data.trimStart().toLowerCase().startsWith("<!doctype");
  if (!esHtml) return data.length > 300 ? data.slice(0, 300) + "…" : data;

  // Django pone el motivo real en el <title> ("403 Forbidden", "404 Not Found").
  const titulo = data.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  return `HTML del servidor (${titulo ?? "sin título"}) — el endpoint no devolvió JSON; suele ser una ruta que no existe en ese servidor.`;
};

// Manejo de errores: log en dev + cierre de sesión si el token expiró
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (IS_DEV) {
      console.error(
        `[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
        error.response?.status,
        resumirError(error.response?.data)
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

// Da de alta una caja. El `codigo` es lo que queda grabado en cada orden, así
// que el backend rechaza códigos repetidos dentro de la misma cafetería.
export const crearCaja = (payload: {
  cafeteria_id: string;
  nombre: string;
  codigo: string;
}) => api.post<{ success: boolean; caja: Caja }>("/ventas/caja/crear/", payload);

export const getDatosTransferencia = (cafeteria_id: string) =>
  api.get<{ transferencia: DatosTransferencia | null }>(
    `/ventas/datos-transferencia/?cafeteria_id=${cafeteria_id}`
  );

export type ClientePOS = {
  documento: string;
  nombre: string;
  celular: string;
  correo: string;
  // De dónde salieron los datos: "cache" | "subsidios" | "app" | "acudientes" | "plaza".
  origen?: string;
};

// Busca un cliente por su cédula para autocompletar los datos en la factura.
// Acotada a la cafetería: no devuelve clientes de otros comercios.
export const buscarClientePorDocumento = (
  documento: string,
  cafeteria_id: string
) =>
  api.get<{ cliente: ClientePOS | null }>(
    `/ventas/cliente/?documento=${encodeURIComponent(documento)}` +
      `&cafeteria_id=${encodeURIComponent(cafeteria_id)}`
  );

export type SugerenciaCliente = {
  documento: string;
  nombre: string;
  celular: string;
  correo: string;
};

// Autocompletado mientras se escribe la cédula. Solo los clientes que esta
// cafetería ya facturó. Devuelve [] con menos de 3 dígitos.
export const buscarSugerenciasClientes = (q: string, cafeteria_id: string) =>
  api.get<{ sugerencias: SugerenciaCliente[] }>(
    `/ventas/clientes/sugerencias/?q=${encodeURIComponent(q)}` +
      `&cafeteria_id=${encodeURIComponent(cafeteria_id)}`
  );

// Registra un cliente nuevo sin facturarle, para que la próxima búsqueda por
// cédula lo autocomplete. Es un upsert: repetir el documento actualiza.
// Queda asociado a la cafetería que lo registra.
export const crearCliente = (payload: {
  cafeteria_id: string;
  documento: string;
  nombre: string;
  celular?: string;
  correo?: string;
}) =>
  api.post<{
    success: boolean;
    ya_existia: boolean;
    cliente: ClientePOS;
  }>("/ventas/cliente/crear/", payload);

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

export type FichaMaestra = {
  codigo_barras: string;
  producto: string;
  categoria: string;
  marca: string;
  descripcion: string;
  foto_url: string;
  /** La plantilla no maneja precio: casi siempre llega 0. Es solo una sugerencia. */
  precio_sugerido: number;
};

// Paso 1: consulta el código en la plantilla maestra SIN crear nada, para que
// el cajero vea la ficha y le ponga precio y stock antes de confirmar.
// `encontrado: false` = no está en la plantilla, toca el formulario manual.
export const consultarPlantilla = (payload: {
  cafeteria_id: string;
  codigo_barras: string;
}) =>
  api.post<{
    encontrado: boolean;
    ya_existia?: boolean;
    ficha?: FichaMaestra;
    producto?: Producto;
  }>("/ventas/plantilla/consultar/", payload);

// Paso 2: crea el producto en la cafetería con la ficha maestra + precio y
// stock. El backend relee la plantilla, no confía en lo que mande el móvil.
// La plantilla maestra NO se modifica.
export const productoDesdePlantilla = (payload: {
  cafeteria_id: string;
  codigo_barras: string;
  precio: number;
  cantidad: number;
}) =>
  api.post<{ success: boolean; producto: Producto }>(
    "/ventas/producto/desde-plantilla/",
    payload
  );

// Alta de producto desde el mostrador. Solo los campos que llena un cajero; el
// resto de la ficha queda con los valores por defecto del backend.
export const crearProducto = (payload: {
  cafeteria_id: string;
  producto: string;
  categoria: string;
  precio: number;
  cantidad: number;
  codigo_barras?: string;
}) =>
  api.post<{ success: boolean; producto: Producto }>(
    "/ventas/producto/crear/",
    payload
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
