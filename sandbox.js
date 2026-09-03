let currentChatId = null;
let attachedImages = [];   // Array de { data: base64, mime: string }
let activeFriendEmail = null;
let friendsPollInterval = null;

// Requerir autenticación al cargar
Auth.requireAuth();

// Helper: obtiene el token del storage
function getToken() {
    return Auth._getStorageItem('ciphra_token') || '';
}

function authHeaders() {
    const token = getToken();
    return token ? { 'Authorization': token } : {};
}

// Inicializar interfaz de usuario y pill de perfil
function initUI() {
    const user = Auth.getUser();
    if (!user) return;

    // Nombre en el botón del pill
    const nameSpan = document.getElementById('operator-name');
    nameSpan.innerText = (user.nickname || user.username || user.email).toUpperCase();

    // Dropdown de perfil
    document.getElementById('dp-user-name').innerText = (user.nickname || user.username).toUpperCase();
    document.getElementById('dp-user-email').innerText = user.email.toLowerCase();

    const avatarBox = document.getElementById('dp-avatar-box');
    if (user.profile_pic) {
        avatarBox.innerHTML = `<img src="${user.profile_pic}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
        avatarBox.innerHTML = `<i data-lucide="user" style="width: 24px; color: var(--ciphra-yellow);"></i>`;
    }

    if (user.plan === 'pro') {
        document.getElementById('pro-badge').style.display = 'inline-block';
        document.getElementById('upgrade-link').style.display = 'none';
    } else {
        document.getElementById('pro-badge').style.display = 'none';
        document.getElementById('upgrade-link').style.display = 'flex';
    }

    // Toggle de Dropdown
    const pillBtn = document.getElementById('user-pill-btn');
    const dropdown = document.querySelector('.pill-dropdown');
    pillBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
        pillBtn.classList.toggle('active');
    });

    document.addEventListener('click', () => {
        dropdown.classList.remove('active');
        pillBtn.classList.remove('active');
    });

    // Cerrar sesión
    document.getElementById('logout-btn').addEventListener('click', () => {
        Auth.logout();
    });

    lucide.createIcons();
}

// Cargar listas
async function loadSandboxData() {
    await loadFriendsList();
    await loadFriendsChats();
}

async function loadFriendsList() {
    try {
        const res = await fetch('/api/friends/list', { headers: authHeaders() });
        const data = await res.json();
        
        const pendingSection = document.getElementById('pending-requests-section');
        const pendingList = document.getElementById('pendingRequestsList');
        pendingList.innerHTML = '';
        
        if (data.pending_received && data.pending_received.length > 0) {
            pendingSection.style.display = 'block';
            data.pending_received.forEach(req => {
                const card = document.createElement('div');
                card.className = 'friend-req-card';
                card.innerHTML = `
                    <div class="friend-req-info">${req.nickname} (${req.username})</div>
                    <div class="friend-req-actions">
                        <button class="req-btn accept" onclick="acceptRequest('${req.email}')">Aceptar</button>
                        <button class="req-btn reject" onclick="rejectRequest('${req.email}')">Rechazar</button>
                    </div>
                `;
                pendingList.appendChild(card);
            });
        } else {
            pendingSection.style.display = 'none';
        }
        
        const listDiv = document.getElementById('friendsList');
        listDiv.innerHTML = '';
        if (data.friends && data.friends.length > 0) {
            data.friends.forEach(f => {
                const item = document.createElement('div');
                item.className = 'chat-item';
                item.onclick = () => startFriendChat(f.email);
                
                let avHtml = '';
                if (f.profile_pic) {
                    avHtml = `<img src="${f.profile_pic}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">`;
                } else {
                    avHtml = `<i data-lucide="user" style="width: 14px;"></i>`;
                }
                
                item.innerHTML = `
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 8px; flex: 1;">
                        ${avHtml}
                        ${f.nickname}
                    </span>
                    <i data-lucide="message-square" style="width: 14px; opacity: 0.6;"></i>
                `;
                listDiv.appendChild(item);
            });
        } else {
            listDiv.innerHTML = `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; padding: 1rem 0;">Aún no tenés amigos agregados.</div>`;
        }
        lucide.createIcons();
    } catch (e) {
        console.error("Error al cargar amigos:", e);
    }
}

