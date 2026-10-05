/* Pumpkin Patch: shared endpoint, trip-specific registration and payment. */
(function () {
  'use strict';
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwhK9l0Ve9IVj9GU4F0BttzPtPD52tMxWNIBs2EUIf5Xg8prXlOQ8UD2Bon74K2aOtH/exec';
  const TRIP_ID = 'pumpkin-patch-2026-10-07';
  const PRICE = 12;
  const preview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const form = document.getElementById('reg-form');
  const list = document.getElementById('participant-list');
  const submit = document.getElementById('reg-submit');
  let counter = 0, inFlight = false, retryKey = '', retryBody = '';
  document.getElementById('preview-notice').hidden = !preview;
  document.getElementById('checkout-cancelled').hidden = new URLSearchParams(location.search).get('cancelled') !== '1';
  function pacificDate() {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part = function(type) {return parts.find(item => item.type === type).value;};
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  document.getElementById('sig-date-display').textContent = new Date().toLocaleDateString('en-US', {timeZone:'America/Los_Angeles',year:'numeric',month:'long',day:'numeric'});
  function updateTotal() {
    const cards = Array.from(list.children), count = cards.length;
    document.getElementById('total-amount').textContent = '$' + count * PRICE;
    document.getElementById('total-breakdown').textContent = count + ' participant' + (count === 1 ? '' : 's') + ' × $' + PRICE;
    if (!inFlight) {submit.textContent = 'Continue to payment · $' + count * PRICE + ' ↗'; submit.disabled = false;}
    document.getElementById('add-participant').disabled = count >= 50;
    cards.forEach(function(card, index) {
      card.querySelector('.pc-title').textContent = 'Participant ' + (index + 1);
      card.querySelector('legend').textContent = 'Participant ' + (index + 1);
      const remove = card.querySelector('.pc-remove');
      remove.hidden = count === 1;
      remove.setAttribute('aria-label', 'Remove participant ' + (index + 1));
    });
    const fullTime = cards.some(card => card.querySelector('[data-field="type"]').value === 'student' && card.querySelector('[data-field="program"]').value === 'full-time');
    document.getElementById('full-time-transport-consent').hidden = !fullTime;
  }
  function addParticipant() {
    if (list.children.length >= 50) return null;
    counter += 1;
    const prefix = 'participant-' + counter;
    const card = document.createElement('fieldset');
    card.className = 'participant-card';
    card.innerHTML = '<legend class="sr-only">Participant '+counter+'</legend><div class="pc-header"><span class="pc-title"></span><button type="button" class="pc-remove">Remove</button></div>' +
      '<div class="reg-row-grid-2"><div><label class="reg-label" for="'+prefix+'-first">First name<span class="req">*</span></label><input class="reg-input" id="'+prefix+'-first" data-field="firstName" required autocomplete="off" maxlength="100"></div>' +
      '<div><label class="reg-label" for="'+prefix+'-last">Last name<span class="req">*</span></label><input class="reg-input" id="'+prefix+'-last" data-field="lastName" required autocomplete="off" maxlength="100"></div></div>' +
      '<div><label class="reg-label" for="'+prefix+'-type">Participant type<span class="req">*</span></label><select class="reg-select" id="'+prefix+'-type" data-field="type" required><option value="student">Student</option><option value="adult">Adult</option></select></div>' +
      '<div class="reg-row-grid-2" data-student-fields><div><label class="reg-label" for="'+prefix+'-program">Student program<span class="req">*</span></label><select class="reg-select" id="'+prefix+'-program" data-field="program" required><option value="">Choose a program</option><option value="full-time">Full-time</option><option value="homeschool">Part-time / homeschool</option></select></div>' +
      '<div><label class="reg-label" for="'+prefix+'-age">Student age<span class="req">*</span></label><input class="reg-input" id="'+prefix+'-age" data-field="age" type="number" min="1" max="99" step="1" inputmode="numeric" required></div></div>';
    card.querySelector('.pc-remove').addEventListener('click', function() {
      if (list.children.length > 1) {card.remove(); updateTotal(); document.getElementById('add-participant').focus();}
    });
    card.querySelector('[data-field="type"]').addEventListener('change', function() {
      const student = this.value === 'student';
      card.querySelector('[data-student-fields]').hidden = !student;
      ['program','age'].forEach(function(name) {
        const field = card.querySelector('[data-field="'+name+'"]');
        field.disabled = !student; field.required = student;
      });
      updateTotal();
    });
    card.querySelector('[data-field="program"]').addEventListener('change', updateTotal);
    list.appendChild(card); updateTotal(); return card;
  }
  document.getElementById('add-participant').addEventListener('click', function() {const card = addParticipant(); if (card) card.querySelector('input').focus();});
  addParticipant();
  function showError(message) {const box = document.getElementById('reg-error'); box.textContent = message; box.hidden = false; box.focus();}
  function value(name) {return form.elements.namedItem(name).value.trim();}
  function buildPayload() {
    return {
      action:'pumpkin_submit',
      trip:{id:TRIP_ID,name:'Pumpkin Patch at Hidden Acres Orchard',date:'2026-10-07',deadline:'2026-10-04',pricePerPersonUSD:PRICE},
      parent:{firstName:value('parentFirstName'),lastName:value('parentLastName'),email:value('parentEmail'),phone:value('parentPhone')},
      participants:Array.from(list.children).map(function(card) {
        const field = function(name) {return card.querySelector('[data-field="'+name+'"]').value.trim();};
        const student = field('type') === 'student';
        return {firstName:field('firstName'),lastName:field('lastName'),age:student ? field('age') : '',type:field('type'),program:student ? field('program') : '',priceUSD:PRICE};
      }),
      acknowledgments:{scheduleRead:form.elements.namedItem('ackSchedule').checked},
      release:{agreed:form.elements.namedItem('releaseAgree').checked,signatureName:value('signatureName'),signatureDate:pacificDate()}
    };
  }
  async function readJSON(url, options) {const response = await fetch(url, options); if (!response.ok) throw new Error('connection'); return response.json();}
  form.addEventListener('submit', async function(event) {
    event.preventDefault();
    if (inFlight) return;
    document.getElementById('reg-error').hidden = true;
    for (const input of form.querySelectorAll('input:not([type="checkbox"])')) input.value = input.value.trim();
    if (!form.reportValidity()) return;
    const payload = buildPayload();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.parent.email)) {showError('Please enter a valid email address.');return;}
    if (preview) {showError('Preview checked: the required fields are complete. No registration or payment has been sent.');return;}
    inFlight = true; submit.disabled = true; submit.textContent = 'Opening secure payment…';
    try {
      const stableBody = JSON.stringify(payload);
      if (stableBody !== retryBody) {
        retryBody = stableBody;
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableBody));
        const hash = Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('');
        try {
          const saved = JSON.parse(sessionStorage.getItem(TRIP_ID) || 'null');
          retryKey = saved && saved.hash === hash ? saved.key : crypto.randomUUID();
          sessionStorage.setItem(TRIP_ID, JSON.stringify({hash:hash,key:retryKey}));
        } catch (_) {retryKey = crypto.randomUUID();}
      }
      payload.requestId = retryKey;
      const config = await readJSON(BACKEND_URL + '?action=pumpkin_config');
      if (config.mode !== 'live' || !config.ok || config.tripId !== TRIP_ID || config.priceUSD !== PRICE || !config.ready) {
        showError('Pumpkin Patch registration is not open. Please contact Mary.'); return;
      }
      const result = await readJSON(BACKEND_URL, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
      if (!result.ok) {showError(result.error || 'We could not save your registration. Please try again.');return;}
      if (!result.checkoutUrl) {showError('We could not open payment. Your registration is not complete. Please try again or contact Mary.');return;}
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('Invalid payment destination');
      location.assign(destination.href);
    } catch (_) {showError('We couldn’t confirm the connection. Your payment has not been confirmed. Please try again with the same details or contact Mary.');}
    finally {inFlight=false;submit.disabled=false;updateTotal();}
  });
})();
