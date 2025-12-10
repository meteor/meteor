console.log('app b.js - before');
await 0
console.log('app b.js - after');

Promise.resolve().then(() => {
  console.log('app b.js - later');
});
