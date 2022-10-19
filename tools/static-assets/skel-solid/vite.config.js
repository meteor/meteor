import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import solidSvg from "vite-plugin-solid-svg";

export default defineConfig({
  plugins: [solidPlugin(), solidSvg({
    defaultExport: 'component',
  })],
  meteor: {
    clientEntry: 'imports/ui/main.jsx',
  },
});
