/**
 * Blog chat widget — vanilla JS, no build step, no dependencies.
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

  const AVATAR_SRC = '/assets/images/favicon-32x32.png';
  const BOT_NAME = '만두봇';
  const GREETING = '안녕하세요, 만두봇이에요! 블로그 글이나 혜란에 대해 뭐든 물어보세요.';

  const CHAT_ICON_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  const CLOSE_ICON_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const SEND_ICON_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.94 2.94a1.5 1.5 0 0 1 1.61-.34l17 6.5a1.5 1.5 0 0 1 0 2.8l-17 6.5a1.5 1.5 0 0 1-2-1.83L4.5 12 2.55 4.77a1.5 1.5 0 0 1 .39-1.83z"/></svg>`;

  const style = document.createElement('style');
  style.textContent = `
    .cw-fab {
      position: fixed; bottom: 130px; right: 24px; z-index: 1001;
      width: 56px; height: 56px; border-radius: 50%; border: none;
      background: #ff5100; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 14px rgba(255, 81, 0, 0.4);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .cw-fab:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(255, 81, 0, 0.5); }
    .cw-fab svg { transition: transform 0.2s ease; }
    .cw-fab[aria-expanded="true"] svg { transform: rotate(90deg); }

    .cw-panel {
      position: fixed; bottom: 198px; right: 24px; z-index: 1001;
      width: 360px; max-width: calc(100vw - 32px);
      height: 480px; max-height: calc(100vh - 240px);
      display: none; flex-direction: column;
      background: #fff; color: #1d1d1f;
      border-radius: 18px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.06);
      opacity: 0; transform: translateY(12px) scale(0.98);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .cw-panel.cw-open { display: flex; }
    .cw-panel.cw-visible { opacity: 1; transform: translateY(0) scale(1); }

    html[data-theme="dark"] .cw-panel {
      background: #1c1c1e; color: #e8e8ea; border-color: rgba(255,255,255,0.08);
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    }

    .cw-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; border-bottom: 1px solid rgba(0,0,0,0.08); flex: none;
    }
    html[data-theme="dark"] .cw-header { border-bottom-color: rgba(255,255,255,0.08); }
    .cw-header img { width: 24px; height: 24px; border-radius: 6px; flex: none; }
    .cw-header-title {
      font-family: "Noto Serif KR", "Noto Serif", serif;
      font-weight: 600; font-size: 15px; flex: 1; line-height: 1.3;
    }
    .cw-header-sub { font-size: 11px; opacity: 0.55; font-weight: 400; margin-top: 1px; }
    .cw-header-close {
      border: none; background: none; cursor: pointer; color: inherit; opacity: 0.5;
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%; flex: none;
      transition: opacity 0.15s ease, background 0.15s ease;
    }
    .cw-header-close:hover { opacity: 1; background: rgba(0,0,0,0.06); }
    html[data-theme="dark"] .cw-header-close:hover { background: rgba(255,255,255,0.08); }

    .cw-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }

    .cw-row { display: flex; gap: 8px; align-items: flex-end; }
    .cw-row.cw-user { flex-direction: row-reverse; }
    .cw-avatar { width: 24px; height: 24px; border-radius: 6px; flex: none; margin-bottom: 2px; }

    .cw-bubble {
      max-width: 78%; padding: 10px 13px; border-radius: 16px;
      font-size: 13.5px; line-height: 1.55; word-break: break-word; white-space: pre-wrap;
    }
    .cw-row.cw-bot .cw-bubble {
      background: #f3f2f0; color: inherit; border-bottom-left-radius: 4px;
    }
    html[data-theme="dark"] .cw-row.cw-bot .cw-bubble { background: #2a2a2d; }
    .cw-row.cw-user .cw-bubble {
      background: #ff5100; color: #fff; border-bottom-right-radius: 4px;
    }

    .cw-sources { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
    .cw-source-chip {
      display: block; font-size: 11px; padding: 5px 9px; border-radius: 10px;
      background: rgba(255,81,0,0.08); color: #ff5100; text-decoration: none;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      border: 1px solid rgba(255,81,0,0.15);
    }
    .cw-source-chip:hover { background: rgba(255,81,0,0.15); }
    html[data-theme="dark"] .cw-source-chip { background: rgba(255,81,0,0.14); border-color: rgba(255,81,0,0.25); }

    .cw-typing { display: flex; gap: 4px; padding: 3px 2px; }
    .cw-typing span {
      width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.4;
      animation: cw-bounce 1.1s infinite ease-in-out;
    }
    .cw-typing span:nth-child(2) { animation-delay: 0.15s; }
    .cw-typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes cw-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 0.9; } }

    .cw-form {
      display: flex; align-items: center; gap: 8px; padding: 10px 12px;
      border-top: 1px solid rgba(0,0,0,0.08); flex: none;
    }
    html[data-theme="dark"] .cw-form { border-top-color: rgba(255,255,255,0.08); }
    .cw-input {
      flex: 1; min-width: 0; border: 1px solid rgba(0,0,0,0.12); background: rgba(0,0,0,0.02);
      color: inherit; border-radius: 20px; padding: 9px 14px; font-size: 13.5px;
      transition: border-color 0.15s ease;
    }
    html[data-theme="dark"] .cw-input { border-color: rgba(255,255,255,0.14); background: rgba(255,255,255,0.04); }
    .cw-input:focus { outline: none; border-color: #ff5100; }
    .cw-send {
      flex: none; width: 34px; height: 34px; border-radius: 50%; border: none;
      background: #ff5100; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.15s ease, transform 0.1s ease;
    }
    .cw-send:active { transform: scale(0.92); }
    .cw-send:disabled { opacity: 0.35; cursor: default; }

    @media (max-width: 420px) {
      .cw-fab { bottom: 110px; right: 16px; }
      .cw-panel { bottom: 178px; right: 16px; height: 60vh; }
    }
  `;
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'cw-fab';
  fab.setAttribute('aria-label', '만두봇에게 질문하기');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = CHAT_ICON_SVG;

  const panel = document.createElement('div');
  panel.className = 'cw-panel';
  panel.innerHTML = `
    <div class="cw-header">
      <img src="${AVATAR_SRC}" alt="" />
      <div class="cw-header-title">${BOT_NAME}<div class="cw-header-sub">블로그와 혜란에 대해 답해요</div></div>
      <button class="cw-header-close" type="button" aria-label="닫기">${CLOSE_ICON_SVG}</button>
    </div>
    <div class="cw-messages"></div>
    <form class="cw-form">
      <input class="cw-input" type="text" placeholder="블로그 내용에 대해 물어보세요" maxlength="500" autocomplete="off" />
      <button class="cw-send" type="submit" aria-label="보내기">${SEND_ICON_SVG}</button>
    </form>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('.cw-messages');
  const formEl = panel.querySelector('.cw-form');
  const inputEl = panel.querySelector('.cw-input');
  const sendEl = panel.querySelector('.cw-send');
  const closeEl = panel.querySelector('.cw-header-close');

  // If the visitor manually scrolls (e.g. to re-read an earlier message),
  // stop auto-scrolling until their next question — don't yank them around.
  let userScrolledAway = false;
  messagesEl.addEventListener('wheel', () => { userScrolledAway = true; }, { passive: true });
  messagesEl.addEventListener('touchmove', () => { userScrolledAway = true; }, { passive: true });

  function scrollToBottom() {
    if (userScrolledAway) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Positions the container so `el`'s top edge is at the top of the visible
  // area — used when a new answer arrives, so the visitor reads it from the
  // start instead of landing on its last line. rect-diff math (not
  // el.offsetTop) because .cw-panel is `position: fixed`, which makes it the
  // offsetParent for everything inside — offsetTop alone would be relative
  // to the panel, not to the scrollable .cw-messages.
  function scrollToTop(el) {
    if (userScrolledAway) return;
    const elRect = el.getBoundingClientRect();
    const containerRect = messagesEl.getBoundingClientRect();
    messagesEl.scrollTop += elRect.top - containerRect.top - 8;
  }

  // Simulated streaming: the full answer already arrived from the API in one
  // shot (see README — true token streaming would need the Durable Object
  // proxy to pipe SSE through, meaningfully more moving parts), this just
  // reveals it progressively so it *looks* like it's typing out live.
  function typewriterReveal(el, text, speed = 16) {
    return new Promise((resolve) => {
      let i = 0;
      (function step() {
        el.textContent = text.slice(0, i);
        if (i++ < text.length) {
          setTimeout(step, speed);
        } else {
          resolve();
        }
      })();
    });
  }

  function addBotBubble(text) {
    const row = document.createElement('div');
    row.className = 'cw-row cw-bot';
    row.innerHTML = `<img class="cw-avatar" src="${AVATAR_SRC}" alt="" /><div class="cw-bubble"></div>`;
    row.querySelector('.cw-bubble').textContent = text;
    messagesEl.appendChild(row);
    scrollToBottom();
    return row.querySelector('.cw-bubble');
  }

  function addUserBubble(text) {
    const row = document.createElement('div');
    row.className = 'cw-row cw-user';
    row.innerHTML = `<div class="cw-bubble"></div>`;
    row.querySelector('.cw-bubble').textContent = text;
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function addTypingBubble() {
    const row = document.createElement('div');
    row.className = 'cw-row cw-bot';
    row.innerHTML = `<img class="cw-avatar" src="${AVATAR_SRC}" alt="" /><div class="cw-bubble"><div class="cw-typing"><span></span><span></span><span></span></div></div>`;
    messagesEl.appendChild(row);
    scrollToBottom();
    return { row, bubble: row.querySelector('.cw-bubble') };
  }

  let greeted = false;
  function setOpen(open) {
    if (open) {
      panel.classList.add('cw-open');
      requestAnimationFrame(() => panel.classList.add('cw-visible'));
      if (!greeted) {
        addBotBubble(GREETING);
        greeted = true;
      }
      inputEl.focus();
    } else {
      panel.classList.remove('cw-visible');
      setTimeout(() => panel.classList.remove('cw-open'), 180);
    }
    fab.setAttribute('aria-expanded', String(open));
    fab.innerHTML = open ? CLOSE_ICON_SVG : CHAT_ICON_SVG;
  }

  fab.addEventListener('click', () => setOpen(!panel.classList.contains('cw-open')));
  closeEl.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('cw-open')) setOpen(false);
  });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = inputEl.value.trim();
    if (!question) return;
    inputEl.value = '';
    inputEl.disabled = true;
    sendEl.disabled = true;
    userScrolledAway = false; // fresh question — resume following along

    addUserBubble(question);
    const { row: botRow, bubble } = addTypingBubble();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (res.status === 429) {
        bubble.textContent = '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
        scrollToBottom();
      } else if (res.status === 503) {
        bubble.textContent = '이번 달 답변 한도에 도달해서 잠시 답변이 제한돼 있어요.';
        scrollToBottom();
      } else if (!res.ok) {
        bubble.textContent = '답변을 가져오지 못했어요.';
        scrollToBottom();
      } else {
        const data = await res.json();
        bubble.textContent = ''; // clear the typing dots before revealing
        scrollToTop(botRow); // position at the answer's start, not its end
        await typewriterReveal(bubble, data.answer);
        if (data.sources?.length) {
          const sourcesEl = document.createElement('div');
          sourcesEl.className = 'cw-sources';
          sourcesEl.innerHTML = data.sources
            .map((s) => `<a class="cw-source-chip" href="${s.url}" target="_blank" rel="noopener">${s.title}</a>`)
            .join('');
          bubble.appendChild(sourcesEl);
        }
      }
    } catch {
      bubble.textContent = '네트워크 오류가 발생했어요.';
      scrollToBottom();
    } finally {
      inputEl.disabled = false;
      sendEl.disabled = false;
      inputEl.focus();
    }
  });
})();
