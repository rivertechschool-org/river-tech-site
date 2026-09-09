/* Hidden Acres. The existing endpoint also serves the lunch waiver. */
(function () {
  'use strict';
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwhK9l0Ve9IVj9GU4F0BttzPtPD52tMxWNIBs2EUIf5Xg8prXlOQ8UD2Bon74K2aOtH/exec';
  const TRIP_ID = 'hidden-acres-2026-09-16';
  const PRICE = 10;
  const preview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const form = document.getElementById('reg-form');
  const list = document.getElementById('participant-list');
  const submit = document.getElementById('reg-submit');
  let counter = 0, inFlight = false, retryKey = '', retryBody = '';
  document.getElementById('preview-notice').hidden = !preview;
  document.getElementById('checkout-cancelled').hidden = new URLSearchParams(location.search).get('cancelled') !== '1';
  document.getElementById('sig-date-display').textContent = new Date().toLocaleDateString('en-US', {timeZone:'America/Los_Angeles',year:'numeric',month:'long',day:'numeric'});
  function updateTotal() {
    const count = list.children.length;
    document.getElementById('total-amount').textContent = '$' + count * PRICE;
    document.getElementById('total-breakdown').textContent = count + ' student' + (count === 1 ? '' : 's') + ' × $10';
    if (!inFlight) submit.textContent = 'Continue to payment · $' + count * PRICE + ' ↗';
    Array.from(list.children).forEach(function(card, index) {
      card.querySelector('.pc-title').textContent = 'Student ' + (index + 1);
      const remove = card.querySelector('.pc-remove');
      remove.hidden = count === 1;
      remove.setAttribute('aria-label', 'Remove student ' + (index + 1));
    });
  }
  function addStudent() {
    counter += 1;
    const prefix = 'student-' + counter;
    const card = document.createElement('fieldset');
    card.className = 'participant-card';
    card.innerHTML = '<legend class="sr-only">Student '+counter+'</legend><div class="pc-header"><span class="pc-title"></span><button type="button" class="pc-remove">Remove</button></div>' +
      '<div class="reg-row-grid-2"><div><label class="reg-label" for="'+prefix+'-first">Student first name<span class="req">*</span></label><input class="reg-input" id="'+prefix+'-first" data-field="firstName" required autocomplete="off" maxlength="100"></div>' +
      '<div><label class="reg-label" for="'+prefix+'-last">Student last name<span class="req">*</span></label><input class="reg-input" id="'+prefix+'-last" data-field="lastName" required autocomplete="off" maxlength="100"></div></div>' +
      '<div><label class="reg-label" for="'+prefix+'-age">Age<span class="req">*</span></label><input class="reg-input" id="'+prefix+'-age" data-field="age" type="number" min="1" max="99" step="1" inputmode="numeric" required></div>';
    card.querySelector('.pc-remove').addEventListener('click', function() {
      if (list.children.length > 1) {card.remove(); updateTotal(); document.getElementById('add-participant').focus();}
    });
    list.appendChild(card); updateTotal(); return card;
  }
  document.getElementById('add-participant').addEventListener('click', function() { addStudent().querySelector('input').focus(); });
  addStudent();
  function showError(message) {
    const box = document.getElementById('reg-error');
    box.textContent = message; box.hidden = false; box.focus();
  }
  function value(name) { return form.elements.namedItem(name).value.trim(); }
  function buildPayload() {
    return {
      trip:{id:TRIP_ID,name:'Hidden Acres Farm',date:'2026-09-16',deadline:'2026-09-13',pricePerPersonUSD:PRICE},
      familyType:'full-time',
      parent:{firstName:value('parentFirstName'),lastName:value('parentLastName'),email:value('parentEmail'),phone:value('parentPhone')},
      participants:Array.from(list.children).map(function(card) {
        const field = function(name) {return card.querySelector('[data-field="'+name+'"]').value.trim();};
        return {firstName:field('firstName'),lastName:field('lastName'),age:field('age'),type:'student',transport:'bus-both',priceUSD:PRICE};
      }),
      acknowledgments:{scheduleRead:form.elements.namedItem('ackSchedule').checked},
      release:{agreed:form.elements.namedItem('releaseAgree').checked,signatureName:value('signatureName'),signatureDate:new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'})}
    };
  }
  async function readJSON(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('connection');
    return response.json();
  }
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
        // Only a fingerprint and a random key are stored, never family details.
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableBody));
        const hash = Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('');
        try {
          const saved = JSON.parse(sessionStorage.getItem(TRIP_ID) || 'null');
          retryKey = saved && saved.hash === hash ? saved.key : crypto.randomUUID();
          sessionStorage.setItem(TRIP_ID, JSON.stringify({hash:hash,key:retryKey}));
        } catch (_) {retryKey = crypto.randomUUID();}
      }
      payload.requestId = retryKey;
      // Fail closed until the new trip and price are available in the deployment.
      const config = await readJSON(BACKEND_URL + '?action=hiddenAcresConfig');
      if (config.mode !== 'live' || !config.ok || config.tripId !== TRIP_ID || config.priceUSD !== PRICE || !config.ready) {
        showError('Hidden Acres registration is not open yet. Please try again shortly or contact Mary.'); return;
      }
      const result = await readJSON(BACKEND_URL, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
      if (!result.ok) {showError(result.error || 'We could not save your registration. Please try again.');return;}
      if (!result.checkoutUrl) {showError('We could not open payment. Your registration is not complete. Please try again or contact Mary.');return;}
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('Invalid payment destination');
      location.assign(destination.href);
    } catch (_) {
      showError('We couldn’t confirm the connection. Your payment has not been confirmed. Please try again with the same details or contact Mary.');
    } finally {inFlight=false;submit.disabled=false;updateTotal();}
  });
})();
