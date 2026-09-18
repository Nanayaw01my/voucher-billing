/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /**
       * White background with a blue accent. Two blues, because text and chart
       * marks have different contrast requirements against white:
       *   brand  #1b5fb0 -> 6.34:1, clears WCAG AA for text and button fills
       *   series #2a78d6 -> 4.42:1, below the text floor but well over the 3:1
       *                     a chart mark needs; validated for data marks.
       * Using the lighter one for text would fail AA, so they stay separate.
       */
      colors: {
        paper: '#ffffff',
        ink: '#0f172a',
        brand: {
          DEFAULT: '#1b5fb0',
          dark: '#14477f',
          tint: '#eff4fb',
          border: '#c9dcf2',
        },
        series: '#2a78d6',
        // Reserved for errors. 6.57:1 on white, never used decoratively.
        danger: { DEFAULT: '#b42318', tint: '#fef3f2', border: '#fcd9d4' },
        hairline: '#e3e8ef',
        muted: '#5b6472',
        wash: '#f6f8fb',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
