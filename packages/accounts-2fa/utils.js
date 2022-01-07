import twofactor from "node-2fa";

export const verifyCode = ({ secret, code }) => {
  const { delta } = twofactor.verifyToken(secret, code) || {};
  if (!delta || delta < 0) {
    throw new Meteor.Error(404, "Invalid token");
  }
};
