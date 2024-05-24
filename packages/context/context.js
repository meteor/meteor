const context = require("@wry/context");

Object.assign(exports, {
  Slot: context.Slot,
  bind: context.bind,
  noContext: context.noContext,
  setTimeout: context.setTimeout,
  asyncFromGen: context.asyncFromGen,
});
