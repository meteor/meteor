// To be included in the compiled aloha-full.js (which includes
// requirejs and jQuery) immediately after jQuery. This will prevent
// Aloha's jQuery from polluting the global namespace.
// TODO: requirejs shouldn't leak either
// NB: this is only for aloha-full.js to preserve behaviour with the way
// older builds of aloha were done. It is now always preferred to use
// aloha-bare.js (which doesn't include either requirejs or jQuery) and
// let the implementer worry exactly how to set up jQuery and requirejs
// to suit his needs.
Aloha = window.Aloha || {};
Aloha.settings = Aloha.settings || {};
Aloha.settings.jQuery = Aloha.settings.jQuery || jQuery.noConflict(true);
