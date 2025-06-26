const fs = require('fs');
const path = require('path');
const inspector = require('inspector');

// Inspector configuration
const INSPECTOR_CONFIG = {
  enabled: !!process.env.METEOR_INSPECT,
  filter: process.env.METEOR_INSPECT ? process.env.METEOR_INSPECT.split(',') : [],
  context: process.env.METEOR_INSPECT_CONTEXT || '',
  outputDir: process.env.METEOR_INSPECT_OUTPUT || path.join(process.cwd(), 'profiling'),
  samplingInterval: process.env.METEOR_INSPECT_INTERVAL ? parseInt(process.env.METEOR_INSPECT_INTERVAL || '1000', 10) : undefined
};

// Inspector global variables
let inspectorActive = false;
let rootSession = null;
let rootProfileName = null;
let profileStartTime = null;

function shouldRunInspectorProfiling(name) {
  if (!INSPECTOR_CONFIG.enabled) return false;
  return INSPECTOR_CONFIG.filter.includes(name);
}

function startInspectorProfiling(name) {
  if (!shouldRunInspectorProfiling(name)) {
    return false;
  }

  try {
    if (rootSession) {
      return false;
    }
    
    profileStartTime = Date.now();
    
    if (!inspectorActive) {
      inspector.open();
      inspectorActive = true;
    }
    
    const session = new inspector.Session();
    session.connect();
    session.post('Profiler.enable');
    session.post('Profiler.start', {
      samplingInterval: INSPECTOR_CONFIG.samplingInterval
    });

    rootSession = session;
    rootProfileName = name;
    
    return true;
  } catch (err) {
    console.log(`[PROFILING_START] Error starting profiling for ${name}: ${err}`);
    return false;
  }
}

function stopInspectorProfiling(name, isActive) {
  if (!isActive || !rootSession || name !== rootProfileName) {
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    try {
      const duration = profileStartTime ? Date.now() - profileStartTime : 0;
      const session = rootSession;
      
      if (!session) {
        return resolve();
      }
      
      session.post('Profiler.stop', (err, result) => {
        if (err) {
          console.log(`[PROFILING_STOP] Error stopping profiler for ${name}: ${err}`);
          cleanupAndResolve(resolve);
          return reject(err);
        }
        
        try {
          saveProfile(result.profile, name, name, duration);
          cleanupAndResolve(resolve);
        } catch (saveErr) {
          console.log(`[PROFILING_STOP] Error saving profile for ${name}: ${saveErr}`);
          cleanupAndResolve(resolve);
          reject(saveErr);
        }
      });
    } catch (err) {
      console.log(`[PROFILING_STOP] Error in stopInspectorProfiling for ${name}: ${err}`);
      cleanupAndResolve(resolve);
      reject(err);
    }
  });
  
  function cleanupAndResolve(resolve) {
    try {
      if (rootSession) {
        rootSession.disconnect();
      }
      
      if (inspectorActive) {
        inspector.close();
        inspectorActive = false;
      }
      
      rootSession = null;
      rootProfileName = null;
      profileStartTime = null;
      
      if (typeof global.gc === 'function') {
        global.gc();
      }
      
      return resolve();
    } catch (cleanupErr) {
      console.log(`[PROFILING_STOP] Error during cleanup: ${cleanupErr}`);
      return resolve();
    }
  }
}

function saveProfile(profile, name, filename, duration) {
  if (!fs.existsSync(INSPECTOR_CONFIG.outputDir)) {
    fs.mkdirSync(INSPECTOR_CONFIG.outputDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = filename.replace(/[\/\\:]/g, '_');
  const filepath = path.join(INSPECTOR_CONFIG.outputDir, `${safeFilename}-${INSPECTOR_CONFIG.context}-${timestamp}.cpuprofile`);
  
  fs.writeFileSync(filepath, JSON.stringify(profile));
  
  const profileSize = JSON.stringify(profile).length / (1024 * 1024);
  
  console.log(`[PROFILING_SAVE] Profile for ${name} saved in: ${filepath}`);
  console.log(`[PROFILING_SAVE] Duration: ${duration}ms, size: ${profileSize.toFixed(2)}MB`);
}

// Main Profile function
export const Profile = function Profile(bucketName, f) {
  return function profileWrapper() {
    const args = Array.from(arguments);
    const name = typeof bucketName === 'function' ? bucketName.apply(this, args) : bucketName;
    
    const profileInfo = {
      name,
      isActive: false,
      isCompleted: false,
      startTime: Date.now()
    };

    if (shouldRunInspectorProfiling(name)) {
      profileInfo.isActive = startInspectorProfiling(name);
    }

    const completeProfiler = () => {
      if (profileInfo.isActive && !profileInfo.isCompleted) {
        profileInfo.isCompleted = true;
        return stopInspectorProfiling(name, profileInfo.isActive);
      }
      return Promise.resolve();
    };

    function completeIfSync(result) {
      if (!(result instanceof Promise)) {
        completeProfiler();
      }
    }

    try {
      const result = f.apply(this, args);
      
      if (result instanceof Promise) {
        return result.finally(() => completeProfiler());
      }
      
      completeIfSync(result);
      return result;
    } catch (error) {
      completeProfiler();
      throw error;
    }
  };
}
