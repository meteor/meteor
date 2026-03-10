// .vitepress/theme/index.ts
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import ApiBox from "../../components/ApiBox.vue";
import ApiMap from "../../components/ApiMap.vue";
import Contributors from "./Contributors.vue";
import Layout from "./Layout.vue";
import "./theme.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // register your custom global components
    app.component("ApiBox", ApiBox);
    app.component("ApiMap", ApiMap);
    app.component("Contributors", Contributors);
  },
  Layout,
} satisfies Theme;
