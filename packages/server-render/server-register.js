import { WebAppInternals } from "meteor/webapp";
import { SAXParser } from "parse5";
import MagicString from "magic-string";
import { ServerSink } from "./server-sink.js";
import { onPageLoad } from "./server.js";

WebAppInternals.registerBoilerplateDataCallback(
  "meteor/server-render",
  (request, data, arch) => {
    const sink = new ServerSink(request, arch);

    return onPageLoad.chain(
      callback => callback(sink, request)
    ).then(() => {
      if (! sink.maybeMadeChanges) {
        return false;
      }

      let reallyMadeChanges = false;

      function rewrite(property) {
        const html = data[property];
        if (typeof html !== "string") {
          return;
        }

        const magic = new MagicString(html);
        const parser = new SAXParser({
          locationInfo: true
        });

        parser.on("startTag", (name, attrs, selfClosing, loc) => {
          attrs.some(attr => {
            if (attr.name === "id") {
              const html = sink.htmlById[attr.value];
              if (html) {
                magic.appendRight(loc.endOffset, html);
                reallyMadeChanges = true;
              }
              return true;
            }
          });
        });

        parser.write(html);

        data[property] = magic.toString();
      }

      if (sink.head) {
        data.dynamicHead = (data.dynamicHead || "") + sink.head;
        reallyMadeChanges = true;
      }

      if (Object.keys(sink.htmlById).length > 0) {
        // We don't currently allow injecting HTML into the <head> except
        // by calling sink.appendHead(html).
        rewrite("body");
        rewrite("dynamicBody");
      }

      if (sink.body) {
        data.dynamicBody = (data.dynamicBody || "") + sink.body;
        reallyMadeChanges = true;
      }

      return reallyMadeChanges;
    });
  }
);
