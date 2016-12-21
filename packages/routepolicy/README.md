# RoutePolicy
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/routepolicy) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/routepolicy)
***

RoutePolicy, part of [Webapp](https://github.com/meteor/meteor/tree/master/packages/webapp), is a
low-level API for declaring the offline access semantics that apply to
portions of the app's URL space. This is information is necessary when
generating HTML5 Appcache manifests.

For example, [DDP](https://www.meteor.com/ddp) uses sockjs to emulate
websockets when they are not available. sockjs emulates websockets
using HTTP long polling, and it uses URLs under `/sockjs` to perform
this long polling. So the [ddp](https://atmospherejs.com/meteor/ddp)
package uses RoutePolicy to declare that the `/sockjs` route is of
type "network" and should always be fetched live from the Internet and
never included in the appcache.

For more information, see the comments in the source.
