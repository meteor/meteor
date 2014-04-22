var DOMBackend = {};
Blaze.DOMBackend = DOMBackend;

var $jq = (typeof jQuery !== 'undefined' ? jQuery :
           (typeof Package !== 'undefined' ?
            Package.jquery && Package.jquery.jQuery : null));
if (! $jq)
  throw new Error("jQuery not found");

DOMBackend.parseHTML = function (html) {
  // Return an array of nodes.
  //
  // jQuery does fancy stuff like creating an appropriate
  // container element and setting innerHTML on it, as well
  // as working around various IE quirks.
  return $jq.parseHTML(html) || [];
};
