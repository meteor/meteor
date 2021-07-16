import HookManager from './hook_manager';
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';

// Global configuration manager that applies to all methods
class MethodOptions extends HookManager {
  constructor() {
    super();
  }
}

export const methodOptions = new MethodOptions();

class MethodCommon extends HookManager {
  constructor(config) {
    super();
    if (!config.name) {
      throw new Error('"name" is required when creating a method');
    }
    this.config = config;
  }

  updateConfig(config) {
    if (config.name) {
      throw new Error(`You can't update a method's name (in "${this.config.name}")`);
    }
    this.config = { ...this.config, ...config };
  }

  getContext(methodContext) {
    return { ...this, config: this.config }
  }

  getConfig() {
    return this.config;
  }

  setHandler(fn) {
    const self = this;
    const { name } = this.config;
    this.handlerIsSet = true;

    Meteor.methods({
      [name](...args) {
        let result;
        let error;
        const context = self.getContext(this);
        const config = self.getConfig();
        let beforeData = {
          config,
          args,
          context,
        };

        beforeData = methodOptions.runBeforeHooks(context, beforeData);
        beforeData = self.runBeforeHooks(beforeData.context, beforeData);

        try {
          result = fn.apply(beforeData.context, beforeData.args)
        } catch (e) {
          error = e;
        }

        let afterData = {
          ...beforeData,
          result,
          error,
        };

        afterData = methodOptions.runAfterHooks(afterData.context, afterData);
        afterData = self.runAfterHooks(afterData.context, afterData);

        if (error) {
          throw afterData.error;
        }

        return afterData.result;
      }
    });
  }
}

export default MethodCommon;