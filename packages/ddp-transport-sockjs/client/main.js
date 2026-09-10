import { DDPTransportRegistry } from "meteor/ddp-transport-registry";
import SockJS from "./sockjs-1.6.1-min-.js";

DDPTransportRegistry.register("sockjs", SockJS);
