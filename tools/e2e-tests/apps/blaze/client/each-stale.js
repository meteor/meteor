import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import './each-stale.html';

// Partial-update scenario from https://github.com/dupontbertrand/blaze-468-repro.
Template.eachStaleScenario.onCreated(function () {
  this.state = {
    generation: new ReactiveVar('A'),
    detail: new ReactiveVar(0),
    report: new ReactiveVar(JSON.stringify({ step: 0, renders: [] })),
    step: 0,
    renders: [],
  };
});

Template.eachStaleScenario.helpers({
  childData() {
    const { state } = Template.instance();
    return { generation: state.generation.get(), state };
  },
  trace: () => Template.instance().state.report.get(),
});

Template.eachStaleList.helpers({
  items() {
    const { generation } = Template.instance().data;
    return (generation === 'A' ? ['a', 'b', 'c'] : ['a', 'd'])
      .map(_id => ({ _id, generation }));
  },
  renderItem() {
    const { generation, state } = Template.instance().data;
    const item = Template.currentData();
    const detail = state.detail.get();
    // Read the enclosing data context, not the generation ReactiveVar itself.
    // Keep this trace non-reactive so it cannot change render scheduling.
    state.renders.push({ id: item._id, item: item.generation, context: generation, detail });
    return `${item._id}:${item.generation}/${generation}/${detail}`;
  },
});

function act(instance, update) {
  const { state } = instance;
  state.renders = [];
  const step = ++state.step;
  update(state);
  // Let Tracker schedule and finish the update naturally. Publish the trace
  // afterward; the step tells Playwright which interaction has completed.
  Tracker.afterFlush(() => {
    state.report.set(JSON.stringify({ step, renders: state.renders }));
  });
}

Template.eachStaleScenario.events({
  'click .each-switch': (event, instance) => act(instance, state => {
    state.generation.set(state.generation.get() === 'A' ? 'B' : 'A');
  }),
  'click .each-detail': (event, instance) => act(instance, state => {
    state.detail.set(state.detail.get() + 1);
  }),
});
