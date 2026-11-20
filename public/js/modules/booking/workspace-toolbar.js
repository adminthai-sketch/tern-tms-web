// Keep the grid visible by default, while preserving the existing tool handlers.
window.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('dispatch-toolbar');
    const actions = document.getElementById('dispatch-toolbar-actions');
    const primary = document.getElementById('dispatch-primary-views');
    const section = primary.parentElement;
    const tools = document.createElement('div');
    tools.id = 'dispatch-extra-tools';
    tools.className = 'dispatch-extra-tools';
    const secondary = document.createElement('div');
    secondary.className = 'dispatch-secondary-actions';
    for (const item of [...actions.children]) {
        if (item.id !== 'btn-save-grid' && !item.getAttribute('onclick')?.includes('exportToExcel')) secondary.append(item);
    }
    tools.append(secondary);
    const badge = document.getElementById('save-status-badge');
    actions.append(badge);
    tools.append(document.getElementById('dispatch-quick-tools'));
    for (const item of [...section.children]) {
        if (item.id !== 'dispatch-primary-views' && item.id !== 'dispatch-booking-summary') tools.append(item);
    }
    panel.append(tools);
    const toggle = document.createElement('button');
    toggle.id = 'dispatch-toggle-tools'; toggle.type = 'button';
    toggle.className = 'dispatch-toggle-tools';
    toggle.setAttribute('aria-controls', tools.id);
    let expanded = false;
    try { expanded = localStorage.getItem('dispatch-tools-expanded') === 'true'; } catch {}
    function render() {
        tools.hidden = !expanded;
        toggle.textContent = expanded ? '▾ พับเครื่องมือ' : '▸ เครื่องมือเพิ่มเติม';
        toggle.setAttribute('aria-expanded', String(expanded));
        requestAnimationFrame(() => hotGridInstance?.refreshDimensions());
    }
    toggle.onclick = () => {
        expanded = !expanded;
        try { localStorage.setItem('dispatch-tools-expanded', String(expanded)); } catch {}
        render();
    };
    actions.append(toggle); render();
});
