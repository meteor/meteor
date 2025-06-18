import shared from "../imports/shared";
import "./lazy1";

shared[module.id] = 2;

export function reset() {
  delete shared[module.id];
  delete module.exports;
}
