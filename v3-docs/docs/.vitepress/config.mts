import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Meteor API Docs",
  description: "Meteor.js API docs",
  head:  [['link', { rel: 'icon', href: '/logo.png' }]],
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
        text: "Troubleshooting",
        items: [
          {text: "Expired Certificates", link: "/troubleshooting/expired-certificate"},
          {text: "Windows", link: "/troubleshooting/windows"},
          {text: "Known issues in 2.13", link: "/troubleshooting/known-issues"},
        ],
        collapsed: true,
      },
      {
        text: "Command Line",
        items: [
          {link: "cli/index", text: "CLI" },
          {link: "cli/using-core-types", text: "Using Core Types" },
          {link: "cli/environment-variables", text: "Environment Variables" },
        ],
        collapsed: true
      },
      {
        text: "Changelog",
        items: [
          // TODO: Open issue in Vitepress about this
          { link: "/history", text: "Current" },
          { link: "https://docs.meteor.com/changelog#v2020210120", text: "Pre-2.0 (legacy)" },
        ],
        collapsed: true,
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/meteor/meteor" }],
    logo: {dark: "/meteor-logo.png", light: "/meteor.png"},
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
