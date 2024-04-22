import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Meteor 3.0 Migration Guide",
  description: "Guide on migrating from Meteor 2.x to Meteor 3.0",
  lang: 'en-US',
  head: [["link", { rel: "icon", href: "/logo.png" }]],
  lastUpdated: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Meteor 3.0 Docs', link: 'https://v3-docs.meteor.com' },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          {text: "Overview", link: "/"},
          {text: "Frequently Asked Questions", link: "/frequently-asked-questions/"},
          {text: "Breaking Changes", link: "/breaking-changes/"},
          {text: "Meteor.call x Meteor.callAsync", link: "/breaking-changes/call-x-callAsync"},
          {text: "Upgrading packages", link: "/breaking-changes/upgrading-packages"},
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
          {text: "React Changes", link: "/front-end/react"},
          {text: "Blaze Changes", link: "/front-end/blaze"},
        ]
      },
      {
        text: "Migrating to Async in v2",
        link: "/migrating-to-async-in-v2/index"
      }
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
