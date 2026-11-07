const styles = `
  .container {
    all: initial;
    background: #FEFEFE;
    padding: 50px;
    min-height: 30vh;
    max-height: 100%;
    width: 100%;
    position: fixed;
    left: 0;
    top: 0;
    font-family: sans-serif;
    box-shadow: inset 0 0 100px #e411111f, 0 0 20px #00000085;
    box-sizing: border-box;
    overflow-y: auto;
    z-index: 1000000;
  }

  .section {
    margin-bottom: 50px;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .section-head h3 {
    flex: 1;
    margin: 0;
  }

  .section pre.collapsed {
    display: none;
  }

  .copy-feedback {
    font-size: 12px;
    min-height: 1em;
  }

  .copy-feedback.error {
    color: #b00020;
  }

  pre {
    overflow-x: auto;
  }
`;

let sectionCounter = 0;
let previouslyFocusedEl = null;
let escapeListener = null;

function createSection (title, content) {
  var sectionContainer = document.createElement('div');
  sectionContainer.classList.add('section');

  var messageId = 'dev-error-overlay-message-' + (++sectionCounter);

  var head = document.createElement('div');
  head.classList.add('section-head');

  var header = document.createElement('h3');
  header.textContent = title;
  head.appendChild(header);

  var message = document.createElement('pre');
  message.id = messageId;
  message.innerHTML = content;

  // Collapse/expand toggle. State lives on this section only, so
  // toggling one diagnostic never affects another.
  var collapsed = false;
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Collapse';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', messageId);
  toggle.addEventListener('click', function () {
    collapsed = !collapsed;
    message.classList.toggle('collapsed', collapsed);
    toggle.textContent = collapsed ? 'Expand' : 'Collapse';
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
  head.appendChild(toggle);

  // Per-diagnostic copy feedback, announced to assistive technology.
  var feedback = document.createElement('span');
  feedback.classList.add('copy-feedback');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');

  var copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.setAttribute('aria-label', 'Copy diagnostic: ' + title);
  copy.addEventListener('click', function () {
    copyDiagnostic(title, message, feedback);
  });
  head.appendChild(copy);

  sectionContainer.appendChild(head);
  sectionContainer.appendChild(message);
  sectionContainer.appendChild(feedback);

  return sectionContainer;
}

// Copy a diagnostic's title and complete message as plain text.
// Uses the Clipboard API when available, with a textarea +
// execCommand fallback. Feedback is always shown; a failed copy is
// never reported as a success and never leaves an unhandled rejection.
function copyDiagnostic (title, messageEl, feedbackEl) {
  var text = title + '\n' + messageEl.textContent;

  function report (ok, message) {
    feedbackEl.textContent = message;
    feedbackEl.classList.toggle('error', !ok);
  }

  function fallback () {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      report(!!ok, ok ? 'Copied!' : 'Copy failed: clipboard unavailable');
    } catch (e) {
      report(false, 'Copy failed: clipboard unavailable');
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () { report(true, 'Copied!'); },
      function () { fallback(); }
    );
  } else {
    fallback();
  }
}

let container = null;
let contentEl = null;

function init () {
  if (container) {
    return;
  }

  // Save the focused element once, when the overlay first opens, so
  // opening further diagnostics does not overwrite it.
  previouslyFocusedEl = document.activeElement;

  container = document.createElement('div');
  document.body.append(container);

  contentEl = document.createElement('div');
  contentEl.classList.add('container');

  let shadow = container.attachShadow({ mode: 'open' });
  shadow.appendChild(contentEl);

  let style = document.createElement('style');
  style.textContent = styles;
  shadow.appendChild(style);

  let button = document.createElement('button');
  button.textContent = 'Close';
  button.addEventListener('click', close);
  contentEl.appendChild(button);

  escapeListener = function (event) {
    if (event.key === 'Escape') {
      close();
    }
  };
  document.addEventListener('keydown', escapeListener);

  // Move focus into the overlay when it first opens.
  button.focus();
}

function close() {
  if (escapeListener) {
    document.removeEventListener('keydown', escapeListener);
    escapeListener = null;
  }

  if (container) {
    document.body.removeChild(container);
  }
  container = null;
  contentEl = null;

  if (previouslyFocusedEl && document.contains(previouslyFocusedEl)) {
    previouslyFocusedEl.focus();
  }
  previouslyFocusedEl = null;
}

DevErrorOverlay = {
  showMessage(title, message) {
    init();

    let sectionEl = createSection(title, message);
    contentEl.prepend(sectionEl);

    return () => {
      if (container && contentEl && sectionEl.parentNode === contentEl) {
        contentEl.removeChild(sectionEl);

        if (contentEl.childNodes.length === 1) {
          close();
        }
      }
    };
  }
}
