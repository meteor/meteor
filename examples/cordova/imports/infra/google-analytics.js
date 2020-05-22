import { Meteor } from 'meteor/meteor';
import { useEffect, useRef } from 'react';

const DEFAULT_ANALYTICS_TRACKER_ID =
  Meteor.settings.public.googleAnalyticsTrackingId;

const getTrackingsIds = ({ gaWebPropertyId } = {}) =>
  [DEFAULT_ANALYTICS_TRACKER_ID, gaWebPropertyId].filter(Boolean);

const ga = (...rest) => {
  const googleAnalytics = window.gtag;
  if (!googleAnalytics || typeof googleAnalytics !== 'function') {
    console.warn('googleAnalytics is not available', googleAnalytics);
    return;
  }
  googleAnalytics(...rest);
};

export const sendConfigToAnalytics = ({ store } = {}, data, options) => {
  getTrackingsIds(store).forEach(trackingId => {
    ga('config', trackingId, data, options);
  });
};

const addAnalyticsTag = (sink, trackingId) => {
  sink.appendToHead(`
    <!-- Global site tag (gtag.js) - Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${trackingId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${trackingId}', { 'transport_type': 'beacon' });
    </script>
    `);
};

export const addGoogleAnalyticsScript = sink => {
  addAnalyticsTag(sink, DEFAULT_ANALYTICS_TRACKER_ID);
};

/**
 * inspired by https://github.com/mib200/vue-gtm/
 */
const hasScript = () =>
  Array.from(document.getElementsByName('script')).some(script =>
    script.src.includes('googletagmanager')
  );

// TODO mobile do we need this?
export const loadGoogleAnalytics = (store = {}) => {
  if (!Meteor.isClient || hasScript()) {
    return false;
  }
  const { gaPrimaryDomain } = store;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${DEFAULT_ANALYTICS_TRACKER_ID}`;
  document.head.appendChild(script);
  const scriptContent = document.createElement('script');
  const domain = gaPrimaryDomain
    ? `gtag('set', 'linker', { 'domains': '${gaPrimaryDomain}' });`
    : '';
  scriptContent.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${DEFAULT_ANALYTICS_TRACKER_ID}', { 'transport_type': 'beacon' });
      ${domain}
    `;
  document.head.appendChild(scriptContent);
  return true;
};

export const initializeGoogleAnalytics = () => {
  loadGoogleAnalytics();
};

export const useGoogleAnalyticsPageView = ({ title, store }) => {
  const pageLocationPath = window.location.pathname;

  const lastPageLocationPathRef = useRef(null);

  useEffect(() => {
    if (
      !lastPageLocationPathRef.current ||
      lastPageLocationPathRef.current !== pageLocationPath
    ) {
      sendConfigToAnalytics(
        { store },
        {
          page_title: title,
          page_location: window.location.href,
          page_path: pageLocationPath,
        }
      );
    }
    lastPageLocationPathRef.current = pageLocationPath;
  }, [pageLocationPath, title]);
};
