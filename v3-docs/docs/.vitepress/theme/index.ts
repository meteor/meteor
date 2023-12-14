// .vitepress/theme/index.ts
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import ApiBox from "../../components/ApiBox.vue";
import Layout from "./Layout.vue";
import "./theme.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // register your custom global components
    app.component("ApiBox", ApiBox);
  },
  Layout,
} satisfies Theme;
