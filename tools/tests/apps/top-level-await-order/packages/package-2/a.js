import './b.js';

console.log('package 2 - a before');
await 0;
console.log('package 2 - a after');
Promise.resolve().then(() => {
  console.log('package 2 - a later');
});

export const value = 6;
