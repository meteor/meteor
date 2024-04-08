# Meteor.call x Meteor.callAsync



::: tip

It is recommened to use `Meteor.callAsync` instead of `Meteor.call` because of how our
async API works. `Meteor.call` is still available but it is not recommended to use it, it
can lead to unexpected behavior.

Using `Meteor.callAsync` will make your code more predictable and easier to maintain.

:::

Example of how to migrate from `Meteor.call` to `Meteor.callAsync`:


::: code-group


```js [v2-client.jsx]
import { Meteor } from 'meteor/meteor'

let data, error;

Meteor.call('getAllData', (err, res) => { // [!code highlight]
  if (err) {
    error = err;
  } else {
    data = res;
  }
});

// render data or error


```


```js [v2-server.js]
import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'

const MyCollection = new Mongo.Collection('myCollection');

Meteor.methods({
  getAllData() {
    return MyCollection.find().fetch(); // [!code highlight]
  }
});
```

```js [v3-client.jsx]
import { Meteor } from 'meteor/meteor'

try {
  const data = await Meteor.callAsync('getAllData'); // [!code highlight]
  // render data
} catch (error) {
  // render error
}

```

```js [v3-server.js]
import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'

const MyCollection = new Mongo.Collection('myCollection');

Meteor.methods({
  async getAllData() {
    return await MyCollection.find().fetchAsync(); // [!code highlight]
  }
});

```

:::

## Rules of using `Meteor.callAsync` & `Meteor.call`

::: tip 
It is not recommended to use concurrent calls.
Use `await` for your `Meteor.callAsync`.
:::

here are a few examples of cases where you should use `Meteor.callAsync` instead of `Meteor.call`:

```js
import { Meteor } from 'meteor/meteor'

Meteor.call("someMethod", (err, res) => { // [!code error] This is not ok
  if (err) {
    console.log(err);
  } else {
    console.log(res);
  }
});


Meteor.callAsync('someMethod') // [!code error] This is not ok
  .then(data => console.log(data))
  .catch(err => console.log(err));

// it is not recommended to use concurrent calls

Promise.all([  // [!code error] This is not ok
  Meteor.callAsync('someMethod'),
  Meteor.callAsync('someMethod')
]).then(([data1, data2]) => {
  console.log(data1, data2);
});

// Ok section

Meteor.call("someMethod", (err, res) => { // [!code ++]
  if (err) {
    console.log(err);
  } else {
    console.log(res);
  }
});

await Meteor.callAsync('someMethod') // this is ok // [!code ++]

// this is also ok
Meteor.callAsync('someMethod').then(data => { // [!code ++]
  console.log(data);
  Meteor.callAsync('someMethod').then(data2 => {
    console.log(data2);
  });
});


```
