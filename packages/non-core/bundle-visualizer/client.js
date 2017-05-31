import { Meteor } from "meteor/meteor";
import {
  classPrefix,
  methodNameStats,
  packageName,
} from "./common.js";
import * as classes from "./classNames.js";

import "./style.css";

Meteor.startup(() => {
  import("./sunburst.js").then(s => main(s.Sunburst));
});

function main(builder) {
  const { container, mask } = frameStage();

  document.body.appendChild(mask);
  document.body.appendChild(container);

  Meteor.call(methodNameStats, (error, result) => {
    if (error) {
      console.error([
        `${packageName}: Couldn't load stats for visualization.`,
        "Are you using standard-minifier-js >= 2.1.0 as the minifier?",
      ].join(" "));
      return;
    }

    // Load the JSON, which is `d3-hierarchy` digestible.
    if (result) {
      new builder({ container }).loadJson(result);
    }
  });
}

function frameStage() {
  // Create the mask which will block out the main application.
  const mask = document.createElement("div");
  mask.setAttribute("class", `${classPrefix} ${classes.mask}`);

  // Create the container which the SVG elements will be drawn into.
  const container = document.createElement("div");
  container.setAttribute("class", `${classPrefix} ${classes.rootContainer}`);
  return { container, mask };
}
