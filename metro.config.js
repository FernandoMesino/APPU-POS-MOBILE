const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// ─── Modo Expo Go ────────────────────────────────────────────────────────────
// `react-native-keyboard-controller` es una librería nativa que Expo Go no
// incluye, y la app crashea al arrancar por el KeyboardProvider del layout raíz.
// Con EXPO_GO_SHIM=1 (definido en .env.local, que está en .gitignore) la
// redirigimos a un shim de React Native puro. Sin esa variable —builds de EAS,
// dev clients, el resto del equipo— no cambia absolutamente nada.
if (process.env.EXPO_GO_SHIM === "1") {
  const shim = path.resolve(__dirname, "shims/keyboard-controller.tsx");
  const defaultResolveRequest = config.resolver.resolveRequest;

  console.log("[metro] EXPO_GO_SHIM=1 → react-native-keyboard-controller apunta al shim de Expo Go");

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "react-native-keyboard-controller") {
      return { type: "sourceFile", filePath: shim };
    }
    return (defaultResolveRequest ?? context.resolveRequest)(
      context,
      moduleName,
      platform
    );
  };
}

module.exports = withNativeWind(config, { input: "./global.css" });
