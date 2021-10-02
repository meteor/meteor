// This file is excluded from transformation in ./register.js.
const rawCode = String(arguments.callee);
exports.getCodeAsync = async function () {
  return await rawCode.slice(
    rawCode.indexOf("{") + 1,
    rawCode.lastIndexOf("}"),
  ).replace(/^\s+|\s+$/g, "");
};
