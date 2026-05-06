import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        trail: {
          green:      '#2d6a4f',
          'green-light': '#52b788',
          'green-pale': '#d8f3dc',
          amber:      '#e8962e',
          'amber-light': '#fde68a',
          stone:      '#6b7280',
          bg:         '#f8f6f1',
          dark:       '#1a2e1e',
          bark:       '#7c5c3e',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
      },
      boxShadow: {
        sheet: '0 -4px 24px rgba(0,0,0,0.12)',
        card:  '0 2px 8px rgba(0,0,0,0.07)',
        pin:   '0 2px 6px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config
