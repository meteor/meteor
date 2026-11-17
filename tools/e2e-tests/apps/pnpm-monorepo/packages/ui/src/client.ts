import { accentColor, createClientMessage } from '@example/shared';

export const packageTitle = 'Meteor + pnpm workspace';

export const renderWorkspaceStatus = () => {
  return [
    '<h1>Welcome to Meteor!</h1>',
    `<h2>${packageTitle}</h2>`,
    '<p>This Meteor app imports code from local pnpm workspace packages.</p>',
    '<ul>',
    `<li><code>@example/ui</code> rendered this content.</li>`,
    `<li><code>@example/shared</code> says: ${createClientMessage('browser')}</li>`,
    '<li id="workspace-status"><code>@example/ui</code>: client package compiled by Rspack</li>',
    `<li id="accent-color" style="color: ${accentColor}">accent color resolved through the npm transitive dependency tree: ${accentColor}</li>`,
    '</ul>',
  ].join('');
};
