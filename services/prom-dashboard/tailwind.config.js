/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'prom-orange': '#e6522c',
        'prom-bg': '#f8f9fa',
        'prom-border': '#dee2e6',
      }
    },
  },
  plugins: [],
}
