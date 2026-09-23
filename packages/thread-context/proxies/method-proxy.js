/**
 * @module thread-context/proxies/method-proxy
 * @summary Worker-side proxy for calling Meteor methods on the host thread.
 */

import { MSG_TYPE } from '../protocol.js';

/**
 * Creates a method proxy with a `callAsync` function that bridges
 * Meteor method invocations to the host thread.
 *
 * @param {import('../bridge-client.js').BridgeClient} client
 * @returns {{ callAsync: (methodName: string, ...args: any[]) => Promise<any> }}
 */
export function createMethodProxy(client) {
  return {
    /**
     * Calls a Meteor method on the host thread.
     * @param {string} methodName - The method to call.
     * @param {...any} args - Arguments passed to the method handler.
     * @returns {Promise<any>} The method's return value.
     */
    async callAsync(methodName, ...args) {
      return await client.call({
        type: MSG_TYPE.METHOD, methodName, methodArgs: args
      });
    }
  };
}
