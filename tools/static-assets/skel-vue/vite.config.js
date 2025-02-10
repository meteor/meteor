import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { meteor } from 'meteor-vite/plugin';

export default defineConfig({
  plugins: [
    vue(),
    meteor({
      clientEntry: 'imports/ui/main.js',
      serverEntry: 'server/main.js',
      enableExperimentalFeatures: true,
      stubValidation: {
        warnOnly: true,
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['vue-meteor-tracker'],
  },
});
