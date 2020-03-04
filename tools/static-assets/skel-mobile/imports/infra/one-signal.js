import {Meteor} from 'meteor/meteor';
// TODO mobile add accounts
import {Accounts} from 'meteor/accounts-base';

import {methodCall} from './methodCall';

let currentPlayerId = null;

export const addPlayerId = playerId => {
  methodCall('addPlayerId', {
    playerId,
  })
    .catch(e => {
      console.error(`Error adding player id ${playerId}`, e);
    });
};

const goTo = route => {
  const navigateTo = `${!route.startsWith('/') ? '/' : ''}${route}`;
  console.debug(`navigateTo ${navigateTo}`);
  history.push(navigateTo);
};

Meteor.startup(() => {
  Accounts.onLogin(data => {
    console.log('onLogin', Meteor.userId(), data);
    addPlayerId(currentPlayerId);
  });

  if (!Meteor.isCordova) {
    return;
  }

  let appId = null;
  // eslint-disable-next-line no-undef
  window.plugins.AppSettings.get(
    ['onesignalappid', 'universallink'],
    configs => {
      const universalLink = configs.universallink;
      // cordova from fairmanager-cordova-plugin-universal-links
      window.cordova.plugins.UniversalLinks.subscribe(null, eventData => {
        console.debug(`cordovaRedirect ${universalLink} ${eventData.url}`);

        if (!eventData.url.includes(universalLink)) return;

        const redirectUrl = eventData.url.replace(universalLink, '');
        if (redirectUrl) {
          const navigateTo = `${
            !redirectUrl.startsWith('/') ? '/' : ''
          }${redirectUrl}`;
          console.debug(`navigateTo ${navigateTo}`);
          history.push(navigateTo);
        }
      });

      appId = configs.onesignalappid;
      if (appId) {
        window.plugins.OneSignal.setLogLevel({logLevel: 4, visualLevel: 1});

        const notificationOpenedCallback = notification => {
          console.debug('received notification', JSON.stringify(notification));
          // TODO mobile readme: explain additionalData.route
          const route = notification && notification.payload &&
            notification.payload.additionalData &&
            notification.payload.additionalData.route;
          if (route) {
            goTo(route);
          }
        };

        window.plugins.OneSignal.startInit(appId);
        window.plugins.OneSignal.handleNotificationOpened(
          notificationOpenedCallback
        );
        window.plugins.OneSignal.getIds(ids => {
          currentPlayerId = ids.userId;
        });
        window.plugins.OneSignal.endInit();
      }
    },
    error => {
      console.error(
        'Error getting configuration from config.xml in Cordova',
        error
      );
    }
  );
});
