/* view-manager-main.js - Estrutura principal da interface de gestão */

import { escapeHtml, formatDate, nowISO, uuid, timestamp } from './utils.js';
import { showModal } from './ui-modals.js';
import { state, session, save, render, hasPower } from './app.js';

// Importa funções dos outros módulos de manager
import {
    renderUsersList,
    showCreateUserForm,
    deleteSelectedUsers,
    updateBulkDeleteButtonState,
    renderPendingList,
    renderNameDropdown
} from './view-manager-users.js';

import {
    renderReports,
    renderPendingVacationsSection,
    renderProvasSection,
    renderTrashList,
    renderSystemLogs,
    showBackupModal,
    renderPautaConfig
} from './view-manager-data.js';

// Variáveis de estado específicas do manager
export let adminCalendarViewing = new Date();
export let adminProvasView = 'list';
export let provasSubTypeFilter = 'all';

// Funções auxiliares para atualizar as variáveis de estado (necessário porque let não pode ser reimportado diretamente)
export function setAdminCalendarViewing(date) { adminCalendarViewing = date; }
export function setAdminProvasView(view) { adminProvasView = view; }
export function setProvasSubTypeFilter(filter) { provasSubTypeFilter = filter; }

// Função principal de renderização da interface de gestão
export function renderManager(user, isDelegatedView = false) {
    const root = document.getElementById('root');
    root.innerHTML = '';
    root.className = 'app-grid';

    const pendingCount = Object.values(state.pendingRegistrations || {}).filter(r => r.status !== 'rejected').length;
    const pendingClass = pendingCount > 0 ? 'has-pending-info' : '';

    // Contagem de pendências de férias
    const vacationPendingCount = (state.interns || [])
        .flatMap(i => i.vacations || [])
        .filter(v => v.status === 'pending')
        .length;
    const vacationPendingClass = vacationPendingCount > 0 ? 'has-pending' : '';

    const isSuperAdmin = user.role === 'super';

    const backToInternButton = `
    <div class="sidebar-item" id="btnBackToInternView" 
        style="
            background: linear-gradient(135deg, #004d61, #007b9e);
            color: #fff;
            font-weight: bold;
            border-radius: 8px;
            padding: 12px 18px;
            text-align: center;
            cursor: pointer;
        ">
        <span>Voltar ao Perfil Estagiário</span>
    </div>`;

    root.innerHTML = `
    <aside class="sidebar-nav">
      <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent);">
        Painel de Gestão
      </div>
      <div class="muted small">Usuário: ${escapeHtml(user.username)} • ${escapeHtml(isDelegatedView ? 'Admin Delegado' : user.role)}</div>
      
      ${isDelegatedView ? backToInternButton : ''}

      ${isSuperAdmin ?
            // Bloco do do perfil Super Admin (Botão Alterar Senha REMOVIDO)
            `<button class="button ghost btn-logout" id="btnLogoutMgr" style="width: 100%; margin-bottom: 1px;"><i class="fas fa-sign-out-alt"></i> Sair</button><hr style="border-color: #eee; margin: 8px 0;">` :

            // Bloco do perfil Admin (Botão Alterar Senha REMOVIDO)
            (user.role === 'admin' && user.selfPasswordChange ?
                `<button class="button ghost btn-logout" id="btnLogoutMgr" style="width: 100%; margin-bottom: 1px;"><i class="fas fa-sign-out-alt"></i> Sair</button><hr style="border-color: #eee; margin: 8px 0;">` :

                // Bloco do perfil para outros
                `<button class="button ghost btn-logout" id="btnLogoutMgr" style="width: 100%; margin-bottom: 1px;"><i class="fas fa-sign-out-alt"></i> Sair</button><hr style="border-color: #eee; margin: 8px 0;">`)
        }

      <div class="sidebar-group"> <div class="sidebar-group-header">
              <span>Gestão Pauta</span>
              <i class="fas fa-chevron-down"></i>
          </div>
          <div class="sidebar-group-content">
              <div class="sidebar-item active" data-section="geral">
                  <span><i class="fas fa-th-large"></i> Geral</span>
              </div>
              <div class="sidebar-item" data-section="provas">
                  <span><i class="fas fa-calendar-check"></i> Gerenciar afastamentos</span>
              </div>
          </div>
      </div>

      <div class="sidebar-group collapsed">
          <div class="sidebar-group-header">
              <span>Gestão Administrativa</span>
              <i class="fas fa-chevron-down"></i>
          </div>
          <div class="sidebar-group-content">
              <div class="sidebar-item" data-section="relatorios">
                  <span><i class="fas fa-chart-bar"></i> Relatórios de Horas</span>
              </div>
              ${!isDelegatedView ? `
              <div class="sidebar-item ${vacationPendingClass}" data-section="pendencias-ferias">
                  <span><i class="fas fa-umbrella-beach"></i> Solicitações de Férias</span>
                  <span id="vacation-pending-count-badge" class="badge" style="display: ${vacationPendingCount > 0 ? 'inline-block' : 'none'};">${vacationPendingCount}</span>
              </div>
              ` : ''}
          </div>
      </div>

      <div class="sidebar-group collapsed">
          <div class="sidebar-group-header">
              <span>Gerenciamento do Sistema</span>
              <i class="fas fa-chevron-down"></i>
          </div>
          <div class="sidebar-group-content">
              ${!isDelegatedView ? `
              <div class="sidebar-item ${pendingClass}" data-section="pendentes">
                  <span><i class="fas fa-user-clock"></i> Pré-cadastros Pendentes</span>
                  <span id="pending-count-badge" class="badge" style="display: ${pendingCount > 0 ? 'inline-block' : 'none'};">${pendingCount}</span>
              </div>
              <div class="sidebar-item" data-section="configuracoes">
                  <span><i class="fas fa-cog"></i> Configurações</span>
              </div>
              ` : ''}
              
              ${user.role === 'super' ? `
              <div class="sidebar-item" id="btnSidebarBackup">
                  <span><i class="fas fa-download"></i> Backup</span>
              </div>
              ` : ''}

              ${!isDelegatedView ? `
              <div class="sidebar-item" data-section="lixeira">
                  <span><i class="fas fa-trash-alt"></i> Lixeira</span>
              </div>
              ` : ''}

              ${user.role === 'super' ? `
              <div class="sidebar-item" data-section="systemlogs">
                  <span><i class="fas fa-clipboard-list"></i> Logs do Sistema</span>
              </div>
              ` : ''}
          </div>
      </div>

    </aside>


    <main class="main-content">
      <div id="geral" class="content-section active">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Usuários</h3>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button id="btnNewUser" class="button ghost"><i class="fas fa-user-plus"></i> Novo usuário</button>
              <button id="btnBulkImport" class="button alt"><i class="fas fa-users"></i> Criar em lote</button>
            </div>
          </div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
             
             <div style="padding: 12px; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 8px; display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end;">
                <div style="flex-grow: 1; min-width: 120px;">
                    <label class="small-muted" for="filterTipo">Tipo</label>
                    <select id="filterTipo" class="input">
                      <option value="all">Todos</option>
                      <option value="admin">Admin</option>
                      <option value="intern">Estagiário</option>
                      <option value="servidor">Servidor</option>
                    </select>
                </div>
                <div style="flex-grow: 1; min-width: 120px;">
                    <label class="small-muted" for="filterSubtipo">Subtipo</label>
                    <select id="filterSubtipo" class="input">
                      <option value="all">Todos</option>
                      <option value="administrativo">Administrativo</option>
                      <option value="sessao">Sessão</option>
                    </select>
                </div>
                <div style="flex-grow: 1; min-width: 120px;">
                    <label class="small-muted" for="filterLocalidade">Localidade</label>
                    <select id="filterLocalidade" class="input">
                      <option value="all">Todos</option>
                      <option value="administrativo">Administrativo</option>
                      <option value="cartório">Cartório</option>
                      <option value="gabinete">Gabinete</option>
                      <option value="audiência">Audiência</option>
                    </select>
                </div>
                <button id="btnClearFilters" class="button ghost"><i class="fas fa-eraser"></i> Limpar Filtros</button>
             </div>

             <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 8px;">
                <div class="form-check">
                    <input type="checkbox" id="selectAllUsersCheckbox" style="width: auto; height: auto;">
                    <label for="selectAllUsersCheckbox" style="font-size: 13px; color: var(--muted); cursor: pointer;">Selecionar Todos</label>
                </div>
                <button id="btnDeleteSelectedUsers" class="button danger" disabled>Excluir (0)</button>
             </div>

             <input id="searchMgmt" placeholder="Pesquisar por nome, usuário ou ID" />
             <div class="muted small">Total de usuários: <span id="totalUsers"></span></div>
             <div class="list" id="usersList" style="margin-top:10px"></div>
          </div>
        </div>
        <div class="card" style="margin-top:12px">
            <h3>Pesquisa de Estagiários</h3>
            <div class="muted small">Pesquise por estagiário – lista dinâmica. Clique para abrir detalhes.</div>
            <div style="margin-top:8px;position:relative">
                <input id="mgrNameSearch" placeholder="Pesquisar por nome do estagiário" autocomplete="off" />
                <div id="mgrNameDropdown" class="dropdown" style="position:absolute;left:0;right:0;z-index:30;display:none;background:#fff;border:1px solid #eee;max-height:220px;overflow:auto"></div>
            </div>
            <div id="mgrResults" style="margin-top:12px"></div>
        </div>
      </div>
      <div id="provas" class="content-section">
          <div class="card">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <h3>Gerenciar afastamentos</h3>
                <div style="display: flex; gap: 8px;">
                    <button id="toggleProvasListView" class="button">Lista</button>
                    <button id="toggleProvasCalendarView" class="button ghost">Calendário</button>
                </div>
              </div>

              <div id="provasFilterButtons" class="filter-button-group" style="margin-top: 12px;">
                  <button class="button" data-filter="all">Todos</button>
                  <button class="button ghost" data-filter="administrativo">Administrativo</button>
                  <button class="button ghost" data-filter="sessao">Sessão</button>
              </div>

              <a href="visualizacaogeral.html" target="_blank" class="button alt small" style="text-decoration: none; padding: 4px 8px; font-size: 0.8rem;">
                    <i class="fas fa-eye"></i>
                </a>

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
        <div class="card" id="reportsArea">
          </div>
      </div>
      <div id="pendentes" class="content-section">
        <div class="card">
          <h3>Pré-cadastros Pendentes</h3>
          <div class="muted small">Aprove ou recuse solicitações de novos estagiários.</div>
          <div id="pendingList" style="margin-top:10px"></div>
        </div>
      </div>
      <div id="pendencias-ferias" class="content-section"></div>
      <div id="configuracoes" class="content-section">
        <div class="card">
          <h3>Configurações</h3>
          
          <div class="tabs">
            <button class="tab-button active" data-tab="folga-prova">Configurações afastamentos</button>
            <button class="tab-button" data-tab="prazo-pauta">Configuração Prazo da Pauta</button>
          </div>

          <div id="folga-prova" class="tab-content active">
              <h4 style="margin-top:15px; color: var(--accent);">Folga-Prova</h4>
              <div class="small-muted">Bloqueio para marcação de folgas-prova (dias)</div>
              <div class="settings-row">
                  <select id="cfgBlockDays">${new Array(31).fill(0).map((_, i) => `<option value="${i}">${i} dias</option>`).join('')}</select>
              </div>
              
              <hr style="margin: 20px 0; border-color: #eee;">
              
              <h4 style="color: var(--accent);">Férias</h4>
              <div class="small-muted">Bloqueio para alteração (exclusão) de férias (dias)</div>
              <div class="settings-row">
                  <select id="cfgVacationBlockDays">${new Array(91).fill(0).map((_, i) => `<option value="${i}">${i} dias</option>`).join('')}</select>
              </div>
              
              <div style="margin-top: 15px; display:flex; justify-content:flex-end;">
                  <button class="button" id="btnSaveConfig">Salvar Configurações</button>
              </div>
          </div>

          <div id="prazo-pauta" class="tab-content">
            </div>

          <hr style="margin: 20px 0"/>
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
      <div id="systemlogs" class="content-section">
        <div class="card">
            <h3>Logs do Sistema</h3>
            <div class="tabs" style="margin-bottom: 15px;">
              <button class="tab-button active" data-tab="activity">Logs de Atividade</button>
              <button class="tab-button" data-tab="access">Histórico de Acesso</button>
            </div>

            <div id="activity" class="tab-content active">
              <div class="muted small">Todas as atividades registradas no sistema.</div>
              <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
                  <input type="date" id="logFilterDate" />
                  <button class="button" id="btnApplyLogFilter">Filtrar por Data</button>
                  <button class="button ghost" id="btnClearLogFilter">Mostrar Todos</button>
                  <button id="btnClearActivityLogs" class="button danger" style="margin-left: auto;">Limpar Logs de Atividade</button>
              </div>
              <div id="logListContainer" style="margin-top:12px; max-height: 600px; overflow-y: auto;"></div>
            </div>

            <div id="access" class="tab-content">
              <div class="muted small">Registros de todos os logins bem-sucedidos no sistema.</div>
              
              <div style="display:flex; gap: 10px; margin-top: 12px; align-items: center;">
                  <input type="text" id="loginLogSearchInput" placeholder="Filtrar por nome ou usuário..." style="flex-grow: 1; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--input-border);">
                  <input type="date" id="loginLogDateInput" style="max-width: 180px; padding: 5px 8px; border-radius: 8px; border: 1px solid var(--input-border);">
                  <button class="button ghost" id="btnClearLoginLogFilter" style="flex-shrink: 0;">Limpar Filtros</button>
              </div>

              <div style="display:flex;gap:16px;margin-top:12px;align-items:center">
                  <div class="form-check">
                      <input type="checkbox" id="selectAllLoginLogs" style="width: auto; height: auto;">
                      <label for="selectAllLoginLogs">Selecionar Tudo</label>
                  </div>
                  <button id="btnDeleteSelectedLoginLogs" class="button ghost" disabled>Apagar Selecionados</button>
                  <button id="btnClearLoginLogs" class="button danger" style="margin-left: auto;">Apagar Todo o Histórico</button>
              </div>
              <div id="loginLogContainer" style="margin-top:12px; max-height: 600px; overflow-y: auto;"></div>
            </div>
        </div>
      </div>
    </main>
    <input type="file" id="fileMgmt" style="display:none" accept="application/json" />
    <input type="file" id="fileBulkImport" style="display:none" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
    `;

    // Event listeners para navegação e controles principais
    setupMainEventListeners(user, isDelegatedView);
}

