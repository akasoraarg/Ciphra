let currentChatId = null;
let chatNavigation = 0;
let chatAbort;
let attachedImages = [];   // Array de { data: base64, mime: string }

// ── Anti-XSS ──
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeMarkdown(content) {
    const html = (window.marked ? marked.parse(content || '') : escapeHtml(content));
    return (window.DOMPurify ? DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) : escapeHtml(content));
}

function buildThinkingBlock(thinking) {
    const wrap = document.createElement('div');
    wrap.className = 'thinking-block-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thinking-toggle';
    btn.innerHTML = `Cómo lo pensó <span class="think-caret">▾</span>`;
    const panel = document.createElement('div');
    panel.className = 'thinking-panel';
    panel.style.display = 'none';
    panel.textContent = thinking;
    let rendered = false;
    btn.onclick = () => {
        const open = panel.style.display === 'none';
        panel.style.display = open ? 'block' : 'none';
        const caret = btn.querySelector('.think-caret');
        if (caret) caret.textContent = open ? '▴' : '▾';
        if (open && !rendered) { rendered = true; PageUI.rich(panel, thinking); }
    };
    wrap.appendChild(btn);
    wrap.appendChild(panel);
    return wrap;
}

function buildSourcesChip(sources) {
    const wrap = document.createElement('div');
    wrap.className = 'sources-chip-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sources-chip';
    btn.innerHTML = `Fuentes · ${sources.length} <span class="src-caret">▾</span>`;
    const list = document.createElement('div');
    list.className = 'sources-list';
    list.style.display = 'none';
    const itemsHtml = sources.map(s =>
        `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="source-item">${escapeHtml(s.title || s.url)}</a>`
    ).join('');
    list.innerHTML = window.DOMPurify
        ? DOMPurify.sanitize(itemsHtml, { ADD_ATTR: ['target', 'rel'] })
        : '';
    btn.onclick = () => {
        const open = list.style.display === 'none';
        list.style.display = open ? 'flex' : 'none';
        const caret = btn.querySelector('.src-caret');
        if (caret) caret.textContent = open ? '▴' : '▾';
    };
    wrap.appendChild(btn);
    wrap.appendChild(list);
    return wrap;
}

function getToken() {
    return Auth._getStorageItem('ciphra_token') || '';
}

