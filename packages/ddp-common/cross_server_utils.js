
if (typeof DDPCommon === 'undefined') {
  if (typeof Package !== 'undefined' && Package['ddp-common']) {
    DDPCommon = Package['ddp-common'].DDPCommon;
  } else if (typeof global !== 'undefined') {
    global.DDPCommon = global.DDPCommon || {};
    DDPCommon = global.DDPCommon;
  } else if (typeof window !== 'undefined') {
    window.DDPCommon = window.DDPCommon || {};
    DDPCommon = window.DDPCommon;
  } else {
    DDPCommon = {};
  }
}

DDPCommon.getDDPUrl = function() {
  if (typeof __meteor_runtime_config__ !== 'undefined' &&
      __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL) {
    return __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
  }
  return null;
};

DDPCommon.isDDPServerDifferent = function() {
  if (typeof window === 'undefined') {
    return false;
  }
  
  if (typeof Meteor !== 'undefined' && Meteor.isTest) {
    return false;
  }
  if (typeof process !== 'undefined' && 
      (process.env.NODE_ENV === 'test' || 
       process.env.TEST_METADATA || 
       process.env.IS_MIRROR ||
       process.env.TRAVIS ||
       process.env.CI)) {
    return false;
  }
  
  const ddpUrl = DDPCommon.getDDPUrl();
  if (!ddpUrl) {
    return false;
  }
  const webOrigin = window.location.origin;
  
  try {
    let fullDdpUrl = ddpUrl;
    if (ddpUrl.startsWith('//')) {
      fullDdpUrl = window.location.protocol + ddpUrl;
    } else if (ddpUrl.startsWith('/')) {
      fullDdpUrl = webOrigin + ddpUrl;
    } else if (!ddpUrl.includes('://')) {
      fullDdpUrl = window.location.protocol + '//' + ddpUrl;
    }
    
    const ddpOrigin = new URL(fullDdpUrl).origin;
    return ddpOrigin !== webOrigin;
  } catch (e) {
    Meteor._debug && Meteor._debug('Failed to parse DDP_DEFAULT_CONNECTION_URL:', ddpUrl, e);
    return false;
  }
};
