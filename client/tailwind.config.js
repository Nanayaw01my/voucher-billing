/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // The whole interface is white and black. `ink` is the only non-neutral
      // token, and it is simply black -- there are no accent colours anywhere.
      colors: {
        ink: '#000000',
        paper: '#ffffff',
        hairline: '#e5e5e5',
        muted: '#6b6b6b',
        wash: '#f7f7f7',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
