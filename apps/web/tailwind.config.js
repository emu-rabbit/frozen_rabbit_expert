/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'soft-green': {
          50: '#e8f5e9',
          300: '#92c5b2',
          500: '#52a890',
          600: '#3e8f7a',
          900: '#2d6a5a',
          950: '#1b4137',
        },
      },
    },
  },
  plugins: [],
}
