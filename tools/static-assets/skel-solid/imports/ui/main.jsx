/* @refresh reload */
import { render } from 'solid-js/web';
import { App } from './App';
import { Meteor } from "meteor/meteor";

Meteor.startup(() => {
  render(() => <App/>, document.getElementById('root'));
})