async function loadFriendsChats() {
    try {
        const res = await fetch('/api/friends/chats', { headers: authHeaders() });
        const chats = await res.json();
        const directList = document.getElementById('directChatsList');
        directList.innerHTML = '';
        
        if (chats && chats.length > 0) {
            chats.forEach(c => {
                const item = document.createElement('div');
                item.className = `chat-item ${c.id === currentChatId ? 'active' : ''}`;
                item.onclick = () => openFriendChat(c.id, c.other_email);
                
                let avHtml = '';
                if (c.other_profile_pic) {
                    avHtml = `<img src="${c.other_profile_pic}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">`;
                } else {
                    avHtml = `<i data-lucide="message-circle" style="width: 14px;"></i>`;
                }
                
                item.innerHTML = `
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 8px; flex: 1;">
                        ${avHtml}
                        ${c.title}
                    </span>
                    <span class="sandbox-header-badge" style="font-size:8px;">DIRECT</span>
                `;
                directList.appendChild(item);
            });
        } else {
            directList.innerHTML = `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; padding: 1rem 0;">No hay chats directos activos.</div>`;
        }
        lucide.createIcons();
    } catch (e) {
        console.error("Error al cargar chats directos:", e);
    }
}

// Acciones de amigos
async function openAddFriendPrompt() {
    const target = prompt("Ingresá el Email o Usuario del operador de Ciphra a agregar:");
    if (!target) return;
    
    try {
        const res = await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ target })
        });
        const data = await res.json();
        alert(data.message);
        if (data.success) {
            loadSandboxData();
        }
    } catch (e) {
        alert("Error al conectar con la red de Ciphra.");
    }
}

async function acceptRequest(email) {
    try {
        const res = await fetch('/api/friends/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        alert(data.message);
        loadSandboxData();
    } catch (e) {
        alert("Error al aceptar solicitud.");
    }
}

async function rejectRequest(email) {
    try {
        const res = await fetch('/api/friends/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        alert(data.message);
        loadSandboxData();
    } catch (e) {
        alert("Error al rechazar solicitud.");
    }
}

async function startFriendChat(email) {
    try {
        const res = await fetch('/api/friends/chats/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ friend_email: email })
        });
        const data = await res.json();
        if (data.chat_id) {
            openFriendChat(data.chat_id, email);
            loadFriendsChats();
        } else {
            alert("No se pudo iniciar el canal directo.");
        }
    } catch (e) {
        alert("Error al iniciar el canal directo.");
    }
}

async function openFriendChat(chatId, otherEmail) {
    currentChatId = chatId;
    activeFriendEmail = otherEmail;
    
    if (friendsPollInterval) {
        clearInterval(friendsPollInterval);
    }
    
    // Cambiar la clase activa
    document.querySelectorAll('#directChatsList .chat-item').forEach(item => {
        item.classList.remove('active');
    });
    
    await refreshDirectChatMessages();
    friendsPollInterval = setInterval(refreshDirectChatMessages, 3000);
}

async function refreshDirectChatMessages() {
    if (!currentChatId) return;
    
    try {
        const res = await fetch(`/api/friends/chats/${currentChatId}`, { headers: authHeaders() });
        const chat = await res.json();
        
        document.getElementById('activeChatTitle').innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="pill-dot" style="background:#eab308; box-shadow: 0 0 10px #eab308; width: 8px; height: 8px; border-radius: 50%;"></span>
                ${chat.title}
                <span class="sandbox-header-badge">👤 CANAL BETA</span>
            </div>
        `;
        
        const container = document.getElementById('chatContainer');
        const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
        
        const currentMsgCount = container.querySelectorAll('.message-wrapper').length;
        if (chat.messages.length === currentMsgCount) {
            return;
        }
        
        container.innerHTML = '';
        
        if (chat.messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state-logo">
                    <i data-lucide="flask-conical" style="width: 48px; height: 48px; margin-bottom: 1rem; color: var(--ciphra-yellow);"></i>
                    <h2 style="font-family: 'League Spartan'; letter-spacing: 2px;">CANAL DIRECTO (BETA)</h2>
                    <p style="opacity: 0.7; font-size: 0.9rem;">Enlace directo cifrado con redundancia camaleón activa.</p>
                </div>
            `;
            lucide.createIcons();
        } else {
            chat.messages.forEach(msg => {
                const isMe = msg.sender === Auth.getUser().email;
                appendDirectMessage(isMe ? 'user' : 'assistant', msg.sender_name, msg.content, msg.image_data, msg.image_mime);
            });
        }
        
        if (wasAtBottom) {
            container.scrollTop = container.scrollHeight;
        }
    } catch (e) {
        console.error("Error al refrescar mensajes directos:", e);
    }
}

