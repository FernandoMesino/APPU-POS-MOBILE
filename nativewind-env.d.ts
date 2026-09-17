/// <reference types="nativewind/types" />

// TypeScript 6 (el que trae Expo SDK 57) exige una declaración para los imports
// de efecto secundario de hojas de estilo. NativeWind no la incluye, así que sin
// esto `import "../global.css"` en app/_layout.tsx no compila.
declare module "*.css";