async function chatRequest(url, options = {}) {
    const response = await fetch(url, options);
    if (response.status === 401) {
        Auth.clear();
        Auth.loginRedirect();
        throw new Error('La sesión venció. Iniciá sesión de nuevo.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.detail || 'No se pudo completar la solicitud.');
    return data;
}

function authHeaders() {
    return { 'Authorization': getToken() };
}

// Load only chats belonging to a verified session.
async function loadChats() {
    let chats;
    try {
        chats = await chatRequest('/api/chats', { headers: authHeaders() });
    } catch (error) {
        PageUI.error('#chatList', () => loadChats(), error.message);
        return;
    }

    const chatList = document.getElementById('chatList');
    if (!chatList) return;
    chatList.innerHTML = '';
    
    chats.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(chat => {
        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.onclick = () => openChat(chat.id);
        item.innerHTML = `
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="message-square" style="width: 14px;"></i>
                ${escapeHtml(chat.title)}
            </span>
            <i data-lucide="trash-2" class="delete-chat" onclick="event.stopPropagation(); deleteChat('${chat.id}')" style="width: 14px;"></i>
        `;
        chatList.appendChild(item);
    });
    if (window.lucide) lucide.createIcons();

    if (chats.length > 0 && !currentChatId) {
        openChat(chats[0].id);
    } else if (chats.length === 0) {
        createChat();
    }
}

async function createChat() {
    try {
        const data = await chatRequest('/api/chats/create', { method: 'POST', headers: authHeaders() });
        currentChatId = data.chat_id;
        await loadChats();
        await openChat(currentChatId);
    } catch (error) {
        alert(error.message);
    }
}

async function openChat(id) {
    const navigation = ++chatNavigation;
    chatAbort?.abort();
    chatAbort = new AbortController();
    let chat;
    try {
        chat = await chatRequest(`/api/chats/${id}`, { headers: authHeaders(), signal: chatAbort.signal });
        if (navigation !== chatNavigation) return;
        currentChatId = id;
    } catch (error) {
        if (navigation === chatNavigation) PageUI.error('#chatContainer', () => openChat(id), error.message);
        return;
    }

    const titleElem = document.getElementById('activeChatTitle');
    if (titleElem) titleElem.innerText = chat.title;
    
    const container = document.getElementById('chatContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (!chat.messages || chat.messages.length === 0) {
        document.querySelector('.main-chat')?.classList.add('is-empty');
        container.innerHTML = `
            <div class="empty-state-logo">
                <div class="cmdr-logo">
                    <svg class="cmdr-mark" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Commander">
                        <circle class="cmdr-ring" cx="60" cy="60" r="54"/>
                        <circle class="cmdr-ring-2" cx="60" cy="60" r="44"/>
                        <path class="cmdr-inter" d="M94 26 L70 50 L94 94 L70 70 L26 94 L50 70 L26 26 L50 50 Z"/>
                        <path class="cmdr-card" d="M60 6 L68 52 L114 60 L68 68 L60 114 L52 68 L6 60 L52 52 Z"/>
                        <circle class="cmdr-hub" cx="60" cy="60" r="6"/>
                        <circle class="cmdr-hub-core" cx="60" cy="60" r="2.4"/>
                    </svg>
                </div>
                <div class="empty-title">COMMANDER</div>
                <p class="empty-sub">¿En qué estás trabajando hoy?</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    } else {
        document.querySelector('.main-chat')?.classList.remove('is-empty');
        const history = await import('./ui-history.js');
        if (navigation !== chatNavigation) return;
        history.mount(container, chat.messages, msg => appendMessage(msg.role, msg.content, null, msg.sources, msg.thinking));
    }
}

const thinkingPhrases = [
    "Sincronizando ideas...", "Armando una respuesta de alta precisión...",
    "Procesando en capas...", "Optimizando la respuesta..."
];

function handleImageAttach(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const imgObj = { data: e.target.result, mime: file.type };
        const idx = attachedImages.length;
        attachedImages.push(imgObj);
        renderThumb(imgObj, idx);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function renderThumb(imgObj, idx) {
    const strip = document.getElementById('thumb-strip');
    if (!strip) return;
    strip.style.display = 'flex';

    const item = document.createElement('div');
    item.className = 'thumb-item';
    item.dataset.idx = idx;

    const img = document.createElement('img');
    img.src = imgObj.data;

    const btn = document.createElement('button');
    btn.className = 'thumb-remove';
    btn.innerHTML = '×';
    btn.onclick = () => removeThumb(idx);

    item.appendChild(img);
    item.appendChild(btn);
    strip.appendChild(item);
}

function removeThumb(idx) {
    attachedImages.splice(idx, 1);
    const strip = document.getElementById('thumb-strip');
    if (!strip) return;
    strip.innerHTML = '';
    if (attachedImages.length === 0) {
        strip.style.display = 'none';
    } else {
        attachedImages.forEach((img, i) => renderThumb(img, i));
    }
}

function clearAllImages() {
    attachedImages = [];
    const strip = document.getElementById('thumb-strip');
    if (strip) {
        strip.innerHTML = '';
        strip.style.display = 'none';
    }
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    if (!message && attachedImages.length === 0) return;
    
    const container = document.getElementById('chatContainer');
    const mainChat = document.querySelector('.main-chat');
    if (mainChat && mainChat.classList.contains('is-empty')) {
        mainChat.classList.remove('is-empty');
        container.innerHTML = '';
    }

    input.value = '';
    appendMessage('user', message);

    const thinkingId = 'thinking-' + Date.now();
    appendMessage('assistant', '', thinkingId);
    const thinkingElem = document.getElementById(thinkingId);
    if (thinkingElem) {
        thinkingElem.style.position = 'relative';
        thinkingElem.style.minHeight = '180px';
        thinkingElem.appendChild(PageUI.skeleton('chat'));
    }

    try {
        if (!currentChatId) throw new Error('Creá un chat antes de enviar un mensaje.');
        const data = await chatRequest(`/api/chats/${currentChatId}/message`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, image_data: attachedImages[0]?.data,
                image_mime: attachedImages[0]?.mime, engine: window.getSelectedMotor?.() || 'synapse' })
        });
        appendMessage('assistant', data.reply || data.content || data.response, null, data.sources, data.thinking);
        clearAllImages();
    } catch (error) {
        alert(error.message);
        input.value = message;
    } finally {
        thinkingElem?.closest('.message-wrapper')?.remove();
    }
}

async function deleteChat(id) {
    try {
        await chatRequest(`/api/chats/${id}`, { method: 'DELETE', headers: authHeaders() });
    } catch (error) {
        alert(error.message);
        return;
    }
    if (currentChatId === id) {
        currentChatId = null;
        const container = document.getElementById('chatContainer');
        if (container) container.innerHTML = '';
    }
    loadChats();
}

function appendMessage(role, content, id = null, sources = null, thinking = null) {
    const container = document.getElementById('chatContainer');
    if (!container) return;
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `message-wrapper ${role}-wrapper`;
    
    const avatar = document.createElement('div');
    avatar.className = `avatar avatar--${role === 'user' ? 'operator' : 'cmdr'}`;
    avatar.innerHTML = role === 'user' 
        ? '<i data-lucide="user"></i>' 
        : '<svg class="avatar-cmdr" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="cmdr-ring" cx="60" cy="60" r="54"/><circle class="cmdr-ring-2" cx="60" cy="60" r="44"/><path class="cmdr-inter" d="M94 26 L70 50 L94 94 L70 70 L26 94 L50 70 L26 26 L50 50 Z"/><path class="cmdr-card" d="M60 6 L68 52 L114 60 L68 68 L60 114 L52 68 L6 60 L52 52 Z"/><circle class="cmdr-hub" cx="60" cy="60" r="6"/><circle class="cmdr-hub-core" cx="60" cy="60" r="2.4"/></svg>';
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role === 'user' ? 'user-msg' : 'assistant-msg'}`;
    if (id) msgDiv.id = id;
    
    msgWrapper.appendChild(avatar);
    msgWrapper.appendChild(msgDiv);
    container.appendChild(msgWrapper);
    lucide.createIcons();

    if (role === 'assistant' && !id) {
        const body = document.createElement('div');
        msgDiv.appendChild(body);
        PageUI.visible(body, () => PageUI.rich(body, content));
        body.textContent = content || '';
        if (sources && sources.length) {
            msgDiv.insertBefore(buildSourcesChip(sources), msgDiv.firstChild);
        }
        if (thinking) {
            msgDiv.insertBefore(buildThinkingBlock(thinking), msgDiv.firstChild);
            lucide.createIcons();
        }
    } else if (role === 'user') {
        msgDiv.innerText = content;
    }
    
    container.scrollTop = container.scrollHeight;
}

function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

loadChats = PageUI.wrap(loadChats, '#chatList', 'list');
openChat = PageUI.wrap(openChat, '#chatContainer', 'chat');
createChat = PageUI.wrap(createChat, '#chatContainer', 'chat');
