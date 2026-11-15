import {readEvents} from './ask-stream.js';

const guide = 'https://ask.rivertechschool.com';

document.body.insertAdjacentHTML('beforeend', `
<aside class="ask-dock" aria-label="Ask River Tech">
  <div class="ask-dock__inner">
    <section class="ask-dock__answer" id="ask-dock-answer" aria-label="Answer" hidden>
      <div class="ask-dock__answer-heading">
        <span>Ask River Tech · AI answer</span>
        <button type="button" id="ask-dock-close" aria-label="Close answer">×</button>
      </div>
      <div class="ask-dock__answer-body" tabindex="0" aria-label="Answer text">
        <p id="ask-dock-question"></p>
        <div id="ask-dock-copy"></div>
        <div id="ask-dock-sources" aria-label="School sources"></div>
        <p id="ask-dock-status" role="status"></p>
      </div>
    </section>
    <form class="ask-dock__form">
      <label for="ask-dock-input">Ask River Tech</label>
      <input id="ask-dock-input" name="question" type="text" maxlength="300" aria-controls="ask-dock-answer" autocomplete="off" placeholder="Ask a question about River Tech" required>
      <button type="submit" aria-label="Send question">↑</button>
    </form>
  </div>
</aside>
`);

const dock = document.querySelector('.ask-dock');
const form = dock.querySelector('form');
const input = dock.querySelector('#ask-dock-input');
const answer = dock.querySelector('#ask-dock-answer');
const answerBody = dock.querySelector('.ask-dock__answer-body');
const question = dock.querySelector('#ask-dock-question');
const copy = dock.querySelector('#ask-dock-copy');
const sources = dock.querySelector('#ask-dock-sources');
const status = dock.querySelector('#ask-dock-status');
const send = form.querySelector('button');
const narrow = matchMedia('(max-width: 540px)');
const initialPlaceholder = input.placeholder;
const preference = {
  role: 'user',
  content: 'Answer in friendly, simple language. Lead with the answer. Keep it short and include only details relevant to my question. For tuition without a payment preference, give the quarterly option first.'
};
let history = [];
let activeRequest;

function showParagraphs(paragraphs) {
  paragraphs.forEach((text, index) => {
    const paragraph = copy.children[index] || copy.appendChild(document.createElement('p'));
    paragraph.textContent = text;
  });
  while (copy.children.length > paragraphs.length) copy.lastElementChild.remove();
}

function addLink({url, title}) {
  if (typeof url !== 'string' || typeof title !== 'string') return;
  if (url !== 'mailto:learn@rivertech.me') {
    let link;
    try { link = new URL(url); } catch { return; }
    if (link.username || link.password) return;
    const schoolSite = ['https://www.rivertechschool.com', 'https://rivertechschool.com'].includes(link.origin);
    const parentGuide = link.origin === 'https://rivertech.me' && link.pathname.startsWith('/parents/');
    const parentGuideDoc = link.origin === 'https://docs.google.com' && link.pathname.startsWith('/document/d/104T-VPtYPYlxYGGHTXEF-GfKRuqasqFWMNFc7RmNyhI/');
    if (!schoolSite && !parentGuide && !parentGuideDoc && url !== guide + '/ask/') return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.textContent = title + ' ↗';
  if (!url.startsWith('mailto:')) {
    anchor.target = '_blank';
    anchor.rel = 'noopener';
  }
  sources.append(anchor);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const prompt = input.value.trim();
  if (activeRequest || !prompt) return;

  const controller = new AbortController();
  activeRequest = controller;
  const timer = setTimeout(() => controller.abort(), 90000);
  send.disabled = true;
  question.textContent = prompt;
  copy.replaceChildren();
  sources.replaceChildren();
  status.textContent = 'Checking River Tech’s information…';
  answer.hidden = false;
  answerBody.scrollTop = 0;
  answerBody.focus({preventScroll: true});
  input.value = '';
  input.placeholder = 'Ask another question';

  try {
    const response = await fetch(guide + '/api/ask', {
      method: 'POST',
      credentials: 'omit',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({question: prompt, stream: true, history: [preference, ...history]}),
      signal: controller.signal
    });

    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
      throw new Error('The live answer is unavailable.');
    }
    for await (const message of readEvents(response.body)) {
      if (message.type === 'error') throw new Error(message.error);
      if (message.type === 'draft') {
        showParagraphs(message.paragraphs);
        status.textContent = '';
      }
      if (message.type === 'done') {
        const result = message.answer;
        showParagraphs(result.paragraphs);
        for (const source of result.sources || []) addLink(source);
        if (result.action) addLink({url: result.action.url, title: result.action.label});
        status.textContent = 'Answer ready.';
        history = [...history, {role: 'user', content: prompt}, {
          role: 'assistant', content: result.paragraphs.join('\n').slice(0, 2200)
        }].slice(-4);
        return;
      }
    }
    throw new Error('The answer ended early.');
  } catch {
    if (activeRequest !== controller) return;
    copy.replaceChildren();
    status.textContent = 'We couldn’t finish that answer. Try again or open Ask River Tech.';
    addLink({url: guide + '/ask/', title: 'Open Ask River Tech'});
    if (!input.value) input.value = prompt;
  } finally {
    clearTimeout(timer);
    if (activeRequest === controller) {
      activeRequest = undefined;
      send.disabled = false;
    }
  }
});

function closeAnswer() {
  const request = activeRequest;
  activeRequest = undefined;
  request?.abort();
  send.disabled = false;
  answer.hidden = true;
  input.placeholder = initialPlaceholder;
  (narrow.matches ? send : input).focus({preventScroll: true});
}

dock.querySelector('#ask-dock-close').addEventListener('click', closeAnswer);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !answer.hidden && !event.defaultPrevented && !document.querySelector('dialog[open]')) {
    closeAnswer();
  }
});
