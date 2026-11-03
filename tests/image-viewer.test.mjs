import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { imageViewerScript } from '../src/templates/image-viewer.ts';
import { layout } from '../src/templates/layout.ts';

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name) => classes.has(name) ? (classes.delete(name), false) : (classes.add(name), true),
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  set src(value) { this.setAttribute('src', value); }
  get src() { return this.getAttribute('src') || ''; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(name, listener) { (this.listeners[name] ??= []).push(listener); }
  emit(name, event = {}) { for (const fn of this.listeners[name] || []) fn({ target: this, ...event }); }
  focus() { this.focused = true; }
  closest() { return this.linked ? {} : null; }
}
class FakeDialog extends FakeElement {
  constructor() { super('dialog'); }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
}

function makeDocument() {
  const image = new FakeElement('img');
  image.src = 'https://example.test/photo.jpg';
  image.currentSrc = 'https://example.test/photo-large.jpg';
  image.alt = '示例 <img onerror=alert(1)>';
  const linked = new FakeElement('img');
  linked.src = 'https://example.test/linked.jpg';
  linked.linked = true;
  const article = { querySelectorAll: () => [image, linked] };
  const body = new FakeElement('body');
  const document = {
    body,
    querySelector(selector) { return selector === '.article .content' ? article : null; },
    createElement(tag) { return tag === 'dialog' ? new FakeDialog() : new FakeElement(tag); },
  };
  return { document, image, linked, body };
}

test('image preview opens responsive source, supports keyboard and restores focus', () => {
  const { document, image, linked, body } = makeDocument();
  runInNewContext(imageViewerScript, { document, HTMLDialogElement: FakeDialog });
  assert.equal(image.getAttribute('role'), 'button');
  assert.equal(image.getAttribute('tabindex'), '0');
  assert.equal(linked.getAttribute('role'), null);
  assert.equal(linked.listeners.click, undefined);
  const dialog = body.children[0];
  const [bar, stage] = dialog.children;
  const [size, close] = bar.children;
  const preview = stage.children[0];
  let prevented = false;
  image.emit('keydown', { key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(dialog.open, true);
  assert.equal(preview.src, image.currentSrc);
  assert.equal(preview.alt, image.alt);
  assert.equal(close.focused, true);
  size.emit('click');
  assert.equal(stage.classList.contains('is-original'), true);
  assert.equal(size.getAttribute('aria-pressed'), 'true');
  close.emit('click');
  assert.equal(dialog.open, false);
  assert.equal(image.focused, true);
  assert.equal(stage.classList.contains('is-original'), false);
  assert.equal(preview.getAttribute('src'), null);
  image.emit('click');
  stage.emit('click');
  assert.equal(dialog.open, false);
});

test('unsupported dialog browsers keep original images and linked behavior', () => {
  const { document, image, linked, body } = makeDocument();
  runInNewContext(imageViewerScript, { document });
  assert.equal(body.children.length, 0);
  assert.equal(image.getAttribute('tabindex'), null);
  assert.equal(image.listeners.click, undefined);
  assert.equal(linked.listeners.click, undefined);
  const markup = layout('title', '<article class="article"><div class="content"><img src="/a.png"></div></article>');
  assert.match(markup, /<img src="\/a.png">/);
  assert.match(markup, /image-viewer-stage/);
});
