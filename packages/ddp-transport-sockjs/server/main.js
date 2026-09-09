import { DDPTransportRegistry } from 'meteor/ddp-transport-registry';
import { createSockJSTransport } from './transport.js';

DDPTransportRegistry.register('sockjs', createSockJSTransport);
