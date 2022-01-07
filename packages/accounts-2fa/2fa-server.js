import twofactor from "node-2fa";
import QRCode from "qrcode-svg";
import { verifyCode } from "./utils";

Meteor.methods({
  getUserTwoFactorAuthenticationData({ selector }) {
      const user = Meteor.users.findOne(selector);
      return user && user.twoFactorAuthentication;
    },
  generateSvgCode(appName) {
    const user = Meteor.user();

    if (!user) { return null; }

    const { username } = user;

    const { secret, uri } = twofactor.generateSecret({ name: appName, account: username });
    const svg = new QRCode(uri).svg();

    Meteor.users.update({ username }, {
      $set: {
        twoFactorAuthentication: {
          secret,
        }
      }
    });

    return svg;
  },
  enableUser2fa(code) {
    const user = Meteor.user();

    if (!user) {
      throw new Meteor.Error(400, "No user logged in.");
    }

    const { twoFactorAuthentication, username } = user;


    if (!twoFactorAuthentication || !twoFactorAuthentication.secret) {
      throw new Meteor.Error(400, "The user does not have a secret generated. You may have to call the function generateSvgCode first.");
    }

    verifyCode({ code, secret: twoFactorAuthentication.secret });
    Meteor.users.update({ username }, {
      $set: {
        twoFactorAuthentication: {
          ...twoFactorAuthentication,
          type: "otp",
        }
      }
    });
  },
});
