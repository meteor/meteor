# fastclick

FastClick is a simple, easy-to-use library for eliminating the 300ms delay
between a physical tap and the firing of a `click` event on mobile browsers. The
aim is to make your application feel less laggy and more responsive while
avoiding any interference with your current logic.

FastClick is developed by [FT Labs](http://labs.ft.com/), part of the Financial
Times.

For more info see the original repo:
[ftlabs/fastclick](https://github.com/ftlabs/fastclick).


This package is included by default on all Meteor Phonegap/Cordova apps. If you
would like to use Fastclick for mobile web as well, add it to your app directly
with `meteor add fastclick`.

In case you want to disable FastClick for certain elements, you can add the
`needsclick` class as described in the [advanced section](https://github.com/ftlabs/fastclick#ignore-certain-elements-with-needsclick)
of the FastClick documentation:

```html
<a class="needsclick">Ignored by FastClick</a>
```
