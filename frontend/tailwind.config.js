/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: '#d6d3cb',
        ink: '#1d1d1d',
        paper: '#ffffff',
        ash: '#a8a7a2',
        stone: '#c7c5be',
      },
      fontFamily: {
        sans: [
          '"Ataero Retina OB Edition"',
          '"Neue Haas Grotesk Display"',
          'Inter',
          '"Suisse Int\'l"',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      letterSpacing: {
        museum: '0.05em',
      },
      borderRadius: {
        interactive: '10px',
      },
    },
  },
  plugins: [],
}
