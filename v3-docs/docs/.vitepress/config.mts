import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "API Docs",
  description: "Meteor.js API docs",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Galaxy", link: "https://www.meteor.com/cloud" },
      {
        text: "Tutorials",
        link: "https://www.meteor.com/developers/tutorials",
      },
      { text: "Guide", link: "https://guide.meteor.com/" },
      { text: "API Docs", link: "/api/index" },
      { text: "Forums", link: "https://forums.meteor.com/" },
    ],
    sidebar: [
      {
        text: "API",
        items: [
          { text: "API map", link: "/api/index" },
          { text: "Runtime API Examples", link: "/api-examples" },
          { text: "Accounts", link: "/api/accounts" },
          {
            text: "Meteor",
            link: "/api/meteor",
            items: [
              { text: "Core", link: "/api/meteor#core" },
              { text: "Methods", link: "/api/meteor#methods" },
          ],
          },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/meteor/meteor" }],
    logo: "/meteor-logo.png",
    search: {
      provider: "local",
    },
    footer: {
      message:
        'Released under the <a href="https://github.com/meteor/meteor?tab=License-1-ov-file#readme">MIT License</a>.',
      copyright:
        'Copyright (c) 2011 - present <a href="https://www.meteor.com/">Meteor Software</a>.',
    },
    editLink: {
      pattern: 'https://github.com/meteor/meteor/edit/main/v3-docs/docs/:path',
      text: 'Edit this page on GitHub'
    }
  },
});