function appendDirectMessage(role, senderName, content, imageData = null, imageMime = 'image/jpeg') {
    const container = document.getElementById('chatContainer');
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `message-wrapper ${role}-wrapper`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = role === 'user' ? '<i data-lucide="user"></i>' : '<i data-lucide="message-square"></i>';
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role === 'user' ? 'user-msg' : 'assistant-msg'}`;
    
    const senderHeader = document.createElement('div');
    senderHeader.style.cssText = "font-size: 0.7rem; font-weight: 700; color: var(--ciphra-yellow); margin-bottom: 4px; letter-spacing: 0.05em;";
    senderHeader.innerText = senderName.toUpperCase();
    
    const contentDiv = document.createElement('div');
    contentDiv.innerText = content;
    
    msgDiv.appendChild(senderHeader);
    if (content) {
        msgDiv.appendChild(contentDiv);
    }
    
    if (imageData) {
        const img = document.createElement('img');
        const src = imageData.startsWith('data:') ? imageData : `data:${imageMime};base64,${imageData}`;
        img.src = src;
        img.style.cssText = "max-width: 250px; max-height: 250px; border-radius: 8px; margin-top: 8px; display: block; border: 1px solid var(--glass-border);";
        msgDiv.appendChild(img);
    }
    
    msgWrapper.appendChild(avatar);
    msgWrapper.appendChild(msgDiv);
    container.appendChild(msgWrapper);
    lucide.createIcons();
    
    container.scrollTop = container.scrollHeight;
}

// Envío de mensajes
async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    if (!currentChatId) return;
    if (!message && attachedImages.length === 0) return;
    
    input.value = '';
    try {
        const payload = { message };
        if (attachedImages.length > 0) {
            payload.image_data = attachedImages[0].data;
            payload.image_mime = attachedImages[0].mime;
            clearAllImages();
        }
        const res = await fetch(`/api/friends/chats/${currentChatId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(payload)
        });
        await refreshDirectChatMessages();
    } catch (e) {
        console.error("Error al enviar mensaje:", e);
    }
}

// Adjuntar imágenes
function handleImageAttach(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        attachedImages = [{
            data: e.target.result,
            mime: file.type
        }];
        renderThumbStrip();
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function renderThumbStrip() {
    const strip = document.getElementById('thumb-strip');
    strip.innerHTML = '';
    if (attachedImages.length === 0) {
        strip.style.display = 'none';
        return;
    }
    
    strip.style.display = 'flex';
    attachedImages.forEach((img, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'thumb-container';
        thumb.style.position = 'relative';
        thumb.innerHTML = `
            <img src="${img.data}" style="width:40px; height:40px; border-radius:6px; object-fit:cover; border:1px solid var(--ciphra-yellow);">
            <div onclick="removeImage(${idx})" style="position:absolute; top:-6px; right:-6px; background:#ef4444; border-radius:50%; width:14px; height:14px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:9px; color:#fff; font-weight:700;">×</div>
        `;
        strip.appendChild(thumb);
    });
}

function removeImage(idx) {
    attachedImages.splice(idx, 1);
    renderThumbStrip();
}

function clearAllImages() {
    attachedImages = [];
    renderThumbStrip();
}

function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Canje de códigos
async function redeemCode() {
    const code = prompt("Ingresá tu código de invitación Ciphra PRO:");
    if (!code) return;
    
    try {
        const res = await fetch('/api/auth/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        alert(data.message);
        if (data.success) {
            // Actualizar datos de usuario local
            const user = Auth.getUser();
            user.plan = 'pro';
            Auth._setStorageItem('ciphra_user', JSON.stringify(user));
            initUI();
        }
    } catch (e) {
        alert("Error de conexión.");
    }
}

// Inicialización general
window.onload = async () => {
    initUI();
    await loadSandboxData();
    // Auto-recarga de amigos y solicitudes recibidas cada 8 segundos
    setInterval(loadSandboxData, 8000);
};
