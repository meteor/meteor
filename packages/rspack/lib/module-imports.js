function capitalizeFirstLetter(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Client bundle is served + injected as a <script>, not imported (#14561).
// Native has no web server to serve from, so it still imports.
export function getBundleLinkContent(config, side) {
  if (config?.isClient && !config?.isNative) {
    return `/* ⚡ Rspack ${capitalizeFirstLetter(side)} App served as a static resource and injected as a <script> (not imported), see #14561 */`;
  }
  return `/* Link to ⚡ Rspack ${capitalizeFirstLetter(side)} App */
import './${config?.outputFile || ''}';`;
}
