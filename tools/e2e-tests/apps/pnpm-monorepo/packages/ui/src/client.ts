import { Meteor } from 'meteor/meteor';
import { createClientMessage } from '@e2e/domain';

export const packageTitle = 'Workspace Packages Loaded';

export const renderWorkspaceStatus = () => {
  return [
    '<h1>Welcome to Meteor!</h1>',
    `<p>${packageTitle}</p>`,
    `<p id="workspace-status">${createClientMessage('ui')}:client-tools:compiled</p>`,
  ].join('');
};
