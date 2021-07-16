import MethodCommon, { methodOptions } from './method_common';

class ServerMethod extends MethodCommon {
  constructor(config) {
    super(config);
  }

  call({ args, options, callback } = {}) {
    const { name } = this.config;
    let beforeData = {
      config: this.config,
      args,
      callback,
      options,
    }

    if (!this.handlerIsSet) {
      beforeData = methodOptions.runBeforeHooks(undefined, beforeData);
      beforeData = this.runBeforeHooks(undefined, beforeData);
    }
    
    return new Promise((resolve, reject) => {
      Meteor.apply(name, beforeData.args, beforeData.options, (error, result) => {
        let afterData = {
          ...beforeData,
          result,
          error,
        }

        if (!this.handlerIsSet) {
          afterData = methodOptions.runAfterHooks(undefined, afterData);
          afterData = this.runAfterHooks(undefined, afterData);
        }
        
        if (afterData.error) {
          reject(afterData.error)
        }

        resolve(afterData.result);
      })
    });
  }
}

export { methodOptions };
export default ServerMethod;