import leftPad from "left-pad";

export function padded(s) {
  return leftPad(s, 5, "_");
}
