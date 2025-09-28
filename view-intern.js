/* view-intern.js - Lógica e renderização da tela do estagiário */

import { escapeHtml, nowISO, uuid, timestamp } from './utils.js';
import { showModal, showProvaBloqueadaModal } from './ui-modals.js';

// Importa funções e variáveis compartilhadas do app principal
import { state, session, save, render, findInternById, downloadBlob, hasPower } from './app.js';

// ------------- Funções movidas de app.js ---------------

function calcHoursSummary(intern) {
    const arr = intern.hoursEntries || [];
    const bank = arr.filter(e => e.hours > 0).reduce((s, e) => s + e.hours, 0);
    const neg = arr.filter(e => e.hours < 0 && !e.compensated).reduce((s, e) => s + Math.abs(e.hours), 0);
    return { bank, negative: neg, net: bank - neg };
}
function formatHours(h) { return Number(h).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }

export function renderIntern(user) {
    const root = document.getElementById('root');
    const intern = findInternById(user.internId);
    root.innerHTML = '';
    root.className = 'app';
    const card = document.createElement('div'); card.className = 'card';
    card.style.maxWidth = '1150px';
    card.style.margin = '28px auto';
    card.style.padding = '20px';

    const totals = calcHoursSummary(intern);
    const totalsHtml = totals.net >= 0
        ? `<div class="total-pill"><div class="small-muted">Banco de horas</div><div class="num">${formatHours(totals.net)} h</div></div>`
        : `<div class="total-pill"><div class="small-muted">Horas negativas</div><div class="num" style="color:var(--danger)">${formatHours(Math.abs(totals.net))} h</div></div>`;

    card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h2>${escapeHtml(intern?.name || user.username)}</h2>
        <div class="muted small">Área do estagiário — insira folgas-prova e veja calendário/horas.</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="button ghost" id="btnLogout">Sair</button>
        <button class="button" id="btnExportSelf">Exportar</button>
        ${user.selfPasswordChange ? '<button class="button ghost" id="btnChangePwdSelf">Alterar senha</button>' : ''}
      </div>
    </div>

    <hr style="margin:12px 0"/>

    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="min-width:320px">
        <div class="small-muted">Adicionar folga-prova</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
            <input type="date" id="inpMyProva" class="input" />
            <input type="text" id="inpMyProvaLink" class="input" placeholder="Link da prova (opcional)" />
            <button class="button alt" id="btnAddMyProva">Adicionar</button>
        </div>
        <div id="provaMsg" class="small-muted" style="margin-top:6px"></div>
      </div>

      <div style="margin-left:auto" id="totalsArea">${totalsHtml}</div>
    </div>

    <div style="margin-top:12px;display:flex;gap:16px;flex-direction:column">
      <div id="calendarWrap" class="card" style="padding:12px"></div>

      <div class="card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <h3>Histórico de lançamentos</h3>
            <div class="muted small">Banco / Negativas</div>
          </div>
          <div>
            ${hasPower(state.users.find(u => u.id === session.userId), 'manage_hours') ? '<button class="button" id="btnAddEntry">Lançar horas (admin)</button>' : ''}
          </div>
        </div>
        <div id="entriesList" style="margin-top:10px"></div>
      </div>
    </div>
  `;
    root.appendChild(card);

    document.getElementById('inpMyProva').value = nowISO();

    document.getElementById('btnAddMyProva').addEventListener('click', async () => {
        const d = document.getElementById('inpMyProva').value;
        const link = document.getElementById('inpMyProvaLink').value;
        if (!d) return alert('Escolha uma data');
        const blockDays = Number(state.meta.provaBlockDays || 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const allowedFrom = new Date(today.getTime() + (blockDays + 1) * 24 * 60 * 60 * 1000);
        const selected = new Date(d + 'T00:00:00');
        const allowedDate = new Date(allowedFrom.getFullYear(), allowedFrom.getMonth(), allowedFrom.getDate());

        if (selected.getTime() <= allowedDate.getTime()) {
            showProvaBloqueadaModal();
            return;
        }

        intern.dates = intern.dates || [];
        if (!intern.dates.some(p => p.date === d)) {
            intern.dates.push({ date: d, link: link });
        }

        await save(state);
        document.getElementById('inpMyProva').value = nowISO();
        document.getElementById('inpMyProvaLink').value = '';
        render();
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        window.logout(); // Usar a função global de logout do app.js
    });
    document.getElementById('btnExportSelf').addEventListener('click', () => { downloadBlob(JSON.stringify({ intern, user }, null, 2), `${(intern.name || user.username).replaceAll(' ', '_')}_dados.json`); });

    if (user.selfPasswordChange) {
        document.getElementById('btnChangePwdSelf').addEventListener('click', () => {
            const html = `
        <div style="display:flex;justify-content:space-between;align-items:center"><h3>Alterar minha senha</h3><button id="closeP" class="button ghost">Fechar</button></div>
        <form id="formPwd" style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
          <label style="position:relative;"><span class="small-muted">Senha atual</span>
            <input type="password" id="curPwd" required style="padding-right: 36px;"/>
            <span class="password-toggle-icon" id="toggleCurPwd">🔒️</span>
          </label>
          <label style="position:relative;"><span class="small-muted">Nova senha</span>
            <input type="password" id="newPwd" required style="padding-right: 36px;"/>
            <span class="password-toggle-icon" id="toggleNewPwd">🔒️</span>
          </label>
          <div style="display:flex;justify-content:flex-end;gap:8px"><button type="submit" class="button">Alterar</button></div>
        </form>
      `;
            const m = showModal(html);
            m.modal.querySelector('#closeP').addEventListener('click', () => { m.close(); m.cleanup(); });

            const toggleCurPwd = m.modal.querySelector('#toggleCurPwd');
            const curPwd = m.modal.querySelector('#curPwd');
            toggleCurPwd.style.position = 'absolute'; toggleCurPwd.style.right = '10px'; toggleCurPwd.style.top = '50%'; toggleCurPwd.style.transform = 'translateY(-50%)'; toggleCurPwd.style.cursor = 'pointer';
            toggleCurPwd.addEventListener('click', () => {
                const type = curPwd.getAttribute('type') === 'password' ? 'text' : 'password';
                curPwd.setAttribute('type', type);
                toggleCurPwd.textContent = type === 'password' ? '🔒' : '🔓';
            });

            const toggleNewPwd = m.modal.querySelector('#toggleNewPwd');
            const newPwd = m.modal.querySelector('#newPwd');
            toggleNewPwd.style.position = 'absolute'; toggleNewPwd.style.right = '10px'; toggleNewPwd.style.top = '50%'; toggleNewPwd.style.transform = 'translateY(-50%)'; toggleNewPwd.style.cursor = 'pointer';
            toggleNewPwd.addEventListener('click', () => {
                const type = newPwd.getAttribute('type') === 'password' ? 'text' : 'password';
                newPwd.setAttribute('type', type);
                toggleNewPwd.textContent = type === 'password' ? '🔒' : '🔓';
            });

            m.modal.querySelector('#formPwd').addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const cur = m.modal.querySelector('#curPwd').value;
                const np = m.modal.querySelector('#newPwd').value;
                const u = (state.users || []).find(x => x.id === session.userId);
                if (!u) return alert('Usuário não encontrado');
                if (u.password !== cur) return alert('Senha atual incorreta');
                if (!np) return alert('Senha nova inválida');
                u.password = np;
                await save(state);
                alert('Senha alterada');
                m.close();
                m.cleanup();
            });
        });
    }

    let viewing = new Date();
    function renderCalendar() {
        renderCalendarForIntern(intern, viewing);
    }
    renderCalendar();
    renderEntriesList(intern);

    const addBtn = document.getElementById('btnAddEntry');
    if (addBtn) addBtn.addEventListener('click', () => showHourEntryForm(intern.id));
}

function renderCalendarForIntern(intern, viewing) {
    const wrap = document.getElementById('calendarWrap');
    const monthStart = new Date(viewing.getFullYear(), viewing.getMonth(), 1);
    const label = monthStart.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div><strong>Calendário</strong></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="button ghost" id="prevMonth">&lt;</button>
        <div class="small-muted" id="monthLabel">${label}</div>
        <button class="button ghost" id="nextMonth">&gt;</button>
      </div>
    </div>
    <div class="calendar" style="grid-template-columns:repeat(7,1fr);font-weight:700;color:var(--muted)">
      <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
    </div>
    <div id="monthGrid" class="calendar" style="margin-top:10px"></div>
  `;
    const grid = document.getElementById('monthGrid');
    grid.innerHTML = '';
    const firstDay = new Date(viewing.getFullYear(), viewing.getMonth(), 1).getDay();
    const daysInMonth = new Date(viewing.getFullYear(), viewing.getMonth() + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div'); blank.className = 'day'; blank.style.visibility = 'hidden'; blank.innerHTML = '&nbsp;'; grid.appendChild(blank);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(viewing.getFullYear(), viewing.getMonth(), d);
        const iso = date.toISOString().slice(0, 10);
        const dayEl = document.createElement('div'); dayEl.className = 'day';
        dayEl.innerHTML = `<div class="date">${d}</div>`;

        const prova = (intern.dates || []).find(p => p.date === iso);
        if (prova) {
            const pill = document.createElement('div'); pill.className = 'tag bank'; pill.textContent = 'Folga-prova';
            const currentUser = (state.users || []).find(u => u.id === session.userId);
            if (currentUser && currentUser.role === 'intern' && currentUser.internId === intern.id) {
                const rem = document.createElement('button'); rem.className = 'button ghost'; rem.textContent = '🗑️';
                const wrapper = document.createElement('div'); wrapper.className = 'wrapper';
                rem.addEventListener('click', async (ev) => { ev.stopPropagation(); if (confirm('Remover sua folga-prova nesta data?')) { intern.dates = intern.dates.filter(x => x.date !== iso); await save(state); render(); } });

                wrapper.appendChild(pill); wrapper.appendChild(rem);
                dayEl.appendChild(wrapper);
            } else {
                dayEl.appendChild(pill);
            }
        }
        ((intern.hoursEntries) || []).filter(e => e.date === iso).forEach(e => {
            const tag = document.createElement('div'); tag.className = 'tag ' + (e.hours > 0 ? 'bank' : 'neg'); tag.textContent = `${e.hours > 0 ? '+' : ''}${e.hours}h`;
            dayEl.appendChild(tag);
        });
        dayEl.addEventListener('click', () => openDayDetails(intern, iso));
        grid.appendChild(dayEl);
    }

    document.getElementById('prevMonth').addEventListener('click', () => {
        viewing.setMonth(viewing.getMonth() - 1);
        renderCalendarForIntern(intern, viewing);
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
        viewing.setMonth(viewing.getMonth() + 1);
        renderCalendarForIntern(intern, viewing);
    });
}

