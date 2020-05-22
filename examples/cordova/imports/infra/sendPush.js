import { Meteor } from 'meteor/meteor';
import request from 'request';

import {ONE_SIGNAL_APP_ID, ONE_SIGNAL_REST_API_KEY} from "./native";

// TODO mobile send push example
export const sendPush = ({ heading, content, playersIds, data = {} }) =>
  new Promise((resolve, reject) => {
    const options = {
      uri: 'https://onesignal.com/api/v1/notifications',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${ONE_SIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        ...(heading ? { headings: { en: heading } } : {}),
        contents: { en: content },
        include_player_ids: playersIds,
        app_id: ONE_SIGNAL_APP_ID,
        data,
        web_url: Meteor.absoluteUrl(data.route),
      }),
    };

    request.post(options, (error, response, body) => {
      if (error) reject(error);
      resolve({
        response: JSON.parse(body),
      });
    });
  });
