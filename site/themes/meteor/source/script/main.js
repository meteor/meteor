(function () {

  var activeLink = document.querySelector('.sidebar-link.current')

  // create sub links for h2s
  var h2s = document.querySelectorAll('h2')
  if (h2s.length) {
    var subMenu = document.createElement('ul')
    subMenu.className = 'sub-menu'
    activeLink.parentNode.appendChild(subMenu)
    Array.prototype.forEach.call(h2s, function (h) {
      createSubMenuLink(subMenu, h)
      createAnchorLink(h)
    })
    smoothScroll.init({
      speed: 400,
      offset: 115
    })
  }

  var h3s = document.querySelectorAll('h3')
  if (h3s.length) {
    Array.prototype.forEach.call(h3s, createAnchorLink)
  }

  function createSubMenuLink (menu, h) {
    var headerLink = document.createElement('li')
    headerLink.innerHTML = '<a href="#' + h.id + '" data-scroll>' + h.textContent + '</a>'
    menu.appendChild(headerLink)
  }

  function createAnchorLink (h) {
    var anchor = document.createElement('a')
    anchor.className = 'anchor'
    anchor.href = '#' + h.id
    anchor.setAttribute('aria-hidden', true)
    anchor.setAttribute('data-scroll', '')
    anchor.textContent = '🔗'
    h.insertBefore(anchor, h.firstChild)
  }

})()