function openDayDetails(intern, iso) {
    const provas = (intern.dates || []).filter(p => p.date === iso);
    const entries = (intern.hoursEntries || []).filter(e => e.date === iso);
    const htmlParts = [];
    htmlParts.push(`<div style="display:flex;justify-content:space-between;align-items:center"><h3>Detalhes — ${iso}</h3><button id="closeD" class="button ghost">Fechar</button></div>`);
    htmlParts.push('<div style="margin-top:8px">');
    htmlParts.push('<h4>Folgas-prova</h4>');
    if (provas.length === 0) htmlParts.push('<div class="muted small">Nenhuma folga-prova nesta data</div>');
    else provas.forEach(p => htmlParts.push(`<div class="row"><div>${p.date} • <span class="small-muted">Folga-prova registrada</span></div> ${p.link ? `<a href="${p.link}" target="_blank" class="button ghost">Ver prova</a>` : ''}</div>`));
    htmlParts.push('<hr/>');
    htmlParts.push('<h4>Lançamentos</h4>');
    if (entries.length === 0) htmlParts.push('<div class="muted small">Nenhum lançamento</div>');
    else entries.forEach(e => {
        const currentUser = (state.users || []).find(u => u.id === session.userId);
        const canManageHours = hasPower(currentUser, 'manage_hours');

        const actions = canManageHours
            ? `<div style="display:flex;gap:6px;"><button class="button ghost" data-edit="${e.id}">Editar</button><button class="button" data-delete="${e.id}">Excluir</button></div>`
            : '';
        const compensation = e.hours < 0 && canManageHours
            ? (e.compensated
                ? `<button class="button ghost" data-uncomp="${e.id}">Desfazer comp.</button>`
                : `<button class="button" data-comp="${e.id}">Marcar comp.</button>`)
            : '';

        htmlParts.push(`
      <div class="row" style="flex-direction:column;align-items:flex-start;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
          <div style="font-weight:700;">${e.date} • ${e.hours > 0 ? '+' : ''}${e.hours}h ${e.type === 'bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div>
          <div style="display:flex;gap:6px">${actions}</div>
        </div>
        <div class="small-muted" style="margin-left:8px;">${escapeHtml(e.reason || 'Sem justificativa')}</div>
        <div class="audit" style="margin-left:8px;">Criado por: ${escapeHtml(e.createdByName || '—')} em ${e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}${e.lastModifiedBy ? ' • Alterado por: ' + escapeHtml(e.lastModifiedBy) : ''}${e.compensatedBy ? ' • Compensado por: ' + escapeHtml(e.compensatedBy) + ' em ' + (e.compensatedAt ? new Date(e.compensatedAt).toLocaleString() : '') : ''}</div>
        ${compensation ? `<div style="margin-top:8px;">${compensation}</div>` : ''}
      </div>
    `);
    });
    htmlParts.push('</div>');

    const m = showModal(htmlParts.join(''), { allowBackdropClose: true });
    m.modal.querySelector('#closeD').addEventListener('click', () => { m.close(); m.cleanup(); });

    m.modal.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        if (!confirm('Excluir lançamento?')) return;
        const entry = (intern.hoursEntries || []).find(x => x.id === id);
        const manager = (state.users || []).find(u => u.id === session.userId);
        if (entry) {
            intern.auditLog.push({ id: uuid(), action: 'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Excluído lançamento ${entry.id}` });
            intern.hoursEntries = intern.hoursEntries.filter(x => x.id !== id);
            await save(state);
            m.close();
            m.cleanup();
            render();
        }
    }));

    m.modal.querySelectorAll('[data-comp]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-comp');
        markCompensated(intern.id, id, true);
        intern.auditLog.push({ id: uuid(), action: 'compensated', byUserId: session.userId, at: timestamp(), details: `Compensou ${id}` });
        await save(state);
        m.close();
        m.cleanup();
        render();
    }));

    m.modal.querySelectorAll('[data-uncomp]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-uncomp');
        markCompensated(intern.id, id, false);
        intern.auditLog.push({ id: uuid(), action: 'uncompensated', byUserId: session.userId, at: timestamp(), details: `Desfez compensação ${id}` });
        await save(state);
        m.close();
        m.cleanup();
        render();
    }));

    m.modal.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit');
        m.close();
        m.cleanup();
        showHourEntryForm(intern.id, id);
    }));
}

