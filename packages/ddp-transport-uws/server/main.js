import { DDPTransportRegistry } from 'meteor/ddp-transport-registry';
import { createUwsTransport } from './transport.js';

DDPTransportRegistry.register('uws', createUwsTransport);
