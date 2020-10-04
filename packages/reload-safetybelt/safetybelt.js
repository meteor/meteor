if (typeof Package === 'undefined' ||
    ! Package.webapp ||
    ! Package.webapp.WebApp ||
    ! Package.webapp.WebApp._isCssLoaded()) {
  window.location.reload();
}
