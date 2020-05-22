const iOS = () => {
  const iDevices = [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod',
  ];

  return !!navigator.platform && iDevices.indexOf(navigator.platform) !== -1;
};

const register = () => {
  if (!('serviceWorker' in navigator)) {
    console.log('serviceWorker is not in navigator!');
    return;
  }
  if (iOS()) {
    console.log('iOS device then not register sw (was with error)!');
    return;
  }
  navigator.serviceWorker
    .register('/sw.js')

    .then(() => {
      console.log('serviceWorker registered with success!');
    })
    .catch(error => console.error('Error registering serviceWorker!', error));
};

register();
