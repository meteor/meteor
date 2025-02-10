import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import solidSvg from "vite-plugin-solid-svg";
import { meteor } from 'meteor-vite/plugin';

export default defineConfig({
  plugins: [
    solidPlugin(),
    solidSvg({ defaultExport: 'component' }),
    meteor({
      clientEntry: 'imports/ui/main.jsx',
      serverEntry: 'server/main.js',
      enableExperimentalFeatures: true,
      stubValidation: {
        warnOnly: true,
      },
    }),
  ],
});
