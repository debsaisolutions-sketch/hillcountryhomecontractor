/* TradeDeskPro first-touch/UTM capture */
(function () {
  if (typeof document === 'undefined') return;
  if (window.__tdpLeadAttribution) return;
  var s = document.createElement('script');
  s.src = 'https://www.tradedeskpro.com/js/tdp-lead-attribution.js';
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
})();

/**
 * Quote / contact form → TradeDeskPro /api/leads
 * Source is the host the visitor is actually on
 * (hillcountryhomecontractor.com or txhillcountrycontractor.com).
 * No intake secret belongs in this file.
 */
(function () {
  var API_URL = 'https://www.tradedeskpro.com/api/leads';
  var PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
  var SITE_PHONE = '(830) 359-4563';
  var MIN_FILL_MS = 3000;
  var SUCCESS_MSG =
    "Request received. We'll contact you within 1 hour during business hours.";
  var ERROR_MSG =
    "We couldn't send that request. Please call " +
    SITE_PHONE +
    " and we'll help you right away.";
  var RATE_MSG =
    "We're getting a lot of requests right now. Please call " +
    SITE_PHONE +
    " and we'll help you right away.";
  var loadedAt = Date.now();

  function pageHost() {
    try {
      return (window.location && window.location.hostname) || '';
    } catch (e) {
      return '';
    }
  }

  function fieldValue(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el || typeof el.value !== 'string') return '';
    return el.value.trim();
  }

  function attribution() {
    try {
      if (typeof window.tdpLeadAttribution === 'function') {
        return window.tdpLeadAttribution() || {};
      }
    } catch (e) {}
    return {};
  }

  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch (e) {
      return '';
    }
  }

  function buildMessage(parts) {
    var lines = [];
    if (parts.service) lines.push('Service: ' + parts.service);
    if (parts.area) lines.push('Area: ' + parts.area);
    if (parts.details) lines.push(parts.details);
    return lines.join('\n');
  }

  function buildPayload(form) {
    var message = fieldValue(form, 'message');
    var details = fieldValue(form, 'details');
    var folded = [message, details].filter(Boolean).join('\n');
    var extra = attribution();
    var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    var body = {
      name: fieldValue(form, 'name'),
      phone: fieldValue(form, 'phone'),
      email: fieldValue(form, 'email'),
      message: buildMessage({
        service: fieldValue(form, 'service'),
        area: fieldValue(form, 'area'),
        details: folded,
      }),
      source: pageHost() || 'hillcountryhomecontractor.com',
      profile_id: PROFILE_ID,
      landing_url: window.location.href,
    };
    if (extra.first_touch_url) body.first_touch_url = extra.first_touch_url;
    if (document.referrer) body.referrer = document.referrer;
    for (var i = 0; i < utmKeys.length; i++) {
      var key = utmKeys[i];
      var value = queryParam(key) || extra[key] || '';
      if (value) body[key] = value;
    }
    return body;
  }

  function statusEl() {
    var el = document.getElementById('form-status');
    if (el) return el;
    el = document.createElement('p');
    el.id = 'form-status';
    el.className = 'form-status';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    var form = document.querySelector('form');
    if (form && form.parentNode) form.parentNode.insertBefore(el, form.nextSibling);
    return el;
  }

  function showStatus(kind, text) {
    var el = statusEl();
    if (!el) return;
    el.className = 'form-status form-status--' + kind;
    el.textContent = text;
    el.style.display = 'block';
    if (typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
    }
  }

  function findSubmitButton(form) {
    var buttons = form.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var type = (buttons[i].getAttribute('type') || 'submit').toLowerCase();
      if (type === 'submit') return buttons[i];
    }
    return null;
  }

  function wireForm(form) {
    if (!form || form.dataset.leadsWired === '1') return;
    form.dataset.leadsWired = '1';
    form.removeAttribute('action');
    form.setAttribute('method', 'post');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var honeypot = fieldValue(form, 'company_website');
      if (honeypot || Date.now() - loadedAt < MIN_FILL_MS) {
        showStatus('ok', SUCCESS_MSG);
        return;
      }

      var payload = buildPayload(form);
      if (!payload.name || !payload.phone) {
        showStatus('err', ERROR_MSG);
        return;
      }

      var btn = findSubmitButton(form);
      var original = btn ? btn.textContent : '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending...';
      }

      window
        .fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        .then(function (res) {
          if (res.ok) {
            showStatus('ok', SUCCESS_MSG);
            form.reset();
            return;
          }
          showStatus('err', res.status === 429 ? RATE_MSG : ERROR_MSG);
        })
        .catch(function () {
          showStatus('err', ERROR_MSG);
        })
        .then(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = original;
          }
        });
    });
  }

  function init() {
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) wireForm(forms[i]);
  }

  window.TdpLeads = {
    API_URL: API_URL,
    PROFILE_ID: PROFILE_ID,
    SITE_PHONE: SITE_PHONE,
    buildMessage: buildMessage,
    buildPayload: buildPayload,
    wireForm: wireForm,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
