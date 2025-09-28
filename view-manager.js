/* view-manager.js - Lógica e renderização da tela do gestor */

import { escapeHtml, formatDate, nowISO, uuid, timestamp } from './utils.js';
import { showModal, showChangePwdModalManager } from './ui-modals.js';

// Funções de outros módulos que a view do manager precisa
import {
    state,
    session,
    save,
    render,
    findUserByIntern,
    findInternById,
    hasPower,
    defaultPowersFor,
    downloadBlob,
    userFilter
} from './app.js';

// Funções da view do estagiário que o manager também usa para gerenciar horas
import { showHourEntryForm, markCompensated } from './view-intern.js';

// Variáveis de estado específicas deste módulo
let adminViewingDate = new Date();
let adminProvasView = 'list';
let importedUserData = [];

// Função principal de renderização, que será exportada
export function renderManager(user) {
    const root = document.getElementById('root');
    root.innerHTML = '';
    root.className = 'app-grid';

    const pendingCount = (state.pendingRegistrations || []).length;
    const pendingClass = pendingCount > 0 ? 'has-pending' : '';
    const isSuperAdmin = user.role === 'super';

    root.innerHTML = `
    <aside class="sidebar-nav">
      <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent);">
        Painel de Gestão
      </div>
      <div class="muted small">Usuário: ${escapeHtml(user.username)} • ${escapeHtml(user.role)}</div>
      
      ${isSuperAdmin ?
            `<button class="button" id="btnChangePwdSuper" style="width: 100%; margin: 8px 0;">Alterar Senha</button><hr style="border-color: #eee; margin: 8px 0;">` :
            (user.role === 'admin' && user.selfPasswordChange ?
                `<button class="button ghost" id="btnChangePwdMgr" style="width: 100%; margin: 8px 0;">Alterar Senha</button><hr style="border-color: #eee; margin: 8px 0;">` :
                `<hr style="border-color: #eee; margin: 8px 0;">`)
        }

      <div class="sidebar-item active" data-section="geral">
        <span>Geral</span>
      </div>
      <div class="sidebar-item" data-section="provas">
        <span>Folgas-prova</span>
      </div>
      <div class="sidebar-item" data-section="relatorios">
        <span>Relatórios de Horas</span>
      </div>
      <div class="sidebar-item ${pendingClass}" data-section="pendentes">
        <span>Pré-cadastros Pendentes</span>
        <span id="pending-count-badge" class="badge" style="display: ${pendingCount > 0 ? 'inline-block' : 'none'};">${pendingCount}</span>
      </div>
      <div class="sidebar-item" data-section="configuracoes">
        <span>Configurações</span>
      </div>
      
      ${user.role === 'super' ? `
      <div class="sidebar-item" id="btnSidebarBackup">
        <span>Backup</span>
      </div>
      ` : ''}

      <div class="sidebar-item" data-section="lixeira">
        <span>Lixeira</span>
      </div>
      <div style="margin-top: auto;">
        <button class="button ghost" id="btnLogoutMgr">Sair</button>
      </div>
    </aside>
    <main class="main-content">
      <div id="geral" class="content-section active">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Usuários</h3>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button id="btnNewUser" class="button ghost">Novo usuário</button>
              <button id="btnBulkImport" class="button alt">Criar em lote</button>
            </div>
          </div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
             <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap">
                <div id="userFilterButtons" style="display:flex;gap:8px;align-items:center;">
                   <button class="button" id="filterAll" data-filter="all">Todos</button>
                   <button class="button ghost" id="filterIntern" data-filter="intern">Estagiário</button>
                   <button class="button ghost" id="filterAdmin" data-filter="admin">Admin</button>
                </div>
                <button id="btnDeleteSelectedUsers" class="button danger" disabled>Excluir selecionados</button>
             </div>
             <input id="searchMgmt" placeholder="Pesquisar por nome, usuário ou ID" />
             <div class="muted small">Total de usuários: <span id="totalUsers"></span></div>
             <div class="list" id="usersList" style="margin-top:10px"></div>
          </div>
        </div>
        <div class="card" style="margin-top:12px">
            <h3>Pesquisa de Estagiários</h3>
            <div class="muted small">Pesquise por estagiário — lista dinâmica. Clique para abrir detalhes.</div>
            <div style="margin-top:8px;position:relative">
                <input id="mgrNameSearch" placeholder="Pesquisar por nome do estagiário" autocomplete="off" />
                <div id="mgrNameDropdown" class="dropdown" style="position:absolute;left:0;right:0;z-index:30;display:none;background:#fff;border:1px solid #eee;max-height:220px;overflow:auto"></div>
            </div>
            <div id="mgrResults" style="margin-top:12px"></div>
        </div>
      </div>
      <div id="provas" class="content-section">
          <div class="card">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3>Folgas-prova</h3>
                <div style="display: flex; gap: 8px;">
                    <button id="toggleProvasListView" class="button">Lista</button>
                    <button id="toggleProvasCalendarView" class="button ghost">Calendário</button>
                </div>
              </div>
              <div id="provasListSection" style="margin-top: 12px;" class="content-section active">
                  <div class="muted small">Exibe apenas estagiários que têm folga-prova cadastrada na data escolhida.</div>
                  <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
                      <input type="date" id="mgrFilterDate" />
                      <button class="button" id="btnApplyFilter">Buscar</button>
                      <button class="button ghost" id="btnClearDateFilter">Limpar</button>
                  </div>
                  <div id="provasResults" style="margin-top:12px"></div>
              </div>
              <div id="provasCalendarSection" style="margin-top: 12px; display: none;">
                  <div id="adminCalendarWrap" class="card" style="padding:12px"></div>
              </div>
          </div>
      </div>
      <div id="relatorios" class="content-section">
        <div class="card">
          <h3>Relatórios de Horas</h3>
          <div class="muted small">Saldo líquido por estagiário (banco - negativas não compensadas)</div>
          <div id="reportsArea" style="margin-top:8px"></div>
        </div>
      </div>
      <div id="pendentes" class="content-section">
        <div class="card">
          <h3>Pré-cadastros Pendentes</h3>
          <div class="muted small">Aprove ou recuse solicitações de novos estagiários.</div>
          <div id="pendingList" style="margin-top:10px"></div>
        </div>
      </div>
      <div id="configuracoes" class="content-section">
        <div class="card">
          <h3>Configurações</h3>
          <div class="small-muted">Bloqueio para marcação de folgas-prova (dias)</div>
          <div class="settings-row">
            <select id="cfgBlockDays">${new Array(31).fill(0).map((_, i) => `<option value="${i}">${i} dias</option>`).join('')}</select>
            <button class="button" id="btnSaveConfig">Salvar</button>
          </div>
          <hr style="margin: 12px 0"/>
          <div class="small-muted">Opções de Importação/Exportação</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <div class="muted small">Use a seção 'Backup' no menu lateral para gerenciar os dados.</div>
          </div>
        </div>
      </div>
      <div id="lixeira" class="content-section">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3>Lixeira</h3>
            <div style="display:flex;gap:8px;">
              <button id="btnRestoreSelected" class="button ghost">Restaurar selecionados</button>
              <button id="btnRestoreAll" class="button alt">Restaurar tudo</button>
              <button id="btnEmptyTrash" class="button danger">Esvaziar lixeira</button>
            </div>
          </div>
          <div class="muted small">Pré-cadastros recusados. Serão removidos após o período de retenção.</div>
          <div class="settings-row">
            <div class="small-muted">Período de retenção:</div>
            <select id="cfgTrashRetention">${new Array(30).fill(0).map((_, i) => `<option value="${i + 1}">${i + 1} dia(s)</option>`).join('')}</select>
            <button class="button" id="btnSaveRetention">Salvar</button>
          </div>
          <div id="trashList" style="margin-top:10px;"></div>
        </div>
      </div>
    </main>
    <input type="file" id="fileMgmt" style="display:none" accept="application/json" />
    <input type="file" id="fileBulkImport" style="display:none" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
    `;

    document.querySelectorAll('#userFilterButtons button').forEach(button => {
        button.addEventListener('click', (e) => {
            window.userFilter = e.currentTarget.dataset.filter;
            document.querySelectorAll('#userFilterButtons button').forEach(btn => {
                btn.classList.toggle('ghost', btn.dataset.filter !== window.userFilter);
            });
            renderUsersList();
        });
    });
    const btnChangePwdSuper = document.getElementById('btnChangePwdSuper');
    if (btnChangePwdSuper) {
        btnChangePwdSuper.addEventListener('click', () => showChangePwdModalManager(user, true));
    }
    const btnChangePwdMgr = document.getElementById('btnChangePwdMgr');
    if (btnChangePwdMgr) {
        btnChangePwdMgr.addEventListener('click', () => {
            const manager = (state.users || []).find(u => u.id === session.userId);
            if (manager.role === 'admin' && manager.selfPasswordChange) {
                showChangePwdModalManager(manager, false);
            } else {
                alert('Você não tem permissão para alterar a senha por aqui.');
            }
        });
    }
    document.getElementById('btnDeleteSelectedUsers').addEventListener('click', deleteSelectedUsers);
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const sectionId = e.currentTarget.dataset.section;
            if (e.currentTarget.id === 'btnSidebarBackup') {
                showBackupModal();
                return;
            }
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            if (sectionId) document.getElementById(sectionId).classList.add('active');
            if (sectionId === 'relatorios') renderReports();
            else if (sectionId === 'provas') renderProvasSection();
            else if (sectionId === 'pendentes') renderPendingList();
            else if (sectionId === 'lixeira') renderTrashList();
        });
    });
    document.getElementById('btnLogoutMgr').addEventListener('click', () => { window.logout(); });
    document.getElementById('btnNewUser').addEventListener('click', () => showCreateUserForm((state.users || []).find(u => u.id === session.userId)));
    document.getElementById('btnBulkImport').addEventListener('click', () => {
        const manager = (state.users || []).find(u => u.id === session.userId);
        if (!hasPower(manager, 'create_intern')) return alert('Sem permissão.');
        showBulkImportModal();
    });
    document.getElementById('fileMgmt').addEventListener('change', (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        importDataFromFile(f);
        ev.target.value = null;
    });
    document.getElementById('searchMgmt').addEventListener('input', renderUsersList);
    const nameInput = document.getElementById('mgrNameSearch');
    nameInput.addEventListener('input', (ev) => renderNameDropdown(ev.target.value.trim().toLowerCase()));
    nameInput.addEventListener('focus', (ev) => renderNameDropdown(ev.target.value.trim().toLowerCase()));
    document.addEventListener('click', (ev) => {
        if (!ev.target.closest('#mgrNameSearch') && !ev.target.closest('#mgrNameDropdown')) {
            document.getElementById('mgrNameDropdown').style.display = 'none';
        }
    });
    document.getElementById('cfgBlockDays').value = String((state.meta || {}).provaBlockDays || 5);
    document.getElementById('btnSaveConfig').addEventListener('click', async () => {
        const val = Number(document.getElementById('cfgBlockDays').value || 0);
        state.meta.provaBlockDays = val;
        await save(state);
        alert('Configuração salva.');
    });
    document.getElementById('cfgTrashRetention').value = String((state.meta || {}).trashRetentionDays || 10);
    document.getElementById('btnSaveRetention').addEventListener('click', async () => {
        const val = Number(document.getElementById('cfgTrashRetention').value || 10);
        state.meta.trashRetentionDays = val;
        await save(state);
        alert('Período de retenção salvo.');
    });
    document.getElementById('btnEmptyTrash').addEventListener('click', emptyTrash);
    document.getElementById('btnRestoreAll').addEventListener('click', restoreAllTrash);
    document.getElementById('btnRestoreSelected').addEventListener('click', restoreSelectedTrash);
    renderUsersList();
}

