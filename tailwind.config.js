/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        appu: {
          dark: "#1a1a4e",   // azul oscuro del header
          blue: "#2f2c59",   // purple/blue de APPU
          orange: "#f97316", // naranja tabs activos
          green: "#22c55e",  // verde botón Facturar
          card: "#f3f4f6",   // fondo tarjeta producto
          text: "#1f2937",
        },
      },
    },
  },
  plugins: [],
};
