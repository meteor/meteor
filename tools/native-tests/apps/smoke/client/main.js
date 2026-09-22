import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

const ddpState = {
  connected: false,
  methodReady: false,
  subscriptionReady: false,
};
const CLIENT_VERSION = "Native client version initial";
const HCP_TRACE_KEY = "meteor-cordova-native-test-hcp-trace";

function setStatus(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function readHcpTrace() {
  try {
    return JSON.parse(window.localStorage.getItem(HCP_TRACE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeHcpTrace(trace) {
  try {
    window.localStorage.setItem(HCP_TRACE_KEY, JSON.stringify(trace));
  } catch {
    // Visible HCP assertions fail if native storage is unavailable.
  }
}

function recordHcpTrace(key) {
  const trace = readHcpTrace();
  trace[key] = (trace[key] || 0) + 1;
  writeHcpTrace(trace);
}

function wrapWebAppLocalServerMethod(methodName, traceKey) {
  const localServer = window.WebAppLocalServer;
  const original = localServer?.[methodName];
  if (typeof original !== "function" || original.__nativeTestWrapped) return;

  const wrapped = function (...args) {
    recordHcpTrace(traceKey);
    return original.apply(this, args);
  };
  wrapped.__nativeTestWrapped = true;
  wrapped.__nativeTestOriginal = original;
  localServer[methodName] = wrapped;
}

function instrumentWebAppLocalServer() {
  const localServer = window.WebAppLocalServer;
  if (!localServer || localServer.__nativeTestInstrumented) return;

  wrapWebAppLocalServerMethod("checkForUpdates", "checkForUpdates");
  wrapWebAppLocalServerMethod(
    "switchToPendingVersion",
    "switchToPendingVersion"
  );
  localServer.__nativeTestInstrumented = true;
}

function updateDdpStatus() {
  if (
    ddpState.connected &&
    ddpState.subscriptionReady &&
    ddpState.methodReady
  ) {
    setStatus("ddp-status", "DDP verified");
  }
}

function checkStyleProbe() {
  const probe = document.getElementById("style-probe");
  if (!probe) return;

  const style = getComputedStyle(probe);
  if (
    style.backgroundColor === "rgb(14, 165, 233)" &&
    style.color === "rgb(255, 255, 255)" &&
    style.paddingTop === "12px"
  ) {
    setStatus("style-status", "Style preserved");
  }
}

function checkCordovaRuntime() {
  if (window.cordova) {
    setStatus("cordova-status", "window.cordova available");
  }

  if (window.cordova?.platformId === "ios" ||
      window.cordova?.platformId === "android") {
    setStatus("native-platform-status", "Cordova native platform ready");
  }
}

function checkWebAppLocalServer() {
  const localServer = window.WebAppLocalServer;
  if (
    localServer &&
    typeof localServer.startupDidComplete === "function" &&
    typeof localServer.checkForUpdates === "function" &&
    typeof localServer.onNewVersionReady === "function" &&
    typeof localServer.switchToPendingVersion === "function"
  ) {
    setStatus("webapp-local-server-status", "WebAppLocalServer ready");
  }
}

function checkHcpTrace() {
  const trace = readHcpTrace();
  if (trace.checkForUpdates > 0) {
    setStatus("hcp-check-status", "HCP check requested");
  }
  if (trace.switchToPendingVersion > 0) {
    setStatus("hcp-reload-status", "HCP reload executed");
  }
}

function checkCordovaPaths() {
  const urls = Array.from(document.querySelectorAll("[src], [href]"))
    .flatMap((node) => [
      node.getAttribute("src"),
      node.getAttribute("href"),
      node.src,
      node.href,
    ])
    .filter(Boolean);

  if (urls.some((url) => String(url).includes("__cordova/"))) {
    setStatus("cordova-paths-status", "__cordova paths served");
  }
}

function checkRouteReloadState() {
  if (window.location.pathname === "/tasks") {
    setStatus("route-status", "Route reload preserved");
  }
}

function bindRouteReloadButton() {
  const button = document.getElementById("route-reload-button");
  if (!button || button.__nativeTestBound) return;

  button.addEventListener("click", () => {
    window.history.pushState({}, "", "/tasks");
    window.location.reload();
  });
  button.__nativeTestBound = true;
}

instrumentWebAppLocalServer();

Meteor.startup(() => {
  // The Cordova plugin global is guaranteed to exist by this point. Wrapping it
  // here still precedes the HCP triggered by the test runner's source update.
  instrumentWebAppLocalServer();
  setStatus("render-status", "Native render ready");
  setStatus("client-version-status", CLIENT_VERSION);
  checkStyleProbe();
  checkCordovaRuntime();
  checkWebAppLocalServer();
  checkHcpTrace();
  checkCordovaPaths();
  checkRouteReloadState();
  bindRouteReloadButton();

  Meteor.subscribe("nativePing", {
    onReady() {
      ddpState.subscriptionReady = true;
      updateDdpStatus();
    },
  });

  Meteor.call("nativeEcho", "ping", (error, result) => {
    if (!error && result?.ok === true && result?.echo === "ping") {
      setStatus("server-version-status", result.serverVersion);
      ddpState.methodReady = true;
      updateDdpStatus();
    }
  });

  Tracker.autorun(() => {
    ddpState.connected = Meteor.status().connected;
    updateDdpStatus();
  });
});
