import MethodCommon, { methodOptions } from './method_common';

class ClientMethod extends MethodCommon {
  constructor(config) {
    super(config);
  }

  call({ args } = {}) {
    const { name } = this.config;
    return Meteor.apply(name, args);
  }
}

export { methodOptions };
export default ClientMethod;
