function collectLinks(value, location = "themeConfig", links = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLinks(item, `${location}[${index}]`, links));
    return links;
  }

  if (!value || typeof value !== "object") {
    return links;
  }

  for (const [key, item] of Object.entries(value)) {
    const itemLocation = `${location}.${key}`;

    if (key === "link" && typeof item === "string") {
      links.push({ link: item, location: itemLocation });
    } else {
      collectLinks(item, itemLocation, links);
    }
  }

  return links;
}

function normalizeRoute(path) {
  if (/%2f|%5c/i.test(path)) {
    throw new Error("encoded path separator");
  }

  return decodeURIComponent(path)
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.(?:html|md)$/i, "")
    .replace(/(?:^|\/)index$/i, "")
    .replace(/\/$/, "");
}

export function checkThemeLinks({ themeConfig, pages, siteOrigin = "https://docs.meteor.com" }) {
  const pageRoutes = new Set(pages.map(normalizeRoute));
  const origin = new URL(siteOrigin).origin;
  const failures = [];
  let checkedLinks = 0;

  for (const { link, location } of collectLinks(themeConfig)) {
    let url;
    try {
      url = new URL(link, origin);
    } catch {
      failures.push(`${location}: ${link} is not a valid URL`);
      continue;
    }

    if (url.origin !== origin) {
      continue;
    }

    checkedLinks += 1;
    let route;
    try {
      route = normalizeRoute(url.pathname);
    } catch {
      failures.push(`${location}: ${link} is not a valid URL`);
      continue;
    }

    if (!pageRoutes.has(route)) {
      failures.push(`${location}: ${link} does not match a documentation page`);
    }
  }

  if (failures.length) {
    throw new Error(
      `Found ${failures.length} broken VitePress theme link(s):\n- ${failures.join("\n- ")}`
    );
  }

  console.log(`Validated ${checkedLinks} internal VitePress theme links.`);
}
