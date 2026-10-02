import { Meteor } from 'meteor/meteor';

Meteor.startup(() => console.log('[tla] startup hook ran'));

console.log('[tla] async-dep top-level');
await new Promise((resolve) => setTimeout(resolve, 500));
console.log('[tla] async-dep settled');

export const asyncValue = 'ready';
