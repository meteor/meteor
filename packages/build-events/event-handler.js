const source = new EventSource("/__meteor__/build-events");

source.addEventListener("message", ({ data }) => {
  if (data === "error" || data === "success") {
    window.location.reload();
  }
});

window.addEventListener("beforeunload", () => {
  source.close();
});
