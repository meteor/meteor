if (typeof process !== "object") {
  process = {};
}

if (typeof process.env !== "object") {
  process.env = {};
}

if (typeof process.env.NODE_ENV !== "string") {
  process.env.NODE_ENV = "development";
}
