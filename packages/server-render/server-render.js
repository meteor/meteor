import { WebAppInternals } from "meteor/webapp";
import { SAXParser } from "parse5";
import MagicString from "magic-string";

const callbacksById = Object.create(null);

// Register a callback function that returns a string of HTML (or a
// Promise<string> if asynchronous work needs to be done). If an element
// with the given id exists in the initial HTTP response body, the result
// of the callback will be injected into that element as part of the
// initial response. The callback receives the current request object as a
// parameter, so it can render according to per-request information like
// request.url. The final result of the callback will be ignored if it is
// anything other than a string, or if there is no element with the given
// id in the body of the current response. Registering multiple callbacks
// for the same id is not well defined, so this function just returns any
// previously registered callback, in case the new callback needs to do
// something with it.
export function renderIntoElementById(id, callback) {
  const previous = callbacksById[id];
  callbacksById[id] = callback;
  return previous;
}

WebAppInternals.registerBoilerplateDataCallback(
  "meteor/server-render",
  (data, request, arch) => {
    let madeChanges = false;

    function rewrite(property) {
      const html = data[property];
      if (typeof html !== "string") {
        return;
      }

      let promise = Promise.resolve();
      const magic = new MagicString(html);
      const parser = new SAXParser({
        locationInfo: true,
      });

      parser.on("startTag", (name, attrs, selfClosing, loc) => {
        attrs.some(attr => {
          if (attr.name === "id") {
            // TODO Ignore this id if it appears later?
            const callback = callbacksById[attr.value];
            if (typeof callback === "function") {
              promise = promise
                .then(() => callback(request))
                .then(rendered => {
                  if (typeof rendered === "string") {
                    magic.appendRight(loc.endOffset, rendered);
                    madeChanges = true;
                  }
                });
            }
            return true;
          }
        });
      });

      parser.write(html);

      return promise.then(
        () => data[property] = magic.toString()
      );
    }

    return Promise.all([
      rewrite("body"),
      rewrite("dynamicBody"),
    ]).then(() => madeChanges);
  }
);
