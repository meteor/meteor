# RPC

## What is this package?

This package provides functions for building E2E type-safe RPCs.
they are:

- crateMethod
- createPublication
- createRouter

## How to use it?

### crateMethod

```typescript
  const test1 = createMethod('name', z.any(), () => 'str');
  const result = await test1();
//    ˆ? is string and their value is 'str'
```

_example of use_

createMethod accepts 4 arguments:

- name: string
- schema: ZodSchema (validator)
- handler: function that receives the arguments of the method and returns the result
- config (optional): object with the following properties:

```typescript
type Config = {
  rateLimit: { limit: number, interval: number },
  methodHooks: {
    beforeResolve: (args, err: null | Meteor.Error, result: T) => void,
    afterResolve: (args, result: T) => void,
    onErrorResolve: (err: Meteor.Error, result: T) => void,
  }
}
```

### createPublication

```typescript
  const publication = createPublication('findRooms', z.object({level: z.number()}), ({level}) => Rooms.find({level: level}));
  const result = publication({level: 1}, (rooms) => console.log(rooms));
//                                            ˆ? subscription 

```
_example of use_

createPublication accepts 4 arguments:

- name: string
- schema: ZodSchema (validator)
- handler: function that is being published
- config (optional): object with the following properties:

_note that subscription returns the subscription handler the same way as Meteor.publish_

```typescript
type Config = {
  rateLimit: { limit: number, interval: number },
  methodHooks: {
    beforeResolve: (args, err: null | Meteor.Error, result: T) => void,
    afterResolve: (args, result: T) => void,
    onErrorResolve: (err: Meteor.Error, result: T) => void,
  }
}
```

### createRouter

```typescript

  const TestRouter = createRouter('name')
    .addMethod('sum', z.object({a: z.number(), b: z.number()}), ({a, b}) => a + b)
    .addMethod('str', z.any(), () => 'str')
    .addPublication('findRooms', z.object({level: z.number()}), ({level}) => Rooms.find({level: level}))
    .build();

TestRouter // {sum: function, str: function}
const sumResult = await TestRouter.sum({a: 1, b: 2});
//    ˆ? is number and their value is 3
const strResult = await TestRouter.str();
//    ˆ? is string and their value is 'str'
const publication = TestRouter.findRooms({level: 1}, (rooms) => console.log(rooms));
//                                  ˆ? subscription 

```

_example of use_

createRouter uses createMethod and createPublication under the hood, so it accepts the same arguments.
It creates an object with the methods and publications defined in the router. 
createRouter have one argument:
- name: string (optional)

_why this param?_
createRouter concats on every method / publication name the router name with a dot. For example these examples are the same:

```typescript
  const TestRouter = createRouter('math')
    .addMethod('sum', z.object({a: z.number(), b: z.number()}), ({a, b}) => a + b)
    .build();

  const TestRouter2 = createRouter()
    .addMethod('math.sum', z.object({a: z.number(), b: z.number()}), ({a, b}) => a + b)
    .build();

  Meteor.methods({
    'math.sum': ({a, b}) => a + b
  });
  Meteor.call('math.sum', {a: 1, b: 2}, (err, result) => console.log(result));
```
