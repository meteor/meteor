# accounts-ui

A turn-key user interface for Meteor Accounts.

To add Accounts and a set of login controls to an application, add the `accounts-ui`
package and at least one login provider package:
`accounts-password`, `accounts-facebook`, `accounts-github`,
`accounts-google`, `accounts-twitter`, or `accounts-weibo`.

Then simply add the `{{> loginButtons}}` helper to an HTML file.

See the Meteor Accounts [project page](https://www.meteor.com/accounts) for more info.

## Details

Adding the `{{> loginButtons}}` helper to an HTML file will
place a login widget on the page. If there is only one provider configured
and it is an external service, this will add a login/logout button. If you use
`accounts-password` or use multiple external login services, this will add
a "Sign in" link which opens a dropdown menu with login options. If you plan to
position the login dropdown in the right edge of the screen, use
`{{> loginButtons align="right"}}` in order to get the dropdown to lay
itself out without expanding off the edge of the screen.

To configure the behavior of `{{> loginButtons}}`, use
[`Accounts.ui.config`](http://docs.meteor.com/#accounts_ui_config).

`accounts-ui` also includes modal popup dialogs to handle links from
[`sendResetPasswordEmail`](http://docs.meteor.com/#accounts_sendresetpasswordemail), [`sendVerificationEmail`](http://docs.meteor.com/#accounts_sendverificationemail),
and [`sendEnrollmentEmail`](http://docs.meteor.com/#accounts_sendenrollmentemail). These
do not have to be manually placed in HTML: they are automatically activated
when the URLs are loaded.

See the Meteor Accounts [project page](https://www.meteor.com/accounts) for more info.