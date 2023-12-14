import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Meteor API Doc",
  description: "API doc for Meteor 3.0",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'API Doc', link: '/api-sitemap' }
    ],

    sidebar: [
      {
        text: 'Examples',
        items: [
          { text: 'API Doc', link: '/api-sitemap' },
          { text: 'Runtime API Examples', link: '/api-examples' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})
