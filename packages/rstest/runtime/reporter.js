const PROTOCOL_VERSION = 1;

function formatResultFrame({ architecture, generation = 1, result }) {
  return `[Meteor-Rstest] ${JSON.stringify({
    type: 'result',
    protocolVersion: PROTOCOL_VERSION,
    generation,
    architecture,
    result,
  })}`;
}

function formatSummary({ architecture, result }) {
  const { passed, failed, skipped, todo } = result.stats;
  return `[Meteor Rstest] ${architecture}: ${passed} passed, ${failed} failed, ${skipped} skipped, ${todo} todo`;
}

module.exports = { formatResultFrame, formatSummary, PROTOCOL_VERSION };
