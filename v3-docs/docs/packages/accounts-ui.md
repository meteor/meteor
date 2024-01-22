# accounts-ui

A turn-key user interface for Meteor Accounts.

To add Accounts and a set of login controls to an application, add the
`accounts-ui` package and at least one login provider package:
`accounts-password`, `accounts-facebook`, `accounts-github`,
`accounts-google`, `accounts-twitter`, or `accounts-weibo`.

Then simply add the <span v-pre>`{{> loginButtons}}`</span> helper to an HTML file. This
will place a login widget on the page. If there is only one provider configured
and it is an external service, this will add a login/logout button. If you use
`accounts-password` or use multiple external login services, this will add
a "Sign in" link which opens a dropdown menu with login options. If you plan to
position the login dropdown in the right edge of the screen, use
<span v-pre>`{{> loginButtons align="right"}}`</span> in order to get the dropdown to lay
itself out without expanding off the edge of the screen.

To configure the behavior of <span v-pre>`{{> loginButtons}}`</span>, use
[`Accounts.ui.config`](#accounts-ui-config).

`accounts-ui` also includes modal popup dialogs to handle links from
[`sendResetPasswordEmail`](#accounts-sendresetpasswordemail), [`sendVerificationEmail`](#accounts_sendverificationemail),
and [`sendEnrollmentEmail`](#accounts-sendenrollmentemail). These
do not have to be manually placed in HTML: they are automatically activated
when the URLs are loaded.

If you want to control the look and feel of your accounts system a little more, we recommend reading the [useraccounts](http://guide.meteor.com/accounts.html#useraccounts) section of the Meteor Guide.
