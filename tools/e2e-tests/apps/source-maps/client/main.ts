import * as eager from '../imports/probe';

globalThis.sourceMapProbe = {
  ...eager,
  async loadLazy() {
    globalThis.sourceMapLazy = await import('../imports/lazy');
  },
};
