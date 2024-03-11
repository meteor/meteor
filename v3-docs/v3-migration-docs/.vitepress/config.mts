import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Meteor V3 Migration Guide",
  description: "Meteor.js API docs",
  head: [["link", { rel: "icon", href: "/logo.png" }]],
  lastUpdated: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    sidebar: [
      {
        text: "Guide",
        items: [
          {text: "Overview", link: "/"},
          {text: "Breaking Changes", link: "/breaking-changes/"},
        ]
      },
      {
        text: "APIs changes",
        items: [
          {text: "Using Async Functions", link: "/api/async-functions"},
          {text: "Renamed Functions", link: "/api/renamed-functions"},
          {text: "Removed Functions", link: "/api/removed-functions"},
        ]
      },
      {
        text: "Front end",
        items: [
          {text: "Isomorphic code", link: "/front-end/isomorphic-code"},
          {text: "React", link: "/front-end/react"},
          {text: "Blaze", link: "/front-end/blaze"},
        ]
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/meteor/meteor" }],

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
      pattern: "https://github.com/meteor/meteor/edit/release-3.0/v3-docs/v3-migration-docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
