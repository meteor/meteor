import assert from "assert";
import {checkPackageVars} from "./common";

export const where = "client";
export * from "./common";

var style = require("./css/imported.css");
if (! style) {
  require("./css/not-imported.css");
}

ClientPackageVar = "client";
checkPackageVars();