// --- Restante das Funções do Manager ---

function generateCsvData() {
    const allEntries = [];
    (state.interns || []).forEach(intern => {
        (intern.hoursEntries || []).forEach(entry => {
            const entryType = entry.hours > 0 ? 'Banco (Crédito)' : 'Negativa (Falta)';
            const hoursValue = entry.hours;
            allEntries.push({
                Tipo_Registro: 'Horas',
                Estagiario_Nome: intern.name,
                Estagiario_ID: intern.id,
                Data: entry.date,
                Detalhe: entryType,
                Horas: hoursValue.toFixed(2).replace('.', ','),
                Compensado: entry.compensated ? 'Sim' : 'Não',
                Motivo_Razao: entry.reason ? entry.reason.replace(/["\n\r]/g, '') : '',
                Link_Prova: '',
                Criado_Em: new Date(entry.createdAt).toLocaleString('pt-BR'),
                Criado_Por: entry.createdByName || 'N/A'
            });
        });
        (intern.dates || []).forEach(prova => {
            allEntries.push({
                Tipo_Registro: 'Folga-Prova',
                Estagiario_Nome: intern.name,
                Estagiario_ID: intern.id,
                Data: prova.date,
                Detalhe: 'Folga-Prova Agendada',
                Horas: '8,00',
                Compensado: 'N/A',
                Motivo_Razao: 'Folga para realização de prova',
                Link_Prova: prova.link || 'N/A',
                Criado_Em: 'N/A',
                Criado_Por: 'N/A'
            });
        });
    });
    if (allEntries.length === 0) {
        return '';
    }
    allEntries.sort((a, b) => {
        if (a.Estagiario_Nome !== b.Estagiario_Nome) {
            return a.Estagiario_Nome.localeCompare(b.Estagiario_Nome);
        }
        return a.Data.localeCompare(b.Data);
    });
    const headers = Object.keys(allEntries[0]);
    const csvRows = [];
    csvRows.push(headers.join(';'));
    for (const row of allEntries) {
        const values = headers.map(header => {
            let safeValue = String(row[header] || '').replace(/"/g, '""');
            if (safeValue.includes(';') || safeValue.includes('\n') || safeValue.includes('\r') || safeValue.includes('"')) {
                safeValue = `"${safeValue}"`;
            }
            return safeValue;
        });
        csvRows.push(values.join(';'));
    }
    return csvRows.join('\n');
}

function showBackupModal() {
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    if (currentUser.role !== 'super') {
        alert('Acesso negado.');
        return;
    }
    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>Opções de Backup</h3>
          <button id="closeBackupModal" class="button ghost">Fechar</button>
        </div>
        <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 15px;">
          <div class="card" style="padding: 15px;">
            <h4>EXPORTAR Backup</h4>
            <div style="display:flex; gap: 10px; margin-top: 10px;">
                <button id="btnDownloadAllJson" class="button">Exportar (.JSON)</button>
                <button id="btnDownloadAllCsv" class="button alt">Exportar (CSV)</button>
            </div>
          </div>
          <div class="card" style="padding: 15px;">
            <h4>CARREGAR Backup </h4>
            <div class="muted small">**Atenção: Isso irá sobrescrever todos os dados atuais!**</div>
            <button id="btnImportTrigger" class="button danger" style="margin-top: 10px;">Importar (.json)</button>
          </div>
        </div>`;
    const m = showModal(html, { allowBackdropClose: true });
    m.modal.querySelector('#closeBackupModal').addEventListener('click', () => { m.close(); m.cleanup(); });
    m.modal.querySelector('#btnDownloadAllJson').addEventListener('click', () => {
        downloadBlob(JSON.stringify(state, null, 2), 'backup_provas_all.json', 'application/json');
        m.close();
        m.cleanup();
    });
    m.modal.querySelector('#btnDownloadAllCsv').addEventListener('click', () => {
        const csvData = generateCsvData();
        if (csvData) {
            const bom = '\ufeff';
            downloadBlob(bom + csvData, `relatorio_provas_horas_${nowISO()}.csv`, 'text/csv;charset=utf-8;');
        } else {
            alert('Nenhum dado para exportar.');
        }
        m.close();
        m.cleanup();
    });
    m.modal.querySelector('#btnImportTrigger').addEventListener('click', () => {
        if (confirm('ATENÇÃO: Deseja continuar e substituir todos os dados atuais?')) {
            document.getElementById('fileMgmt').click();
            m.close();
            m.cleanup();
        }
    });
}

async function importDataFromFile(file) {
    const r = new FileReader();
    r.onload = async e => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.users || !parsed.interns || typeof parsed.meta === 'undefined') {
                throw new Error('Formato do arquivo de backup inválido.');
            }
            state = parsed;
            await save(state);
            alert('Importação concluída com sucesso!');
            render();
        } catch (err) {
            console.error(err);
            alert('Erro ao importar o backup: ' + err.message);
        }
    };
    r.readAsText(file);
}

function showBulkImportModal() {
    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <h3>CRIAR USUÁRIOS EM LOTE</h3>
                <div class="muted small">Carregue um arquivo Excel/CSV com os dados.</div>
            </div>
            <button id="closeBulkImport" class="button ghost">Cancelar</button>
        </div>
        <div class="card" style="margin-top:10px; padding: 15px; background: var(--input-bg);">
            <h4>Formato da Planilha:</h4>
            <ul style="font-size: 14px;">
                <li><strong>Coluna A: Nome completo</strong></li>
                <li><strong>Coluna B: Usuário (Matrícula)</strong></li>
                <li><strong>Coluna C: Senha (padrão '123456' se vazia)</strong></li>
                <li><strong>Coluna D: Permitir alteração de senha (Sim/Não)</strong></li>
            </ul>
        </div>
        <div style="display:flex; gap: 10px; margin-top: 15px; align-items:center;">
            <button id="btnTriggerFile" class="button alt">Carregar Planilha</button>
            <span id="fileNameDisplay" class="small-muted">Nenhum arquivo.</span>
        </div>
        <div id="bulkStatus" style="margin-top: 15px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top: 15px;">
            <button id="btnCreateInBatch" class="button" disabled>Criar em Lote (0)</button>
        </div>`;
    const m = showModal(html, { allowBackdropClose: true });
    const btnCreateInBatch = m.modal.querySelector('#btnCreateInBatch');
    const fileInput = document.getElementById('fileBulkImport');
    fileInput.value = null;
    m.modal.querySelector('#closeBulkImport').addEventListener('click', () => { m.close(); m.cleanup(); });
    m.modal.querySelector('#btnTriggerFile').addEventListener('click', () => fileInput.click());
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        m.modal.querySelector('#fileNameDisplay').textContent = `Arquivo: ${file.name}`;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                if (typeof XLSX === 'undefined') throw new Error('Biblioteca SheetJS (xlsx.js) não carregada.');
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false });
                importedUserData = validateExcelData(sheetData);
                const validCount = importedUserData.length;
                m.modal.querySelector('#bulkStatus').innerHTML = `<div class="chip">Pronto para criar: <strong>${validCount}</strong> estagiário(s)</div>`;
                btnCreateInBatch.textContent = `Criar em Lote (${validCount})`;
                btnCreateInBatch.disabled = validCount === 0;
            } catch (error) {
                m.modal.querySelector('#bulkStatus').innerHTML = `<div class="chip danger">Erro: ${error.message}</div>`;
                importedUserData = [];
                btnCreateInBatch.textContent = 'Criar em Lote (0)';
                btnCreateInBatch.disabled = true;
            }
        };
        reader.readAsArrayBuffer(file);
    };
    btnCreateInBatch.onclick = async () => {
        if (importedUserData.length === 0) return alert('Nenhum dado válido.');
        if (!confirm(`Deseja criar ${importedUserData.length} novos estagiários?`)) return;
        const manager = (state.users || []).find(u=>u.id===session.userId);
        const creationDate = timestamp();
        for (const userData of importedUserData) {
            const internId = uuid();
            (state.interns || []).push({ id: internId, name: userData.name, dates: [], hoursEntries: [], auditLog: [] });
            (state.users || []).push({ id: uuid(), username: userData.username, name: userData.name, password: userData.password, role:'intern', internId, powers: defaultPowersFor('intern'), selfPasswordChange: userData.allowSelfPwd, createdAt: creationDate });
        }
        await save(state);
        alert(`${importedUserData.length} estagiários criados.`);
        m.close(); m.cleanup(); render();
    };
}

