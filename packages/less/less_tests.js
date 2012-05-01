
Tinytest.add("less - presence", function(test) {

  var div = document.createElement("DIV");
  div.style.height = '0';
  div.style.overflow = 'hidden';
  div.innerHTML = '<p class="unlucky-left-border"></p>';
  document.body.appendChild(div);

  var p = div.firstChild;
  var leftBorder;
  if (p.currentStyle) { // IE
    leftBorder = p.currentStyle.borderLeftWidth;
  } else {
    leftBorder =
      window.getComputedStyle(p, null).getPropertyValue('border-left-width');
  }

  test.equal(leftBorder, "13px");

  div.parentNode.removeChild(div);
});

