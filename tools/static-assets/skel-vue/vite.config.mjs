import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { meteor } from 'meteor-vite/plugin';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    meteor({
      clientEntry: 'client/main.js',
      serverEntry: 'server/main.js',
      enableExperimentalFeatures: true,
      stubValidation: {
        ignorePackages: ['meteor/mongo'],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['vue-meteor-tracker'],
  },
});