// Configura todos os event listeners da interface principal
function setupMainEventListeners(user, isDelegatedView) {

    document.querySelectorAll('.sidebar-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const group = header.closest('.sidebar-group');
            group.classList.toggle('collapsed');
        });
    });
    updateSidebarGroupHighlights();

    // Botão voltar para perfil estagiário
    if (isDelegatedView) {
        document.getElementById('btnBackToInternView').addEventListener('click', () => {
            session.viewMode = 'intern';
            render();
        });
    }

    document.getElementById('filterTipo').addEventListener('change', renderUsersList);
    document.getElementById('filterSubtipo').addEventListener('change', renderUsersList);
    document.getElementById('filterLocalidade').addEventListener('change', renderUsersList);
    document.getElementById('btnClearFilters').addEventListener('click', () => {
        document.getElementById('filterTipo').value = 'all';
        document.getElementById('filterSubtipo').value = 'all';
        document.getElementById('filterLocalidade').value = 'all';

        // Dispara o evento de change para garantir que os filtros dependentes sejam resetados
        document.getElementById('filterSubtipo').dispatchEvent(new Event('change'));

        renderUsersList();
    });

    // LÓGICA DO FILTRO DEPENDENTE
    const filterSubtipo = document.getElementById('filterSubtipo');
    const filterLocalidade = document.getElementById('filterLocalidade');

    if (filterSubtipo && filterLocalidade) {
        // Guarda as opções originais para poder restaurá-las
        if (!filterLocalidade.dataset.allOptions) {
            filterLocalidade.dataset.allOptions = filterLocalidade.innerHTML;
        }

        filterSubtipo.addEventListener('change', () => {
            const selectedSubtipo = filterSubtipo.value;

            if (selectedSubtipo === 'administrativo') {
                filterLocalidade.innerHTML = `
                    <option value="all">Todos</option>
                    <option value="cartório">Cartório</option>
                    <option value="gabinete">Gabinete</option>
                `;
            } else if (selectedSubtipo === 'sessao') {
                filterLocalidade.innerHTML = `
                    <option value="all">Todos</option>
                    <option value="administrativo">Apoio à audiência</option>
                    <option value="audiência">Audiência</option>
                `;
            } else { // 'all'
                filterLocalidade.innerHTML = filterLocalidade.dataset.allOptions;
            }
            filterLocalidade.value = 'all';
        });
    }

    // Filtros de provas por subtipo
    document.querySelectorAll('#provasFilterButtons button').forEach(button => {
        button.addEventListener('click', (e) => {
            setProvasSubTypeFilter(e.currentTarget.dataset.filter);
            document.querySelectorAll('#provasFilterButtons button').forEach(btn => {
                btn.classList.add('ghost');
            });
            e.currentTarget.classList.remove('ghost');
            renderProvasSection();
        });
    });

    // --- INÍCIO DA CORREÇÃO (ADIÇÃO DOS LISTENERS DE TOGGLE) ---
    // Adiciona os listeners para os botões "Lista" e "Calendário"
    const toggleListBtn = document.getElementById('toggleProvasListView');
    const toggleCalendarBtn = document.getElementById('toggleProvasCalendarView');

    if (toggleListBtn) {
        toggleListBtn.addEventListener('click', () => {
            setAdminProvasView('list'); // Atualiza o estado
            renderProvasSection(); // Re-renderiza a seção
        });
    }

    if (toggleCalendarBtn) {
        toggleCalendarBtn.addEventListener('click', () => {
            setAdminProvasView('calendar'); // Atualiza o estado
            renderProvasSection(); // Re-renderiza a seção
        });
    }
    // --- FIM DA CORREÇÃO ---


    // Seleção de todos os usuários
    const selectAllCheckbox = document.getElementById('selectAllUsersCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('#usersList .user-select-checkbox').forEach(checkbox => {
                checkbox.checked = isChecked;
            });
            updateBulkDeleteButtonState();
        });
    }


    // Exclusão em lote de usuários
    document.getElementById('btnDeleteSelectedUsers').addEventListener('click', deleteSelectedUsers);

    // Navegação entre seções da sidebar
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const sectionId = e.currentTarget.dataset.section;
            if (e.currentTarget.id === 'btnSidebarBackup' || e.currentTarget.id === 'btnBackToInternView') {
                if (e.currentTarget.id === 'btnSidebarBackup') showBackupModal();
                return;
            }
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            if (sectionId) document.getElementById(sectionId).classList.add('active');

            // Renderiza a seção apropriada quando ativada
            if (sectionId === 'relatorios') renderReports();
            else if (sectionId === 'provas') renderProvasSection();
            else if (sectionId === 'pendentes') renderPendingList();
            else if (sectionId === 'pendencias-ferias') renderPendingVacationsSection();
            else if (sectionId === 'lixeira') renderTrashList();
            else if (sectionId === 'systemlogs') renderSystemLogs();
        });
    });

    // Botões de ação principal
    document.getElementById('btnLogoutMgr').addEventListener('click', () => { window.logout(); });
    document.getElementById('btnNewUser').addEventListener('click', () => showCreateUserForm((state.users || {})[session.userId]));
    document.getElementById('btnBulkImport').addEventListener('click', () => {
        const manager = (state.users || {})[session.userId];
        if (!hasPower(manager, 'create_intern')) return showToast('Sem permissão.', 'error');
        import('./view-manager-users.js').then(module => module.showBulkImportModal());
    });

    // Busca de usuários
    document.getElementById('searchMgmt').addEventListener('input', renderUsersList);

    // Busca de estagiários por nome
    const nameInput = document.getElementById('mgrNameSearch');
    nameInput.addEventListener('input', (ev) => renderNameDropdown(ev.target.value.trim().toLowerCase()));
    nameInput.addEventListener('focus', (ev) => renderNameDropdown(ev.target.value.trim().toLowerCase()));
    document.addEventListener('click', (ev) => {
        const dropdown = document.getElementById('mgrNameDropdown');
        if (dropdown && !ev.target.closest('#mgrNameSearch') && !ev.target.closest('#mgrNameDropdown')) {
            dropdown.style.display = 'none';
        }
    });

    const provasSection = document.getElementById('provas');
    if (provasSection) {

        // Alerta ao clicar no botão "Buscar"
        provasSection.addEventListener('click', (e) => {
            if (e.target.id === 'btnApplyFilter') {
                // A lógica de busca real é disparada pelo listener 
                // em 'view-manager-data.js' (via renderProvasSection).
                // Aqui, apenas exibimos a notificação.

                // Usamos um pequeno timeout para garantir que a UI
                // processe o clique antes de mostrar o toast.
                setTimeout(() => {
                    // Assumindo que showToast está disponível no escopo 
                    // (assim como em outras funções neste arquivo)
                    showToast('A lista foi atualizada!', 'success');
                }, 100);
            }
        });
    }

    // Configuração das abas de configurações
    setupConfigurationTabs();

    // Configuração de bloqueio de folga prova
    setupProvaBlockConfig();

    // Configuração da lixeira
    setupTrashConfig();

    // Renderiza a lista inicial de usuários
    renderUsersList();
    renderPautaConfig();
}

