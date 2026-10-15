/* Render the newest messages first. Older DOM and rich content wait for interaction. */
export function mount(container, messages, render) {
    let cursor = messages.length;
    container.replaceChildren();
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'ui-history-more'; more.textContent = 'Cargar mensajes anteriores';
    function batch() {
        const start = Math.max(0, cursor - 20);
        const previous = [...container.children].filter(node => node !== more && !node.classList.contains('ui-skeleton'));
        const oldHeight = container.scrollHeight;
        const oldTop = container.scrollTop;
        more.remove();
        // Existing message nodes keep their listeners and rendered math.
        previous.forEach(node => node.remove());
        for (const message of messages.slice(start, cursor)) render(message);
        previous.forEach(node => container.appendChild(node));
        cursor = start;
        if (cursor) container.prepend(more);
        if (previous.length) container.scrollTop = oldTop + container.scrollHeight - oldHeight;
        else container.scrollTop = container.scrollHeight;
    }
    more.onclick = () => PageUI.run(container, 'chat', async () => batch());
    batch();
}
