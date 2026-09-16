import { peerLocation, peerValue } from './peer';

export function getRelativePayload(context: string) {
  return {
    context,
    peer: peerValue,
    location: peerLocation,
    value: `${context}:${peerValue}`,
  };
}
