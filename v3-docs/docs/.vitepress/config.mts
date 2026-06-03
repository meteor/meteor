import { defineConfig } from "vitepress";
import metadata from "../generators/meteor-versions/metadata.generated";
import llmstxt from "vitepress-plugin-llms";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Docs",
  description: "Meteor.js Docs",
  head: [
    ["link", { rel: "icon", href: "/logo.png" }],
    ["script", {
      defer: "",
      "data-domain": "meteor.com",
      src: "https://plausible.io/js/script.js"
    }]
  ],
  lastUpdated: true,
  sitemap: {
    hostname: "https://v3-docs.meteor.com",
  },
  ignoreDeadLinks: [/^http:\/\/localhost/],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      {
        text: "Docs",
        activeMatch: `^/(guide|docs|examples)/`,
        items: [
          { text: "Quick Start", link: "/about/install" },
          { text: "Examples", link: "https://github.com/meteor/examples" },
          {
            text: "Meteor.js 2 Docs",
            link: "https://v2-docs.meteor.com",
          },
          {
            text: "Migration from Meteor.js 2",
            link: "https://v3-migration-docs.meteor.com",
          },
          {
            text: "Tutorials",
            items: [
              {
                text: "Meteor.js 3 + React",
                link: "/tutorials/react/index",
              },
              {
                text: "Meteor.js 3 + Vue",
                link: "/tutorials/vue/meteorjs3-vue3",
              },
              {
                text: "Meteor.js 3 + Solid",
                link: "/tutorials/solid/index",
              },
              {
                text: "Meteor.js 3 + Blaze",
                link: "/tutorials/blaze/index",
              },
              {
                text: "Meteor.js 3 + Svelte",
                link: "/tutorials/svelte/index",
              },
              {
                link: "/tutorials/application-structure/index",
                text: "Application structure",
              },
            ],
          },
        ],
      },
      {
        text: "Ecosystem",
        activeMatch: `^/ecosystem/`,
        items: [
          {
            text: "Community & Help",
            items: [
              {
                text: "Meteor Forums",
                link: "https://forums.meteor.com",
              },
              {
                text: "Meteor Lounge Discord",
                link: "https://discord.gg/hZkTCaVjmT",
              },
              {
                text: "GitHub Discussions",
                link: "https://github.com/meteor/meteor/discussions",
              },
            ],
          },
          {
            text: "Resources",
            items: [
              {
                text: "Packages on Atmosphere",
                link: "https://atmospherejs.com/",
              },
              {
                text: "DevTools - Chrome Extension",
                link: "https://chromewebstore.google.com/detail/ibniinmoafhgbifjojidlagmggecmpgf",
              },
              {
                text: "DevTools - Firefox Extension",
                link: "https://addons.mozilla.org/en-US/firefox/addon/meteor-devtools-evolved/",
              },
            ],
          },
          {
            text: "Learning",
            items: [
              {
                text: "Meteor University",
                link: "https://university.meteor.com",
              },
              {
                text: "Youtube Channel",
                link: "https://www.youtube.com/@meteorsoftware",
              },
            ],
          },
          {
            text: "News",
            items: [
              { text: "Blog on Dev.to", link: "https://dev.to/meteor" },
              { text: "Blog on Medium", link: "https://blog.meteor.com" },
              { text: "Twitter", link: "https://x.com/meteorjs" },
              {
                text: "LinkedIn",
                link: "https://www.linkedin.com/company/meteor-software/",
              },
            ],
          },
        ],
      },
      { text: "API", link: "/api/" },
      { text: "Galaxy Cloud", link: "https://galaxycloud.app" },
      {
        text: metadata.currentVersion,
        items: metadata.versions.reverse().map((v) => {
          if (v.isCurrent) {
            return {
              text: `${v.version} (Current)`,
              link: "/",
              activeMatch: "/",
            };
          }
          return {
            text: v.version,
            link: v.url,
          };
        }),
      },
    ],
    sidebar: [
      {
        text: "About",
        link: "/about/what-is",
        items: [
          {
            text: "What is Meteor?",
            link: "/about/what-is#introduction",
            items:[
              {
                text: "Meteor resources",
                link: "/about/what-is#learning-more",
              },
            ],
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
          {
            text: "Web Apps",
            link: "/about/web-apps",
          },
          {
            text: "Modern Build Stack",
            link: "/about/modern-build-stack.md",
            items: [
              {
                text: "Meteor Bundler",
                link: "/about/modern-build-stack/meteor-bundler-optimizations.md",
              },
              {
                text: "Rspack Bundler",
                link: "/about/modern-build-stack/rspack-bundler-integration.md",
              },
            ]
          },
          {
            text: "Cordova",
            link: "/about/cordova",
          },
        ],
        collapsed: true,
      },
      {
        text: "API",
        link: "/api/",
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
          {
            text: "Top Level Await",
            link: "/api/top-level-await",
          },
        ],
        collapsed: true,
      },
      {
        text: "Packages",
        items: [
          {
            text: "Overview",
            link: "/packages/index",
          },
          {
            text: "Accounts and security",
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
                text: "roles",
                link: "/packages/roles",
              },
              {
                text: "service-configuration",
                link: "/packages/service-configuration",
              },
              {
                text: "oauth-encryption",
                link: "/packages/oauth-encryption",
              },
              {
                text: "browser-policy",
                link: "/packages/browser-policy",
              },
            ]
          },
          {
            text: "Developer tools",
            items: [
              {
                text: "audit-arguments-checks",
                link: "/packages/audit-argument-checks",
              },
              {
                text: "bundler-visualizer",
                link: "/packages/bundle-visualizer",
              },
              {
                text: "hot-module-replacement",
                link: "/packages/hot-module-replacement",
              },
              {
                text: "fetch",
                link: "/packages/fetch",
              },
              {
                text: "logging",
                link: "/packages/logging",
              },
              {
                text: "underscore",
                link: "/packages/underscore",
              },
              {
                text: "autoupdate",
                link: "/packages/autoupdate",
              },
              {
                text: "modern-browsers",
                link: "/packages/modern-browsers",
              },
              {
                text: "modules",
                link: "/packages/modules",
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
                text: "url",
                link: "/packages/url",
              },
              {
                text: "webapp",
                link: "/packages/webapp",
              },
            ]
          },
          {
            text: "Framework compatibility",
            items: [
              {
                text: "coffeescript",
                link: "/packages/coffeescript",
              },
              {
                text: "ecmascript",
                link: "/packages/ecmascript",
              },
              {
                text: "less",
                link: "/packages/less",
              },
              {
                text: "react-meteor-data",
                link: "/packages/react-meteor-data",
              },
            ]
          },
          {
            text: "Using Atmosphere packages",
            link: "/packages/6.using-atmosphere-packages",
          },
          {
            text: "Writing Atmosphere packages",
            link: "/packages/7.writing-atmosphere-packages",
          },
          {
            link: "/packages/packages-listing",
            text: "Maintained Packages",
          },
          {
            text: "Using npm packages",
            link: "/packages/4.using-npm-packages",
          },
          {
            text: "Writing npm packages",
            link: "/packages/5.writing-npm-packages",
          },
          {
            link: "/community-packages/index",
            text: "Community Packages",
            items: [
              {
                text: "Meteor RPC",
                link: "/community-packages/meteor-rpc",
              },
              {
                text: "jam:method",
                link: "/community-packages/jam-method",
              },
              {
                text: "jam:pub-sub",
                link: "/community-packages/pub-sub",
              },
              {
                text: "jam:mongo-transactions",
                link: "/community-packages/mongo-transactions",
              },
              {
                text: "jam:soft-delete",
                link: "/community-packages/soft-delete",
              },
              {
                text: "jam:archive",
                link: "/community-packages/archive",
              },
              {
                text: "jam:offline",
                link: "/community-packages/offline",
              },
              {
                text: "dupontbertrand:cluster",
                link: "/community-packages/cluster",
              },
              {
                text: "dupontbertrand:mail-preview",
                link: "/community-packages/mail-preview",
              },
            ],
            collapsed: true,
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
            text: "MongoDB Connection",
            link: "/troubleshooting/mongodb-connection",
          },
          {
            text: "Hot Code Push",
            link: "/troubleshooting/hot-code-push",
          },
        ],
        collapsed: true,
      },
      {
        text: "Command Line",
        items: [
          { link: "/cli/", text: "CLI" },
          { link: "/cli/using-core-types", text: "Using Core Types" },
          { link: "/cli/environment-variables", text: "Environment Variables" },
        ],
        collapsed: true,
      },
      {
        text: "Tutorials",
        items: [
          {
            text: "Meteor.js 3 + React",
            link: "/tutorials/react/index",
          },
          {
            text: "Meteor.js 3 + Vue",
            link: "/tutorials/vue/meteorjs3-vue3",
          },
          {
            text: "Meteor.js 3 + Solid",
            link: "/tutorials/solid/index",
          },
          {
            text: "Meteor.js 3 + Blaze",
            link: "/tutorials/blaze/index",
          },
          {
            text: "Meteor.js 3 + Svelte",
            link: "/tutorials/svelte/index",
          },
          {
            link: "/tutorials/application-structure/index",
            text: "Application structure",
          },
          {
            text: "Build System",
            link: "/about/build-tool",
          },
          {
            text: "Core Concepts",
            items: [
              {
                text: "Methods",
                link: "/tutorials/methods/methods",
              },
              {
                text: "Data Loading",
                link: "/tutorials/data-loading/data-loading",
              },
              {
                text: "Collections & Schemas",
                link: "/tutorials/collections/collections",
              },
              {
                text: "Accounts",
                link: "/tutorials/accounts/accounts",
              },
            ]
          },
          {
            text: "Production",
            items:[
              {
                text: "Security",
                link: "/tutorials/security/security",
              },
              {
                text: "Testing",
                link: "/tutorials/testing/testing",
              },
              {
                text: "Deployment",
                link: "/tutorials/deployment/deployment",
              },
            ]
          },
          {
            text: "Advanced Topics",
            items: [
              {
                text: "Apollo & GraphQL",
                link: "/tutorials/apollo/apollo",
              },
              {
                text: "Code Style",
                link: "/tutorials/code-style/code-style",
              },
            ]
          },
          {
            text: "Integrations",
            items: [
              {
                text: "React Native",
                link: "/tutorials/integrations/react-native",
              },
              {
                text: "Flowbite UI",
                link: "/tutorials/integrations/flowbite",
              },
            ]
          },
        ],
        collapsed: true,
      },
      {
        text: "Changelog",
        items: [
          // TODO: Open issue in Vitepress about this
          { link: "/history", text: "Meteor.js v3 (Current)" },
          {
            link: "https://v2-docs.meteor.com/changelog",
            text: "Meteor.js v2",
          },
          {
            link: "https://v2-docs.meteor.com/changelog#v112220211012",
            text: "Meteor.js v1",
          },
        ],
        collapsed: true,
      },
      {
        text: "Performance",
        items: [
          {
            text: "Performance Improvements",
            link: "/performance/performance-improvement",
          },
          {
            text: "WebSocket Compression",
            link: "/performance/websocket-compression",
          },
        ],
        collapsed: true,
      },
      {
        text: "Community",
        items: [
          {
            text: "Contributing",
            link: "/community/contributing",
          },
          {
            text: "Contributors",
            link: "/community/contributors",
          },
        ],
        collapsed: true,
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/meteor/meteor" },
      { icon: "twitter", link: "https://x.com/meteorjs" },
      { icon: "discord", link: "https://discord.gg/hZkTCaVjmT" },
    ],

    logo: { dark: "/meteor-logo.png", light: "/meteor-blue.png" },

    search: {
      provider: "algolia",
      options: {
        appId: "2RBX3PR26I",
        apiKey: "7fcba92008b84946f04369df2afa1744",
        indexName: "meteor_docs_v3",
        searchParameters: {
          facetFilters: ["lang:en"],
        },
      },
    },

    footer: {
      message:
        'Released under the <a href="https://github.com/meteor/meteor?tab=License-1-ov-file#readme">MIT License</a>.',
      copyright:
        'Copyright (c) 2011 - present <a href="https://www.meteor.com/">Meteor Software</a>.',
    },
    editLink: {
      pattern: "https://github.com/meteor/meteor/edit/devel/v3-docs/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
  vite: {
    plugins: [
      llmstxt({
        title: "Meteor.js 3 Documentation",
        domain: "https://docs.meteor.com",
        description: "Full-stack JavaScript platform for modern web and mobile applications.",
        details: `
Meteor is a full-stack JavaScript platform for developing web and mobile applications.

Key capabilities:
- Real-time data synchronization with publications and subscriptions
- Built-in accounts and authentication system
- Frontend agnostic (React, Vue, Solid, Blaze, Svelte)
- Zero-config build system with modern tooling (SWC, Rspack)
- One-command deployment to Galaxy Cloud
- TypeScript support with full type inference

Current version: Meteor ${metadata.currentVersion}.

## Structured API Data

For complete API documentation in machine-readable format, see:
- [api-reference.json](/api-reference.json) - Full API reference with all functions, parameters, and types
        `.trim(),
      }),
    ],
  },
});
