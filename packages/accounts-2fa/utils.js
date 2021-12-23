import twofactor from "node-2fa";
import QRCode from "qrcode-svg";

export const generateSecret = ({ username, appName } = {}) => {
  const { secret, uri } = twofactor.generateSecret({ name: appName, account: username });
  const svg = new QRCode(uri).svg();
  return { svg, secret };
}

export const verifyCode = ({ secret, code, window = 4 }) => {
  return twofactor.verifyToken(secret, code, window);
}