function validateExcelData(sheetData) {
    const validUsers = [];
    const existingUsernames = new Set((state.users || []).map(u => u.username.toLowerCase()));
    const dataRows = sheetData.slice(1);
    dataRows.forEach((row, index) => {
        if (!row || row.filter(cell => String(cell).trim() !== '').length === 0) return;
        const name = String(row[0] || '').trim();
        const username = String(row[1] || '').trim().toLowerCase();
        const password = String(row[2] || '').trim() || '123456';
        const allowSelfPwdText = String(row[3] || '').trim().toLowerCase();
        const allowSelfPwd = allowSelfPwdText === 'sim';
        const isMatriculaValid = /^e\d{6}$/.test(username);
        if (!name || !username || !isMatriculaValid || existingUsernames.has(username)) {
            console.warn(`Linha ${index + 2} ignorada: dados inválidos ou usuário já existente.`);
            return;
        }
        validUsers.push({ name, username, password, allowSelfPwd });
        existingUsernames.add(username);
    });
    return validUsers;
}

function renderPendingList() {
    const list = document.getElementById('pendingList');
    if (!list) return;
    list.innerHTML = '';
    const pending = (state.pendingRegistrations || []).filter(r => r.status !== 'rejected');
    if (pending.length === 0) {
        list.innerHTML = '<div class="muted">Nenhum pré-cadastro pendente.</div>';
        return;
    }
    pending.forEach(reg => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
      <div>
        <div style="font-weight:700">${escapeHtml(reg.name)}</div>
        <div class="muted small">Usuário: ${escapeHtml(reg.username)}</div>
        <div class="muted small">Solicitado em: ${new Date(reg.createdAt).toLocaleString()}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="button" data-approve-id="${reg.id}">Aprovar</button>
        <button class="button danger" data-reject-id="${reg.id}">Recusar</button>
      </div>
    `;
        list.appendChild(row);
        row.querySelector(`[data-approve-id="${reg.id}"]`).addEventListener('click', () => approveRegistration(reg.id));
        row.querySelector(`[data-reject-id="${reg.id}"]`).addEventListener('click', () => rejectRegistration(reg.id));
    });
}

async function approveRegistration(regId) {
    const reg = (state.pendingRegistrations || []).find(r => r.id === regId);
    if (!reg) return;
    const internId = uuid();
    (state.interns || []).push({ id: internId, name: reg.name, dates: [], hoursEntries: [], auditLog: [] });
    (state.users || []).push({ id: uuid(), username: reg.username, name: reg.name, password: reg.password, role: 'intern', internId, powers: defaultPowersFor('intern'), selfPasswordChange: true, createdAt: timestamp() });
    state.pendingRegistrations = (state.pendingRegistrations || []).filter(r => r.id !== regId);
    await save(state);
    alert('Pré-cadastro aprovado!');
    render();
}

async function rejectRegistration(regId) {
    if (!confirm('Deseja recusar este pré-cadastro? Ele será movido para a lixeira.')) return;
    const reg = (state.pendingRegistrations || []).find(r => r.id === regId);
    if (!reg) return;
    reg.status = 'rejected';
    reg.rejectedAt = timestamp();
    (state.trash || []).push(reg);
    state.pendingRegistrations = (state.pendingRegistrations || []).filter(r => r.id !== regId);
    await save(state);
    alert('Pré-cadastro recusado e movido para a lixeira.');
    render();
}

function renderTrashList() {
    const list = document.getElementById('trashList');
    if (!list) return;
    list.innerHTML = '';
    if ((state.trash || []).length === 0) {
        list.innerHTML = '<div class="muted">A lixeira está vazia.</div>';
        return;
    }
    const now = new Date();
    const retentionDays = (state.meta || {}).trashRetentionDays;
    (state.trash || []).forEach(item => {
        const deletedDate = new Date(item.deletedAt || item.rejectedAt);
        const daysLeft = Math.max(0, retentionDays - Math.ceil((now - deletedDate) / (1000 * 60 * 60 * 24)));
        const row = document.createElement('div');
        row.className = 'trash-item-row';
        const typeLabel = item.type === 'user' ? 'Usuário Excluído' : 'Pré-cadastro Rejeitado';
        row.innerHTML = `
      <input type="checkbox" data-id="${item.id}" />
      <div class="trash-item-details">
        <div style="font-weight:700">${escapeHtml(item.internName || item.name || item.username)}</div>
        <div class="muted small">${typeLabel} • Usuário: ${escapeHtml(item.username)}</div>
        <div class="muted small">Removido em: ${deletedDate.toLocaleString()}</div>
        <div class="muted small">Será excluído em ${daysLeft} dia(s)</div>
      </div>
    `;
        list.appendChild(row);
    });
}

async function emptyTrash() {
    if ((state.trash || []).length === 0) return alert('A lixeira já está vazia.');
    if (!confirm('Deseja esvaziar a lixeira permanentemente?')) return;
    state.trash = [];
    await save(state);
    alert('Lixeira esvaziada.');
    renderTrashList();
}

async function restoreAllTrash() {
    if ((state.trash || []).length === 0) return alert('A lixeira está vazia.');
    if (!confirm('Deseja restaurar todos os itens da lixeira?')) return;
    (state.trash || []).forEach(item => {
        if (item.type === 'user') {
            (state.users || []).push({
                id: item.userId, username: item.username, password: '123456', role: item.role,
                internId: item.internId, powers: defaultPowersFor(item.role), selfPasswordChange: true, createdAt: item.createdAt || timestamp()
            });
            if (item.internId) {
                (state.interns || []).push({ id: item.internId, name: item.internName, dates: [], hoursEntries: [], auditLog: [] });
            }
        } else {
            (state.pendingRegistrations || []).push({ ...item, status: 'pending' });
        }
    });
    state.trash = [];
    await save(state);
    alert('Todos os itens restaurados.');
    render();
}

async function restoreSelectedTrash() {
    const checkboxes = document.querySelectorAll('#trashList input:checked');
    if (checkboxes.length === 0) return alert('Selecione itens para restaurar.');
    if (!confirm(`Deseja restaurar os ${checkboxes.length} itens selecionados?`)) return;
    const idsToRestore = Array.from(checkboxes).map(cb => cb.dataset.id);
    const itemsToRestore = (state.trash || []).filter(item => idsToRestore.includes(item.id));
    itemsToRestore.forEach(item => {
        if (item.type === 'user') {
            (state.users || []).push({
                id: item.userId, username: item.username, password: '123456', role: item.role,
                internId: item.internId, powers: defaultPowersFor(item.role), selfPasswordChange: true, createdAt: item.createdAt || timestamp()
            });
            if (item.internId) {
                (state.interns || []).push({ id: item.internId, name: item.internName, dates: [], hoursEntries: [], auditLog: [] });
            }
        } else {
            (state.pendingRegistrations || []).push({ ...item, status: 'pending' });
        }
    });
    state.trash = (state.trash || []).filter(item => !idsToRestore.includes(item.id));
    await save(state);
    alert('Itens selecionados restaurados.');
    render();
}

export async function cleanupRejectedRegistrations() {
    const now = new Date();
    const retentionDays = (state.meta || {}).trashRetentionDays;
    state.trash = (state.trash || []).filter(reg => {
        const deletedDate = new Date(reg.deletedAt || reg.rejectedAt);
        const diffDays = Math.ceil((now - deletedDate) / (1000 * 60 * 60 * 24));
        return diffDays <= retentionDays;
    });
    await save(state);
}

function renderProvasSection() {
    const listSection = document.getElementById('provasListSection');
    const calendarSection = document.getElementById('provasCalendarSection');
    const toggleListBtn = document.getElementById('toggleProvasListView');
    const toggleCalendarBtn = document.getElementById('toggleProvasCalendarView');
    const newToggleListBtn = toggleListBtn.cloneNode(true);
    const newToggleCalendarBtn = toggleCalendarBtn.cloneNode(true);
    toggleListBtn.replaceWith(newToggleListBtn);
    toggleCalendarBtn.replaceWith(newToggleCalendarBtn);
    if (adminProvasView === 'list') {
        listSection.style.display = 'block';
        calendarSection.style.display = 'none';
        newToggleListBtn.className = 'button';
        newToggleCalendarBtn.className = 'button ghost';
        const filterDateInput = document.getElementById('mgrFilterDate');
        if (filterDateInput && !filterDateInput.value) {
            filterDateInput.value = nowISO();
        }
        filterAndRenderProvas();
        document.getElementById('btnApplyFilter').addEventListener('click', () => filterAndRenderProvas());
        document.getElementById('btnClearDateFilter').addEventListener('click', () => {
            document.getElementById('mgrFilterDate').value = '';
            document.getElementById('provasResults').innerHTML = '';
        });
    } else {
        listSection.style.display = 'none';
        calendarSection.style.display = 'block';
        newToggleListBtn.className = 'button ghost';
        newToggleCalendarBtn.className = 'button';
        renderAdminProvasCalendar();
    }
    newToggleListBtn.addEventListener('click', () => {
        adminProvasView = 'list';
        renderProvasSection();
    });
    newToggleCalendarBtn.addEventListener('click', () => {
        adminProvasView = 'calendar';
        renderProvasSection();
    });
}

function renderAdminProvasCalendar() {
    const wrap = document.getElementById('adminCalendarWrap');
    const monthStart = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), 1);
    const label = monthStart.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div><strong>Calendário de Folgas-prova</strong></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="button ghost" id="prevAdminMonth">&lt;</button>
        <div class="small-muted" id="adminMonthLabel">${label}</div>
        <button class="button ghost" id="nextAdminMonth">&gt;</button>
      </div>
    </div>
    <div class="calendar">
      <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
    </div>
    <div id="adminMonthGrid" class="calendar" style="margin-top:10px"></div>
  `;
    const grid = document.getElementById('adminMonthGrid');
    grid.innerHTML = '';
    const firstDay = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), 1).getDay();
    const daysInMonth = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth() + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(document.createElement('div'));
    }
    const provasByDate = {};
    (state.interns || []).forEach(intern => {
        (intern.dates || []).forEach(p => {
            if (!provasByDate[p.date]) provasByDate[p.date] = [];
            provasByDate[p.date].push(intern);
        });
    });
    for (let d = 1; d <= daysInMonth; d++) {
        const iso = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), d).toISOString().slice(0, 10);
        const dayEl = document.createElement('div');
        dayEl.className = 'day';
        dayEl.innerHTML = `<div class="date">${d}</div>`;
        if (provasByDate[iso] && provasByDate[iso].length > 0) {
            const countEl = document.createElement('div');
            countEl.className = 'tag bank';
            countEl.textContent = `${provasByDate[iso].length} estagiário(s)`;
            dayEl.appendChild(countEl);
            dayEl.addEventListener('click', () => showProvasDayDetails(iso, provasByDate[iso]));
        }
        grid.appendChild(dayEl);
    }
    document.getElementById('prevAdminMonth').addEventListener('click', () => {
        adminCalendarViewing.setMonth(adminCalendarViewing.getMonth() - 1);
        renderAdminProvasCalendar();
    });
    document.getElementById('nextAdminMonth').addEventListener('click', () => {
        adminCalendarViewing.setMonth(adminCalendarViewing.getMonth() + 1);
        renderAdminProvasCalendar();
    });
}

