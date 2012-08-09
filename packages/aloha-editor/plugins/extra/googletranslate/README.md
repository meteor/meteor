Alhoa-Editor GoogleTranslate Plugin
===================================
This plugin will allow you to translate the contents you're editing by using the Google Translate API v2.

Usage
=====
Just include the plugin.js file in your page, like any other Aloha plugin. Highlight some text, switch to the "Translate" tab, and select a language you want to translate to.
At this point only English, German and French are supported, which is just because I'm too lazy to add all the language icons and styles Google Translate supports.

Please configure your own API key, as you will most likely hit Google's Translation API limits if you stick with the one I provide with this plugin:

GENTICS.Aloha.settings = {
	"plugins" : {
		"com.gentics.aloha.plugins.GoogleTranslate": {
			apiKey : "YOUR-API-KEY-HERE"
		}
	}
}

Known Issues
============
* Any translation which returns special chars is broken, as the characters are inserted as symbols. This will result in broken text entries, eg. when translating english to french