import { Sunburst } from "./sunburst.js";
import { select } from "d3-selection";

// Regression test for https://github.com/meteor/meteor/issues/14927:
// hover, mouseleave, and reset-transition selections must be scoped to the
// Sunburst instance that owns the chart. Unrelated application SVG paths in
// the same document must keep their opacity and their own mouseover
// handlers, and two Sunburst instances must not affect each other.
Tinytest.addAsync(
  "bundle-visualizer - hover scoped to owning instance",
  function (test, onComplete) {
    const container1 = document.createElement("div");
    const container2 = document.createElement("div");
    document.body.appendChild(container1);
    document.body.appendChild(container2);

    const viz1 = new Sunburst({ container: container1 });
    const viz2 = new Sunburst({ container: container2 });

    const json1 = {
      name: "root",
      children: [
        {
          name: "bundleA",
          children: [{ name: "a.js", size: 10 }],
        },
      ],
    };
    const json2 = {
      name: "root",
      children: [
        {
          name: "bundleB",
          children: [{ name: "b.js", size: 20 }],
        },
      ],
    };

    viz1.loadJson(json1);
    viz2.loadJson(json2);

    // An application-owned SVG path outside both visualizers, with a
    // distinctive opacity and its own unnamespaced D3 mouseover handler.
    const unrelatedSvg = select(document.body)
      .append("svg")
      .attr("width", 100)
      .attr("height", 100);

    const unrelatedPath = unrelatedSvg
      .append("path")
      .attr("d", "M10,10 L90,10 L90,90 Z")
      .style("fill", "steelblue")
      .style("opacity", 0.65)
      .node();

    let unrelatedMouseoverCount = 0;
    select(unrelatedPath).on("mouseover", () => {
      unrelatedMouseoverCount++;
    });

    // Hover a segment of the first visualizer.
    const viz1Path = viz1.vis[0].selectAll("path").node();
    test.isTrue(!!viz1Path, "first visualizer path exists");

    viz1Path.dispatchEvent(
      new Event("mouseover", { bubbles: true, cancelable: true })
    );

    test.equal(
      parseFloat(select(unrelatedPath).style("opacity")),
      0.65,
      "unrelated path opacity unchanged after visualizer mouseover"
    );
    test.equal(
      unrelatedMouseoverCount,
      0,
      "unrelated mouseover handler not triggered by visualizer hover"
    );

    // Leave the chart (the mouseleave handler lives on the bounding
    // circle's parent <g>; a bubbling event dispatched on the circle
    // reaches it). The reset transition runs for 1000ms.
    const boundingCircle = viz1.vis[0].select("circle").node();
    boundingCircle.dispatchEvent(
      new Event("mouseleave", { bubbles: true, cancelable: true })
    );

    // Assert after the transition completes, not only immediately after
    // mouseleave.
    setTimeout(() => {
      test.equal(
        parseFloat(select(unrelatedPath).style("opacity")),
        0.65,
        "unrelated path opacity unchanged after mouseleave transition"
      );

      // The unrelated handler must still work: fire a mouseover on it.
      unrelatedPath.dispatchEvent(
        new Event("mouseover", { bubbles: true, cancelable: true })
      );
      test.equal(
        unrelatedMouseoverCount,
        1,
        "unrelated mouseover handler intact after visualizer transition"
      );

      test.equal(
        parseFloat(select(viz1Path).style("opacity")),
        1,
        "visualizer path opacity restored after transition"
      );

      const viz2Path = viz2.vis[0].selectAll("path").node();
      test.equal(
        parseFloat(select(viz2Path).style("opacity")),
        1,
        "second visualizer path opacity unchanged"
      );

      // Cross-instance isolation: hovering the second visualizer's path
      // must drive the SECOND instance's display only. With the old
      // document-wide selections, the first instance's mouseleave
      // transition would have installed the FIRST instance's handler on
      // the second instance's paths.
      viz2Path.dispatchEvent(
        new Event("mouseover", { bubbles: true, cancelable: true })
      );
      test.equal(
        viz1.elements.explanation.style("display"),
        "none",
        "hovering second visualizer does not touch first visualizer"
      );
      test.isTrue(
        viz2.elements.percentage.text() !== "",
        "second visualizer updates its own percentage on hover"
      );

      document.body.removeChild(container1);
      document.body.removeChild(container2);
      unrelatedSvg.remove();

      onComplete();
    }, 1200);
  }
);
