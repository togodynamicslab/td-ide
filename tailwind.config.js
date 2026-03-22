/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        td: {
          bg: 'rgb(var(--td-bg) / <alpha-value>)',
          surface: 'rgb(var(--td-surface) / <alpha-value>)',
          border: 'rgb(var(--td-border) / <alpha-value>)',
          hover: 'rgb(var(--td-hover) / <alpha-value>)',
          accent: 'rgb(var(--td-accent) / <alpha-value>)',
          muted: 'rgb(var(--td-muted) / <alpha-value>)',
          bubble: 'rgb(var(--td-bubble) / <alpha-value>)',
          text: 'rgb(var(--td-text) / <alpha-value>)',
          'text-secondary': 'rgb(var(--td-text-secondary) / <alpha-value>)',
          'text-tertiary': 'rgb(var(--td-text-tertiary) / <alpha-value>)',
          'text-faint': 'rgb(var(--td-text-faint) / <alpha-value>)',
          'code-inline': 'rgb(var(--td-code-inline) / <alpha-value>)'
        }
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
