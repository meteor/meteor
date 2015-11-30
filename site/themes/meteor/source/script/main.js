(function () {

  var MAX_HEADER_DEPTH = 3
  var scrolling = false
  var scrollTimeout
  var activeLink = document.querySelector('.sidebar-link.current')
  var allLinks = []

  // create sub links for h2s
  var h2s = document.querySelectorAll('h2')
  if (h2s.length) {
    createSubMenu(activeLink.parentNode, h2s, 2)
    smoothScroll.init({
      speed: 400,
      offset: window.innerWidth > 560 ? 115 : 55,
      callback: function () {
        scrolling = false
      }
    })
  }

  function createSubMenu (container, headers, depth) {
    var subMenu = document.createElement('ul')
    subMenu.className = 'sub-menu'
    container.appendChild(subMenu)
    Array.prototype.forEach.call(headers, function (h) {
      var link = createSubMenuLink(h)
      subMenu.appendChild(link)
      if (depth < MAX_HEADER_DEPTH) {
        var subHeaders = findSubHeaders(h, depth)
        createSubMenu(link, subHeaders, depth + 1)
      }
      makeHeaderLinkable(h)
    })
  }

  function createSubMenuLink (h) {
    allLinks.push(h)
    var headerLink = document.createElement('li')
    headerLink.innerHTML = '<a href="#' + h.id + '" data-scroll>' + h.textContent + '</a>'
    headerLink.firstChild.addEventListener('click', onLinkClick)
    return headerLink
  }

  function findSubHeaders (node, depth) {
    var res = []
    while (node.nextSibling && node.nextSibling.tagName !== 'H' + depth) {
      node = node.nextSibling
      if (node.tagName === 'H' + (depth + 1)) {
        res.push(node)
      }
    }
    return res
  }

  function makeHeaderLinkable (h) {
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
    document.body.classList.remove('sidebar-open')
  }

  // setup active h3 update
  window.addEventListener('scroll', updateSidebar)
  window.addEventListener('resize', updateSidebar)

  function updateSidebar () {
    if (scrolling) return
    var doc = document.documentElement
    var top = doc && doc.scrollTop || document.body.scrollTop
    var last
    for (var i = 0; i < allLinks.length; i++) {
      var link = allLinks[i]
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

  // version select
  var currentVersion = location.pathname.match(/^\/(v\d[^\/]+)/)
  ;[].forEach.call(document.querySelectorAll('.version-select'), function (select) {
    if (currentVersion) {
      [].some.call(select.options, function (o) {
        if (o.value === currentVersion[1]) {
          o.selected = true
          return true
        }
      })
    }
    select.addEventListener('change', function () {
      var targetPath = '/'
      if (select.selectedIndex !== 0) {
        targetPath = '/' + select.value + '/'
      }
      location.assign(targetPath)
    })
  })

  // search box
  // TODO
  
  // mobile
  document.querySelector('#mobile-header .menu-button')
    .addEventListener('click', function () {
      document.body.classList.toggle('sidebar-open')
    })
  document.getElementById('mobile-shade').addEventListener('click', function () {
    document.body.classList.remove('sidebar-open')
  })
})()
