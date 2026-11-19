import { Meteor } from 'meteor/meteor';
import { getClientPackageAsset } from 'meteor/my-assets-package';

Meteor.startup(async () => {
  try {
    const clientAsset = await getClientPackageAsset();
    const div = document.createElement('div');
    div.id = 'client-asset';
    div.innerText = clientAsset;
    document.body.appendChild(div);
  } catch (error) {
    console.error('Error fetching client asset:', error);
  }
});

// Web Worker bundled by Rspack: render its reply and any error it raises.
Meteor.startup(() => {
  const workerEvents = document.createElement('div');
  workerEvents.id = 'worker-events';
  document.body.appendChild(workerEvents);

  const worker = new Worker(new URL('./echo.worker.js', import.meta.url));
  worker.onmessage = (event) => {
    workerEvents.textContent += `message: ${event.data}\n`;
  };
  worker.onerror = (event) => {
    workerEvents.textContent += `error: ${event.message}\n`;
  };
  worker.postMessage('ping');
});
