import { testPeerLocation, testPeerValue } from './peer';

export function getTestPayload(context: string) {
  return {
    context,
    peer: testPeerValue,
    location: testPeerLocation,
    value: `${context}:${testPeerValue}`,
  };
}
