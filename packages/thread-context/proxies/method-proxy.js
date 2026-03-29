import { MSG_TYPE } from '../protocol.js';

export function createMethodProxy(client) {
  return {
    async callAsync(methodName, ...args) {
      return await client.call({
        type: MSG_TYPE.METHOD, methodName, methodArgs: args
      });
    }
  };
}