function showProvasDayDetails(iso, interns) {
    const htmlParts = [];
    htmlParts.push(`<div style="display:flex;justify-content:space-between;align-items:center"><h3>Folgas-prova — ${iso}</h3><button id="closeProvasDetails" class="button ghost">Fechar</button></div>`);
    htmlParts.push('<div style="margin-top:8px">');
    if (interns.length === 0) {
        htmlParts.push('<div class="muted small">Nenhuma folga-prova marcada.</div>');
    } else {
        interns.forEach(intern => {
            const prova = (intern.dates || []).find(p => p.date === iso);
            const linkIcon = prova && prova.link ? `<a href="${prova.link}" target="_blank" class="button ghost">Ver prova</a>` : '';
            htmlParts.push(`<div class="row"><div><strong>${escapeHtml(intern.name)}</strong></div><div>${linkIcon}</div></div>`);
        });
    }
    htmlParts.push('</div>');
    const m = showModal(htmlParts.join(''), { allowBackdropClose: true });
    m.modal.querySelector('#closeProvasDetails').addEventListener('click', () => { m.close(); m.cleanup(); });
}

function updateBulkDeleteButtonState() {
    const selectedCount = document.querySelectorAll('#usersList .user-select-checkbox:checked').length;
    const button = document.getElementById('btnDeleteSelectedUsers');
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    const canDelete = hasPower(currentUser, 'delete_user');
    if (button) {
        button.textContent = `Excluir (${selectedCount})`;
        button.disabled = selectedCount === 0 || !canDelete;
    }
}

