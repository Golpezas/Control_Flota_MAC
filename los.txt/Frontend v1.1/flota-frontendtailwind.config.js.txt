/** @type {import('tailwindcss').Config} */
module.exports = {
  // CRÍTICO: Rutas donde Tailwind debe escanear las clases
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Puedes añadir colores, fuentes o extensiones de tema aquí.
      colors: {
        'flota-primary': '#1D3557', // Azul Oscuro principal
        'flota-secondary': '#457B9D', // Azul Claro
        'flota-accent': '#FFB703', // Amarillo de acento para botones/alertas
      }
    },
  },
  plugins: [],
}