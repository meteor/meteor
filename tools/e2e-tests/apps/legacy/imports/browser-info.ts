import { UAParser } from 'ua-parser-js';

export const describeBrowser = () => {
  const browser = new UAParser(navigator.userAgent).getBrowser();
  return `${browser.name ?? 'Unknown browser'} ${browser.version ?? ''}`.trim();
};