async function deleteSelectedUsers() {
    const checkboxes = document.querySelectorAll('#usersList .user-select-checkbox:checked');
    const idsToDelete = Array.from(checkboxes).map(cb => cb.dataset.userId);
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    if (idsToDelete.length === 0) return alert('Selecione perfis para excluir.');
    if (!hasPower(currentUser, 'delete_user')) return alert('Sem permissão.');
    const superAdmin = (state.users || []).find(u => u.role === 'super');
    const finalIdsToDelete = idsToDelete.filter(id => id !== superAdmin.id);
    if (finalIdsToDelete.length !== idsToDelete.length) {
        alert('O Administrador Principal não pode ser excluído.');
    }
    if (finalIdsToDelete.length === 0) return;
    if (!confirm(`Mover ${finalIdsToDelete.length} perfil(s) para a lixeira?`)) return;
    const deletedAt = timestamp();
    const usersToProcess = (state.users || []).filter(u => finalIdsToDelete.includes(u.id));
    for (const userToDelete of usersToProcess) {
        const internData = userToDelete.internId ? findInternById(userToDelete.internId) : null;
        (state.trash || []).push({
            id: uuid(), type: 'user', userId: userToDelete.id, username: userToDelete.username, role: userToDelete.role,
            internId: userToDelete.internId, internName: internData ? internData.name : null, deletedAt, createdAt: userToDelete.createdAt
        });
    }
    state.users = (state.users || []).filter(u => !finalIdsToDelete.includes(u.id));
    state.interns = (state.interns || []).filter(i => !usersToProcess.some(u => u.internId === i.id));
    await save(state);
    alert(`${finalIdsToDelete.length} perfil(s) movidos para a lixeira.`);
    render();
}

