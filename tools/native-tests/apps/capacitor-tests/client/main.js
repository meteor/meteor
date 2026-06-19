import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

const ddpState = {
  connected: false,
  methodReady: false,
  subscriptionReady: false,
};

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

function checkCapacitorRuntime() {
  const capacitor = window.Capacitor;
  const native = typeof capacitor?.isNativePlatform === "function"
    ? capacitor.isNativePlatform()
    : !!capacitor?.isNative;

  if (capacitor && native) {
    setStatus("capacitor-status", "Capacitor runtime ready");
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

  if (!urls.some((url) => String(url).includes("__cordova/"))) {
    setStatus("cordova-status", "__cordova paths adapted");
  }
}

Meteor.startup(() => {
  setStatus("render-status", "Native render ready");
  checkStyleProbe();
  checkCapacitorRuntime();
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
      ddpState.methodReady = true;
      updateDdpStatus();
    }
  });

  Tracker.autorun(() => {
    ddpState.connected = Meteor.status().connected;
    updateDdpStatus();
  });
});
