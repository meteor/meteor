import shared from "./shared";
import "./lazy2";

shared[module.id] = 1;

export function reset() {
  delete shared[module.id];
  delete module.exports;
}
