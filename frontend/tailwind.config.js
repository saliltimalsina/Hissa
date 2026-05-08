/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#fafaf8',
        surface: '#ffffff',
        's2': '#f2f5ef',
        's3': '#e8ebe6',
        dark: '#0e0f0c',
        'dark-2': '#1a1c18',
        'dark-3': '#252720',
        tx: '#0e0f0c',
        't2': '#454745',
        't3': '#868685',
        green: '#9fe870',
        'green-text': '#163300',
        'green-dark': '#054d28',
        'green-dim': '#e2f6d5',
        danger: '#d03238',
        warning: '#b37d00',
      },
      fontFamily: {
        sans: ['Inter', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'card': '16px',
        'card-lg': '30px',
        'card-xl': '40px',
        'pill': '9999px',
      },
      boxShadow: {
        'ring': 'rgba(14, 15, 12, 0.12) 0px 0px 0px 1px',
        'ring-green': '#9fe870 0px 0px 0px 1.5px',
        'ring-md': 'rgba(14, 15, 12, 0.18) 0px 0px 0px 1px, rgba(14,15,12,0.06) 0px 4px 12px',
      },
    },
  },
  plugins: [],
}
