/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // BrightForge website palette
        portal: {
          dark: '#0d0f1a',
          surface: '#131627',
          surface2: '#1a1e32',
          border: 'rgba(255,255,255,0.07)',
          text: '#e8eaf2',
          soft: '#7a7f99',
          accent: '#f0622a',
          'accent-light': '#ff9a62',
        }
      }
    },
  },
  plugins: [],
}