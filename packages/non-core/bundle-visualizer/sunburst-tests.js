import { select } from "d3-selection";
import { Sunburst } from "./sunburst.js";
import { typeBundle } from "./common.js";

const TRANSITION_WAIT_MS = 1500;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function bundleJson(...names) {
  return {
    name: "main",
    children: names.map(name => ({
      name,
      type: typeBundle,
      children: [
        { name: "a.js", size: 100 },
        { name: "dir", children: [{ name: "b.js", size: 50 }] },
      ],
    })),
  };
}

function dispatch(node, type) {
  node.dispatchEvent(new MouseEvent(type, { bubbles: false }));
}

function createFixture(test) {
  const nodes = [];
  const append = node => (nodes.push(node), document.body.appendChild(node));

  // An application-owned path with its own unnamespaced D3 mouseover handler.
  const appSvg = append(
    document.createElementNS("http://www.w3.org/2000/svg", "svg"));
  const appPath = appSvg.appendChild(
    document.createElementNS("http://www.w3.org/2000/svg", "path"));
  appPath.style.opacity = "0.65";
  let appHovers = 0;
  const appHandler = () => appHovers++;
  select(appPath).on("mouseover", appHandler);

  const burstA = new Sunburst({ container: append(document.createElement("div")) });
  burstA.loadJson(bundleJson("first", "second"));
  const burstB = new Sunburst({ container: append(document.createElement("div")) });
  burstB.loadJson(bundleJson("other"));

  const pathsOf = burst => burst.elements.chart.selectAll("path").nodes();
  const visiblePath = burst =>
    burst.vis[burst.activeBundle].selectAll("path").nodes()
      .find(node => select(node).datum().depth === 3);

  const checkUntouched = () => {
    test.equal(appPath.style.opacity, "0.65");
    test.isTrue(select(appPath).on("mouseover") === appHandler);
    const before = appHovers;
    dispatch(appPath, "mouseover");
    test.equal(appHovers, before + 1);

    pathsOf(burstB).forEach(node => {
      test.equal(node.style.opacity, "1");
      test.isTrue(select(node).on("mouseover") === burstB.mouseoverEvent());
    });
  };

  const cleanup = () => nodes.forEach(node => node.remove());

  return { appPath, burstA, burstB, pathsOf, visiblePath, checkUntouched, cleanup };
}

Tinytest.addAsync(
  "bundle-visualizer - hover only affects paths owned by the Sunburst",
  async test => {
    const f = createFixture(test);
    try {
      const target = f.visiblePath(f.burstA);
      dispatch(target, "mouseover");

      // Ancestors are highlighted, everything else in the chart is faded.
      const ancestors = select(target).datum().ancestors();
      f.burstA.vis[0].selectAll("path").each(function (d) {
        test.equal(this.style.opacity, d.depth && ancestors.includes(d) ? "1" : "0.3");
      });
      test.equal(f.burstA.elements.percentage.text(), "33.3%");
      test.equal(f.burstA.elements.trail.selectAll("div").size(), 3);
      f.checkUntouched();

      dispatch(f.burstA.vis[0].node(), "mouseleave");
      test.equal(f.burstA.elements.trail.style("visibility"), "hidden");
      f.checkUntouched();

      await wait(TRANSITION_WAIT_MS);

      f.pathsOf(f.burstA).forEach(node => {
        test.equal(node.style.opacity, "1");
        test.isTrue(select(node).on("mouseover") === f.burstA.mouseoverEvent());
      });
      f.checkUntouched();
    } finally {
      f.cleanup();
    }
  }
);

Tinytest.addAsync(
  "bundle-visualizer - switching tabs during the reset transition",
  async test => {
    const f = createFixture(test);
    try {
      dispatch(f.visiblePath(f.burstA), "mouseover");
      dispatch(f.burstA.vis[0].node(), "mouseleave");
      f.burstA.handlePillClick("second");
      test.equal(f.burstA.activeBundle, 1);

      await wait(TRANSITION_WAIT_MS);

      f.pathsOf(f.burstA).forEach(node => {
        test.equal(node.style.opacity, "1");
        test.isTrue(select(node).on("mouseover") === f.burstA.mouseoverEvent());
      });
      f.checkUntouched();

      dispatch(f.visiblePath(f.burstA), "mouseover");
      test.equal(f.burstA.elements.percentage.text(), "33.3%");
      f.checkUntouched();
    } finally {
      f.cleanup();
    }
  }
);
