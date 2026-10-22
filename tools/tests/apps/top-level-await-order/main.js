import './a.js';
import './b.js';

Meteor.startup(() => {
  console.log('entry - startup');
});

console.log('entry - before');
await 0
console.log('entry - after');

Promise.resolve().then(() => console.log('entry - later'));

require('meteor/lazy-package').then(({ value }) => {
  console.log(`lazy package value ${value}`);
});

console.log(`package 2 value ${require('meteor/package-2').value}`);
