export { name as imported } from "./imported.js";
export const name = 'client-only-ecmascript';
export const ClientTypeof = {
  require: typeof require,
  exports: typeof exports
};
