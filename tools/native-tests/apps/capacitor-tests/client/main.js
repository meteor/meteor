import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

const ddpState = {
  connected: false,
  methodReady: false,
  subscriptionReady: false,
};
const CLIENT_VERSION = "Native client version initial";
const HCP_TRACE_KEY = "meteor-capacitor-native-test-hcp-trace";

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
    // Native tests keep running if storage is unavailable; visible assertions
    // that depend on persisted HCP state will fail.
  }
}

function recordHcpTrace(key) {
  const trace = readHcpTrace();
  trace[key] = (trace[key] || 0) + 1;
  writeHcpTrace(trace);
}

function isNativeWebAppLocalServerBridge(shim) {
  const source = [
    shim?.checkForUpdates,
    shim?.onNewVersionReady,
    shim?.switchToPendingVersion,
  ].map((fn) => {
    try {
      return Function.prototype.toString.call(fn);
    } catch {
      return "";
    }
  }).join("\n");

  return source.includes("CapacitorMeteorWebApp") || source.includes("getPlugin");
}

function wrapWebAppLocalServerMethod(shim, methodName, traceKey, mapArgs) {
  const original = shim?.[methodName];
  if (typeof original !== "function" || original.__nativeTestWrapped) return;

  const wrapped = function (...args) {
    recordHcpTrace(traceKey);
    return original.apply(this, mapArgs ? mapArgs(args) : args);
  };
  wrapped.__nativeTestWrapped = true;
  shim[methodName] = wrapped;
}

function instrumentWebAppLocalServer() {
  const shim = window.WebAppLocalServer;
  if (!shim || shim.__nativeTestInstrumented) return;

  wrapWebAppLocalServerMethod(shim, "checkForUpdates", "checkForUpdates");
  wrapWebAppLocalServerMethod(
    shim,
    "onNewVersionReady",
    "onNewVersionReadyRegistered",
    (args) => {
      if (typeof args[0] !== "function") return args;
      const callback = args[0];
      return [
        function (...callbackArgs) {
          recordHcpTrace("updateReady");
          return callback.apply(this, callbackArgs);
        },
      ];
    }
  );
  wrapWebAppLocalServerMethod(shim, "switchToPendingVersion", "switchToPendingVersion");
  shim.__nativeTestInstrumented = true;
}

instrumentWebAppLocalServer();

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

function checkWindowCapacitor() {
  const capacitor = window.Capacitor;

  if (capacitor) {
    setStatus("capacitor-status", "window.Capacitor available");
  }
}

function checkMeteorIsCapacitor() {
  if (Meteor.isCapacitor === true) {
    setStatus("meteor-capacitor-status", "Meteor.isCapacitor true");
  }
}

function checkCapacitorNativePlatform() {
  if (window.Capacitor?.isNativePlatform?.() === true) {
    setStatus("native-platform-status", "Capacitor native platform ready");
  }
}

function checkWebAppLocalServerShim() {
  const shim = window.WebAppLocalServer;
  if (
    shim &&
    typeof shim.startupDidComplete === "function" &&
    typeof shim.checkForUpdates === "function" &&
    typeof shim.switchToPendingVersion === "function"
  ) {
    setStatus("shim-status", "WebAppLocalServer shim ready");
  }

  if (isNativeWebAppLocalServerBridge(shim)) {
    setStatus("webapp-local-server-mode-status", "WebAppLocalServer native bridge ready");
  } else if (shim) {
    setStatus("webapp-local-server-mode-status", "WebAppLocalServer no-op shim ready");
  }
}

function checkHcpTrace() {
  const trace = readHcpTrace();
  if (trace.checkForUpdates > 0) {
    setStatus("hcp-check-status", "HCP check requested");
  }
  if (trace.updateReady > 0) {
    setStatus("hcp-ready-status", "HCP update ready");
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
    setStatus("cordova-status", "__cordova paths served");
  } else {
    setStatus("cordova-status", "__cordova paths adapted");
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

Meteor.startup(() => {
  setStatus("render-status", "Native render ready");
  setStatus("client-version-status", CLIENT_VERSION);
  checkStyleProbe();
  checkWindowCapacitor();
  checkMeteorIsCapacitor();
  checkCapacitorNativePlatform();
  checkWebAppLocalServerShim();
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
