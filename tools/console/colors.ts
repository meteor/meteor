type Color = (text: string) => string;
const yellow: Color = (text) => `\x1b[33m${ text }\x1b[0m`;
const red: Color = (text) => `\x1b[31m${ text }\x1b[0m`;
const purple: Color = (text) => `\x1b[35m${ text }\x1b[0m`;
const green: Color = (text) => `\x1b[32m${ text }\x1b[0m`;
const blue: Color = (text) => `\x1b[34m${ text }\x1b[0m`;

exports.colors = {
  yellow,
  red,
  purple,
  green,
  blue,
};
