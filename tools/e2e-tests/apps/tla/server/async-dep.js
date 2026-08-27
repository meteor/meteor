console.log('[tla] async-dep top-level');
await new Promise((resolve) => setTimeout(resolve, 500));
console.log('[tla] async-dep settled');

export const asyncValue = 'ready';
