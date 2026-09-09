(function () {
  'use strict';
  const hub = document.getElementById('fieldtrip-hub');
  if (!hub) return;
  const familyButtons = Array.from(hub.querySelectorAll('[data-family]'));
  const topicButtons = Array.from(hub.querySelectorAll('[data-topic]'));
  const topicPanels = Array.from(hub.querySelectorAll('[data-topic-panel]'));
  const topicList = hub.querySelector('[data-topic-tabs]');
  const nextRow = hub.querySelector('.trip-topic-next');
  const nextButton = hub.querySelector('[data-topic-next]');
  const overviewButton = hub.querySelector('[data-topic-overview]');
  let family = 'full-time';
  let topic = 'overview';
  hub.querySelector('[data-trip-tabs]').setAttribute('role', 'group');
  topicList.setAttribute('role', 'tablist');
  const compact = matchMedia('(max-width:720px)');
  function orientation() { topicList.setAttribute('aria-orientation', compact.matches ? 'horizontal' : 'vertical'); }
  orientation(); compact.addEventListener('change', orientation);
  topicButtons.forEach(function (button) {
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'topic-' + button.dataset.topic);
  });
  topicPanels.forEach(function (panel) {
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
  });
  function available() { return topicButtons.filter(button => button.dataset.audience === 'shared' || button.dataset.audience === family); }
  function render(nextFamily, nextTopic, updateHash) {
    family = nextFamily;
    const choices = available();
    topic = choices.some(button => button.dataset.topic === nextTopic) ? nextTopic : (family === 'homeschool' ? 'homeschool-details' : 'full-time-details');
    familyButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.family === family)));
    hub.querySelectorAll('[data-audience]').forEach(element => {element.hidden = element.dataset.audience !== 'shared' && element.dataset.audience !== family;});
    topicButtons.forEach(function (button) {
      const active = button.dataset.topic === topic;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    topicPanels.forEach(panel => {panel.hidden = panel.dataset.topicPanel !== topic;});
    const index = choices.findIndex(button => button.dataset.topic === topic);
    const next = choices[index + 1];
    nextRow.hidden = !next && topic === 'overview';
    nextButton.hidden = !next;
    overviewButton.hidden = topic === 'overview';
    if (next) {nextButton.textContent = 'Next: ' + next.querySelector('[data-topic-label]').textContent + ' →'; nextButton.dataset.next = next.dataset.topic;}
    if (updateHash) history.replaceState(null, '', '#' + family + '/' + topic);
  }
  function fromHash() {
    const hash = location.hash.slice(1);
    const parts = hash.split('/');
    if (parts[0] === 'full-time' || parts[0] === 'homeschool') {
      render(parts[0], parts[1] || (parts[0] === 'homeschool' ? 'homeschool-details' : 'overview'), false);
    } else render('full-time', topicButtons.some(button => button.dataset.topic === hash) ? hash : 'overview', false);
  }
  familyButtons.forEach(button => button.addEventListener('click', function () {
    render(button.dataset.family, 'overview', true);
  }));
  topicButtons.forEach(button => {
    button.addEventListener('click', function () {render(family, button.dataset.topic, true);});
    button.addEventListener('keydown', function (event) {
      const choices = available(), index = choices.indexOf(button);
      let target;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = choices[(index + 1) % choices.length];
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = choices[(index + choices.length - 1) % choices.length];
      if (event.key === 'Home') target = choices[0];
      if (event.key === 'End') target = choices[choices.length - 1];
      if (target) {event.preventDefault(); target.click(); target.focus();}
    });
  });
  nextButton.addEventListener('click', function () {
    render(family, nextButton.dataset.next, true);
    document.getElementById('topic-' + topic).focus();
  });
  overviewButton.addEventListener('click', function () {
    render(family, 'overview', true);
    document.getElementById('topic-overview').focus();
  });
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
