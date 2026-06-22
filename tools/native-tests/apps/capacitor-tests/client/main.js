import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

const ddpState = {
  connected: false,
  methodReady: false,
  subscriptionReady: false,
};
const CLIENT_VERSION = "Native client version initial";

function setStatus(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
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

Meteor.startup(() => {
  setStatus("render-status", "Native render ready");
  setStatus("client-version-status", CLIENT_VERSION);
  checkStyleProbe();
  checkWindowCapacitor();
  checkMeteorIsCapacitor();
  checkCapacitorNativePlatform();
  checkWebAppLocalServerShim();
  checkCordovaPaths();

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
