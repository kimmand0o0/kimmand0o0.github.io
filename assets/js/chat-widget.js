/**
 * Minimal blog chat widget — vanilla JS, no build step, no dependencies.
 *
 * This is the SOURCE copy. The file actually served by Jekyll lives at
 * assets/js/chat-widget.js (chat/ is Jekyll-excluded, see root _config.yml)
 * — keep both in sync, or better, treat assets/js/chat-widget.js as the
 * copy-of-record and re-copy from there when editing.
 *
 * Wired in via _includes/custom-head.html:
 *   <script src="{{ '/assets/js/chat-widget.js' | relative_url }}"
 *           data-endpoint="https://kimmand0o0-blog-chat.kimmand0o0.workers.dev/api/chat" defer></script>
 */
(function () {
  const scriptTag = document.currentScript;
  const endpoint = scriptTag?.dataset?.endpoint;
  if (!endpoint) {
    console.warn('[chat-widget] missing data-endpoint attribute — widget disabled');
    return;
  }

  const style = document.createElement('style');
  style.textContent = `
    .chat-widget-toggle {
      /* Stacked above the theme's own "scroll to top" button (bottom:48px/
         right:60px, 64px tall) so the two never overlap once both show. */
      position: fixed; bottom: 130px; right: 24px; z-index: 1001;
      width: 52px; height: 52px; border-radius: 50%; border: none;
      background: #ff5100; color: #fff; font-size: 22px; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .chat-widget-panel {
      position: fixed; bottom: 194px; right: 24px; z-index: 1001;
      width: 320px; max-width: calc(100vw - 32px); max-height: 440px;
      display: none; flex-direction: column;
      background: #fff; color: #1d1d1f;
      border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.25); overflow: hidden;
      border: 1px solid rgba(0,0,0,0.1);
    }
    html[data-theme="dark"] .chat-widget-panel { background: #1a1a1a; color: #e5e5e5; border-color: rgba(255,255,255,0.1); }
    .chat-widget-panel.open { display: flex; }
    .chat-widget-messages { flex: 1; overflow-y: auto; padding: 12px; font-size: 14px; line-height: 1.5; }
    .chat-widget-msg { margin-bottom: 12px; word-break: break-word; }
    .chat-widget-msg.user { text-align: right; color: #ff5100; }
    .chat-widget-sources { margin-top: 4px; font-size: 12px; opacity: 0.7; }
    .chat-widget-sources a { color: inherit; }
    .chat-widget-form { display: flex; border-top: 1px solid rgba(0,0,0,0.1); }
    html[data-theme="dark"] .chat-widget-form { border-top-color: rgba(255,255,255,0.1); }
    .chat-widget-input { flex: 1; border: none; padding: 10px; font-size: 14px; background: transparent; color: inherit; min-width: 0; }
    .chat-widget-input:focus { outline: none; }
    .chat-widget-send { border: none; background: none; color: #ff5100; font-weight: 600; padding: 0 14px; cursor: pointer; }
    .chat-widget-send:disabled { opacity: 0.4; cursor: default; }
    @media (max-width: 420px) {
      .chat-widget-toggle { bottom: 110px; right: 16px; }
      .chat-widget-panel { bottom: 174px; right: 16px; }
    }
  `;
  document.head.appendChild(style);

  const toggle = document.createElement('button');
  toggle.className = 'chat-widget-toggle';
  toggle.setAttribute('aria-label', '블로그에 질문하기');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = '💬';

  const panel = document.createElement('div');
  panel.className = 'chat-widget-panel';
  panel.innerHTML = `
    <div class="chat-widget-messages"></div>
    <form class="chat-widget-form">
      <input class="chat-widget-input" type="text" placeholder="블로그 내용에 대해 물어보세요" maxlength="500" />
      <button class="chat-widget-send" type="submit">보내기</button>
    </form>
  `;

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  function setOpen(open) {
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('.chat-widget-input')?.focus();
  }

  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false);
  });

  const messagesEl = panel.querySelector('.chat-widget-messages');
  const formEl = panel.querySelector('.chat-widget-form');
  const inputEl = panel.querySelector('.chat-widget-input');

  function appendMessage(role, text) {
    const el = document.createElement('div');
    el.className = `chat-widget-msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = inputEl.value.trim();
    if (!question) return;
    inputEl.value = '';
    inputEl.disabled = true;

    appendMessage('user', question);
    const pending = appendMessage('bot', '생각 중...');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (res.status === 429) {
        pending.textContent = '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
      } else if (res.status === 503) {
        pending.textContent = '이번 달 답변 한도에 도달해서 잠시 답변이 제한돼 있어요.';
      } else if (!res.ok) {
        pending.textContent = '답변을 가져오지 못했어요.';
      } else {
        const data = await res.json();
        pending.textContent = data.answer;
        if (data.sources?.length) {
          const sourcesEl = document.createElement('div');
          sourcesEl.className = 'chat-widget-sources';
          sourcesEl.innerHTML = data.sources
            .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>`)
            .join('<br>');
          pending.appendChild(sourcesEl);
        }
      }
    } catch {
      pending.textContent = '네트워크 오류가 발생했어요.';
    } finally {
      inputEl.disabled = false;
      inputEl.focus();
    }
  });
})();
