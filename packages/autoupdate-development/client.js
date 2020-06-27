import { ssePath } from "./common.js";

const eventSource = new EventSource(ssePath);

eventSource.addEventListener("message", ({ data }) => {
  if (data !== __meteor_runtime_config__.clientHash) {
    window.location.reload();
  }
});

window.addEventListener("beforeunload", () => eventSource.close());
