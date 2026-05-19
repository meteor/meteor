import { Meteor } from 'meteor/meteor';
import { createClientMessage } from '@e2e/domain';
import { renderWorkspaceStatus } from '@e2e/ui/client';
import './main.css';

console.log(createClientMessage('client package loaded'));

const render = () => {
  const container = document.getElementById('app-target');
  container.innerHTML = renderWorkspaceStatus();
};

Meteor.startup(() => {
  render();
});
