import { Meteor } from 'meteor/meteor';
import { createClientMessage } from '@example/shared';
import { renderWorkspaceStatus } from '@example/ui/client';
import './main.css';

console.log(createClientMessage('workspace package loaded on the client'));

const render = () => {
  const container = document.getElementById('app-target');
  container.innerHTML = renderWorkspaceStatus();
};

Meteor.startup(() => {
  render();
});
