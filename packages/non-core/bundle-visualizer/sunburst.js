/**
  Inspired-by, borrowed-from and improved-upon another sundial provided under
  the Apache License:

    https://bl.ocks.org/kerryrodden/766f8f6d31f645c39f488a0befa1e3c8

  Copyright 2013 Google Inc. All Rights Reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import assert from "assert";
import prettyBytes from "pretty-bytes";

// Make a custom "d3" object containing exactly what we need from the
// modularized d3 bundles.
const d3 = Object.assign({},
  { selectAll, select, mouse } = require("d3-selection"),
  { arc } = require("d3-shape"),
  { hierarchy, partition } = require("d3-hierarchy"),
  { keys, entries } = require("d3-collection"),
);

// This is imported only for its side effects, which affect the d3 namespace.
import "d3-transition";

import {
  typeBundle,
  typePackage,
  typeNodeModules,
  prefixedClass,
} from "./common.js";

import * as classes from "./classNames.js";

// Dimensions of sunburst.
const width = 950;
const height = 600;
const radius = Math.min(width, height) / 2;

// Mapping of step names to colors.
const DEFAULT_COLORS = {
  "_default_": "#ababab",
  [typeBundle]: "#de4f4f",
  [typePackage]: "#de783b",
  [typeNodeModules]: "#7b615c",
  "meteor": "#6ab975",
  "javascript": "#a173d1",
};

export class Sunburst {
  constructor({
    container,
    colors = DEFAULT_COLORS,
  } = {}) {
    this.elements = {};
    this.colors = colors;
    this.totalSize = 0;

    assert.strictEqual(typeof container, "object",
      "Must pass a 'container' element");

    this.elements.container = d3.select(container);

    this.elements.main =
      this.elements.container
        .append("div")
          .attr("class", prefixedClass("main"));

    this.elements.pillContainer =
      this.elements.container
        .append("div")
          .attr("class", prefixedClass("pills"));

    this.elements.sequence =
      this.elements.main
        .append("div")
          .attr("class", prefixedClass("sequence"));

    this.elements.chart =
      this.elements.main
        .append("div")
          .attr("class", prefixedClass("chart"));

    this.elements.explanation =
      this.elements.chart
        .append("div")
          .attr("class", prefixedClass("explanation"));

    this.elements.percentage =
      this.elements.explanation
        .append("span")
          .attr("class", prefixedClass("percentage"));

    // BR between percentage and bytes.
    this.elements.explanation.append("br");

    this.elements.bytes =
      this.elements.explanation
        .append("span")
          .attr("class", prefixedClass("bytes"));

    this.partition = d3.partition()
      .size([2 * Math.PI, radius * radius]);

    this.arc = d3.arc()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .innerRadius(d => Math.sqrt(d.y0))
      .outerRadius(d => Math.sqrt(d.y1));

    this.svg = [];
    this.vis = [];
    this.totalSizes = [];
  }

  getColor(data) {
    if (data.type === typePackage) {
      return this.colors[typePackage];
    }

    if (data.name.endsWith(".js")) {
      return this.colors.javascript;
    }

    if (this.colors[data.name]) {
      return this.colors[data.name];
    }

    return this.colors._default_;
  }

  initializeBreadcrumbTrail() {
    // Add the svg area.
    this.elements.trail =
      this.elements.container
        .append("div")
        .attr("class", prefixedClass("trail"));
  }

  createPills(json) {
    this.elements.pills = [];
    json.children.forEach((child, i) => {
      const className =
        prefixedClass("pill") + (i ? '' : ` ${prefixedClass("active")}`);
      this.elements.pills.push(
        this.elements.pillContainer
          .append("div")
          .attr("class", className)
          .attr("name", child.name)
          .text(child.name)
          .on("click", () => this.handlePillClick(child.name))
      );
    })
  }

  handlePillClick(name) {
    this.elements.pills.forEach((pill, i) => {
      const className =
        pill.attr("name") === name
          ? `${prefixedClass("pill")} ${prefixedClass("active")}`
          : prefixedClass("pill");

      pill.attr("class", className);
      if (pill.attr("name") === name) {
        this.svg[i].style("display", null);
        this.totalSize = this.totalSizes[i];
        this.activeBundle = i;
      } else {
        this.svg[i].style("display", "none");
      }
    });
  }

  draw(json, i) {
    const svg = this.elements.chart
      .append("svg:svg")
        .attr("width", width)
        .attr("height", height)
        .style("display", "none");

    const vis = svg
      .append("svg:g")
        .attr("class", prefixedClass("top"))
        .attr("transform", `translate(${width / 2},${height / 2})`)

    // Bounding circle underneath the sunburst, to make it easier to detect
    // when the mouse leaves the parent g.
    vis
      .append("svg:circle")
        .attr("r", radius)
        .style("opacity", 0);

    // Add the mouseleave handler to the bounding circle.
    vis.on("mouseleave", this.mouseleaveEvent());

    // Turn the data into a d3 hierarchy and calculate the sums.
    this.root = d3.hierarchy(json)
      .sum(d => d.size)
      .sort((a, b) => b.value - a.value);

    // For efficiency, filter nodes to keep only those large enough to see.
    this.nodes = this
      .partition(this.root)
      .descendants()
      .filter(d => d.x1 - d.x0 > 0.005); // 0.005 radians = 0.29 degrees

    this.path = vis.data([json]).selectAll("path")
      .data(this.nodes)
      .enter()
      .append("svg:path")
        .attr("display", d => d.depth ? null : "none")
        .attr("d", this.arc)
        .attr("fill-rule", "evenodd")
        .style("fill", d => this.getColor(d.data))
        .style("opacity", 1)
        .on("mouseover", this.mouseoverEvent());

    // // Get total size of the tree = value of root node from partition.
    const totalSize = this.path.datum().value;

    this.svg.push(svg);
    this.vis.push(vis);
    this.totalSizes.push(totalSize);
  }

  loadJson(json) {
    // Draw the starburst for the each bundle
    json.children
      .forEach(bundle => this.draw({ name: 'main', children: [bundle] }));

    // Basic setup of page elements.
    this.json = json;
    this.createPills(json);
    this.initializeBreadcrumbTrail();

    this.svg[0].style("display", null);
    this.activeBundle = 0;
  }

  mouseoverEvent() {
    return this.mouseover || (this.mouseover = d => {
      const percentage =
        (100 * d.value / this.totalSizes[this.activeBundle]).toPrecision(3);
      let percentageString = `${percentage}%`;
      if (percentage < 0.1) {
        percentageString = "< 0.1%";
      }

      this.elements.percentage
        .text(percentageString);

      this.elements.bytes
        .text(prettyBytes(d.value || 0));

      this.elements.explanation
        .style("display", null);

      const sequenceArray = d.ancestors().reverse();
      sequenceArray.shift(); // remove root node from the array
      this.updateBreadcrumbs(sequenceArray, percentageString);

      // Fade all the segments.
      d3.selectAll("path")
        .style("opacity", 0.3);

      // Then highlight only those that are an ancestor of the current segment.
      this.vis[this.activeBundle].selectAll("path")
        .filter((node) => sequenceArray.indexOf(node) >= 0)
        .style("opacity", 1);
    });
  }

  // Restore everything to full opacity when moving off the visualization.
  mouseleaveEvent() {
    const self = this;
    return self.mouseleave || (self.mouseleave = function (d) {
      // Hide the breadcrumb trail
      self.elements.trail
        .style("visibility", "hidden");

      // Deactivate all segments during transition.
      d3.selectAll("path").on("mouseover", null);

      // Transition each segment to full opacity and then reactivate it.
      d3.selectAll("path")
        .transition()
        .duration(1000)
        .style("opacity", 1)
        .on("end", function() {
          d3.select(this).on("mouseover", self.mouseoverEvent());
        });

      self.elements.explanation
        .style("display", "none");
    });
  }

  // Update the breadcrumb trail to show the current sequence and percentage.
  updateBreadcrumbs(nodeArray, percentageString) {
    // Data join; key function combines name and depth (= position in sequence).
    const trail = this.elements.trail
      .selectAll("div")
      .data(nodeArray, d => d.data.name + d.depth);

    // Remove exiting nodes.
    trail.exit().remove();

    // Add breadcrumb and label for entering nodes.
    const entering = trail.enter()
      .append("div")
        .attr("class", prefixedClass("trailSegment"))
        .style("background-color", d => this.getColor(d.data))
        .text(d => d.data.name);

    // Merge enter and update selections; set position for all nodes.
    entering
      .merge(trail);

    // Make the breadcrumb trail visible, if it's hidden.
    this.elements.trail
      .style("visibility", "");
  }
}
