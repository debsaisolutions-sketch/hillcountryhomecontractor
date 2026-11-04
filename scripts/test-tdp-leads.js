#!/usr/bin/env node
/**
 * Local test for js/tdp-leads.js. Fetch is mocked. Never calls TradeDeskPro.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'js', 'tdp-leads.js'), 'utf8');
const PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
const API_URL = 'https://www.tradedeskpro.com/api/leads';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function linkSiblings(parent) {
  const kids = parent.children || [];
  for (let i = 0; i < kids.length; i++) {
    kids[i].nextSibling = kids[i + 1] || null;
    kids[i].parentNode = parent;
  }
}

function makeDocument() {
  function walk(node, fn) {
    fn(node);
    for (const child of node.children || []) walk(child, fn);
  }

  function matches(el, sel) {
    if (sel === 'form') return el.tagName === 'FORM';
    if (sel === 'button') return el.tagName === 'BUTTON';
    const named = /^\[name="([^"]+)"\]$/.exec(sel);
    if (named) return el.getAttribute('name') === named[1];
    const id = /^#([\w-]+)$/.exec(sel);
    if (id) return el.id === id[1];
    return false;
  }

  function queryAll(root, sel) {
    const found = [];
    walk(root, (node) => {
      if (node !== root && matches(node, sel)) found.push(node);
    });
    return found;
  }

  function createEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      attributes: {},
      style: {},
      dataset: {},
      className: '',
      textContent: '',
      value: '',
      disabled: false,
      id: '',
      parentNode: null,
      nextSibling: null,
      listeners: {},
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      addEventListener(type, fn) {
        (this.listeners[type] || (this.listeners[type] = [])).push(fn);
      },
      appendChild(child) {
        this.children.push(child);
        linkSiblings(this);
        return child;
      },
      insertBefore(child, ref) {
        const i = this.children.indexOf(ref);
        if (i === -1) this.children.push(child);
        else this.children.splice(i, 0, child);
        linkSiblings(this);
        return child;
      },
      querySelector(sel) {
        return queryAll(this, sel)[0] || null;
      },
      querySelectorAll(sel) {
        return queryAll(this, sel);
      },
      reset() {
        walk(this, (node) => {
          if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') {
            node.value = '';
          }
        });
      },
    };
    return el;
  }

  const document = createEl('#document');
  document.createElement = createEl;
  document.head = createEl('head');
  document.body = createEl('body');
  document.documentElement = createEl('html');
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);
  document.children = [document.documentElement];
  document.readyState = 'complete';
  document.referrer = '';
  document.getElementById = (id) => queryAll(document, '#' + id)[0] || null;
  document.querySelector = (sel) => queryAll(document, sel)[0] || null;
  document.querySelectorAll = (sel) => queryAll(document, sel);
  return document;
}

function addField(form, tag, name, value) {
  const el = form.owner.createElement(tag);
  el.setAttribute('name', name);
  el.value = value || '';
  form.appendChild(el);
  return el;
}

function buildForm(document, values) {
  const section = document.createElement('section');
  const form = document.createElement('form');
  form.owner = document;
  form.setAttribute('action', 'https://example.invalid/should-be-removed');
  form.setAttribute('method', 'POST');
  addField(form, 'input', 'name', values.name);
  addField(form, 'input', 'email', values.email);
  addField(form, 'input', 'phone', values.phone);
  addField(form, 'select', 'service', values.service);
  addField(form, 'input', 'area', values.area);
  addField(form, 'textarea', 'message', values.message);
  addField(form, 'input', 'company_website', values.company_website || '');
  const button = document.createElement('button');
  button.setAttribute('type', 'submit');
  button.textContent = 'Request Free Estimate';
  form.appendChild(button);
  const status = document.createElement('p');
  status.setAttribute('id', 'form-status');
  section.appendChild(form);
  section.appendChild(status);
  document.body.appendChild(section);
  return { form, button, status };
}

async function load(options) {
  const document = makeDocument();
  const calls = [];
  const fetchImpl =
    options.fetch ||
    (async () => ({
      ok: true,
      status: 201,
      json: async () => ({ inbox_id: 'local' }),
      text: async () => '',
    }));
  const window = {
    document,
    location: options.location,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return fetchImpl(url, init);
    },
    tdpLeadAttribution: options.attribution,
  };
  window.window = window;
  const { form, button, status } = buildForm(document, options.values);
  const sandbox = {
    window,
    document,
    location: window.location,
    URLSearchParams,
    Date,
    JSON,
    Promise,
    console,
    Array,
    Object,
    String,
    Number,
    Error,
    RegExp,
    parseInt,
    fetch: (...args) => window.fetch(...args),
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: 'js/tdp-leads.js' });
  return { window, document, form, button, status, calls };
}

async function submit(form) {
  const handlers = (form.listeners.submit || []).slice();
  assert(handlers.length === 1, 'form should have one submit handler');
  const event = { preventDefault() { event.defaultPrevented = true; }, defaultPrevented: false };
  handlers[0](event);
  assert(event.defaultPrevented, 'submit should be cancelled');
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function payloadOf(call) {
  assert(call, 'expected a fetch call');
  assert(call.url === API_URL, 'posted to ' + call.url);
  assert(call.init.method === 'POST', 'method');
  assert(call.init.headers['Content-Type'] === 'application/json', 'content type');
  const headerBlob = JSON.stringify(call.init.headers).toLowerCase();
  assert(!headerBlob.includes('secret'), 'request must not send an intake secret');
  return JSON.parse(call.init.body);
}

const realNow = Date.now;
let clock = 1_700_000_000_000;

async function main() {
  Date.now = () => clock;
  try {
    clock = 1_700_000_000_000;
    const happy = await load({
      location: {
        hostname: 'txhillcountrycontractor.com',
        href: 'https://txhillcountrycontractor.com/?utm_source=test&utm_medium=cpc',
        search: '?utm_source=test&utm_medium=cpc',
      },
      attribution() {
        return {
          landing_url: 'https://txhillcountrycontractor.com/ignored',
          first_touch_url: 'https://txhillcountrycontractor.com/?utm_campaign=spring',
          utm_campaign: 'spring',
          utm_source: 'should-not-override-query',
        };
      },
      values: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '830-359-0199',
        service: 'Kitchen Remodeling',
        area: 'Kerrville',
        message: 'Need new cabinets and a layout change.',
      },
    });
    assert(!happy.form.getAttribute('action'), 'action attribute removed');
    clock += 4000;
    await submit(happy.form);
    assert(happy.calls.length === 1, 'one post');
    const body = payloadOf(happy.calls[0]);
    assert(body.name === 'Ada Lovelace', 'name');
    assert(body.phone === '830-359-0199', 'phone');
    assert(body.email === 'ada@example.com', 'email');
    assert(body.profile_id === PROFILE_ID, 'profile');
    assert(body.source === 'txhillcountrycontractor.com', 'source uses the page host');
    assert(body.landing_url === 'https://txhillcountrycontractor.com/?utm_source=test&utm_medium=cpc', 'landing_url');
    assert(body.first_touch_url === 'https://txhillcountrycontractor.com/?utm_campaign=spring', 'first touch');
    assert(body.utm_source === 'test', 'query utm wins');
    assert(body.utm_medium === 'cpc', 'utm medium');
    assert(body.utm_campaign === 'spring', 'attribution utm filled in');
    assert(
      body.message ===
        'Service: Kitchen Remodeling\nArea: Kerrville\nNeed new cabinets and a layout change.',
      'message fold: ' + body.message
    );
    assert(!Object.prototype.hasOwnProperty.call(body, 'company_website'), 'honeypot not posted');
    assert(happy.status.textContent.includes('Request received'), 'success copy');
    assert(happy.button.disabled === false, 'button re-enabled');
    assert(happy.button.textContent === 'Request Free Estimate', 'button label restored');
    assert(happy.form.querySelector('[name="name"]').value === '', 'form reset');

    async function expectStatus(status, includes) {
      clock = 1_700_000_000_000;
      const page = await load({
        location: {
          hostname: 'hillcountryhomecontractor.com',
          href: 'https://hillcountryhomecontractor.com/',
          search: '',
        },
        fetch: async () => ({ ok: status >= 200 && status < 300, status, text: async () => '' }),
        values: { name: 'Grace', email: 'g@example.com', phone: '8303594563', message: 'Bath fan' },
      });
      clock += 5000;
      await submit(page.form);
      assert(page.calls.length === 1, 'status ' + status + ' still posts');
      assert(page.status.textContent.includes(includes), status + ' copy: ' + page.status.textContent);
      assert(page.status.className.includes(status >= 200 && status < 300 ? 'ok' : 'err'), 'status class');
    }

    await expectStatus(201, 'Request received');
    await expectStatus(202, 'Request received');
    await expectStatus(403, '(830) 359-4563');
    await expectStatus(429, 'a lot of requests');
    await expectStatus(500, '(830) 359-4563');

    clock = 1_700_000_000_000;
    const offline = await load({
      location: {
        hostname: 'hillcountryhomecontractor.com',
        href: 'https://hillcountryhomecontractor.com/',
        search: '',
      },
      fetch: async () => {
        throw new Error('offline');
      },
      values: { name: 'Grace', email: 'g@example.com', phone: '8303594563', message: 'Door' },
    });
    clock += 5000;
    await submit(offline.form);
    assert(offline.status.textContent.includes('(830) 359-4563'), 'network error offers the phone');
    assert(offline.button.disabled === false, 'button restored after network error');

    clock = 1_700_000_000_000;
    const spam = await load({
      location: {
        hostname: 'hillcountryhomecontractor.com',
        href: 'https://hillcountryhomecontractor.com/',
        search: '',
      },
      values: {
        name: 'Bot',
        email: 'bot@example.com',
        phone: '8303594563',
        message: 'spam',
        company_website: 'https://spam.example',
      },
    });
    clock += 10000;
    await submit(spam.form);
    assert(spam.calls.length === 0, 'honeypot must not post');
    assert(spam.status.textContent.includes('Request received'), 'honeypot looks like success');

    clock = 1_700_000_000_000;
    const fast = await load({
      location: {
        hostname: 'www.hillcountryhomecontractor.com',
        href: 'https://www.hillcountryhomecontractor.com/',
        search: '',
      },
      values: { name: 'Speedy', email: 's@example.com', phone: '8303594563', message: 'Too fast' },
    });
    clock += 2999;
    await submit(fast.form);
    assert(fast.calls.length === 0, 'submit under 3s must not post');
    assert(fast.status.textContent.includes('Request received'), 'fast submit looks like success');

    clock += 2;
    await submit(fast.form);
    assert(fast.calls.length === 1, 'submit after 3s posts');
    assert(payloadOf(fast.calls[0]).source === 'www.hillcountryhomecontractor.com', 'www host kept');

    console.log('tdp-leads mocked fetch tests passed');
  } finally {
    Date.now = realNow;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
