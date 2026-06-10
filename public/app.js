// ===== State =====
const state = {
  chats: {},          // { chatId: { id, title, messages, createdAt, updatedAt } }
  activeChatId: null,
  isLoading: false,
  systemPrompt: '',
  selectedModel: 'claude-sonnet-4-5',
  memories: [],       // [{ content, category, createdAt }]
  attachedFile: null,  // { name, type, data (base64) }
  messageCountSinceLastExtract: 0,
  referenceFiles: [],  // [{ name, content (text) }]
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
const modelSelect = document.getElementById('model-select');
const menuBtn = document.getElementById('menu-btn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const chatList = document.getElementById('chat-list');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const filePreviewIcon = document.getElementById('file-preview-icon');
const filePreviewName = document.getElementById('file-preview-name');
const fileRemoveBtn = document.getElementById('file-remove-btn');
const memoryCountEl = document.getElementById('memory-count');
const memoryListEl = document.getElementById('memory-list');
const memoryToast = document.getElementById('memory-toast');
const memoryToastText = document.getElementById('memory-toast-text');
const refFileInput = document.getElementById('ref-file-input');
const refFileList = document.getElementById('ref-file-list');
const refFileCountEl = document.getElementById('ref-file-count');
const refFileLoading = document.getElementById('ref-file-loading');

// ===== Event Listeners =====

// Settings panel
settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

// Sidebar
menuBtn.addEventListener('click', openSidebar);
sidebarCloseBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
newChatBtn.addEventListener('click', () => {
  createNewChat();
  closeSidebar();
});

// System prompt save on change
systemPromptInput.addEventListener('input', () => {
  state.systemPrompt = systemPromptInput.value;
  localStorage.setItem('claude-chat-system-prompt', state.systemPrompt);
});

// Model selection
modelSelect.addEventListener('change', () => {
  state.selectedModel = modelSelect.value;
  localStorage.setItem('claude-chat-selected-model', state.selectedModel);
});

// Clear current chat
clearChatBtn.addEventListener('click', () => {
  if (!state.activeChatId) return;
  const chat = state.chats[state.activeChatId];
  if (chat) {
    chat.messages = [];
    chat.updatedAt = Date.now();
    saveAllChats();
    renderMessages();
    renderChatList();
  }
  closeSettings();
});

// Send message
sendBtn.addEventListener('click', sendMessage);

// Reference file
refFileInput.addEventListener('change', handleRefFileSelect);

// Input handling
messageInput.addEventListener('input', () => {
  autoResizeTextarea();
  updateSendButton();
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if ((messageInput.value.trim() || state.attachedFile) && !state.isLoading) {
      sendMessage();
    }
  }
});

// File attachment
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
fileRemoveBtn.addEventListener('click', clearAttachedFile);

// ===== Sidebar Functions =====

function openSidebar() {
  sidebar.classList.remove('hidden');
  sidebarOverlay.classList.remove('hidden');
}

function closeSidebar() {
  sidebar.classList.add('hidden');
  sidebarOverlay.classList.add('hidden');
}

// ===== Settings Functions =====

function openSettings() {
  renderMemoryList();
  settingsPanel.classList.remove('hidden');
  settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
  settingsPanel.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
}

// ===== Chat Management =====

function generateChatId() {
  return 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

function createNewChat() {
  const chatId = generateChatId();
  const chat = {
    id: chatId,
    title: '新しいチャット',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.chats[chatId] = chat;
  state.activeChatId = chatId;
  state.messageCountSinceLastExtract = 0;
  saveAllChats();
  renderMessages();
  renderChatList();
  messageInput.focus();
}

function switchChat(chatId) {
  if (!state.chats[chatId]) return;
  state.activeChatId = chatId;
  state.messageCountSinceLastExtract = 0;
  localStorage.setItem('claude-chat-active-id', chatId);
  renderMessages();
  renderChatList();
  closeSidebar();
}

function deleteChat(chatId) {
  delete state.chats[chatId];
  if (state.activeChatId === chatId) {
    const chatIds = Object.keys(state.chats);
    if (chatIds.length > 0) {
      state.activeChatId = chatIds[chatIds.length - 1];
    } else {
      createNewChat();
      return;
    }
  }
  saveAllChats();
  renderMessages();
  renderChatList();
}

function getChatTitle(chat) {
  if (chat.messages.length === 0) return '新しいチャット';
  const firstUserMsg = chat.messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    const text = typeof firstUserMsg.content === 'string'
      ? firstUserMsg.content
      : (firstUserMsg.displayContent || '新しいチャット');
    return text.substring(0, 30) + (text.length > 30 ? '...' : '');
  }
  return '新しいチャット';
}

function renderChatList() {
  const chatIds = Object.keys(state.chats).sort((a, b) => {
    return (state.chats[b].updatedAt || 0) - (state.chats[a].updatedAt || 0);
  });

  if (chatIds.length === 0) {
    chatList.innerHTML = '<div class="chat-list-empty">チャットがありません</div>';
    return;
  }

  chatList.innerHTML = chatIds.map(chatId => {
    const chat = state.chats[chatId];
    const title = getChatTitle(chat);
    const isActive = chatId === state.activeChatId;
    const date = new Date(chat.updatedAt || chat.createdAt);
    const dateStr = date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

    return `
      <div class="chat-item ${isActive ? 'active' : ''}" data-chat-id="${chatId}">
        <div class="chat-item-icon">💬</div>
        <div class="chat-item-info">
          <div class="chat-item-title">${escapeHtml(title)}</div>
          <div class="chat-item-date">${dateStr}</div>
        </div>
        <button class="chat-item-delete" data-delete-id="${chatId}" aria-label="削除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Attach click events
  chatList.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't switch if clicking delete button
      if (e.target.closest('.chat-item-delete')) return;
      const chatId = item.dataset.chatId;
      switchChat(chatId);
    });
  });

  chatList.querySelectorAll('.chat-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chatId = btn.dataset.deleteId;
      deleteChat(chatId);
    });
  });
}

// ===== File Attachment =====

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    alert('ファイルサイズは50MB以下にしてください。');
    fileInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      alert('画像またはPDFファイルのみ対応しています。');
      fileInput.value = '';
      return;
    }

    state.attachedFile = {
      name: file.name,
      type: file.type,
      data: base64,
      mediaType: file.type,
    };

    // Show preview
    filePreviewIcon.textContent = isImage ? '🖼️' : '📄';
    filePreviewName.textContent = file.name;
    filePreview.classList.remove('hidden');
    updateSendButton();
  };
  reader.readAsDataURL(file);
}

function clearAttachedFile() {
  state.attachedFile = null;
  fileInput.value = '';
  filePreview.classList.add('hidden');
  updateSendButton();
}

function updateSendButton() {
  sendBtn.disabled = (!messageInput.value.trim() && !state.attachedFile) || state.isLoading;
}

// ===== Utility Functions =====

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

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// ===== Render Messages =====

function renderMessages() {
  chatMessages.innerHTML = '';

  const chat = state.chats[state.activeChatId];
  if (!chat || chat.messages.length === 0) {
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

  chat.messages.forEach((msg, idx) => {
    appendMessageToDOM(msg, idx === chat.messages.length - 1, idx);
  });

  scrollToBottom();
}

function appendMessageToDOM(msg, animate = true, msgIndex = -1) {
  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  if (msgIndex >= 0) row.dataset.msgIdx = msgIndex;
  if (!animate) {
    row.style.animation = 'none';
    row.style.opacity = '1';
  }

  const displayContent = msg.displayContent || msg.content;
  const contentText = typeof displayContent === 'string' ? displayContent : '';

  if (msg.role === 'assistant') {
    let thinkingHtml = '';
    if (msg.thinking) {
      thinkingHtml = `
        <div class="thinking-block">
          <button class="thinking-toggle" onclick="toggleThinking(this)">
            <span class="thinking-icon">💭</span>
            <span class="thinking-label">はるくんの心の声</span>
            <svg class="thinking-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="thinking-content collapsed">
            <div class="thinking-inner">${formatContent(msg.thinking)}</div>
          </div>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="chat-avatar">
        <img src="icon_hands_circle.png" alt="はるくん" class="avatar-img">
      </div>
      <div class="bubble assistant">
        ${thinkingHtml}
        ${formatContent(contentText)}
        <span class="timestamp">${msg.timestamp || getTimestamp()}</span>
      </div>
    `;
  } else {
    // User message
    let fileBadge = '';
    if (msg.fileName) {
      const icon = msg.fileType && msg.fileType.startsWith('image/') ? '🖼️' : '📄';
      fileBadge = `<div class="msg-file-badge">${icon} ${escapeHtml(msg.fileName)}</div>`;
    }

    const editBtn = msgIndex >= 0 ? `
      <button class="msg-edit-btn" data-msg-idx="${msgIndex}" aria-label="編集" title="メッセージを編集">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
    ` : '';

    row.innerHTML = `
      ${editBtn}
      <div class="bubble user">
        ${fileBadge}
        <div class="bubble-text-content">${formatContent(contentText)}</div>
        <span class="timestamp">${msg.timestamp || getTimestamp()}</span>
      </div>
    `;

    // Attach edit handler
    const editBtnEl = row.querySelector('.msg-edit-btn');
    if (editBtnEl) {
      editBtnEl.addEventListener('click', () => {
        editMessage(parseInt(editBtnEl.dataset.msgIdx));
      });
    }
  }

  chatMessages.appendChild(row);
}

// Thinking toggle (global function for onclick)
window.toggleThinking = function(btn) {
  const content = btn.nextElementSibling;
  btn.classList.toggle('expanded');
  content.classList.toggle('collapsed');
};

function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.id = 'typing-row';
  row.innerHTML = `
    <div class="chat-avatar">
      <img src="icon_hands_circle.png" alt="はるくん" class="avatar-img">
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

// ===== Edit Message =====

function editMessage(msgIndex) {
  if (state.isLoading) return;
  const chat = state.chats[state.activeChatId];
  if (!chat) return;
  const msg = chat.messages[msgIndex];
  if (!msg || msg.role !== 'user') return;

  // Find the row element
  const row = chatMessages.querySelector(`.message-row[data-msg-idx="${msgIndex}"]`);
  if (!row) return;

  const displayContent = msg.displayContent || msg.content;
  const contentText = typeof displayContent === 'string' ? displayContent : '';

  // Replace bubble with edit form
  row.classList.add('editing');
  row.innerHTML = `
    <div class="edit-form">
      <textarea class="edit-textarea" rows="3">${escapeHtml(contentText)}</textarea>
      <div class="edit-actions">
        <button class="edit-cancel-btn">キャンセル</button>
        <button class="edit-send-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
          再送信
        </button>
      </div>
    </div>
  `;

  const textarea = row.querySelector('.edit-textarea');
  const cancelBtn = row.querySelector('.edit-cancel-btn');
  const sendBtn2 = row.querySelector('.edit-send-btn');

  // Auto-resize textarea
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  });

  cancelBtn.addEventListener('click', () => {
    renderMessages();
  });

  sendBtn2.addEventListener('click', () => {
    const newText = textarea.value.trim();
    if (!newText) return;
    resendFromIndex(msgIndex, newText);
  });

  // Enter to send (Shift+Enter for newline)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newText = textarea.value.trim();
      if (!newText) return;
      resendFromIndex(msgIndex, newText);
    }
  });

  scrollToBottom();
}

