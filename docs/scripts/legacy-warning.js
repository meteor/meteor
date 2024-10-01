/* global hexo */

hexo.extend.filter.register('after_render:html', function (str) {
  const warningMessage = `
    <div class="warning-banner">
      <p>
        ⚠️ You're browsing the documentation for an old version of Meteor.js.
        Check out the <a href="https://docs.meteor.com" target="_blank">v3 docs</a> and <a href="https://v3-migration-docs.meteor.com/" target="_blank">migration guide</a>.
      </p>
    </div>
  `;

  const css = `
    <style>
      .warning-banner {
        text-align: center;
        background-color: #fff3cd;
        border: 1px solid #ffeeba;
        color: #856404;
        margin-bottom: 20px;
      }
      .warning-banner a {
        color: #0056b3;
        text-decoration: underline;
      }
      .warning-banner a:hover {
        color: #003d82;
      }
    </style>
  `;

  const injectedContent = css + warningMessage;

  return str.replace(/<div class="content">/, `<div class="content" data-injected>${injectedContent}`);
});