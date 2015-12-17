if (typeof process !== "object") {
  process = {};
}

if (typeof process.env !== "object") {
  process.env = {};
}

process.env.NODE_ENV = "production";
