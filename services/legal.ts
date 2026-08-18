import { Alert, Linking } from "react-native";

/**
 * Enlace legal de la app.
 *
 * Apple exige (guideline 5.1.1(i)) que la política de privacidad sea accesible
 * **dentro** de la app, no solo en los metadatos de App Store Connect. Por eso
 * aparece en dos sitios: el pie del login —alcanzable sin iniciar sesión, que es
 * como la va a encontrar el revisor— y el menú de perfil.
 *
 * Apunta a la página que ya publica el backend en `Reservas/urls.py`
 * (`Terminos_Y_Condiciones/`), que incluye la autorización de tratamiento de
 * datos. Si se publica una página de privacidad aparte, basta cambiar esta
 * constante.
 */
export const URL_LEGAL = "https://appu.store/Terminos_Y_Condiciones/";

export const abrirLegal = async () => {
  try {
    const soportado = await Linking.canOpenURL(URL_LEGAL);
    if (!soportado) throw new Error("URL no soportada");
    await Linking.openURL(URL_LEGAL);
  } catch {
    // Sin navegador disponible el enlace no sirve de nada: se muestra la
    // dirección para que se pueda abrir a mano.
    Alert.alert("No se pudo abrir el enlace", URL_LEGAL);
  }
};
