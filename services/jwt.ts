/**
 * Lectura del `exp` de un JWT, sin verificar la firma.
 *
 * Sirve solo para que la app sepa, ANTES de disparar el primer request, que el
 * token guardado ya venció y mande al login limpio en vez de mostrar un error
 * confuso. La validación real la sigue haciendo el backend en cada llamada:
 * esto no es una comprobación de seguridad y no debe usarse como tal.
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Decodificador propio en vez de `atob`: no depende de qué globals traiga el
// runtime de Hermes en cada versión de React Native.
function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);

  let salida = "";
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = B64.indexOf(padded[i]);
    const c1 = B64.indexOf(padded[i + 1]);
    const c2 = B64.indexOf(padded[i + 2]);
    const c3 = B64.indexOf(padded[i + 3]);
    if (c0 < 0 || c1 < 0) return "";

    const n = (c0 << 18) | (c1 << 12) | ((c2 & 63) << 6) | (c3 & 63);
    salida += String.fromCharCode((n >> 16) & 255);
    if (padded[i + 2] !== "=") salida += String.fromCharCode((n >> 8) & 255);
    if (padded[i + 3] !== "=") salida += String.fromCharCode(n & 255);
  }
  return salida;
}

/** Segundos epoch del `exp`, o null si el token no es legible. */
export function getTokenExp(token: string): number | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;

  const payload = base64UrlDecode(partes[1]);
  if (!payload) return null;

  // Regex en vez de JSON.parse: el payload trae el username, y un nombre con
  // acentos rompería el parseo al decodificar byte a byte. Solo nos importa exp.
  const m = payload.match(/"exp"\s*:\s*(\d+)/);
  if (!m) return null;

  const exp = Number(m[1]);
  return Number.isFinite(exp) ? exp : null;
}

/**
 * ¿El token ya venció? Un token ilegible se trata como vencido: es preferible
 * pedir login de nuevo que arrancar la app con una sesión que no sirve.
 *
 * `margenSegundos` descarta tokens a punto de expirar, para no entrar al POS
 * y que el 401 caiga a la mitad de una venta.
 */
export function tokenVencido(token: string, margenSegundos = 60): boolean {
  const exp = getTokenExp(token);
  if (exp === null) return true;
  return Date.now() / 1000 >= exp - margenSegundos;
}
