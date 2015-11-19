(function () {

  var scrolling = false
  var scrollTimeout
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
      offset: 115,
      callback: function () {
        scrolling = false
      }
    })
  }

  // add anchors for all h3s
  var h3s = document.querySelectorAll('h3')
  if (h3s.length) {
    Array.prototype.forEach.call(h3s, createAnchorLink)
  }

  function createSubMenuLink (menu, h) {
    var headerLink = document.createElement('li')
    headerLink.innerHTML = '<a href="#' + h.id + '" data-scroll>' + h.textContent + '</a>'
    headerLink.firstChild.addEventListener('click', onLinkClick)
    menu.appendChild(headerLink)
  }

  function createAnchorLink (h) {
    var anchor = document.createElement('a')
    anchor.className = 'anchor'
    anchor.href = '#' + h.id
    anchor.setAttribute('aria-hidden', true)
    anchor.setAttribute('data-scroll', '')
    anchor.textContent = '🔗'
    anchor.addEventListener('click', onLinkClick)
    h.insertBefore(anchor, h.firstChild)
  }

  function onLinkClick (e) {
    if (document.querySelector('.sub-menu').contains(e.target)) {
      setActive(e.target)
    }
    scrolling = true
  }

  // setup active h3 update
  window.addEventListener('scroll', updateSidebar)
  window.addEventListener('resize', updateSidebar)

  function updateSidebar () {
    if (scrolling) return
    var doc = document.documentElement
    var top = doc && doc.scrollTop || document.body.scrollTop
    var last
    for (var i = 0; i < h2s.length; i++) {
      var link = h2s[i]
      if (link.offsetTop - 120 > top) {
        if (!last) last = link
        break
      } else {
        last = link
      }
    }
    if (last) {
      setActive(last)
    }
  }

  function setActive (link) {
    var previousActive = document.querySelector('.sub-menu .active')
    var id = link.id || link.hash.slice(1)
    var currentActive = document.querySelector('.sub-menu a[href="#' + id + '"]')
    if (currentActive !== previousActive) {
      if (previousActive) previousActive.classList.remove('active')
      currentActive.classList.add('active')
    }
  }

})()
