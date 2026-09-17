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

// Cambia el token actual por uno nuevo, reiniciando su cuenta regresiva. La app
// lo llama al arrancar: así la sesión "rueda" y un POS en uso diario no vuelve
// a ver el login. Requiere un token todavía válido (lo inyecta el interceptor).
export const refrescarSesion = () =>
  api.post<{ success: boolean; token: string }>("/auth/refresh/");

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
  // Campos que agrega el backend al aplicar promociones (ver
  // calcularPromociones). Viajan tal cual dentro de la orden: los reportes de
  // Costos y SuperAdmin leen exactamente estos nombres.
  precio_unitario?: number;
  precio_unitario_original?: number;
  precioTotal?: number;
  descuentoTotal?: number;
  promocionId?: string | null;
  unidadesPromocion?: number;
  promocion_aplicada?: PromocionAplicada | null;
  combo_aplicado?: ComboAplicado | null;
  /** true cuando la línea la agregó una promo de "producto gratis". */
  agregado_por_promocion?: boolean;
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
  /** Promociones vigentes del cliente en esta cafetería (suyas + masivas). */
  promociones?: Promocion[];
  promocion_resumen?: string;
  tiene_promociones?: boolean;
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

// Autocompletado mientras se escribe: `q` puede ser un prefijo de cédula (solo
// dígitos) o parte del nombre. Solo los clientes que esta
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

// ─── Promociones ─────────────────────────────────────────────────────────────

export type Promocion = {
  id: string;
  nombre: string;
  descripcion: string;
  tipo_promocion: string;
  /** Marca que patrocina la promo: a quien el tendero le cobra el descuento. */
  empresa_patrocinadora: string;
  /** true = campaña para todos los clientes de la cafetería. */
  es_masiva: boolean;
  porcentaje?: number | string;
  fecha_inicio?: string;
  fecha_vencimiento?: string;
  productos?: { id_producto: string; producto: string }[];
};

export type PromocionAplicada = {
  id: string;
  nombre: string;
  tipo?: string;
  porcentaje?: number;
  unidades_con_descuento?: number;
  descuento_total: number;
  empresa_patrocinadora?: string;
};

export type ComboAplicado = {
  combo_id: string;
  nombre: string;
  numero_combos: number;
  precio_combo: number;
  descuento_total: number;
  empresa_patrocinadora?: string;
};

export type ResumenPromoAplicada = {
  id: string;
  nombre: string;
  empresa_patrocinadora: string;
  descuento_total: number;
  productos: string[];
};

export type CarritoConPromociones = {
  items: CartItem[];
  total: number;
  total_sin_descuento: number;
  total_descuento: number;
  promociones_aplicadas: ResumenPromoAplicada[];
  promociones_disponibles: Promocion[];
};

/**
 * Promociones vigentes de la cafetería. Sin `documento` devuelve solo las
 * masivas (las que puede usar cualquier cliente); con documento, también las
 * personales de esa persona.
 */
export const getPromociones = (cafeteria_id: string, documento?: string) =>
  api.get<{ promociones: Promocion[]; cantidad: number; masivas: Promocion[] }>(
    `/promociones/?cafeteria_id=${encodeURIComponent(cafeteria_id)}` +
      (documento ? `&documento=${encodeURIComponent(documento)}` : "")
  );

/**
 * Manda el carrito y devuelve el carrito **ya con los descuentos aplicados**.
 *
 * El cálculo vive en el backend a propósito: el POS web tiene el mismo motor en
 * JavaScript y mantener dos copias de esas reglas (combos, cupos, 2x1...) las
 * desincronizaría a la primera promoción nueva.
 */
export const calcularPromociones = (payload: {
  cafeteria_id: string;
  documento?: string;
  carrito: { id_producto: string; producto: string; precio: number; cantidad: number }[];
}) => api.post<CarritoConPromociones>("/promociones/calcular/", payload);

// ─── Cuentas por cobrar del tendero ──────────────────────────────────────────

export type PromoPorCobrar = {
  promocion_id: string;
  nombre: string;
  tipo: string;
  alcance: string;
  total: number;
  usos: number;
  ultima_fecha: string;
};

export type EmpresaPorCobrar = {
  empresa: string;
  /** false = no hay marca detrás; el descuento lo asumió la cafetería. */
  patrocinada: boolean;
  total: number;
  usos: number;
  clientes: number;
  promociones: PromoPorCobrar[];
};

export type CuentaPorCobrar = {
  empresas: EmpresaPorCobrar[];
  total: number;
  total_usos: number;
  total_empresas: number;
  solo_pendientes: boolean;
  fecha_inicio: string;
  fecha_fin: string;
};

export type FilaPorCobrar = {
  id: string;
  fecha: string;
  id_orden: string;
  cliente: string;
  documento: string;
  producto: string;
  cantidad: number;
  promocion: string;
  promocion_id: string;
  empresa: string;
  valor_real: number;
  descuento: number;
  estado_pago: string;
};

/** Cuánto le debe cada empresa al tendero por los descuentos que ya dio. */
export const getCuentaPorCobrar = (params: {
  cafeteria_id: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  incluir_pagados?: boolean;
}) => {
  const q = new URLSearchParams({ cafeteria_id: params.cafeteria_id });
  if (params.fecha_inicio) q.set("fecha_inicio", params.fecha_inicio);
  if (params.fecha_fin) q.set("fecha_fin", params.fecha_fin);
  if (params.incluir_pagados) q.set("incluir_pagados", "1");
  return api.get<CuentaPorCobrar>(`/promociones/por-cobrar/?${q.toString()}`);
};

/** Las ventas, una por una, que componen lo que debe una empresa. */
export const getDetallePorCobrar = (params: {
  cafeteria_id: string;
  empresa?: string;
  promocion_id?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  incluir_pagados?: boolean;
}) => {
  const q = new URLSearchParams({ cafeteria_id: params.cafeteria_id });
  if (params.empresa) q.set("empresa", params.empresa);
  if (params.promocion_id) q.set("promocion_id", params.promocion_id);
  if (params.fecha_inicio) q.set("fecha_inicio", params.fecha_inicio);
  if (params.fecha_fin) q.set("fecha_fin", params.fecha_fin);
  if (params.incluir_pagados) q.set("incluir_pagados", "1");
  return api.get<{ filas: FilaPorCobrar[]; total: number; cantidad: number }>(
    `/promociones/por-cobrar/detalle/?${q.toString()}`
  );
};

/** Marca como cobrado lo que la empresa ya le reembolsó al tendero. */
export const marcarCobrado = (uso_ids: string[], pagado = true) =>
  api.post<{ success: boolean; actualizados: number; estado: string }>(
    "/promociones/por-cobrar/marcar/",
    { uso_ids, pagado }
  );
