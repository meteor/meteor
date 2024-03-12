import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  description: "Guide for Meteor 3.0",
  head: [
    ['link', { rel: 'icon', href: '../images/meteor-logo.webp' }],
  ],
  themeConfig: {
    siteTitle: 'Meteor 3.0',
    logo: {
      dark: 'meteor-logo.webp',
      light: 'meteor-logo.webp',
      alt: 'Meteor 3.0 Logo',
    },
    search: {
      provider: 'local'
    },

    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/',  },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Meteor 3.0', link: '/index' },
          { text: 'How to install', link: '/docs/introduction/how-to-install' },
        ]
      },
      {
        text: 'Collection and Schemas',
        items: [
          { text: 'MongoDB collections in Meteor', link: '/docs/collections-schemas/mongo-db-collection-meteor' },
        ]
      },
      {
        text: 'Publications and Data Loading',
        items: [
          { text: 'Publications and subscriptions', link: '/docs/collections-schemas/undefined' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/meteor/meteor' },
      { icon: 'twitter', link: 'https://twitter.com/meteorjs' }
    ]
  }
})
