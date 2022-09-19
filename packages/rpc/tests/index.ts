import {Tinytest} from "meteor/tinytest";
import {Meteor} from "meteor/meteor";
import {createMethod} from "../server-main";
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