// Configura as abas da seção de configurações
function setupConfigurationTabs() {
    const configSection = document.getElementById('configuracoes');
    if (configSection) {
        const configTabs = configSection.querySelectorAll('.tab-button');
        const configContents = configSection.querySelectorAll('.tab-content');

        configTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.dataset.tab;
                configTabs.forEach(t => t.classList.remove('active'));
                configContents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const activeContent = configSection.querySelector(`#${targetId}`);
                activeContent.classList.add('active');
                if (targetId === 'prazo-pauta') {
                    renderPautaConfig();
                }
            });
        });
    }
}

// Configura o sistema de bloqueio de folgas-prova e férias
function setupProvaBlockConfig() {
    const cfgBlockDays = document.getElementById('cfgBlockDays');
    const cfgVacationBlockDays = document.getElementById('cfgVacationBlockDays');

    if (cfgBlockDays) {
        cfgBlockDays.value = String((state.meta || {}).provaBlockDays || 5);
    }

    if (cfgVacationBlockDays) {
        cfgVacationBlockDays.value = String((state.meta || {}).vacationBlockDays || 0);
    }

    document.getElementById('btnSaveConfig').addEventListener('click', async () => {
        const provaVal = Number(document.getElementById('cfgBlockDays').value || 0);
        const vacationVal = Number(document.getElementById('cfgVacationBlockDays').value || 0);

        state.meta.provaBlockDays = provaVal;
        state.meta.vacationBlockDays = vacationVal;

        await save(state);
        showToast('Configurações salvas com sucesso!', 'success');
    });
}

