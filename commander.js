let currentChatId = 'demo-chat-1';
let attachedImages = [];   // Array de { data: base64, mime: string }

// Chat local de demostración para trabajar sin servidor
let localChats = [
    { id: 'demo-chat-1', title: 'Espacio de trabajo Ciphra', created_at: new Date().toISOString(), messages: [] }
];

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
    panel.innerHTML = safeMarkdown(thinking);
    btn.onclick = () => {
        const open = panel.style.display === 'none';
        panel.style.display = open ? 'block' : 'none';
        const caret = btn.querySelector('.think-caret');
        if (caret) caret.textContent = open ? '▴' : '▾';
        if (open && window.MathJax) MathJax.typesetPromise([panel]);
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

const OPERADOR_DEMO = {
    username: 'OPERADOR_DEMO',
    nickname: 'OPERADOR_DEMO',
    email: 'operador@ciphra.io',
    plan: 'pro'
};

function getToken() {
    return (typeof Auth !== 'undefined' && Auth._getStorageItem) 
        ? Auth._getStorageItem('ciphra_token') || 'dev_token_pro' 
        : 'dev_token_pro';
}

function authHeaders() {
    return { 'Authorization': getToken() };
}

// Cargar chats (con fallback a local en modo offline/desarrollo sin bloqueo por 401 o desconexión)
async function loadChats() {
    let chats = localChats;
    try {
        const res = await fetch('/api/chats', { headers: authHeaders() });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) chats = data;
        } else if (res.status === 401) {
            console.warn("401 Unauthorized en /api/chats - manteniendo usuario en memoria (modo local/mock).");
        }
    } catch (e) {
        console.warn("API desconectada en loadChats, usando modo mock local:", e);
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
    const newId = 'chat-' + Date.now();
    const newChatObj = { id: newId, title: 'Nuevo chat', created_at: new Date().toISOString(), messages: [] };
    
    try {
        const res = await fetch('/api/chats/create', { method: 'POST', headers: authHeaders() });
        if (res.ok) {
            const data = await res.json();
            currentChatId = data.chat_id || newId;
        } else {
            if (res.status === 401) {
                console.warn("401 Unauthorized en /api/chats/create - creando chat local.");
            }
            localChats.push(newChatObj);
            currentChatId = newId;
        }
    } catch(e) {
        console.warn("API desconectada en createChat, creando chat local:", e);
        localChats.push(newChatObj);
        currentChatId = newId;
    }

    await loadChats();
    openChat(currentChatId);
}

async function openChat(id) {
    currentChatId = id;
    let chat = localChats.find(c => c.id === id) || { id, title: 'Chat Ciphra', messages: [] };

    try {
        const res = await fetch(`/api/chats/${id}`, { headers: authHeaders() });
        if (res.ok) {
            chat = await res.json();
        } else if (res.status === 401) {
            console.warn(`401 Unauthorized en /api/chats/${id} - usando chat local.`);
        }
    } catch(e) {
        console.warn(`API desconectada al abrir chat ${id}:`, e);
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
        chat.messages.forEach(msg => {
            appendMessage(msg.role, msg.content, null, msg.sources, msg.thinking);
        });
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
        thinkingElem.innerHTML = `<div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-phrase">Procesando consulta...</span>`;
    }

    let assistantResponse = null;
    try {
        const res = await fetch(`/api/chats/${currentChatId || 'demo-chat-1'}/message`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, images: attachedImages, engine: window.selectedMotor || 'synapse' })
        });
        if (res.ok) {
            const data = await res.json();
            assistantResponse = data.content || data.response;
        } else if (res.status === 401) {
            console.warn("401 Unauthorized en sendMessage - utilizando respuesta mock local.");
        }
    } catch(e) {
        console.warn("API no disponible al enviar mensaje, usando respuesta mock local:", e);
    }

    setTimeout(() => {
        const wrapper = thinkingElem ? thinkingElem.closest('.message-wrapper') : null;
        if (wrapper) wrapper.remove();
        clearAllImages();
        const content = assistantResponse || 'Esta es una respuesta simulada en modo desarrollo para evaluar la interfaz de Ciphra.';
        appendMessage('assistant', content);
    }, 1000);
}

async function deleteChat(id) {
    localChats = localChats.filter(c => c.id !== id);
    try {
        const res = await fetch(`/api/chats/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (res.status === 401) {
            console.warn(`401 Unauthorized en DELETE /api/chats/${id}.`);
        }
    } catch(e) {
        console.warn("API desconectada al eliminar chat:", e);
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
        msgDiv.innerHTML = safeMarkdown(content);
        if (window.MathJax) MathJax.typesetPromise([msgDiv]);
        if (window.renderDiagrams) window.renderDiagrams(msgDiv);
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

window.onload = loadChats;