async function resendFromIndex(msgIndex, newText) {
  if (state.isLoading) return;
  const chat = state.chats[state.activeChatId];
  if (!chat) return;

  // Truncate messages from msgIndex onwards
  chat.messages = chat.messages.slice(0, msgIndex);

  // Add updated user message
  const userMsg = {
    role: 'user',
    content: newText,
    displayContent: newText,
    timestamp: getTimestamp(),
  };
  chat.messages.push(userMsg);
  chat.updatedAt = Date.now();
  saveAllChats();

  // Re-render messages
  renderMessages();

  // Show typing
  state.isLoading = true;
  showTypingIndicator();
  scrollToBottom();

  // Check for manual memory trigger
  const memoryTriggers = ['覚えておいて', '記憶して', '覚えて'];
  if (memoryTriggers.some(t => newText.includes(t))) {
    saveManualMemory(newText);
  }

  try {
    const apiMessages = chat.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const body = {
      messages: apiMessages,
      model: state.selectedModel,
      memories: state.memories,
      referenceContent: buildReferenceContent(),
    };

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
      displayContent: data.content,
      timestamp: getTimestamp(),
      thinking: data.thinking || null,
    };
    chat.messages.push(assistantMsg);
    chat.updatedAt = Date.now();
    appendMessageToDOM(assistantMsg, true, chat.messages.length - 1);
    saveAllChats();

    state.messageCountSinceLastExtract++;
    if (state.messageCountSinceLastExtract >= 5) {
      state.messageCountSinceLastExtract = 0;
      extractMemories(chat.messages);
    }
  } catch (error) {
    removeTypingIndicator();
    const errRow = document.createElement('div');
    errRow.className = 'message-row assistant';
    errRow.innerHTML = `
      <div class="chat-avatar">
        <img src="icon_hands_circle.png" alt="はるくん" class="avatar-img">
      </div>
      <div class="bubble error">
        ⚠️ エラー: ${escapeHtml(error.message)}
        <span class="timestamp">${getTimestamp()}</span>
      </div>
    `;
    chatMessages.appendChild(errRow);
  } finally {
    state.isLoading = false;
    updateSendButton();
    scrollToBottom();
  }
}

