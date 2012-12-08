if (!Accounts.linkedin) {
  Accounts.linkedin = {};
}

Accounts.linkedin._urls = {
  requestToken: "https://api.linkedin.com/uas/oauth/requestToken",
  authorize: "https://api.linkedin.com/uas/oauth/authorize",
  accessToken: "https://api.linkedin.com/uas/oauth/accessToken",
  authenticate: "https://api.linkedin.com/uas/oauth/authenticate"
};
