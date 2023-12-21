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
        text: "About",
        items: [
          {
            text: "What is Meteor?",
            link: "/about/what-is#what-is-meteor",
          },
          {
            text: "Meteor resources",
            link: "/about/what-is#learning-more",
          },
          {
            text: "Roadmap",
            link: "/about/roadmap",
          },
        ],
        collapsed: true,
      },
      {
        text: "Quick Start",
        items: [
          {
            text: "Install Meteor",
            link: "/about/install",
          },
          // TODO: Your first app meteor app
        ],
        collapsed: true,
      },
      {
        text: "API",
        link: "/api/index",
        items: [
          { text: "Accounts", link: "/api/accounts" },
          {
            text: "Meteor",
            link: "/api/meteor",
            items: [
              { text: "Core", link: "/api/meteor#core" },
              { text: "Methods", link: "/api/meteor#methods" },
            ],
          },
          { text: "Maintained Packages", link: "/api/packages-listing" },
        ],
        collapsed: true,
      },
      {
        text: "Changelog",
        items: [
          // TODO: Open issue in Vitepress about this
          { link: "/history", text: "Current" },
          { link: "old-changelogs/pre-2.0", text: "Pre-2.0" },
          { link: "old-changelogs/pre-1.0", text: "Pre-1.0" },
        ],
        collapsed: true,
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
      pattern: "https://github.com/meteor/meteor/edit/main/v3-docs/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