// ===============================================================
// === FUNÇÕES FALTANTES ADICIONADAS A PARTIR DAQUI ===
// ===============================================================

// ----------------- Entries list -----------------
function renderEntriesList(intern) {
    const list = document.getElementById('entriesList'); if (!list) return;
    list.innerHTML = '';
    const arr = ((intern.hoursEntries) || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (arr.length === 0) { list.innerHTML = '<div class="muted">Nenhum lançamento</div>'; return; }
    arr.forEach(e => {
        const row = document.createElement('div'); row.className = 'row';
        const currentUser = (state.users || []).find(u => u.id === session.userId);
        const left = document.createElement('div');
        left.innerHTML = `<div style="font-weight:700">${e.date} — ${e.hours > 0 ? '+' : ''}${e.hours}h ${e.type === 'bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div><div class="small-muted">${escapeHtml(e.reason || '')}</div><div class="audit">Criado por: ${escapeHtml(e.createdByName || '—')} em ${e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}</div>`;
        const right = document.createElement('div');
        if (hasPower(currentUser, 'manage_hours')) {
            const btnEdit = document.createElement('button'); btnEdit.className = 'button ghost'; btnEdit.textContent = 'Editar'; btnEdit.addEventListener('click', () => showHourEntryForm(intern.id, e.id));
            const btnDel = document.createElement('button'); btnDel.className = 'button'; btnDel.textContent = 'Excluir'; btnDel.addEventListener('click', async () => { if (confirm('Excluir lançamento?')) { const manager = (state.users || []).find(u => u.id === session.userId); intern.auditLog = intern.auditLog || []; intern.auditLog.push({ id: uuid(), action: 'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Excluído lançamento ${e.id} (${e.hours}h ${e.type})` }); intern.hoursEntries = intern.hoursEntries.filter(x => x.id !== e.id); await save(state); render(); } });
            right.appendChild(btnEdit); right.appendChild(btnDel);
            if (e.hours < 0) {
                const btnComp = document.createElement('button'); btnComp.className = e.compensated ? 'button ghost' : 'button'; btnComp.textContent = e.compensated ? 'Desfazer comp.' : 'Marcar compensado';
                btnComp.addEventListener('click', async () => { markCompensated(intern.id, e.id, !e.compensated); const manager = (state.users || []).find(u => u.id === session.userId); intern.auditLog = intern.auditLog || []; intern.auditLog.push({ id: uuid(), action: e.compensated ? 'uncompensated' : 'compensated', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `${e.compensated ? 'Desfez compensação' : 'Compensou'} lançamento ${e.id}` }); await save(state); render(); });
                right.appendChild(btnComp);
            }
        }
        row.appendChild(left); row.appendChild(right); list.appendChild(row);
    });
}

// ----------------- Hour entry modal (create/edit) -----------------
export function showHourEntryForm(internId, entryId) {
    const intern = findInternById(internId);
    if (!intern) return;
    const isEdit = !!entryId;
    const existing = isEdit ? ((intern.hoursEntries) || []).find(e => e.id === entryId) : null;
    const currentManager = (state.users || []).find(u => u.id === session.userId);
    if (!hasPower(currentManager, 'manage_hours')) return alert('Sem permissão para gerenciar horas.');
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>${isEdit ? 'Editar' : 'Lançar'} horas — ${escapeHtml(intern.name)}</h3><button id="closeH" class="button ghost">Fechar</button></div>
    <form id="formHours" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
      <label><span class="small-muted">Data</span><input type="date" id="h_date" value="${existing ? existing.date : nowISO()}" required /></label>
      <label><span class="small-muted">Tipo</span>
        <select id="h_type"><option value="bank">Banco (crédito)</option><option value="negative">Negativa (falta)</option></select>
      </label>
      <label><span class="small-muted">Quantidade de horas (número)</span><input id="h_hours" value="${existing ? Math.abs(existing.hours) : 8}" type="number" min="0.25" step="0.25" required /></label>
      <label><span class="small-muted">Justificativa / observações</span><textarea id="h_reason" rows="3">${existing ? escapeHtml(existing.reason || '') : ''}</textarea></label>
      <label><input type="checkbox" id="h_comp" ${existing && existing.compensated ? 'checked' : ''}/> Marcar como compensado (aplica-se a negativas)</label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">${isEdit ? 'Salvar' : 'Lançar'}</button>
      </div>
    </form>
  `;
    const m = showModal(html);
    const modal = m.modal;
    modal.querySelector('#closeH').addEventListener('click', () => { m.close(); m.cleanup(); });
    if (existing) modal.querySelector('#h_type').value = existing.type;
    modal.querySelector('#formHours').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const date = modal.querySelector('#h_date').value;
        const type = modal.querySelector('#h_type').value;
        const hoursRaw = modal.querySelector('#h_hours').value;
        const hoursNum = Number(hoursRaw);
        if (!date || !hoursNum || isNaN(hoursNum) || hoursNum <= 0) return alert('Dados inválidos');
        const reason = modal.querySelector('#h_reason').value || '';
        const comp = !!modal.querySelector('#h_comp').checked;
        const manager = (state.users || []).find(u => u.id === session.userId);
        if (isEdit && existing) {
            existing.date = date;
            existing.type = type;
            existing.hours = type === 'bank' ? hoursNum : -hoursNum;
            existing.reason = reason;
            existing.lastModifiedBy = manager.username;
            existing.lastModifiedAt = timestamp();
            existing.compensated = comp;
            await save(state);
            intern.auditLog.push({ id: uuid(), action: 'edit_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Editou lançamento ${existing.id}` });
        } else {
            const entry = { id: uuid(), date, type, hours: type === 'bank' ? hoursNum : -hoursNum, reason, compensated: comp, createdById: manager.id, createdByName: manager.username, createdAt: timestamp() };
            intern.hoursEntries = intern.hoursEntries || [];
            intern.hoursEntries.push(entry);
            intern.auditLog.push({ id: uuid(), action: 'create_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Criou lançamento ${entry.id}` });
        }
        await save(state);
        m.close();
        m.cleanup();
        render();
    });
}

// ----------------- Mark compensated -----------------
export async function markCompensated(internId, entryId, flag) {
    const intern = findInternById(internId);
    if (!intern) return;
    const entry = ((intern.hoursEntries) || []).find(e => e.id === entryId);
    if (!entry) return;
    entry.compensated = !!flag;
    if (flag) {
        entry.compensatedBy = ((state.users || []).find(u => u.id === session.userId) || {}).username;
        entry.compensatedAt = timestamp();
    } else {
        entry.compensatedBy = null;
        entry.compensatedAt = null;
    }
    await save(state);
}