// ===== Send Message =====

async function sendMessage() {
  const text = messageInput.value.trim();
  if ((!text && !state.attachedFile) || state.isLoading) return;

  // Ensure we have an active chat
  if (!state.activeChatId || !state.chats[state.activeChatId]) {
    createNewChat();
  }

  const chat = state.chats[state.activeChatId];

  // Clear welcome message
  const welcome = document.getElementById('welcome-message');
  if (welcome) {
    welcome.remove();
    const dateSep = document.createElement('div');
    dateSep.className = 'date-separator';
    dateSep.innerHTML = `<span>今日</span>`;
    chatMessages.appendChild(dateSep);
  }

  // Build message content for API
  let apiContent;
  let displayContent = text;
  let fileName = null;
  let fileType = null;

  if (state.attachedFile) {
    fileName = state.attachedFile.name;
    fileType = state.attachedFile.type;
    const isImage = state.attachedFile.type.startsWith('image/');

    if (isImage) {
      apiContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: state.attachedFile.mediaType,
            data: state.attachedFile.data,
          },
        },
      ];
      if (text) {
        apiContent.push({ type: 'text', text: text });
      }
    } else {
      // PDF
      apiContent = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: state.attachedFile.data,
          },
        },
      ];
      if (text) {
        apiContent.push({ type: 'text', text: text });
      }
    }
    displayContent = text || `[${fileName}]`;
  } else {
    apiContent = text;
  }

  // Add user message
  const userMsg = {
    role: 'user',
    content: apiContent,
    displayContent: displayContent,
    timestamp: getTimestamp(),
    fileName: fileName,
    fileType: fileType,
  };
  chat.messages.push(userMsg);
  appendMessageToDOM(userMsg);

  // Update chat title from first message
  chat.title = getChatTitle(chat);
  chat.updatedAt = Date.now();
  saveAllChats();
  renderChatList();

  // Clear input and file
  messageInput.value = '';
  messageInput.style.height = 'auto';
  clearAttachedFile();
  sendBtn.disabled = true;

  // Show typing
  state.isLoading = true;
  showTypingIndicator();
  scrollToBottom();

  // Check for manual memory trigger
  const memoryTriggers = ['覚えておいて', '記憶して', '覚えて'];
  const hasMemoryTrigger = memoryTriggers.some(trigger => text.includes(trigger));

  if (hasMemoryTrigger) {
    saveManualMemory(text);
  }

  try {
    // Build messages for API (only text content for history)
    const apiMessages = chat.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const body = {
      messages: apiMessages,
      model: state.selectedModel,
      memories: state.memories,
      referenceContent: buildReferenceContent(),
    };

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
      displayContent: data.content,
      timestamp: getTimestamp(),
      thinking: data.thinking || null,
    };
    chat.messages.push(assistantMsg);
    chat.updatedAt = Date.now();
    appendMessageToDOM(assistantMsg);
    saveAllChats();

    // Memory extraction every 5 exchanges
    state.messageCountSinceLastExtract++;
    if (state.messageCountSinceLastExtract >= 5) {
      state.messageCountSinceLastExtract = 0;
      extractMemories(chat.messages);
    }

  } catch (error) {
    removeTypingIndicator();
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.innerHTML = `
      <div class="chat-avatar">
        <img src="icon_hands_circle.png" alt="はるくん" class="avatar-img">
      </div>
      <div class="bubble error">
        ⚠️ エラー: ${escapeHtml(error.message)}
        <span class="timestamp">${getTimestamp()}</span>
      </div>
    `;
    chatMessages.appendChild(row);
  } finally {
    state.isLoading = false;
    updateSendButton();
    scrollToBottom();
  }
}

