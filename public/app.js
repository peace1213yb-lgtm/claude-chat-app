// ===== State =====
const state = {
  messages: [],       // { role: 'user'|'assistant', content: string }
  isLoading: false,
  systemPrompt: '',
};

// ===== DOM Elements =====
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const systemPromptInput = document.getElementById('system-prompt');
const clearChatBtn = document.getElementById('clear-chat-btn');
const welcomeMessage = document.getElementById('welcome-message');

// ===== Event Listeners =====

// Settings panel
settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

// System prompt save on change
systemPromptInput.addEventListener('input', () => {
  state.systemPrompt = systemPromptInput.value;
  localStorage.setItem('claude-chat-system-prompt', state.systemPrompt);
});

// Clear chat
clearChatBtn.addEventListener('click', () => {
  state.messages = [];
  localStorage.removeItem('claude-chat-history');
  renderMessages();
  closeSettings();
});

// Send message
sendBtn.addEventListener('click', sendMessage);

// Input handling
messageInput.addEventListener('input', () => {
  autoResizeTextarea();
  sendBtn.disabled = !messageInput.value.trim() || state.isLoading;
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (messageInput.value.trim() && !state.isLoading) {
      sendMessage();
    }
  }
});

// ===== Functions =====

function openSettings() {
  settingsPanel.classList.remove('hidden');
  settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
  settingsPanel.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
}

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatContent(text) {
  // Simple markdown-like formatting
  let html = escapeHtml(text);

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

function renderMessages() {
  // Clear everything
  chatMessages.innerHTML = '';

  if (state.messages.length === 0) {
    // Show welcome
    chatMessages.innerHTML = `
      <div id="welcome-message" class="welcome">
        <div class="welcome-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <h2>Claudeとチャット</h2>
        <p>メッセージを入力して会話を始めましょう</p>
      </div>
    `;
    return;
  }

  // Date separator
  const dateSep = document.createElement('div');
  dateSep.className = 'date-separator';
  dateSep.innerHTML = `<span>今日</span>`;
  chatMessages.appendChild(dateSep);

  state.messages.forEach((msg, idx) => {
    appendMessageToDOM(msg, idx === state.messages.length - 1);
  });

  scrollToBottom();
}

function appendMessageToDOM(msg, animate = true) {
  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  if (!animate) {
    row.style.animation = 'none';
    row.style.opacity = '1';
  }

  if (msg.role === 'assistant') {
    row.innerHTML = `
      <div class="chat-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <circle cx="9" cy="10" r="1.2" fill="currentColor"/>
          <circle cx="15" cy="10" r="1.2" fill="currentColor"/>
        </svg>
      </div>
      <div class="bubble assistant">
        ${formatContent(msg.content)}
        <span class="timestamp">${msg.timestamp || getTimestamp()}</span>
      </div>
    `;
  } else {
    row.innerHTML = `
      <div class="bubble user">
        ${formatContent(msg.content)}
        <span class="timestamp">${msg.timestamp || getTimestamp()}</span>
      </div>
    `;
  }

  chatMessages.appendChild(row);
}

function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.id = 'typing-row';
  row.innerHTML = `
    <div class="chat-avatar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <circle cx="9" cy="10" r="1.2" fill="currentColor"/>
        <circle cx="15" cy="10" r="1.2" fill="currentColor"/>
      </svg>
    </div>
    <div class="bubble assistant">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  chatMessages.appendChild(row);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-row');
  if (el) el.remove();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || state.isLoading) return;

  // Clear welcome message on first send
  const welcome = document.getElementById('welcome-message');
  if (welcome) {
    welcome.remove();
    // Add date separator
    const dateSep = document.createElement('div');
    dateSep.className = 'date-separator';
    dateSep.innerHTML = `<span>今日</span>`;
    chatMessages.appendChild(dateSep);
  }

  // Add user message
  const userMsg = { role: 'user', content: text, timestamp: getTimestamp() };
  state.messages.push(userMsg);
  appendMessageToDOM(userMsg);
  saveHistory();

  // Clear input
  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;

  // Show typing
  state.isLoading = true;
  showTypingIndicator();
  scrollToBottom();

  try {
    // Build messages for API
    const apiMessages = state.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const body = {
      messages: apiMessages,
    };

    if (state.systemPrompt && state.systemPrompt.trim()) {
      body.systemPrompt = state.systemPrompt.trim();
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    removeTypingIndicator();

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }

    const data = await response.json();

    const assistantMsg = {
      role: 'assistant',
      content: data.content,
      timestamp: getTimestamp(),
    };
    state.messages.push(assistantMsg);
    appendMessageToDOM(assistantMsg);
    saveHistory();
  } catch (error) {
    removeTypingIndicator();
    // Show error message
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.innerHTML = `
      <div class="chat-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <circle cx="9" cy="10" r="1.2" fill="currentColor"/>
          <circle cx="15" cy="10" r="1.2" fill="currentColor"/>
        </svg>
      </div>
      <div class="bubble error">
        ⚠️ エラー: ${escapeHtml(error.message)}
        <span class="timestamp">${getTimestamp()}</span>
      </div>
    `;
    chatMessages.appendChild(row);
  } finally {
    state.isLoading = false;
    sendBtn.disabled = !messageInput.value.trim();
    scrollToBottom();
  }
}

function saveHistory() {
  localStorage.setItem('claude-chat-history', JSON.stringify(state.messages));
}

function loadHistory() {
  const saved = localStorage.getItem('claude-chat-history');
  if (saved) {
    try {
      state.messages = JSON.parse(saved);
    } catch {
      state.messages = [];
    }
  }

  const savedPrompt = localStorage.getItem('claude-chat-system-prompt');
  if (savedPrompt) {
    state.systemPrompt = savedPrompt;
    systemPromptInput.value = savedPrompt;
  }

  renderMessages();
}

// ===== Init =====
loadHistory();
messageInput.focus();
