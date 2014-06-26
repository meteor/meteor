if (typeof Package === 'undefined' ||
    ! Package.webapp ||
    ! Package.webapp.WebApp ||
    ! Package.webapp.WebApp._isCssLoaded()) {
  document.location.reload();
}
