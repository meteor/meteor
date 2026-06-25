import React, { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Device } from '@capacitor/device';

import './main.css';

function getErrorMessage(error) {
  return error?.message || String(error);
}

export const App = () => {
  const [devicePluginStatus, setDevicePluginStatus] = useState('Device plugin pending');
  const [appPluginStatus, setAppPluginStatus] = useState('App plugin pending');

  useEffect(() => {
    let active = true;

    async function checkDevicePlugin() {
      try {
        const info = await Device.getInfo();
        if (!active) return;

        setDevicePluginStatus(
          info?.platform === 'web'
            ? 'Device plugin ready: web'
            : `Device plugin unexpected platform: ${info?.platform || 'unknown'}`
        );
      } catch (error) {
        if (active) {
          setDevicePluginStatus(`Device plugin error: ${getErrorMessage(error)}`);
        }
      }
    }

    async function checkAppPlugin() {
      try {
        await CapacitorApp.getInfo();
        if (active) {
          setAppPluginStatus('App plugin unexpectedly available on web');
        }
      } catch (error) {
        if (!active) return;

        const message = getErrorMessage(error);
        setAppPluginStatus(
          /not implemented on web/i.test(message)
            ? 'App plugin unavailable on web'
            : `App plugin error: ${message}`
        );
      }
    }

    checkDevicePlugin();
    checkAppPlugin();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main data-testid="native-react-root" className="native-react">
      <h1>Welcome to Meteor Native React</h1>
      <p data-testid="native-context">Rspack and Capacitor fixture</p>
      <p data-testid="native-device-plugin">{devicePluginStatus}</p>
      <p data-testid="native-app-plugin">{appPluginStatus}</p>
    </main>
  );
};
