/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        console: '0 1px 2px rgba(16, 24, 40, 0.05)',
      },
      colors: {
        console: {
          label: '#64748b',
        },
      },
    },
  },
  plugins: [],
};
