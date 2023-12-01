// .vitepress/theme/index.ts
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import ApiSiteMap from '../../components/ApiSiteMap.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // register your custom global components
    app.component(
      'ApiSiteMap',
      ApiSiteMap,
    )
  }
} satisfies Theme