(() => {
  const tabs = [...document.querySelectorAll('[data-school-year]')];
  const panels = [...document.querySelectorAll('[data-school-year-panel]')];
  if (!tabs.length) return;
  function selectYear(year) {
    if (!tabs.some(tab => tab.dataset.schoolYear === year)) year = '2026-27';
    for (const tab of tabs) {
      const selected = tab.dataset.schoolYear === year;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.schoolYearPanel !== year;
    const nextYear = year === '2027-28';
    const explore = document.querySelector('.opening-copy .solid-link');
    if (explore) explore.href = nextYear ? '#next-monday' : '#build-your-week';
    for (const link of document.querySelectorAll('a[href*="a-la-carte.html"]')) {
      const day = link.hash.slice(1).replace('next-', '');
      if (!['monday', 'tuesday', 'thursday', 'friday'].includes(day)) continue;
      link.href = '/pages/a-la-carte.html?year=' + year + '#' + (nextYear ? 'next-' : '') + day;
      if (day === 'tuesday') link.textContent = nextYear ? 'Tuesday: Technology' : 'Tuesday: Science & Social Studies';
      if (day === 'thursday') link.textContent = nextYear ? 'Thursday: Academics' : 'Thursday: Life Skills';
    }
    const url = new URL(location.href);
    url.searchParams.set('year', year);
    history.replaceState(null, '', url);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectYear(tab.dataset.schoolYear));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].click();
      tabs[next].focus();
    });
  });
  const syncYear = () => selectYear(new URL(location.href).searchParams.get('year'));
  window.addEventListener('popstate', syncYear);
  syncYear();
})();

(() => {
  const carousel = document.querySelector('.next-day-carousel');
  if (!carousel) return;
  const tabs = [...document.querySelectorAll('[data-next-day]')];
  const cards = [...carousel.querySelectorAll('.next-year-day')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function markSelected(index) {
    tabs.forEach((tab, position) => {
      tab.setAttribute('aria-selected', String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
    });
  }
  function showDay(index) {
    const card = cards[index];
    markSelected(index);
    carousel.scrollTo({left: card.offsetLeft - cards[0].offsetLeft, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
    tabs[index].scrollIntoView({block:'nearest', inline:'nearest', behavior:'instant'});
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showDay(index));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      showDay(next);
      tabs[next].focus({preventScroll:true});
    });
  });
  carousel.addEventListener('scroll', () => {
    const first = cards[0].offsetLeft;
    const distances = cards.map(card => Math.abs(card.offsetLeft - first - carousel.scrollLeft));
    markSelected(distances.indexOf(Math.min(...distances)));
  }, {passive:true});
  function followAnchor() {
    const index = cards.findIndex(card => '#' + card.id === location.hash);
    if (index >= 0) showDay(index);
  }
  window.addEventListener('hashchange', followAnchor);
  document.querySelector('[data-school-year="2027-28"]').addEventListener('click', followAnchor);
  followAnchor();
})();