// Configura as opções da lixeira
function setupTrashConfig() {
    const cfgTrashRetention = document.getElementById('cfgTrashRetention');
    if (cfgTrashRetention) {
        cfgTrashRetention.value = String((state.meta || {}).trashRetentionDays || 10);
        document.getElementById('btnSaveRetention').addEventListener('click', async () => {
            const val = Number(document.getElementById('cfgTrashRetention').value || 10);
            state.meta.trashRetentionDays = val;
            await save(state);
            showToast('Período de retenção salvo com sucesso!', 'success');
        });

        // Importa e configura as funções da lixeira
        import('./view-manager-data.js').then(module => {
            document.getElementById('btnEmptyTrash').addEventListener('click', module.emptyTrash);
            document.getElementById('btnRestoreAll').addEventListener('click', module.restoreAllTrash);
            document.getElementById('btnRestoreSelected').addEventListener('click', module.restoreSelectedTrash);
        });
    }
}

// Atualiza os destaques dos grupos da sidebar se tiverem pendências
function updateSidebarGroupHighlights() {
    document.querySelectorAll('.sidebar-group').forEach(group => {
        // Verifica se existe um item com notificação de FÉRIAS (vermelho)
        const hasPendingVacation = group.querySelector('.sidebar-item.has-pending');
        // Verifica se existe um item com notificação de CADASTRO (azul)
        const hasPendingInfo = group.querySelector('.sidebar-item.has-pending-info');

        // Limpa classes antigas
        group.classList.remove('group-has-pending', 'group-has-pending-info');

        if (hasPendingVacation) {
            // Prioridade 1: Se tem pendência de férias, o grupo fica vermelho
            group.classList.add('group-has-pending');
        } else if (hasPendingInfo) {
            // Prioridade 2: Se não tem férias, mas tem cadastro, o grupo fica azul
            group.classList.add('group-has-pending-info');
        }
    });
}

// Função para atualizar o contador de pendências de férias no menu lateral
export function updateVacationPendingBadge() {
    const vacationPendingCount = (state.interns || [])
        .flatMap(i => i.vacations || [])
        .filter(v => v.status === 'pending')
        .length;

    const badge = document.getElementById('vacation-pending-count-badge');
    if (badge) {
        badge.textContent = vacationPendingCount;
        badge.style.display = vacationPendingCount > 0 ? 'inline-block' : 'none';
    }

    // Atualiza também a classe do item do menu
    const menuItem = document.querySelector('[data-section="pendencias-ferias"]');
    if (menuItem) {
        if (vacationPendingCount > 0) {
            menuItem.classList.add('has-pending');
        } else {
            menuItem.classList.remove('has-pending');
        }
    }
}
