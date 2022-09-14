import {Tinytest} from "meteor/tinytest";
import {Meteor} from "meteor/meteor";
import {createMethod, createRouter} from "../server-main";
import {z} from "zod";

Meteor.isServer && Tinytest.addAsync('rpc - example', async function (test) {
  const id = new Date().toISOString()
  const test1 = createMethod(`${id}.num`, z.any(), () => 4);
  const result = await test1();
  test.equal(result, 4);
})

Meteor.isServer && Tinytest.addAsync('rpc - text', async function (test) {
  const id = new Date().toISOString()
  const test1 = createMethod(`${id}.str`, z.any(), () => 'str');
  const result = await test1();
  test.equal(result, 'str');
})


Meteor.isServer && Tinytest.addAsync('rpc - router', async function (test) {
  const id = new Date().toISOString()
  const TestRouter = createRouter(`${id}.test`)
    .addMethod('num', z.any(), () => 4)
    .addMethod('str', z.any(), () => 'str')
    .build();

  const name = TestRouter.str.config.name;
  const strResult = await TestRouter.str();
  const num = await TestRouter.num();
  test.equal(name, `${id}.test.str`);
  test.equal(strResult, 'str');
  test.equal(num, 4);
})
