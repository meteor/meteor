Clicks = Sky.Collection('clicks');

if (Sky.is_server) {
  Sky.publish('clicks', {});
}
