console.log('app a.js - before');
await 0
console.log('app a.js - after');

Promise.resolve().then(() => {
  console.log('app a.js - later');
});
