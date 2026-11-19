self.onmessage = (event) => self.postMessage(`worker got ${event.data}`);