// ===== Memory System =====

async function extractMemories(messages) {
  try {
    const recentMessages = messages.slice(-10).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : (m.displayContent || ''),
    }));

    const response = await fetch('/api/extract-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: recentMessages }),
    });

    if (!response.ok) return;
    const data = await response.json();

    if (data.memories && data.memories.length > 0) {
      let addedCount = 0;
      data.memories.forEach(mem => {
        // Avoid duplicates
        const isDuplicate = state.memories.some(
          existing => existing.content === mem.content
        );
        if (!isDuplicate) {
          state.memories.push({
            content: mem.content,
            category: mem.category,
            createdAt: Date.now(),
          });
          addedCount++;
        }
      });

      if (addedCount > 0) {
        saveMemories();
        showMemoryToast(`${addedCount}件のメモリを保存しました`);
      }
    }
  } catch (error) {
    console.error('Memory extraction failed:', error);
  }
}

async function saveManualMemory(text) {
  try {
    const response = await fetch('/api/save-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) return;
    const data = await response.json();

    if (data.memories && data.memories.length > 0) {
      let addedCount = 0;
      data.memories.forEach(mem => {
        const isDuplicate = state.memories.some(
          existing => existing.content === mem.content
        );
        if (!isDuplicate) {
          state.memories.push({
            content: mem.content,
            category: mem.category,
            createdAt: Date.now(),
          });
          addedCount++;
        }
      });

      if (addedCount > 0) {
        saveMemories();
        showMemoryToast(`✨ 覚えました！（${addedCount}件）`);
      }
    }
  } catch (error) {
    console.error('Manual memory save failed:', error);
  }
}

function showMemoryToast(message) {
  memoryToastText.textContent = message;
  memoryToast.classList.add('show');
  updateMemoryCount();
  setTimeout(() => {
    memoryToast.classList.remove('show');
  }, 3000);
}

function updateMemoryCount() {
  if (state.memories.length > 0) {
    memoryCountEl.textContent = state.memories.length;
    memoryCountEl.style.display = 'inline-flex';
  } else {
    memoryCountEl.style.display = 'none';
  }
}

function getCategoryIcon(category) {
  const icons = {
    '個人情報': '👤',
    '好み・興味': '❤️',
    '出来事・悩み': '📖',
    '健康・体調': '🏥',
    '価値観・気持ち': '💫',
    '猫・家族': '🐱',
  };
  return icons[category] || '📝';
}

function renderMemoryList() {
  updateMemoryCount();

  if (state.memories.length === 0) {
    memoryListEl.innerHTML = '<div class="memory-empty">メモリはまだありません</div>';
    return;
  }

  memoryListEl.innerHTML = state.memories.map((mem, idx) => {
    const icon = getCategoryIcon(mem.category);
    const date = new Date(mem.createdAt);
    const dateStr = date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

    return `
      <div class="memory-item" data-memory-idx="${idx}">
        <div class="memory-item-category">${icon}</div>
        <div class="memory-item-body">
          <div class="memory-item-content">${escapeHtml(mem.content)}</div>
          <div class="memory-item-meta">
            <span class="memory-item-tag">${escapeHtml(mem.category)}</span>
            <span class="memory-item-date">${dateStr}</span>
          </div>
        </div>
        <button class="memory-item-delete" data-memory-delete="${idx}" aria-label="削除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Attach delete handlers
  memoryListEl.querySelectorAll('.memory-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.memoryDelete);
      state.memories.splice(idx, 1);
      saveMemories();
      renderMemoryList();
    });
  });
}

// ===== Storage =====

function saveAllChats() {
  localStorage.setItem('claude-chat-all-chats', JSON.stringify(state.chats));
  localStorage.setItem('claude-chat-active-id', state.activeChatId);
}

function saveMemories() {
  localStorage.setItem('claude-chat-memories', JSON.stringify(state.memories));
  updateMemoryCount();
}

function loadAll() {
  // Load system prompt
  const savedPrompt = localStorage.getItem('claude-chat-system-prompt');
  if (savedPrompt) {
    state.systemPrompt = savedPrompt;
    systemPromptInput.value = savedPrompt;
  }

  // Load model
  const savedModel = localStorage.getItem('claude-chat-selected-model');
  if (savedModel) {
    state.selectedModel = savedModel;
    modelSelect.value = savedModel;
  }

  // Load memories
  const savedMemories = localStorage.getItem('claude-chat-memories');
  if (savedMemories) {
    try {
      state.memories = JSON.parse(savedMemories);
    } catch {
      state.memories = [];
    }
  }
  updateMemoryCount();

  // Load chats
  const savedChats = localStorage.getItem('claude-chat-all-chats');
  if (savedChats) {
    try {
      state.chats = JSON.parse(savedChats);
    } catch {
      state.chats = {};
    }
  }

  // Load active chat ID
  const savedActiveId = localStorage.getItem('claude-chat-active-id');
  if (savedActiveId && state.chats[savedActiveId]) {
    state.activeChatId = savedActiveId;
  } else {
    // Pick latest or create new
    const chatIds = Object.keys(state.chats);
    if (chatIds.length > 0) {
      state.activeChatId = chatIds[chatIds.length - 1];
    } else {
      createNewChat();
      return;
    }
  }

  renderChatList();
  renderMessages();
  loadReferenceFiles();
}

// ===== Reference Files (Multiple) =====

async function handleRefFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const maxSize = 20 * 1024 * 1024; // 20MB
  if (file.size > maxSize) {
    alert('ファイルサイズは20MB以下にしてください。');
    refFileInput.value = '';
    return;
  }

  const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

  if (!isPdf) {
    // Read text file directly
    const reader = new FileReader();
    reader.onload = () => {
      addReferenceFile(file.name, reader.result);
    };
    reader.readAsText(file);
  } else {
    // PDF: send to server for text extraction
    refFileLoading.style.display = 'flex';

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];
          const response = await fetch('/api/extract-pdf-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64 }),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'PDF extraction failed');
          }

          const data = await response.json();
          addReferenceFile(file.name, data.text);
        } catch (error) {
          alert('PDFの処理中にエラーが発生しました: ' + error.message);
        } finally {
          refFileLoading.style.display = 'none';
        }
      };
      reader.onerror = () => {
        alert('ファイルの読み込みに失敗しました。');
        refFileLoading.style.display = 'none';
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert('PDFの処理中にエラーが発生しました: ' + error.message);
      refFileLoading.style.display = 'none';
    }
  }

  refFileInput.value = '';
}

function addReferenceFile(name, content) {
  // Replace if same filename exists, otherwise add
  const existingIdx = state.referenceFiles.findIndex(f => f.name === name);
  if (existingIdx >= 0) {
    state.referenceFiles[existingIdx] = { name, content };
  } else {
    state.referenceFiles.push({ name, content });
  }
  saveReferenceFiles();
  renderRefFileList();
}

function deleteReferenceFile(idx) {
  state.referenceFiles.splice(idx, 1);
  saveReferenceFiles();
  renderRefFileList();
}

function saveReferenceFiles() {
  localStorage.setItem('claude-chat-ref-files', JSON.stringify(state.referenceFiles));
  // Migrate: remove old single-file key if it exists
  localStorage.removeItem('claude-chat-ref-file');
}

function buildReferenceContent() {
  if (state.referenceFiles.length === 0) return null;
  return state.referenceFiles.map(f => {
    return `【${f.name}】\n${f.content}`;
  }).join('\n\n---\n\n');
}

function renderRefFileList() {
  // Update count badge
  if (state.referenceFiles.length > 0) {
    refFileCountEl.textContent = state.referenceFiles.length;
    refFileCountEl.style.display = 'inline-flex';
  } else {
    refFileCountEl.style.display = 'none';
  }

  if (state.referenceFiles.length === 0) {
    refFileList.innerHTML = '';
    return;
  }

  refFileList.innerHTML = state.referenceFiles.map((f, idx) => {
    const icon = f.name.endsWith('.pdf') ? '📄' : '📝';
    return `
      <div class="ref-file-display">
        <div class="ref-file-info">
          <span class="ref-file-icon">${icon}</span>
          <span class="ref-file-name">${escapeHtml(f.name)}</span>
        </div>
        <button class="ref-file-delete-btn" data-ref-idx="${idx}" aria-label="削除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Attach delete handlers
  refFileList.querySelectorAll('.ref-file-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.refIdx);
      deleteReferenceFile(idx);
    });
  });
}

function loadReferenceFiles() {
  // Try new multi-file key first
  const saved = localStorage.getItem('claude-chat-ref-files');
  if (saved) {
    try {
      state.referenceFiles = JSON.parse(saved);
    } catch {
      state.referenceFiles = [];
    }
  } else {
    // Migrate from old single-file format
    const oldSaved = localStorage.getItem('claude-chat-ref-file');
    if (oldSaved) {
      try {
        const old = JSON.parse(oldSaved);
        if (old && old.name && old.content) {
          state.referenceFiles = [old];
          saveReferenceFiles();
        }
      } catch {
        state.referenceFiles = [];
      }
    }
  }
  renderRefFileList();
}

// ===== Init =====
loadAll();
messageInput.focus();
