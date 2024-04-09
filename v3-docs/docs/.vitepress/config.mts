import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Meteor API Docs",
  description: "Meteor.js API docs",
  head: [["link", { rel: "icon", href: "/logo.png" }]],
  lastUpdated: true,
  sitemap: {
    hostname: "https://v3-docs.meteor.com",
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Galaxy", link: "https://www.meteor.com/cloud" },
      {
        text: "Tutorials",
        link: "https://www.meteor.com/developers/tutorials",
      },
      { text: "Guide", link: "https://guide.meteor.com/" },
      { text: "API Docs", link: "/about/what-is" },
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
          {
            text: "Accounts",
            link: "/api/accounts",
            items: [
              { text: "Accounts-Base", link: "/api/accounts#accounts-base" },
              { text: "Multi-server", link: "/api/accounts#multi-server" },
              { text: "Passwords", link: "/api/accounts#passwords" },
            ],
            collapsed: true,
          },
          {
            text: "Meteor",
            link: "/api/meteor",
            items: [
              { text: "Core", link: "/api/meteor#core" },
              { text: "Methods", link: "/api/meteor#methods" },
              { text: "Publish and Subscribe", link: "/api/meteor#pubsub" },
              { text: "Server connections", link: "/api/meteor#connections" },
              { text: "Timers", link: "/api/meteor#timers" },
            ],
          },
          {
            text: "Collections",
            link: "/api/collections",
          },
          {
            text: "DDPRateLimiter",
            link: "/api/DDPRateLimiter",
          },
          {
            text: "Check",
            link: "/api/check",
          },
          {
            text: "Session",
            link: "/api/session",
          },
          {
            text: "Blaze",
            link: "/api/blaze",
          },
          {
            text: "Templates",
            link: "/api/templates",
          },
          {
            text: "Email",
            link: "/api/email",
          },
          {
            text: "Tracker",
            link: "/api/Tracker",
          },
          {
            text: "Reactive Var",
            link: "/api/ReactiveVar",
          },
          {
            text: "Reactive Dict",
            link: "/api/ReactiveDict",
          },
          {
            text: "EJSON",
            link: "/api/EJSON",
          },
          {
            text: "Assets",
            link: "/api/assets",
          },
          {
            text: "Mobile Configuration",
            link: "/api/app",
          },
          {
            text: "Package.js",
            link: "/api/package",
          },
        ],
        collapsed: false,
      },
      {
        text: "Packages",
        items: [
          {
            text: "accounts-ui",
            link: "/packages/accounts-ui",
          },
          {
            text: "accounts-passwordless",
            link: "/packages/accounts-passwordless",
          },
          {
            text: "accounts-2fa",
            link: "/packages/accounts-2fa",
          },
          {
            text: "appcache",
            link: "/packages/appcache",
          },
          {
            text: "audit-arguments-checks",
            link: "/packages/audit-argument-checks",
          },
          {
            text: "autoupdate",
            link: "/packages/autoupdate",
          },
          {
            text: "browser-policy",
            link: "/packages/browser-policy",
          },
          {
            text: "bundler-visualizer",
            link: "/packages/bundle-visualizer",
          },
          {
            text: "coffeescript",
            link: "/packages/coffeescript",
          },
          {
            text: "ecmascript",
            link: "/packages/ecmascript",
          },
          {
            text: "fetch",
            link: "/packages/fetch",
          },
          {
            text: "hot-module-replacement",
            link: "/packages/hot-module-replacement",
          },
          {
            text: "less",
            link: "/packages/less",
          },
          {
            text: "logging",
            link: "/packages/logging",
          },
          {
            text: "markdown",
            link: "/packages/markdown",
          },
          {
            text: "modules",
            link: "/packages/modules",
          },
          {
            text: "oauth-encryption",
            link: "/packages/oauth-encryption",
          },
          {
            text: "random",
            link: "/packages/random",
          },
          {
            text: "server-render",
            link: "/packages/server-render",
          },
          {
            text: "standard-minifier-css",
            link: "/packages/standard-minifier-css",
          },
          {
            text: "underscore",
            link: "/packages/underscore",
          },
          {
            text: "url",
            link: "/packages/url",
          },
          {
            text: "webapp",
            link: "/packages/webapp",
          },
          {
            link: "packages/packages-listing",
            text: "Maintained Packages",
          },
        ],
        collapsed: true,
      },
      {
        text: "Troubleshooting",
        items: [
          {
            text: "Expired Certificates",
            link: "/troubleshooting/expired-certificate",
          },
          { text: "Windows", link: "/troubleshooting/windows" },
          {
            text: "Known issues in 2.13",
            link: "/troubleshooting/known-issues",
          },
        ],
        collapsed: true,
      },
      {
        text: "Command Line",
        items: [
          { link: "cli/index", text: "CLI" },
          { link: "cli/using-core-types", text: "Using Core Types" },
          { link: "cli/environment-variables", text: "Environment Variables" },
        ],
        collapsed: true,
      },
      {
        text: "Changelog",
        items: [
          // TODO: Open issue in Vitepress about this
          { link: "/history", text: "Current" },
          {
            link: "https://docs.meteor.com/changelog#v2020210120",
            text: "Pre-2.0",
          },
        ],
        collapsed: true,
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/meteor/meteor" }],
    logo: { dark: "/meteor-logo.png", light: "/meteor-blue.png" },

    search: {
      provider: 'algolia',
      options: {
        appId: '2RBX3PR26I',
        apiKey: '7fcba92008b84946f04369df2afa1744',
        indexName: 'meteor_docs_v3'
      }
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