function renderUsersList() {
    const q = document.getElementById('searchMgmt').value.trim().toLowerCase();
    const container = document.getElementById('usersList'); container.innerHTML = '';
    let list = (state.users || []).filter(u => u.role !== 'super');
    if (userFilter === 'intern') {
        list = list.filter(u => u.role === 'intern');
    } else if (userFilter === 'admin') {
        list = list.filter(u => u.role === 'admin');
    }
    if (q) list = list.filter(u => (u.username || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q));
    document.getElementById('totalUsers').textContent = list.length;
    list.sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    const canDelete = hasPower(currentUser, 'delete_user');
    list.forEach(u => {
        const row = document.createElement('div');
        row.className = 'row user-row-selectable';
        const internName = u.role === 'intern' ? (findInternById(u.internId)?.name || '') : '';
        const displayName = u.role === 'intern' ? `${escapeHtml(internName)} (${escapeHtml(u.username)})` : `${escapeHtml(u.name || u.username)}`;
        const roleAndDateDisplay = `${u.role} (${formatDate(u.createdAt)})`;
        const checkboxHtml = canDelete ? `<input type="checkbox" data-user-id="${u.id}" class="user-select-checkbox" />` : '<div class="icon-placeholder"></div>';
        const left = `<div><div style="font-weight:700">${displayName}</div><div class="muted small">${roleAndDateDisplay}</div></div>`;
        const right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-view-id="${u.id}">Abrir</button><button class="button" data-edit-id="${u.id}">Editar</button></div>`;
        row.innerHTML = `${checkboxHtml}${left}${right}`;
        container.appendChild(row);
        row.querySelector('[data-view-id]').addEventListener('click', () => openUserManagerView(u.id));
        row.querySelector('[data-edit-id]').addEventListener('click', () => showEditUserForm(u.id));
        if (canDelete) row.querySelector('.user-select-checkbox').addEventListener('change', updateBulkDeleteButtonState);
    });
    updateBulkDeleteButtonState();
}

function renderReports() {
    const area = document.getElementById('reportsArea');
    if (!area) return;
    area.innerHTML = '';
    const computed = (state.interns || []).map(i => {
        const totalBank = ((i.hoursEntries) || []).filter(e => e.hours > 0).reduce((s, e) => s + e.hours, 0);
        const totalNeg = ((i.hoursEntries) || []).filter(e => e.hours < 0 && !e.compensated).reduce((s, e) => s + Math.abs(e.hours), 0);
        return { id: i.id, name: i.name, net: totalBank - totalNeg };
    });
    const negatives = computed.filter(x => x.net < 0).sort((a, b) => a.net - b.net);
    const banks = computed.filter(x => x.net > 0).sort((a, b) => b.net - a.net);
    const negHtml = `<h4>Horas negativas</h4>${negatives.length === 0 ? '<div class="muted small">Nenhum</div>' : negatives.map(n => `<div class="row"><div><strong>${escapeHtml(n.name)}</strong></div><div><span class="badge danger">${Math.abs(n.net)}h</span></div></div>`).join('')}`;
    const bankHtml = `<h4 style="margin-top:12px">Banco de horas</h4>${banks.length === 0 ? '<div class="muted small">Nenhum</div>' : banks.map(n => `<div class="row"><div><strong>${escapeHtml(n.name)}</strong></div><div><span class="badge ok">${n.net}h</span></div></div>`).join('')}`;
    area.innerHTML = negHtml + bankHtml;
}

function openUserManagerView(userId) {
    const u = (state.users || []).find(x => x.id === userId); if (!u) return;
    const area = document.getElementById('mgrResults'); if (!area) return;
    area.innerHTML = '';
    const card = document.createElement('div'); card.className = 'card';
    const intern = u.internId ? findInternById(u.internId) : null;
    const canDelete = u.role !== 'super';
    card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div><h3>${escapeHtml(u.username)} ${u.role === 'intern' ? '• ' + escapeHtml(intern?.name || '') : ''}</h3></div>
      <div><button class="button ghost" id="btnCloseView">Fechar</button></div>
    </div>
    <div style="margin-top:8px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="btnResetPwd" class="button ghost">Resetar senha</button>
        <button id="btnManageDates" ${u.role !== 'intern' ? 'disabled' : ''} class="button ghost">Gerenciar folgas</button>
        <button id="btnManageHours" ${u.role !== 'intern' ? 'disabled' : ''} class="button ghost">Gerenciar horas</button>
        ${canDelete ? `<button id="btnDeleteUser" class="button danger">Excluir</button>` : ''}
      </div>
    </div>
    <div id="mgrUserBody" style="margin-top:10px"></div>`;
    area.appendChild(card);
    document.getElementById('btnCloseView').addEventListener('click', () => render());
    document.getElementById('btnResetPwd').addEventListener('click', async () => {
        const currentManager = (state.users || []).find(uu => uu.id === session.userId);
        if (!hasPower(currentManager, 'reset_password')) return alert('Sem permissão.');
        const np = prompt(`Nova senha para ${u.username}:`);
        if (!np) return;
        u.password = np;
        await save(state);
        alert('Senha alterada.');
    });
    if (u.role === 'intern') {
        document.getElementById('btnManageDates').addEventListener('click', () => openInternManagerView(u.internId));
        document.getElementById('btnManageHours').addEventListener('click', () => openInternHoursView(u.internId));
    }
    if (canDelete) {
        document.getElementById('btnDeleteUser').addEventListener('click', async () => {
            const mgr = (state.users || []).find(uu => uu.id === session.userId);
            if (!hasPower(mgr, 'delete_user')) return alert('Sem permissão.');
            if (!confirm('Excluir este usuário? Ação irreversível.')) return;
            state.users = (state.users || []).filter(x => x.id !== userId);
            if (u.internId) {
                state.interns = (state.interns || []).filter(i => i.id !== u.internId);
            }
            await save(state);
            alert('Usuário excluído.');
            render();
        });
    }
}

// Função: openInternManagerView
function openInternManagerView(internId){
  const intern = findInternById(internId); if(!intern) return;
  const area = document.getElementById('mgrResults'); if(!area) return;
  area.innerHTML = '';
  const card = document.createElement('div'); card.className='card';
  const user = findUserByIntern(intern.id);
  
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3>${escapeHtml(intern.name)}</h3>
        <div class="muted small">ID: ${intern.id}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="button ghost" id="btnBackToUser">Voltar</button>
        <button class="button ghost" id="btnCloseViewIntern">Fechar</button>
      </div>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <input type="date" id="mgrAddDate" />
      <input type="text" id="mgrAddLink" class="input" placeholder="Link da prova" />
      <button id="mgrAddDateBtn" class="button">Adicionar folga-prova</button>
    </div>
    <div id="mgrDates" style="margin-top:10px"></div>

    <div style="margin-top:12px">
      <h4>Log de ações</h4>
      <div id="mgrAudit" class="muted small"></div>
    </div>
  `;
  area.appendChild(card);
  
  document.getElementById('btnCloseViewIntern').addEventListener('click', ()=> renderManager((state.users || []).find(u=>u.id===session.userId)));
  
  if(user) {
    document.getElementById('btnBackToUser').addEventListener('click', ()=> openUserManagerView(user.id));
  }
  
  document.getElementById('mgrAddDateBtn').addEventListener('click', async ()=>{ 
    const d = document.getElementById('mgrAddDate').value;
    const link = document.getElementById('mgrAddLink').value;
    if(!d) return alert('Escolha uma data'); 
    
    const currentManager = (state.users || []).find(u=>u.id===session.userId);
    if(!hasPower(currentManager, 'manage_provas')) return alert('Sem permissão para gerenciar folgas-prova.');

    if(!((intern.dates || []).some(p => p.date === d))) {
      intern.dates = intern.dates || [];
      intern.dates.push({ date: d, link: link });
    }
    
    const manager = (state.users || []).find(u=>u.id===session.userId);
    intern.auditLog = intern.auditLog || [];
    intern.auditLog.push({ id: uuid(), action:'create_prova', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Criou folga-prova ${d}` });
    await save(state);
    openInternManagerView(intern.id); 
    renderUsersList(); 
  });
  renderMgrDates(intern);
  const auditEl = document.getElementById('mgrAudit'); const auditArr = ((intern.auditLog) || []).slice().sort((a,b)=> b.at.localeCompare(a.at));
  if(auditArr.length===0) auditEl.innerHTML = 'Nenhuma ação administrativa registrada';
  else auditEl.innerHTML = auditArr.map(a=>`${new Date(a.at).toLocaleString()} — ${escapeHtml(a.byUserName)} — ${escapeHtml(a.action)} — ${escapeHtml(a.details||'')}`).join('<br/>');
}

