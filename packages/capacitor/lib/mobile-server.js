export function getContextMobileServerUrl(context = {}) {
  return context?.mobileServerUrl ||
    context?.options?.mobileServerUrl ||
    context?.options?.['mobile-server'] ||
    process.env.MOBILE_ROOT_URL ||
    null;
}
