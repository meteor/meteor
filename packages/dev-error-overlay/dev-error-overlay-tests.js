// Regression tests for https://github.com/meteor/meteor/issues/14926:
// each diagnostic gets independent collapse/copy controls, with
// keyboard support, focus handling, and safe removal callbacks.
import { DevErrorOverlay } from "meteor/dev-error-overlay";

function findOverlayHost () {
  return Array.from(document.body.children).find(
    (el) => el.shadowRoot
  );
}

function installFakeClipboard (impl) {
  const fake = { writeText: impl };
  Object.defineProperty(navigator, "clipboard", {
    value: fake,
    configurable: true,
  });
  return fake;
}

function restoreClipboard () {
  delete navigator.clipboard;
}

Tinytest.addAsync(
  "dev-error-overlay - independent collapse and copy controls",
  function (test, onComplete) {
    let captured = null;
    installFakeClipboard((text) => {
      captured = text;
      return Promise.resolve();
    });

    const removeFirst = DevErrorOverlay.showMessage(
      "First diagnostic",
      "First line\nSecond line"
    );
    const removeSecond = DevErrorOverlay.showMessage(
      "Second diagnostic",
      "<span>Formatted message</span>\nAnother line"
    );
    const removeDup = DevErrorOverlay.showMessage(
      "First diagnostic",
      "Duplicate title body"
    );

    const host = findOverlayHost();
    test.isTrue(!!host, "overlay host exists");
    const root = host.shadowRoot;
    const sections = () => Array.from(root.querySelectorAll(".section"));

    test.equal(sections().length, 3, "three diagnostics shown");
    test.equal(
      sections()[0].querySelector("h3").textContent,
      "First diagnostic",
      "newest diagnostic first"
    );

    // Collapse the middle diagnostic only.
    const middle = sections()[1];
    const toggle = middle.querySelectorAll("button")[0];
    test.equal(toggle.textContent, "Collapse", "toggle starts collapsed=false");
    test.equal(
      toggle.getAttribute("aria-expanded"),
      "true",
      "aria-expanded starts true"
    );
    toggle.click();
    test.isTrue(
      middle.querySelector("pre").classList.contains("collapsed"),
      "collapsed section hides its message"
    );
    test.equal(toggle.textContent, "Expand", "toggle becomes Expand");
    test.equal(
      toggle.getAttribute("aria-expanded"),
      "false",
      "aria-expanded becomes false"
    );
    test.isFalse(
      sections()[0].querySelector("pre").classList.contains("collapsed"),
      "other diagnostics stay expanded"
    );
    test.isFalse(
      sections()[2].querySelector("pre").classList.contains("collapsed"),
      "other diagnostics stay expanded"
    );

    // Copy works while collapsed, as plain text without HTML.
    const copyMiddle = middle.querySelectorAll("button")[1];
    captured = null;
    copyMiddle.click();

    setTimeout(() => {
      test.equal(
        captured,
        "Second diagnostic\nFormatted message\nAnother line",
        "copy captures title and plain message text"
      );
      test.equal(
        middle.querySelector(".copy-feedback").textContent,
        "Copied!",
        "copy feedback shown"
      );

      // Identical titles stay separate: remove the newest duplicate.
      removeDup();
      test.equal(sections().length, 2, "one diagnostic removed");
      test.isTrue(
        sections().some(
          (s) => s.querySelector("h3").textContent === "First diagnostic"
        ),
        "the older same-title diagnostic survives"
      );

      // Removal callback is safe when called again.
      removeDup();
      test.equal(sections().length, 2, "double removal is a no-op");

      restoreClipboard();
      // Close the overlay via its Close button to leave a clean DOM.
      const closeButton = root.querySelector(".container > button");
      closeButton.click();
      onComplete();
    }, 100);
  }
);

Tinytest.addAsync(
  "dev-error-overlay - clipboard rejection, Escape, focus, and callbacks",
  function (test, onComplete) {
    let unhandled = 0;
    const onUnhandled = () => { unhandled++; };
    window.addEventListener("unhandledrejection", onUnhandled);

    // Rejecting clipboard + failing fallback: understandable feedback,
    // no unhandled rejection, no false success claim.
    installFakeClipboard(() => Promise.reject(new Error("denied")));
    const realExecCommand = document.execCommand;
    document.execCommand = () => false;

    const beforeBtn = document.createElement("button");
    beforeBtn.textContent = "before";
    document.body.appendChild(beforeBtn);
    beforeBtn.focus();

    const removeFirst = DevErrorOverlay.showMessage(
      "First diagnostic",
      "First line"
    );
    const removeSecond = DevErrorOverlay.showMessage(
      "Second diagnostic",
      "Second line"
    );

    const host = findOverlayHost();
    const root = host.shadowRoot;
    test.equal(
      document.activeElement,
      host,
      "focus moves into the overlay on first open"
    );

    const first = root.querySelectorAll(".section")[1];
    const copyFirst = first.querySelectorAll("button")[1];
    copyFirst.click();

    setTimeout(() => {
      const feedback = first.querySelector(".copy-feedback");
      test.isTrue(
        feedback.textContent.indexOf("Copy failed") === 0,
        "rejected copy shows failure feedback"
      );
      test.isTrue(
        feedback.classList.contains("error"),
        "failure feedback is marked as an error"
      );
      test.equal(unhandled, 0, "no unhandled promise rejection");

      document.execCommand = realExecCommand;
      restoreClipboard();

      // Escape closes the overlay and restores focus.
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );

      setTimeout(() => {
        test.isTrue(!findOverlayHost(), "Escape closes the overlay");
        test.equal(
          document.activeElement,
          beforeBtn,
          "focus returns to the previously focused element"
        );

        // A stale Escape listener must not affect anything after close.
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );

        // Removal callbacks stay safe after manual closure.
        removeFirst();
        removeSecond();
        test.isTrue(!findOverlayHost(), "still closed after callbacks");

        // Reopen works; old callbacks cannot remove the new diagnostic.
        const removeNew = DevErrorOverlay.showMessage("Reopened", "fresh");
        test.equal(
          findOverlayHost().shadowRoot.querySelectorAll(".section").length,
          1,
          "overlay reopens with the new diagnostic"
        );
        removeFirst();
        test.equal(
          findOverlayHost().shadowRoot.querySelectorAll(".section").length,
          1,
          "old callback cannot remove the new diagnostic"
        );
        removeNew();
        test.isTrue(
          !findOverlayHost(),
          "overlay closes when the last diagnostic is removed"
        );

        window.removeEventListener("unhandledrejection", onUnhandled);
        document.body.removeChild(beforeBtn);
        onComplete();
      }, 100);
    }, 100);
  }
);
