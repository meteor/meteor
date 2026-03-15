// Demo: DOM testing with happy-dom + node:test
//
// This demonstrates that browser-dependent tests can run server-side
// using happy-dom as a lightweight DOM implementation — no Puppeteer,
// no browser, no headless Chrome needed.
//
// Run with:
//   meteor test-packages meteor-test --driver-package meteor-test --once

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

describe('DOM (happy-dom)', () => {
  let window, document;

  before(() => {
    window = new Window({ url: 'http://localhost:3000' });
    document = window.document;
    // Expose globals like a browser would
    globalThis.window = window;
    globalThis.document = document;
  });

  after(() => {
    window.close();
    delete globalThis.window;
    delete globalThis.document;
  });

  it('creates and appends elements', () => {
    const div = document.createElement('div');
    div.id = 'test-container';
    document.body.appendChild(div);

    assert.ok(document.getElementById('test-container'));
    assert.strictEqual(div.parentNode, document.body);
  });

  it('handles innerHTML', () => {
    const ul = document.createElement('ul');
    ul.innerHTML = '<li>one</li><li>two</li><li>three</li>';

    assert.strictEqual(ul.children.length, 3);
    assert.strictEqual(ul.children[0].textContent, 'one');
    assert.strictEqual(ul.children[2].textContent, 'three');
  });

  it('spreads NodeList (like ecmascript runtime-client-tests)', () => {
    const div = document.createElement('div');
    for (let i = 0; i < 5; i++) {
      const child = document.createElement('span');
      child.textContent = `child ${i}`;
      div.appendChild(child);
    }

    const arr = [...div.childNodes];
    assert.strictEqual(arr.length, 5);
    arr.forEach((el, i) => {
      assert.strictEqual(el.textContent, `child ${i}`);
    });
  });

  it('handles CSS classes', () => {
    const el = document.createElement('div');
    el.classList.add('active', 'visible');

    assert.ok(el.classList.contains('active'));
    assert.ok(el.classList.contains('visible'));
    assert.strictEqual(el.className, 'active visible');

    el.classList.remove('active');
    assert.ok(!el.classList.contains('active'));
  });

  it('handles event listeners', () => {
    const button = document.createElement('button');
    let clicked = false;

    button.addEventListener('click', () => { clicked = true; });
    button.click();

    assert.ok(clicked);
  });

  it('handles querySelector', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="item" data-id="1">First</div>
      <div class="item" data-id="2">Second</div>
      <div class="item active" data-id="3">Third</div>
    `;

    const active = container.querySelector('.active');
    assert.ok(active);
    assert.strictEqual(active.dataset.id, '3');

    const items = container.querySelectorAll('.item');
    assert.strictEqual(items.length, 3);
  });

  it('handles form elements', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'hello';

    assert.strictEqual(input.value, 'hello');
    assert.strictEqual(input.type, 'text');
  });
});
