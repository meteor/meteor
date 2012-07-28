// Dump out the contents of a LiveRange as an HTML string.
var rangeToHtml = function(liverange) {
  var frag = document.createDocumentFragment();
  for(var n = liverange.firstNode(),
          after = liverange.lastNode().nextSibling;
      n && n !== after;
      n = n.nextSibling)
    frag.appendChild(n.cloneNode(true)); // deep copy
  return DomUtils.fragmentToHtml(frag);
};
