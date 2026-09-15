import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import { Mongo } from 'meteor/mongo';
import './each-stale.html';

// Scenarios from https://github.com/dupontbertrand/blaze-468-repro.
// Keep the generation on the enclosing template's data context: reading the
// source ReactiveVar directly inside an item exercises a different race.
const scenarios = [
  { id: 'replace', title: 'Different IDs', child: 'eachStaleList' },
  { id: 'retain', title: 'Same ID, changed content', child: 'eachStaleList' },
  { id: 'partial', title: 'Retain, remove and add items', child: 'eachStaleList' },
  { id: 'variable', title: 'Each item in items', child: 'eachStaleVariable' },
  { id: 'nested', title: 'Two nested loops', child: 'eachStaleNested' },
  { id: 'cursor', title: 'Minimongo cursor selector', child: 'eachStaleList' },
  { id: 'reorder', title: 'Reorder retained IDs', child: 'eachStaleList' },
  { id: 'parent', title: 'Template.parentData()', child: 'eachStaleParentData' },
  { id: 'empty', title: 'Filled and empty with else', child: 'eachStaleList' },
  { id: 'deep', title: 'Three nested loops', child: 'eachStaleDeep' },
];
const states = new Map();
const item = (id, generation) => ({ _id: id, generation });
const collection = new Mongo.Collection(null);
for (const [generation, ids] of [['A', ['a', 'b']], ['B', ['c']]]) {
  for (const id of ids) collection.insert(item(id, generation));
}

function items() {
  const { scenario, generation } = Template.instance().data;
  // A separate dependency lets the test invalidate an unchanged sequence.
  states.get(scenario).refresh.get();
  const make = id => item(id, generation);
  switch (scenario) {
    case 'retain': return [make('retained')];
    case 'partial': return (generation === 'A' ? ['a', 'b', 'c'] : ['a', 'd']).map(make);
    case 'nested': return [{ ...make(`group-${generation}`), children:
      (generation === 'A' ? ['a', 'b'] : ['c']).map(make) }];
    case 'deep': return [{ ...make(`outer-${generation}`), children: [
      { ...make(`middle-${generation}`), children: [make(generation)] },
    ] }];
    case 'cursor': return collection.find({ generation }, { sort: { _id: 1 } });
    case 'reorder': return (generation === 'A' ? ['x', 'y'] : ['y', 'x']).map(make);
    case 'empty': return generation === 'A' ? [make('A')] : [];
    default: return [make(generation)];
  }
}

function record(data, context) {
  const state = states.get(context.scenario);
  const detail = state.detail.get();
  // Plain arrays only. Publishing a reactive trace during render would change
  // invalidation order and could either mask the bug or create a render loop.
  state.renders.push({
    id: data._id,
    item: data.generation,
    context: context.generation,
    detail,
  });
  return `${data._id}:${data.generation}/${context.generation}/${detail}`;
}

const helpers = {
  items,
  renderItem() {
    const context = Template.instance().data;
    return record(Template.currentData(), context);
  },
  renderVariable(data) {
    return record(data, Template.instance().data);
  },
  renderParentData() {
    return record(Template.currentData(), Template.parentData(1));
  },
};
for (const name of new Set(scenarios.map(scenario => scenario.child))) {
  Template[name].helpers(helpers);
}

Template.eachStaleScenarios.helpers({ scenarios: () => scenarios });
Template.eachStaleScenario.onCreated(function () {
  this.state = {
    generation: new ReactiveVar('A'),
    detail: new ReactiveVar(0),
    refresh: new ReactiveVar(0),
    mounted: new ReactiveVar(true),
    report: new ReactiveVar('[]'),
    renders: [],
  };
  states.set(this.data.id, this.state);
});
Template.eachStaleScenario.onDestroyed(function () {
  states.delete(this.data.id);
});
Template.eachStaleScenario.helpers({
  mounted: () => Template.instance().state.mounted.get(),
  childData() {
    const instance = Template.instance();
    return { scenario: instance.data.id, generation: instance.state.generation.get() };
  },
  trace: () => Template.instance().state.report.get(),
});

function act(instance, update) {
  const state = instance.state;
  state.renders = [];
  update(state);
  // Synchronous flush captures intermediate executions as well as the final
  // render. Publish only afterward; Playwright reads this completed trace.
  Tracker.flush();
  state.report.set(JSON.stringify(state.renders));
  Tracker.flush();
}
const toggle = state => state.generation.set(state.generation.get() === 'A' ? 'B' : 'A');
Template.eachStaleScenario.events({
  'click .each-switch': (event, instance) => act(instance, toggle),
  'click .each-detail': (event, instance) => act(instance, state => {
    state.detail.set(state.detail.get() + 1);
  }),
  'click .each-refresh': (event, instance) => act(instance, state => {
    state.refresh.set(state.refresh.get() + 1);
  }),
  'click .each-burst': (event, instance) => act(instance, state => {
    toggle(state);
    toggle(state);
    toggle(state);
  }),
  'click .each-mount': (event, instance) => act(instance, state => {
    state.mounted.set(!state.mounted.get());
  }),
});
