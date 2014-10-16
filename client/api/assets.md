{{#template name="apiAssets"}}

<h2 id="assets"><span>Assets</span></h2>

`Assets` allows server code in a Meteor application to access static server
assets, which are located in the `private` subdirectory of an application's
tree. Assets are not processed as source files and are copied directly
into your application's bundle.

{{> autoApiBox "Assets.getText"}}
{{> autoApiBox "Assets.getBinary"}}

Static server assets are included by placing them in the application's `private`
subdirectory. For example, if an application's `private` subdirectory includes a
directory called `nested` with a file called `data.txt` inside it, then server
code can read `data.txt` by running:

    var data = Assets.getText('nested/data.txt');

{{/template}}