// Função: renderMgrDates
function renderMgrDates(intern){
  const el = document.getElementById('mgrDates'); el.innerHTML='';
  if(!intern.dates || intern.dates.length===0){ el.innerHTML='<div class="muted">Nenhuma folga-prova cadastrada</div>'; return; }
  (intern.dates || []).slice().sort((a,b) => a.date.localeCompare(b.date)).forEach(p=>{
    const row = document.createElement('div'); row.className='row';
    const left = document.createElement('div'); 
    left.innerHTML = `<div style="font-weight:700; color: var(--danger);">${p.date}</div><div class="muted small">Data da folga-prova</div>`;
    
    const right = document.createElement('div'); 
    right.style.display = 'flex';
    right.style.gap = '8px';
    
    const currentUser = (state.users || []).find(u=>u.id===session.userId);

    if(p.link) {
      const btnLink = document.createElement('a'); 
      btnLink.className = 'button ghost'; 
      btnLink.textContent = `Link`;
      btnLink.href = p.link;
      btnLink.target = '_blank';
      btnLink.style.textDecoration = 'none';
      right.appendChild(btnLink);
    }
    
    if(hasPower(currentUser, 'manage_provas')){
        const btnDel = document.createElement('button'); btnDel.className='button ghost'; btnDel.textContent='Remover'; btnDel.addEventListener('click', async ()=>{ 
          if(confirm('Remover folga-prova '+p.date+'?')){ 
            intern.dates = (intern.dates || []).filter(x=>x.date!==p.date); 
            const manager = (state.users || []).find(u=>u.id===session.userId); 
            intern.auditLog = intern.auditLog || []; 
            intern.auditLog.push({ id: uuid(), action:'remove_prova', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Removida folga-prova ${p.date}` }); 
            await save(state); 
            render(); 
          }});
        right.appendChild(btnDel);
    }
    
    row.appendChild(left); row.appendChild(right); el.appendChild(row);
  });
}

// Função: openInternHoursView
function openInternHoursView(internId){
  const intern = findInternById(internId); if(!intern) return;
  const area = document.getElementById('mgrResults'); if(!area) return;
  area.innerHTML = '';
  const card = document.createElement('div'); card.className='card';
  const user = findUserByIntern(intern.id);
  
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3>Horas — ${escapeHtml(intern.name)}</h3>
        <div class="muted small">Lançamentos e compensações.</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="button ghost" id="btnBackToUser">Voltar (Usuário)</button>
        <button class="button ghost" id="btnCloseHours">Fechar</button>
      </div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
      <button id="btnAddHoursAdmin" class="button">Lançar horas (admin)</button>
    </div>
    <div id="mgrHoursList" style="margin-top:10px"></div>
  `;
  area.appendChild(card);
  
  document.getElementById('btnCloseHours').addEventListener('click', ()=> renderManager((state.users || []).find(u=>u.id===session.userId)));
  
  if(user) {
    document.getElementById('btnBackToUser').addEventListener('click', ()=> openUserManagerView(user.id));
  }
  
  document.getElementById('btnAddHoursAdmin').addEventListener('click', ()=> showHourEntryForm(intern.id));
  renderMgrHoursList(intern);
}

// Função: renderMgrHoursList
function renderMgrHoursList(intern){
  const el = document.getElementById('mgrHoursList'); el.innerHTML='';
  const arr = ((intern.hoursEntries) || []).slice().sort((a,b)=> b.date.localeCompare(a.date));
  if(arr.length===0){ el.innerHTML='<div class="muted">Nenhum lançamento</div>'; return; }
  arr.forEach(e=>{
    const row = document.createElement('div'); row.className='row';
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    
    const actionButtons = hasPower(currentUser, 'manage_hours')
      ? `<div style="display:flex;gap:6px">
        <button class="button ghost" data-edit="${e.id}">Editar</button>
        <button class="button" data-delete="${e.id}">Excluir</button>
      </div>`
      : '';

    const compensationButton = e.hours < 0 && hasPower(currentUser, 'manage_hours')
      ? (e.compensated
        ? `<button class="button ghost" data-uncomp="${e.id}">Desfazer comp.</button>`
        : `<button class="button" data-comp="${e.id}">Marcar comp.</button>`)
      : '';

    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
        <div>
          <div style="font-weight:700">${e.date} • ${e.hours>0?'+':''}${e.hours}h ${e.type==='bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div>
          <div class="muted small" style="margin-top:4px">${escapeHtml(e.reason||'Sem justificativa')}</div>
          <div class="audit" style="margin-top:6px">Criado por: ${escapeHtml(e.createdByName||'—')} em ${e.createdAt? new Date(e.createdAt).toLocaleString() : ''}${e.lastModifiedBy ? ' • Alterado por: '+escapeHtml(e.lastModifiedBy) : ''}${e.compensatedBy ? ' • Compensado por: '+escapeHtml(e.compensatedBy)+' em '+(e.compensatedAt? new Date(e.compensatedAt).toLocaleString(): '') : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${actionButtons}
          ${compensationButton}
        </div>
      </div>
    `;

    el.appendChild(row);

    if(hasPower(currentUser,'manage_hours')){
        row.querySelector('[data-edit]').addEventListener('click', ()=> showHourEntryForm(intern.id, e.id));
        row.querySelector('[data-delete]').addEventListener('click', async ()=> {
          if(confirm('Excluir lançamento?')){
            const manager = (state.users || []).find(u=>u.id===session.userId);
            intern.auditLog.push({ id: uuid(), action:'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Excluído lançamento ${e.id}` });
            intern.hoursEntries = (intern.hoursEntries || []).filter(x=>x.id!==e.id);
            await save(state);
            render();
          }
        });
        if(e.hours < 0) {
          const compBtn = row.querySelector('[data-comp]') || row.querySelector('[data-uncomp]');
          if(compBtn){
            compBtn.addEventListener('click', async ()=> {
              await markCompensated(intern.id, e.id, !e.compensated);
              const manager = (state.users || []).find(u=>u.id===session.userId);
              intern.auditLog.push({ id: uuid(), action: e.compensated ? 'uncompensated' : 'compensated', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `${e.compensated ? 'Desfez compensação' : 'Compensou'} lançamento ${e.id}` });
              await save(state);
              render();
            });
          }
        }
    }
  });
}

// Função: showCreateUserForm
function showCreateUserForm(currentManager){
  if(!hasPower(currentManager,'create_intern') && currentManager.role!=='super') return alert('Sem permissão');
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>Criar usuário</h3><button id="closeC" class="button ghost">Fechar</button></div>
    <form id="formCreate" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      <label><span class="small-muted">Tipo</span><select id="newType"><option value="intern">Estagiário</option><option value="admin">Admin secundário</option></select></label>
      <label id="labelNewName"><span class="small-muted">Nome completo</span><input id="newName" required/></label>
      <label><span class="small-muted">Usuário (login/matrícula)</span><input id="newUser" required/></label>
      <label style="position:relative;"><span class="small-muted">Senha</span>
        <input id="newPass" type="password" value="123456" style="padding-right: 36px;"/>
        <span class="password-toggle-icon" id="toggleNewPass">🔒</span>
      </label>
      <label class="form-check"><input type="checkbox" id="allowSelfPwd" checked/> Permitir alteração de senha</label>
      <div id="adminPowers" style="display:none">
        <div class="small-muted" style="margin-bottom: 8px;">Poderes do admin</div>
        <div class="form-check-group">
          <label class="form-check"><input type="checkbox" id="p_create"/> Criar estagiários</label>
          <label class="form-check"><input type="checkbox" id="p_edit"/> Editar usuários</label>
          <label class="form-check"><input type="checkbox" id="p_delete"/> Excluir usuários</label>
          <label class="form-check"><input type="checkbox" id="p_reset"/> Resetar senhas</label>
          <label class="form-check"><input type="checkbox" id="p_manage"/> Gerenciar horas</label>
          <label class="form-check"><input type="checkbox" id="p_provas"/> Gerenciar folgas-prova</label>
          <label class="form-check"><input type="checkbox" id="p_delegate" ${currentManager.role !== 'super' ? 'disabled' : ''}/> Delegar admins</label>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">Criar</button>
      </div>
    </form>
  `;
  const m = showModal(html);
  m.modal.querySelector('#closeC').addEventListener('click', ()=> { m.close(); m.cleanup(); });
  m.modal.querySelector('#newType').addEventListener('change', (e)=> {
    const isIntern = e.target.value === 'intern';
    m.modal.querySelector('#adminPowers').style.display = isIntern ? 'none' : 'block';
    if (!isIntern) {
        const defaultAdminPowers = defaultPowersFor('admin');
        m.modal.querySelector('#p_create').checked = defaultAdminPowers.create_intern;
        m.modal.querySelector('#p_edit').checked = defaultAdminPowers.edit_user;
        m.modal.querySelector('#p_delete').checked = defaultAdminPowers.delete_user;
        m.modal.querySelector('#p_reset').checked = defaultAdminPowers.reset_password;
        m.modal.querySelector('#p_manage').checked = defaultAdminPowers.manage_hours;
        m.modal.querySelector('#p_provas').checked = defaultAdminPowers.manage_provas;
        m.modal.querySelector('#p_delegate').checked = false;
    }
  });
  m.modal.querySelector('#formCreate').addEventListener('submit', async (ev)=> {
    ev.preventDefault();
    const type = m.modal.querySelector('#newType').value;
    const name = m.modal.querySelector('#newName').value.trim();
    const uname = m.modal.querySelector('#newUser').value.trim();
    if(!name || !uname) return alert('Nome e usuário são obrigatórios');
    const pass = m.modal.querySelector('#newPass').value || '123456';
    const allowSelf = !!m.modal.querySelector('#allowSelfPwd').checked;
    const creationDate = timestamp();
    if(type==='intern'){
      const id = uuid();
      (state.interns || []).push({ id, name, dates: [], hoursEntries: [], auditLog: [] });
      (state.users || []).push({ id: uuid(), username: uname, name, password: pass, role:'intern', internId: id, powers: defaultPowersFor('intern'), selfPasswordChange: allowSelf, createdAt: creationDate });
    } else {
      const p_create = m.modal.querySelector('#p_create').checked;
      const p_edit = m.modal.querySelector('#p_edit').checked;
      const p_delete = m.modal.querySelector('#p_delete').checked;
      const p_reset = m.modal.querySelector('#p_reset').checked;
      const p_manage = m.modal.querySelector('#p_manage').checked;
      const p_provas = m.modal.querySelector('#p_provas').checked;
      const p_delegate = m.modal.querySelector('#p_delegate').checked && currentManager.role==='super';
      const powers = { create_intern: p_create, edit_user: p_edit, delete_user: p_delete, reset_password: p_reset, manage_hours: p_manage, manage_provas: p_provas, delegate_admins: p_delegate };
      (state.users || []).push({ id: uuid(), username: uname, name, password: pass, role:'admin', powers, selfPasswordChange: true, createdAt: creationDate });
    }
    await save(state);
    alert('Usuário criado');
    m.close();
    m.cleanup();
    render();
  });
  m.modal.querySelector('#newType').dispatchEvent(new Event('change'));
}

// Função: showEditUserForm
function showEditUserForm(userId){
  const u = (state.users || []).find(x=>x.id===userId); if(!u) return;
  const currentManager = (state.users || []).find(uu=>uu.id===session.userId);
  if(u.id !== currentManager.id && !hasPower(currentManager,'edit_user')) return alert('Sem permissão');
  if (u.role === 'super' && currentManager.role !== 'super') return alert('Apenas o Super Admin pode se editar.');
  const intern = u.internId ? findInternById(u.internId) : null;
  const isIntern = u.role === 'intern';
  const canEditPowers = currentManager.role === 'super' && !isIntern;
  let powersHtml = '';
  if (!isIntern) {
      powersHtml = `
        <div id="adminPowersEdit" style="margin-top:15px; border-top: 1px solid #eee; padding-top: 10px;">
          <div class="small-muted" style="margin-bottom: 8px;">Poderes do Admin</div>
          <div class="form-check-group">
            <label class="form-check"><input type="checkbox" id="p_create_edit" ${u.powers.create_intern ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Criar estagiários</label>
            <label class="form-check"><input type="checkbox" id="p_edit_edit" ${u.powers.edit_user ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Editar usuários</label>
            <label class="form-check"><input type="checkbox" id="p_delete_edit" ${u.powers.delete_user ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Excluir usuários</label>
            <label class="form-check"><input type="checkbox" id="p_reset_edit" ${u.powers.reset_password ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Resetar senhas</label>
            <label class="form-check"><input type="checkbox" id="p_manage_edit" ${u.powers.manage_hours ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Gerenciar horas</label>
            <label class="form-check"><input type="checkbox" id="p_provas_edit" ${u.powers.manage_provas ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Gerenciar folgas</label>
            <label class="form-check"><input type="checkbox" id="p_delegate_edit" ${u.powers.delegate_admins ? 'checked' : ''} ${currentManager.role === 'super' && u.role !== 'super' ? '' : 'disabled'}/> Delegar admins</label>
          </div>
        </div>`;
  }
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>Editar usuário</h3><button id="closeE" class="button ghost">Fechar</button></div>
    <form id="formEdit" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      <label><span class="small-muted">Nome completo</span><input id="editName" value="${escapeHtml(isIntern ? intern?.name || '' : u.name || '')}" required/></label>
      <label><span class="small-muted">Usuário</span><input id="editUser" value="${escapeHtml(u.username)}" required/></label>
      <label><input type="checkbox" id="editAllowSelf" ${u.selfPasswordChange ? 'checked' : ''}/> Permitir auto-alteração de senha</label>
      ${powersHtml}
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">Salvar</button>
      </div>
    </form>
  `;
  const m = showModal(html);
  m.modal.querySelector('#closeE').addEventListener('click', ()=> { m.close(); m.cleanup(); });
  m.modal.querySelector('#formEdit').addEventListener('submit', async (ev)=> {
    ev.preventDefault();
    const newName = m.modal.querySelector('#editName').value.trim();
    const newUsername = m.modal.querySelector('#editUser').value.trim();
    if(!newName || !newUsername) return alert('Nome e usuário são obrigatórios');
    u.username = newUsername;
    u.name = newName;
    if(isIntern && intern){
      intern.name = newName;
    }
    u.selfPasswordChange = !!m.modal.querySelector('#editAllowSelf').checked;
    if (canEditPowers) {
        u.powers.create_intern = !!m.modal.querySelector('#p_create_edit').checked;
        u.powers.edit_user = !!m.modal.querySelector('#p_edit_edit').checked;
        u.powers.delete_user = !!m.modal.querySelector('#p_delete_edit').checked;
        u.powers.reset_password = !!m.modal.querySelector('#p_reset_edit').checked;
        u.powers.manage_hours = !!m.modal.querySelector('#p_manage_edit').checked;
        u.powers.manage_provas = !!m.modal.querySelector('#p_provas_edit').checked;
        if (currentManager.role === 'super' && u.role === 'admin') {
            u.powers.delegate_admins = !!m.modal.querySelector('#p_delegate_edit').checked;
        }
    }
    await save(state);
    alert('Atualizado');
    m.close();
    m.cleanup();
    render();
  });
}

// Função: filterAndRenderProvas
function filterAndRenderProvas(){
  const date = document.getElementById('mgrFilterDate').value;
  const area = document.getElementById('provasResults'); if(!area) return;
  area.innerHTML='';
  if(!date){ area.innerHTML = '<div class="muted">Escolha uma data para filtrar</div>'; return; }
  const matched = (state.interns || []).filter(i=> (i.dates || []).some(p => p.date === date) );
  if(matched.length===0){ area.innerHTML = '<div class="muted">Nenhum estagiário com folga-prova nesta data</div>'; return; }
  matched.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).forEach(it=>{
    const row = document.createElement('div'); row.className='row';
    const prova = (it.dates || []).find(p => p.date === date);
    const left = `<div><div style="font-weight:700">${escapeHtml(it.name)}</div><div class="muted small">ID: ${it.id}</div></div>`;
    let right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-view-id="${it.id}">Abrir</button></div>`;
    if(prova && prova.link){
        right = `<div style="display:flex;gap:8px;"><a href="${prova.link}" target="_blank" class="button">Link</a><button class="button ghost" data-view-id="${it.id}">Abrir</button></div>`;
    }
    row.innerHTML = left + right;
    row.querySelector('[data-view-id]').addEventListener('click', () => openInternManagerView(it.id));
    area.appendChild(row);
  });
}

// Função: renderNameDropdown
function renderNameDropdown(q){
  const dropdown = document.getElementById('mgrNameDropdown');
  if(!dropdown) return;
  dropdown.innerHTML = '';
  if(!q || q.length < 1){ dropdown.style.display = 'none'; return; }
  const matches = (state.interns || []).filter(i => i.name.toLowerCase().includes(q)).slice(0,50);
  if(matches.length === 0){ dropdown.style.display = 'none'; return; }
  matches.forEach(it => {
    const item = document.createElement('div');
    item.style.padding = '8px';
    item.style.cursor = 'pointer';
    item.innerHTML = `<div style="font-weight:700">${escapeHtml(it.name)}</div><div class="muted small">${it.id}</div>`;
    item.addEventListener('click', ()=> {
      document.getElementById('mgrNameDropdown').style.display = 'none';
      document.getElementById('mgrNameSearch').value = '';
      openInternManagerView(it.id);
    });
    dropdown.appendChild(item);
  });
  dropdown.style.display = 'block';
}