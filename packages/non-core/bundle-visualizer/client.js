import { Meteor } from "meteor/meteor";
import { HTTP } from "meteor/http";
import {
  classPrefix,
  methodNameStats,
  packageName,
} from "./common.js";
import * as classes from "./classNames.js";

import("./style.css");

Meteor.startup(() => {
  import("./sunburst.js").then(s => main(s.Sunburst));
});

function main(builder) {
  const { container, mask } = frameStage();

  document.body.appendChild(mask);
  document.body.appendChild(container);

  // Always match the protocol (http or https) and the domain:port of the
  // current page.
  const url = "//" + location.host + methodNameStats;

  HTTP.call("GET", url, {
    params: {
      cacheBuster: Math.random().toString(36).slice(2)
    }
  }, (error, { data }) => {
    if (error) {
      console.error([
        packageName + ": Couldn't load stats for visualization.",
        "Are you using standard-minifier-js >= 2.1.0 as the minifier?",
      ].join(" "));
      return;
    }

    // Load the JSON, which is `d3-hierarchy` digestible.
    if (data) {
      new builder({ container }).loadJson(data);
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
