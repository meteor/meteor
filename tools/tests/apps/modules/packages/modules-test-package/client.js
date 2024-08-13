import assert from "assert";
import {
  checkWhere,
  checkPackageVars,
} from "./common";

export const where = "client";
export * from "./common";

await checkWhere(where);

var style = require("./css/imported.css");
if (! style) {
  require("./css/not-imported.css");
}

ClientPackageVar = "client";
checkPackageVars();
