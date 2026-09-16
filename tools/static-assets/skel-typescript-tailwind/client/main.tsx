import { Meteor } from 'meteor/meteor';
import { createRoot } from 'react-dom/client';
import { App } from '/imports/ui/App';
import './main.css';

Meteor.startup(() => {
  const target = document.getElementById('react-target');
  if (target) {
    createRoot(target).render(<App/>);
  }
});
