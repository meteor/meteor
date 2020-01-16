import lodash from "lodash";
import cheerio from "cheerio";
import lodashUser from "@sebak/lodashuser";

export { lodash, lodashUser, cheerio };

export const lodashPath = require.resolve("lodash");
export const cheerioPath = require.resolve("cheerio");
export const hasFlagPath = require.resolve("has-flag");