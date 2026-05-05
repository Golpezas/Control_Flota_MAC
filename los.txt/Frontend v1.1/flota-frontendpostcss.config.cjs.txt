/**
 * Configuración de PostCSS usando sintaxis CommonJS (.cjs)
 * para compatibilidad con PostCSS/Vite.
 */
module.exports = {
  plugins: {
    // 🔑 CORRECCIÓN: Usamos el nombre del paquete completo para evitar el error.
    '@tailwindcss/postcss': {}, 
    'autoprefixer': {},
  },
};