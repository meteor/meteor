import {
  checkPackageVars,
  checkWhere,
} from "./common";

export const where = "client";
export * from "./common";

checkWhere(where);

var style = require("./css/imported.css");
if (! style) {
  require("./css/not-imported.css");
}

ClientPackageVar = "client";
checkPackageVars();
