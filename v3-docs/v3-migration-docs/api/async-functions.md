
# Using Async Functions

Meteor now uses the `Promise` [API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) for all asynchronous operations.

This means that for many functions,
for example the `Meteor.call` function,
you have the `Meteor.callAsync` counterpart,
that returns a promise of the result.

You can promisify any function that takes a callback as its last argument, with the [`Meteor.promisify`](https://v3-docs.meteor.com/api/meteor.html#Meteor-promisify) function.


for example, you can make [`Meteor.loginWithPassword`](https://v3-docs.meteor.com/api/accounts.html#Meteor-loginWithPassword) return a promise like this:

```javascript
import { Meteor } from 'meteor/meteor';

loginWithPasswordAsync = Meteor.promisify(Meteor.loginWithPassword);

const login = async () => {
  try {
    await loginWithPasswordAsync('username', 'password');
    console.log('Logged in');
  } catch (error) {
    console.error('Login failed', error);
  }
};
```

For promises in general, you can use the `await` keyword to wait for the promise to resolve.

```javascript
const delay = async () => {
  console.log('Waiting...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Done waiting');
};

await delay(); // it will wait for 1 second before logging 'Done waiting'
```

Normally you should `await` the promise inside an `async` function, but you can also use the `then` method to handle the promise resolution.

```javascript
const delay = () => {
  console.log('Waiting...');
  return new Promise(resolve => setTimeout(resolve, 1000));
};

delay().then(() => console.log('Done waiting'));
console.log('End of the function'); // this will be logged before 'Done waiting'
```

With the `await` keyword, the code will wait for the promise to resolve before continuing.

This is essential for Meteor methods, as they are asynchronous by nature.

```javascript
const callMethod = async () => {
  try {
    const result = await Meteor.callAsync('myMethod', 'arg1', 'arg2');
    console.log('Method result:', result);
  } catch (error) {
    console.error('Method error:', error);
  }
};

await callMethod();
```
As mentioned in the [call x callAsync](../breaking-changes/call-x-callAsync.md) you _should_
await for the `Meteor.callAsync` function to resolve.


## Handling errors

When using `await`, you can use a `try`/`catch` block to handle errors.

In the past you would have to pass a callback to handle errors, but now you can use the `catch` block to handle errors.

```javascript
import { Meteor } from 'meteor/meteor';

Meteor.call('myMethod', 'arg1', 'arg2', (error, result) => {
  if (error) {
    console.error('Method error:', error);
  } else {
    console.log('Method result:', result);
  }
});

```

Now, with `await` you can use a `try`/`catch` block to handle errors.

```javascript
import { Meteor } from 'meteor/meteor';

try {
  const result = await Meteor.callAsync('myMethod', 'arg1', 'arg2');
  console.log('Method result:', result);
} catch (error) {
  console.error('Method error:', error);
}
```

You also can use the `then` method to handle the promise resolution.

```javascript
import { Meteor } from 'meteor/meteor';

Meteor.callAsync('myMethod', 'arg1', 'arg2')
  .then(result => console.log('Method result:', result))
  .catch(error => console.error('Method error:', error));
```

## Async context

To use await, you need to be inside an `async` function.

```javascript

const myFunction = async () => { // [!code highlight]
  console.log('Waiting...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Done waiting');
};

```

Without the `async` keyword, you will get a syntax error.

```javascript

const myFunction = () => { // [!code error] syntax error!
  console.log('Waiting...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Done waiting');
};

```

You context must be `async` to use the `await` keyword.

for example in meteor 2 this code would work:

```javascript
import { Meteor } from 'meteor/meteor';

const someFunction = () => { // [!code ++]
  Meteor.call('myMethod', 'arg1', 'arg2', (error, result) => { // [!code ++]
    if (error) {
      console.error('Method error:', error);
    } else {
      console.log('Method result:', result);
      // do something with the result
    }
  });
};

```

Now you need to make it `async` to use the `await` keyword.

```javascript
import { Meteor } from 'meteor/meteor';

const someFunction = async () => { // [!code ++]
  try {
    const result = await Meteor.callAsync('myMethod', 'arg1', 'arg2'); // [!code ++]
    console.log('Method result:', result);
    // do something with the result
  } catch (error) {
    console.error('Method error:', error);
  }
};

```

