/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        forest: { 50: '#f1f7f4', 100: '#dcebe3', 600: '#1f6b4d', 700: '#17553d', 800: '#0f3d2e', 900: '#0a2a20' },
        emerald2: '#10a37f',
        gold: { 300: '#e6d28a', 400: '#d4b85a', 500: '#c19d3a' },
        beige: { 50: '#fbf9f4', 100: '#f4efe3', 200: '#e9e0cb' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        arabic: ['Amiri', '"Noto Naskh Arabic"', 'serif'],
      },
    },
  },
  plugins: [],
}
