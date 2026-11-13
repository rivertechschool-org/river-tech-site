(()=>{
 const $=s=>document.querySelector(s);
 const query=$('#answer-filter');if(query){const rows=[...document.querySelectorAll('.answer-library .answer')];const run=()=>{const q=query.value.trim().toLowerCase();let count=0;rows.forEach(r=>{r.hidden=!r.textContent.toLowerCase().includes(q);if(!r.hidden)count++});$('#answer-count').textContent=count+' answer'+(count===1?'':'s');$('#answer-empty').hidden=count>0};query.addEventListener('input',run);run()}
 const data = $('#tuition-data');
 if (data) {
   const currentRates = JSON.parse(data.textContent);
   const nextRates = JSON.parse($('#tuition-next-year-data').textContent);
   const years = $('#tuition-years');
   const attendance = $('#tuition-attendance');
   const payment = $('#tuition-payment');
   const paymentNote = $('#tuition-payment-note');
   const guide = $('#tuition-guide');
   const table = $('#tuition-rate-table table');
   const format = amount => '$' + amount.toLocaleString('en-US', {
     minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
     maximumFractionDigits: 2,
   });
   const schedule = [
     {payments: 12, unit: 'month'},
     {payments: 4, unit: 'quarter'},
     {payments: 1, unit: 'year'},
     {payments: 11, unit: 'month'},
   ];
   const monthlyOption = payment.querySelector('[value="0"]');
   const elevenPayments = new Option('Monthly · 11 payments', '3');
   monthlyOption.after(elevenPayments);
   let rates = currentRates;

   function updateQuote() {
     const program = rates[attendance.value];
     const option = Number(payment.value);
     const {payments, unit} = schedule[option];
     const total = option === 3 ? program.rates[0] * 12 : program.rates[option] * payments;
     const totalCents = total * 100;
     const installment = Math.round(totalCents / payments);
     const lastInstallment = totalCents - installment * (payments - 1);
     $('#tuition-name').textContent = program.name;
     $('#tuition-amount').textContent = format(installment / 100);
     $('#tuition-frequency').textContent = 'per ' + unit;
     const paymentCount = payments === 1 ? '1 payment' : payments + ' payments';
     const lastPayment = lastInstallment === installment ? '' : ' (last payment ' + format(lastInstallment / 100) + ')';
     $('#tuition-total').textContent = format(total) + ' full-year tuition · ' + paymentCount + lastPayment;
   }

   function updateYear() {
     const next = years.querySelector('input:checked').value === '2027-28';
     const year = next ? '2027–28' : '2026–27';
     rates = next ? nextRates : currentRates;
     $('#tuition-year-heading').textContent = year;
     elevenPayments.hidden = !next;
     elevenPayments.disabled = !next;
     if (!next && payment.value === '3') payment.value = '0';
     paymentNote.textContent = next
       ? 'The rate guide shows 12 monthly payments. An 11-payment schedule splits the same yearly tuition over fewer payments.'
       : 'Monthly payments run July–June. Checks are accepted for quarterly and annual plans.';
     const guidePath = '/assets/images/tuition-fulltime-' + (next ? '2027-28' : '2026-27') + '.png';
     guide.querySelectorAll('a').forEach(link => { link.href = guidePath; });
     const image = guide.querySelector('img');
     image.alt = year + ' tuition comparison for all six attendance plans. Rates are also in the calculator and table.';
     if (image.getAttribute('src') !== guidePath) image.src = guidePath;
     table.caption.textContent = 'Published ' + year + ' tuition per student';
     for (const [index, row] of Array.from(table.tBodies[0].rows).entries()) {
       rates[index].rates.forEach((rate, column) => { row.cells[column + 1].textContent = format(rate); });
     }
     $('#tuition-fee-year').hidden = !next;
     $('#tuition-siblings-current').hidden = next;
     $('#tuition-siblings-next').hidden = !next;
     updateQuote();
   }

   years.addEventListener('change', updateYear);
   attendance.addEventListener('change', updateQuote);
   payment.addEventListener('change', updateQuote);
   updateYear();
   years.hidden = false;
 }
 const switchTab=b=>{const list=b.closest('[role=tablist]');list.querySelectorAll('[role=tab]').forEach(t=>{const active=t===b;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!active})};
 document.querySelectorAll('.explorer-tabs [role=tab]').forEach(b=>{b.addEventListener('click',()=>switchTab(b));b.addEventListener('keydown',e=>{const all=[...b.parentElement.children];let i=all.indexOf(b);if(e.key==='ArrowRight')i=(i+1)%all.length;else if(e.key==='ArrowLeft')i=(i+all.length-1)%all.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=all.length-1;else return;e.preventDefault();switchTab(all[i]);all[i].focus()})});
 // Keep wide data inside its own scroll region on phones.
 document.querySelectorAll('.source-content table,.reading-width table').forEach(t=>{if(!t.parentElement.classList.contains('data-scroll')&&!t.closest('.schedule-table-wrap')){const wrap=document.createElement('div');wrap.className='data-scroll';t.before(wrap);wrap.append(t)}});
 document.querySelectorAll('iframe').forEach(f=>{if(!f.title)f.title='River Tech video';if(!f.loading)f.loading='lazy'});
})();
(()=>{const buttons=[...document.querySelectorAll('[data-week-day]')],result=document.querySelector('#week-result');if(!result)return;buttons.forEach(b=>b.addEventListener('click',()=>{const selected=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(selected));b.querySelector('b').textContent=selected?'✓':'+';const days=buttons.filter(x=>x.getAttribute('aria-pressed')==='true');result.replaceChildren();if(!days.length){result.textContent='Select one or more days above.';return}const price=document.createElement('strong');price.textContent='$'+[0,365,690,960,1199][days.length].toLocaleString('en-US')+' / quarter';const description=document.createElement('p');description.textContent=days.length+'-day homeschool plan · Per student';result.append(price,description);days.forEach(d=>{const a=document.createElement('a');a.href=d.dataset.weekLink;a.textContent=d.dataset.weekDay+': '+d.dataset.weekTitle+' ↗';result.append(a)});const note=document.createElement('small');note.textContent='Tuition only. Fees and sibling discounts are on the tuition page. Openings are filled from the free wait pool.';result.append(note)}))})();
