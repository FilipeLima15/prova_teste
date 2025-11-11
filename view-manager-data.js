/* view-manager-data.js - Relatórios, dados agregados, logs e configurações do sistema */

import { escapeHtml, nowISO, uuid, timestamp } from './utils.js';
import { showModal, showDeleteConfirmationModal, showVacationApprovalModal } from './ui-modals.js';
import { state, session, save, render, findInternById, findUserByIntern, defaultPowersFor, downloadBlob, showToast } from './app.js';
import { updateVacationPendingBadge } from './view-manager-main.js';
import { adminCalendarViewing, setAdminCalendarViewing, adminProvasView, provasSubTypeFilter, setAdminProvasView } from './view-manager-main.js';
import { openInternHoursView, openUserManagerView } from './view-manager-users.js';

// ========== RELATÓRIOS DE HORAS ==========

export function renderReports() {
    const area = document.getElementById('reportsArea');
    if (!area) return;

    // Estrutura principal com abas
    area.innerHTML = `
        <div class="tabs" style="margin-top: 15px;">
            <button class="tab-button active" data-tab="negativas">Horas negativas</button>
            <button class="tab-button" data-tab="positivas">Horas positivas</button>
        </div>
        <div id="reports-content-area" style="margin-top: 15px;"></div>
    `;

    const tabs = area.querySelectorAll('.tab-button');
    const contentArea = area.querySelector('#reports-content-area');

    // Função para renderizar o conteúdo da aba selecionada
    const renderReportList = (tabName) => {
        const computed = (state.interns || []).map(i => {
            const totalBank = ((i.hoursEntries) || [])
                .filter(e => e.hours > 0)
                .reduce((s, e) => s + e.hours, 0);

            const totalNeg = ((i.hoursEntries) || [])
                .filter(e => e.hours < 0 && !e.compensated)
                .reduce((s, e) => s + Math.abs(e.hours), 0);

            return { id: i.id, name: i.name, net: totalBank - totalNeg };
        });

        const baseBadgeStyle = 'display:inline-block;min-width:36px;text-align:center;padding:6px 8px;border-radius:8px;font-weight:700;font-size:0.9em;line-height:1;';
        const negInline = baseBadgeStyle + 'background-color: rgba(239,68,68,0.10); color: #ef4444; border: 1px solid rgba(239,68,68,0.12);';
        const okInline = baseBadgeStyle + 'background-color: rgba(16,185,129,0.08); color: #10b981; border: 1px solid rgba(16,185,129,0.10);';

        if (tabName === 'negativas') {
            const negatives = computed.filter(x => x.net < 0).sort((a, b) => a.net - b.net);
            if (negatives.length === 0) {
                contentArea.innerHTML = '<div class="muted small" style="text-align: center; padding: 20px;">Nenhum estagiário com horas negativas.</div>';
            } else {
                contentArea.innerHTML = negatives.map(n => `
                    <div class="row">
                        <div><strong>${escapeHtml(n.name)}</strong></div>
                        <div class="inline">
                            <span style="${negInline}">${Math.abs(n.net)}h</span>
                            <button class="button ghost" data-intern-id="${n.id}"><i class="fas fa-cog"></i> Gerenciar</button>
                        </div>
                    </div>
                `).join('');
            }
        } else if (tabName === 'positivas') {
            const banks = computed.filter(x => x.net > 0).sort((a, b) => b.net - a.net);
            if (banks.length === 0) {
                contentArea.innerHTML = '<div class="muted small" style="text-align: center; padding: 20px;">Nenhum estagiário com horas positivas.</div>';
            } else {
                contentArea.innerHTML = banks.map(n => `
                    <div class="row">
                        <div><strong>${escapeHtml(n.name)}</strong></div>
                        <div class="inline">
                            <span style="${okInline}">${n.net}h</span>
                            <button class="button ghost" data-intern-id="${n.id}"><i class="fas fa-cog"></i> Gerenciar</button>
                        </div>
                    </div>
                `).join('');
            }
        }

        // --- INÍCIO DA ALTERAÇÃO ---
        // Adiciona o evento de clique aos novos botões "Gerenciar"
        contentArea.querySelectorAll('[data-intern-id]').forEach(button => {
            button.addEventListener('click', (e) => {
                const internId = e.currentTarget.dataset.internId;
                const user = findUserByIntern(internId); // Encontra o usuário do estagiário
                if (user) {
                    // Importa a função do outro módulo e a chama com a opção da aba 'hours'
                    import('./view-manager-users.js').then(module => {
                        module.showManagementOptionsModal(user, { initialTab: 'hours' });
                    });
                } else {
                    showToast('Usuário não encontrado para este estagiário.', 'error');
                }
            });
        });
        // --- FIM DA ALTERAÇÃO ---
    };

    // Adiciona os eventos de clique nas abas
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderReportList(tab.dataset.tab);
        });
    });

    // Renderiza o conteúdo da primeira aba ("negativas") inicialmente
    renderReportList('negativas');
}

// ========== SEÇÃO: ANÁLISE DE FÉRIAS ==========

export function renderPendingVacationsSection() {
    const container = document.getElementById('pendencias-ferias');
    if (!container) return;

    container.innerHTML = `
        <div class="card">
            <h3>Solicitações de Férias (Pendências)</h3>
            <div class="muted small">Analise e gerencie as solicitações de férias.</div>

            <div class="tabs" style="margin-top: 15px;">
                <button class="tab-button active" data-tab-filter="pending">Aguardando análise</button>
                <button class="tab-button" data-tab-filter="analisadas">Analisadas</button>
                <button class="tab-button" data-tab-filter="servidores" disabled>Servidores</button>
            </div>
            
            <div id="vacation-content-area" style="margin-top: 15px;"></div>
        </div>
    `;

    const tabs = container.querySelectorAll('.tab-button');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.disabled) return;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderVacationList();
        });
    });

    // Função principal que decide qual lista renderizar
    const renderVacationList = () => {
        const activeTab = container.querySelector('.tab-button.active').dataset.tabFilter;
        const contentArea = container.querySelector('#vacation-content-area');

        if (activeTab === 'pending') {
            renderPendingList(contentArea);
        } else if (activeTab === 'analisadas') {
            renderAnalyzedList(contentArea);
        }
    };

    // Renderiza a lista inicial
    renderVacationList();
}

// Renderiza a lista de FÉRIAS PENDENTES
function renderPendingList(container) {
    container.innerHTML = `
        <input id="vacationSearchInput" class="input" placeholder="Pesquisar por nome do solicitante..." />
        <div id="pendingVacationsList" style="margin-top: 15px;"></div>
    `;

    const searchInput = container.querySelector('#vacationSearchInput');
    const listContainer = container.querySelector('#pendingVacationsList');

    const filterAndRender = () => {
        const query = searchInput.value.trim().toLowerCase();

        let allPending = [];
        (state.interns || []).forEach(intern => {
            const user = findUserByIntern(intern.id);
            (intern.vacations || []).forEach(vacation => {
                if (vacation.status === 'pending') {
                    allPending.push({
                        ...vacation, internName: intern.name, internId: intern.id, username: user ? user.username : 'N/A'
                    });
                }
            });
        });

        let filtered = query ? allPending.filter(req => req.internName.toLowerCase().includes(query)) : allPending;

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">Nenhuma solicitação pendente encontrada.</div>';
            return;
        }

        listContainer.innerHTML = filtered.map(req => {
            const startDate = new Date(req.startDate + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + req.days - 1);
            const period = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;
            const requestDate = req.createdAt ? new Date(req.createdAt).toLocaleDateString('pt-BR') : 'N/A';

            return `
                <div class="row status-pending">
                    <div>
                        <div style="font-weight:700;">${escapeHtml(req.internName)}</div>
                        <div class="muted small">Matrícula: ${escapeHtml(req.username)} • Período: ${period} (${req.days} dias)</div>
                        <div class="muted small">Pedido registrado em: ${requestDate}</div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="button" data-approve-id="${req.id}" data-intern-id="${req.internId}"><i class="fas fa-check"></i> Aprovar</button>
                        <button class="button danger" data-reject-id="${req.id}" data-intern-id="${req.internId}"><i class="fas fa-times"></i> Recusar</button>
                    </div>
                </div>
            `;
        }).join('');

        // Listener do botão APROVAR
        listContainer.querySelectorAll('[data-approve-id]').forEach(button => {
            button.addEventListener('click', () => {
                const internId = button.dataset.internId;
                const vacationId = button.dataset.approveId;
                const onConfirm = async () => {
                    await updateVacationStatus(internId, vacationId, 'approved');
                    updateVacationPendingBadge(); // Atualiza o contador
                    renderPendingList(container);
                };
                showVacationApprovalModal(onConfirm);
            });
        });

        // Listener do botão RECUSAR
        listContainer.querySelectorAll('[data-reject-id]').forEach(button => {
            button.addEventListener('click', async () => {
                if (confirm('Deseja realmente recusar esta solicitação de férias?')) {
                    await updateVacationStatus(button.dataset.internId, button.dataset.rejectId, 'rejected');
                    updateVacationPendingBadge(); // Atualiza o contador
                    renderPendingList(container);
                }
            });
        });
    };

    searchInput.addEventListener('input', filterAndRender);
    filterAndRender();
}

// Renderiza a lista de FÉRIAS ANALISADAS
function renderAnalyzedList(container) {
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr auto; gap: 16px; margin-bottom: 15px; align-items: flex-end;">
            <input id="analyzedSearchInput" class="input" placeholder="Pesquisar por nome do solicitante..." />
            <div>
                <label class="small-muted" for="analyzedStatusFilter">Filtrar por status</label>
                <select id="analyzedStatusFilter" class="input">
                    <option value="all">Todas</option>
                    <option value="approved">Aprovadas</option>
                    <option value="rejected">Rejeitadas</option>
                </select>
            </div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 15px;">
            <div class="form-check">
                <input type="checkbox" id="selectAllAnalyzedCheckbox" style="width: auto; height: auto;">
                <label for="selectAllAnalyzedCheckbox" style="font-size: 13px; color: var(--muted); cursor: pointer;">Selecionar Todos</label>
            </div>
            <button id="btnDeleteSelectedAnalyzed" class="button danger" disabled>Excluir (0)</button>
        </div>
        <div id="analyzedVacationsList" style="margin-top: 15px;"></div>
    `;

    const searchInput = container.querySelector('#analyzedSearchInput');
    const statusFilter = container.querySelector('#analyzedStatusFilter');
    const listContainer = container.querySelector('#analyzedVacationsList');
    const selectAllCheckbox = container.querySelector('#selectAllAnalyzedCheckbox');
    const deleteButton = container.querySelector('#btnDeleteSelectedAnalyzed');

    const updateDeleteButtonState = () => {
        const selectedCount = container.querySelectorAll('.analyzed-checkbox:checked').length;
        deleteButton.textContent = `Excluir (${selectedCount})`;
        deleteButton.disabled = selectedCount === 0;
    };

    const filterAndRender = () => {
        const query = searchInput.value.trim().toLowerCase();
        const status = statusFilter.value;

        let allAnalyzed = [];
        (state.interns || []).forEach(intern => {
            const user = findUserByIntern(intern.id);
            (intern.vacations || []).forEach(vacation => {
                if (vacation.status === 'approved' || vacation.status === 'rejected') {
                    allAnalyzed.push({
                        ...vacation, internName: intern.name, internId: intern.id, username: user ? user.username : 'N/A'
                    });
                }
            });
        });

        let filteredByStatus = allAnalyzed;
        if (status !== 'all') {
            filteredByStatus = allAnalyzed.filter(req => req.status === status);
        }

        let filtered = query ? filteredByStatus.filter(req => req.internName.toLowerCase().includes(query)) : filteredByStatus;

        filtered.sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">Nenhuma solicitação analisada encontrada para os filtros aplicados.</div>';
            return;
        }

        listContainer.innerHTML = filtered.map(req => {
            const statusClass = `status-${req.status}`;
            const startDate = new Date(req.startDate + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + req.days - 1);
            const period = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;

            return `
                <div class="row ${statusClass}" style="display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: center;">
                    <input type="checkbox" class="analyzed-checkbox" data-vacation-id="${req.id}" data-intern-id="${req.internId}" style="width: auto; height: auto;">
                    <div>
                        <div style="font-weight:700;">${escapeHtml(req.internName)} <span class="muted small">(${escapeHtml(req.username)})</span></div>
                        <div class="muted small">Período: ${period} (${req.days} dias)</div>
                        <div class="audit">Analisado por ${escapeHtml(req.analyzedBy || '?')} em ${new Date(req.analyzedAt).toLocaleDateString('pt-BR')}</div>
                    </div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.analyzed-checkbox').forEach(cb => cb.addEventListener('change', updateDeleteButtonState));
    };

    selectAllCheckbox.addEventListener('change', () => {
        container.querySelectorAll('.analyzed-checkbox').forEach(cb => cb.checked = selectAllCheckbox.checked);
        updateDeleteButtonState();
    });

    deleteButton.addEventListener('click', () => {
        const selected = container.querySelectorAll('.analyzed-checkbox:checked');
        if (selected.length === 0) return;

        const onConfirm = async () => {
            const manager = (state.users || {})[session.userId];
            selected.forEach(cb => {
                const internId = cb.dataset.internId;
                const vacationId = cb.dataset.vacationId;
                const intern = findInternById(internId);
                if (!intern) return;

                const vIndex = intern.vacations.findIndex(v => v.id === vacationId);
                if (vIndex > -1) {
                    const vacation = intern.vacations[vIndex];
                    state.trash.push({
                        id: uuid(), type: 'vacation', internId, internName: intern.name,
                        data: vacation, deletedAt: timestamp(), deletedBy: manager.username,
                    });
                    intern.vacations.splice(vIndex, 1);
                }
            });
            await save(state);
            renderAnalyzedList(container);
        };

        showDeleteConfirmationModal(onConfirm, selected.length);
    });

    searchInput.addEventListener('input', filterAndRender);
    statusFilter.addEventListener('change', filterAndRender);
    filterAndRender();
}


// Função para atualizar o status de uma solicitação de férias
async function updateVacationStatus(internId, vacationId, newStatus) {
    const intern = findInternById(internId);
    const user = findUserByIntern(internId); // Encontra o usuário do estagiário
    if (!intern || !intern.vacations || !user) return;

    const vacationIndex = intern.vacations.findIndex(v => v.id === vacationId);
    if (vacationIndex === -1) return;

    const manager = (state.users || {})[session.userId];
    if (!manager) return;

    // Atualiza os dados da solicitação
    intern.vacations[vacationIndex].status = newStatus;
    intern.vacations[vacationIndex].analyzedBy = manager.name || manager.username;
    intern.vacations[vacationIndex].analyzedAt = timestamp();

    // Cria e adiciona a notificação para o usuário
    user.notifications = user.notifications || [];
    const statusText = newStatus === 'approved' ? 'APROVADA' : 'REJEITADA';
    const notification = {
        id: uuid(),
        type: 'vacation_analyzed',
        timestamp: timestamp(),
        isRead: false,
        message: `Sua solicitação de férias foi ${statusText} por ${escapeHtml(manager.name || manager.username)} - (analisar na aba Andamento das solicitações).`
    };
    user.notifications.push(notification);

    // Adiciona um registro de auditoria no perfil do estagiário
    const actionText = newStatus === 'approved' ? 'Aprovou' : 'Rejeitou';
    const vacation = intern.vacations[vacationIndex];
    intern.auditLog = intern.auditLog || [];
    intern.auditLog.push({
        id: uuid(),
        action: `vacation_${newStatus}`,
        byUserId: manager.id,
        byUserName: manager.username,
        at: timestamp(),
        details: `${actionText} a intenção de férias de ${vacation.days} dias, com início em ${vacation.startDate}.`
    });

    await save(state);
}


// ========== GERENCIAR AFASTAMENTOS (ANTIGO FOLGAS-PROVA) ==========

export function renderProvasSection() {
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

        // --- INÍCIO DA CORREÇÃO ---
        // Clonar e substituir os elementos de filtro para evitar listeners duplicados

        const oldFilterDateInput = document.getElementById('mgrFilterDate');
        const oldBtnApplyFilter = document.getElementById('btnApplyFilter');
        const oldBtnClearDateFilter = document.getElementById('btnClearDateFilter');

        // 1. Clonar
        const filterDateInput = oldFilterDateInput.cloneNode(true);
        const btnApplyFilter = oldBtnApplyFilter.cloneNode(true);
        const btnClearDateFilter = oldBtnClearDateFilter.cloneNode(true);

        // 2. Substituir (Isso remove os listeners antigos)
        oldFilterDateInput.replaceWith(filterDateInput);
        oldBtnApplyFilter.replaceWith(btnApplyFilter);
        oldBtnClearDateFilter.replaceWith(btnClearDateFilter);
        // --- FIM DA CORREÇÃO ---

        if (filterDateInput && !filterDateInput.value) {
            filterDateInput.value = nowISO();
        }

        filterAndRenderAfastamentos();

        // 3. Adicionar listeners aos NOVOS clones
        btnApplyFilter.addEventListener('click', filterAndRenderAfastamentos);
        filterDateInput.addEventListener('change', () => btnApplyFilter.click());
        btnClearDateFilter.addEventListener('click', () => {
            filterDateInput.value = '';
            document.getElementById('provasResults').innerHTML = '';
        });

    } else {
        listSection.style.display = 'none';
        calendarSection.style.display = 'block';
        newToggleListBtn.className = 'button ghost';
        newToggleCalendarBtn.className = 'button';
        renderAdminAfastamentosCalendar();
    }

    newToggleListBtn.addEventListener('click', () => {
        import('./view-manager-main.js').then(module => {
            module.setAdminProvasView('list');
            renderProvasSection();
        });
    });

    newToggleCalendarBtn.addEventListener('click', () => {
        import('./view-manager-main.js').then(module => {
            module.setAdminProvasView('calendar');
            renderProvasSection();
        });
    });
}

function filterAndRenderAfastamentos() {
    const date = document.getElementById('mgrFilterDate').value;
    const area = document.getElementById('provasResults');
    if (!area) return;
    area.innerHTML = '';
    if (!date) {
        area.innerHTML = '<div class="muted">Escolha uma data para filtrar os afastamentos.</div>';
        return;
    }

    const cardBase = 'background: var(--panel); border: 1px solid var(--input-border); border-radius: 10px; margin-bottom: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);';
    const cardHeaderBase = 'display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--input-border);';
    const cardListBase = 'padding: 8px; max-height: 250px; overflow-y: auto;';
    const cardFerias = cardBase + ' border-top: 4px solid #10b981;';
    const cardLicenca = cardBase + ' border-top: 4px solid #c2410c;';
    const cardNPJ = cardBase + ' border-top: 4px solid #4b5563;';
    const cardOAE = cardBase + ' border-top: 4px solid #4D7EA8;';
    const cardProvas = cardBase + ' border-top: 4px solid #f59e0b; /* Amarelo/Laranja Sólido */';
    const headerTitleBase = 'font-weight: 800; margin: 0; font-size: 1rem; line-height: 1;';
    const feriasHeader = headerTitleBase + ' color: #10b981;';
    const licencaHeader = headerTitleBase + ' color: #c2410c;';
    const npjHeader = headerTitleBase + ' color: #4b5563;';
    const oaeHeader = headerTitleBase + ' color: #4D7EA8;';
    const provasHeader = headerTitleBase + ' color: #b45309;';

    let filteredInterns = state.interns || [];
    if (provasSubTypeFilter !== 'all') {
        filteredInterns = filteredInterns.filter(i => (i.subType || 'sessao') === provasSubTypeFilter);
    }

    const folgaProvaMatches = [];
    filteredInterns.forEach(i => {
        (i.dates || []).forEach(p => {
            if (p.date === date) {
                folgaProvaMatches.push({ intern: i, absence: p });
            }
        });
    });

    const feriasMatches = [];
    filteredInterns.forEach(i => {
        (i.vacations || []).forEach(v => {
            if (v.status === 'approved' && v.dates.includes(date)) {
                feriasMatches.push({ intern: i, absence: v });
            }
        });
    });

    const medicalLeaveMatches = [];
    filteredInterns.forEach(i => {
        Object.values(i.medicalLeaves || {}).forEach(l => {
            if (l.dates.includes(date)) {
                medicalLeaveMatches.push({ intern: i, absence: l });
            }
        });
    });

    const npjMatches = [];
    filteredInterns.forEach(i => {
        Object.values(i.npjAbsences || {}).forEach(p => {
            if (p.dates.includes(date)) {
                npjMatches.push({ intern: i, absence: p });
            }
        });
    });

    const oaeMatches = [];
    filteredInterns.forEach(i => {
        Object.values(i.oaeAbsences || {}).forEach(l => {
            if (l.dates.includes(date)) {
                oaeMatches.push({ intern: i, absence: l });
            }
        });
    });


    let html = '<div class="afastamentos-grid-container">';

    // --- INÍCIO DA CORREÇÃO 1 ---
    // Adicionado o botão de expandir (classe .btn-show-list-modal) em todos os cards

    if (feriasMatches.length > 0) {
        html += `<div style="${cardFerias}">`;
        html += `<div style="${cardHeaderBase}">
                     <h4 style="${feriasHeader}">Férias Agendadas</h4>
                     <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge" style="background: rgba(16,185,129,0.1); color: #10b981;">${feriasMatches.length}</span>
                        <button class="button ghost btn-show-list-modal" data-type="ferias" title="Ver em modal" style="padding: 4px 8px; font-size: 12px; line-height: 1;"><i class="fas fa-expand-arrows-alt"></i></button>
                     </div>
                 </div>`;
        html += `<div style="${cardListBase}">`;
        feriasMatches.sort((a, b) => a.intern.name.localeCompare(b.intern.name, 'pt-BR')).forEach(item => {
            const it = item.intern;
            const absence = item.absence;
            const user = findUserByIntern(it.id);
            const left = `<div>
                            <div style="font-weight:700; cursor: pointer;" class="absence-details-trigger" 
                                 data-type="ferias" 
                                 data-absence-info='${JSON.stringify(absence).replace(/'/g, '&#39;')}' 
                                 data-intern-name="${escapeHtml(it.name)}">
                                 ${escapeHtml(it.name)}
                            </div>
                            <div class="muted small">${escapeHtml(user?.username || 'N/A')}</div>
                          </div>`;
            const right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-user-id="${user?.id}"><i class="fas fa-external-link-alt"></i> Abrir</button></div>`;
            html += `<div class="row" style="background: transparent; border-color: var(--input-border);">${left}${right}</div>`;
        });
        html += `</div></div>`;
    }

    if (medicalLeaveMatches.length > 0) {
        html += `<div style="${cardLicenca}">`;
        html += `<div style="${cardHeaderBase}">
                     <h4 style="${licencaHeader}">Licença Médica</h4>
                     <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge" style="background: rgba(249, 115, 22, 0.1); color: #c2410c;">${medicalLeaveMatches.length}</span>
                        <button class="button ghost btn-show-list-modal" data-type="licenca" title="Ver em modal" style="padding: 4px 8px; font-size: 12px; line-height: 1;"><i class="fas fa-expand-arrows-alt"></i></button>
                     </div>
                 </div>`;
        html += `<div style="${cardListBase}">`;
        medicalLeaveMatches.sort((a, b) => a.intern.name.localeCompare(b.intern.name, 'pt-BR')).forEach(item => {
            const it = item.intern;
            const absence = item.absence;
            const user = findUserByIntern(it.id);
            const left = `<div>
                            <div style="font-weight:700; cursor: pointer;" class="absence-details-trigger" 
                                 data-type="licenca" 
                                 data-absence-info='${JSON.stringify(absence).replace(/'/g, '&#39;')}' 
                                 data-intern-name="${escapeHtml(it.name)}">
                                 ${escapeHtml(it.name)}
                            </div>
                            <div class="muted small">${escapeHtml(user?.username || 'N/A')}</div>
                          </div>`;
            const right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-user-id="${user?.id}"><i class="fas fa-external-link-alt"></i> Abrir</button></div>`;
            html += `<div class="row" style="background: transparent; border-color: var(--input-border);">${left}${right}</div>`;
        });
        html += `</div></div>`;
    }

    if (npjMatches.length > 0) {
        html += `<div style="${cardNPJ}">`;
        html += `<div style="${cardHeaderBase}">
                     <h4 style="${npjHeader}">NPJ</h4>
                     <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge" style="background: #f3f4f6; color: #4b5563;">${npjMatches.length}</span>
                        <button class="button ghost btn-show-list-modal" data-type="npj" title="Ver em modal" style="padding: 4px 8px; font-size: 12px; line-height: 1;"><i class="fas fa-expand-arrows-alt"></i></button>
                     </div>
                 </div>`;
        html += `<div style="${cardListBase}">`;
        npjMatches.sort((a, b) => a.intern.name.localeCompare(b.intern.name, 'pt-BR')).forEach(item => {
            const it = item.intern;
            const absence = item.absence;
            const user = findUserByIntern(it.id);
            const left = `<div>
                            <div style="font-weight:700; cursor: pointer;" class="absence-details-trigger" 
                                 data-type="npj" 
                                 data-absence-info='${JSON.stringify(absence).replace(/'/g, '&#39;')}' 
                                 data-intern-name="${escapeHtml(it.name)}">
                                 ${escapeHtml(it.name)}
                            </div>
                            <div class="muted small">${escapeHtml(user?.username || 'N/A')}</div>
                          </div>`;
            const right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-user-id="${user?.id}"><i class="fas fa-external-link-alt"></i> Abrir</button></div>`;
            html += `<div class="row" style="background: transparent; border-color: var(--input-border);">${left}${right}</div>`;
        });
        html += `</div></div>`;
    }

    if (oaeMatches.length > 0) {
        html += `<div style="${cardOAE}">`;
        html += `<div style="${cardHeaderBase}">
                     <h4 style="${oaeHeader}">OAE (Outros Afastamentos)</h4>
                     <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge" style="background: rgba(77, 126, 168, 0.1); color: #4D7EA8;">${oaeMatches.length}</span>
                        <button class="button ghost btn-show-list-modal" data-type="oae" title="Ver em modal" style="padding: 4px 8px; font-size: 12px; line-height: 1;"><i class="fas fa-expand-arrows-alt"></i></button>
                     </div>
                 </div>`;
        html += `<div style="${cardListBase}">`;
        oaeMatches.sort((a, b) => a.intern.name.localeCompare(b.intern.name, 'pt-BR')).forEach(item => {
            const it = item.intern;
            const absence = item.absence;
            const user = findUserByIntern(it.id);
            const left = `<div>
                            <div style="font-weight:700; cursor: pointer;" class="absence-details-trigger" 
                                 data-type="oae" 
                                 data-absence-info='${JSON.stringify(absence).replace(/'/g, '&#39;')}' 
                                 data-intern-name="${escapeHtml(it.name)}">
                                 ${escapeHtml(it.name)}
                            </div>
                            <div class="muted small">${escapeHtml(user?.username || 'N/A')}</div>
                          </div>`;
            const right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-user-id="${user?.id}"><i class="fas fa-external-link-alt"></i> Abrir</button></div>`;
            html += `<div class="row" style="background: transparent; border-color: var(--input-border);">${left}${right}</div>`;
        });
        html += `</div></div>`;
    }

    if (folgaProvaMatches.length > 0) {
        html += `<div style="${cardProvas}">`;
        html += `<div style="${cardHeaderBase}">
                     <h4 style="${provasHeader}">Folga prova</h4>
                     <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #b45309;">${folgaProvaMatches.length}</span>
                        <button class="button ghost btn-show-list-modal" data-type="prova" title="Ver em modal" style="padding: 4px 8px; font-size: 12px; line-height: 1;"><i class="fas fa-expand-arrows-alt"></i></button>
                     </div>
                 </div>`;
        html += `<div style="${cardListBase}">`;
        folgaProvaMatches.sort((a, b) => a.intern.name.localeCompare(b.intern.name, 'pt-BR')).forEach(item => {
            const it = item.intern;
            const prova = item.absence;
            const user = findUserByIntern(it.id);
            const left = `<div>
                            <div style="font-weight:700; cursor: pointer;" class="absence-details-trigger" 
                                 data-type="prova" 
                                 data-absence-info='${JSON.stringify(prova).replace(/'/g, '&#39;')}' 
                                 data-intern-name="${escapeHtml(it.name)}">
                                 ${escapeHtml(it.name)}
                            </div>
                            <div class="muted small">${escapeHtml(user?.username || 'N/A')}</div>
                          </div>`;

            let right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-user-id="${user?.id}"><i class="fas fa-external-link-alt"></i> Abrir</button></div>`;
            if (prova && prova.link) {
                right = `<div style="display:flex;gap:8px;">
                            <a href="${prova.link}" target="_blank" class="button ghost" style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <i class="fas fa-link"></i> Link
                            </a>
                            <button class="button ghost" data-user-id="${user?.id}"><i class="fas fa-external-link-alt"></i> Abrir</button>
                         </div>`;
            }

            html += `<div class="row" style="background: transparent; border-color: var(--input-border);">${left}${right}</div>`;
        });
        html += `</div></div>`;
    }

    // --- FIM DA CORREÇÃO 1 ---

    if (html === '<div class="afastamentos-grid-container">') {
        area.innerHTML = '<div class="muted">Nenhum estagiário com afastamento nesta data.</div>';
    } else {
        html += '</div>';
        area.innerHTML = html;
    }

    // --- INÍCIO DA CORREÇÃO 2 ---
    // Substituído o listener de ID por um listener de CLASSE

    area.querySelectorAll('.btn-show-list-modal').forEach(button => {
        button.addEventListener('click', (e) => {
            const type = e.currentTarget.dataset.type;
            let title = 'Lista de Afastamentos';
            let matches = [];

            if (type === 'ferias') {
                title = 'Férias Agendadas';
                matches = feriasMatches;
            } else if (type === 'licenca') {
                title = 'Licença Médica';
                matches = medicalLeaveMatches;
            } else if (type === 'npj') {
                title = 'NPJ';
                matches = npjMatches;
            } else if (type === 'oae') {
                title = 'OAE (Outros Afastamentos)';
                matches = oaeMatches;
            } else if (type === 'prova') {
                title = 'Folga prova';
                matches = folgaProvaMatches;
            }

            showAbsenceListModal(title, type, matches, date);
        });
    });

    // --- FIM DA CORREÇÃO 2 ---

    area.querySelectorAll('[data-user-id]').forEach(button => {
        button.addEventListener('click', e => openUserManagerView(e.currentTarget.dataset.userId));
    });

    area.querySelectorAll('.absence-details-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            const target = e.currentTarget;
            try {
                const type = target.dataset.type;
                const internName = target.dataset.internName;
                const absenceInfo = JSON.parse(target.dataset.absenceInfo);
                showAbsencePeriodModal(type, absenceInfo, internName);
            } catch (err) {
                console.error("Erro ao parsear dados do afastamento:", err, target.dataset.absenceInfo);
                showToast('Erro ao carregar detalhes do afastamento.', 'error');
            }
        });
    });
}

/**
 * Exibe um modal contendo apenas a lista de estagiários com Folga-Prova.
 * @param {Array} folgaProvaMatches - O array de estagiários filtrados.
 * @param {string} date - A data (ISO string YYYY-MM-DD) sendo visualizada.
 */
/**
 * Exibe um modal contendo apenas a lista de estagiários com Folga-Prova.
 * @param {Array} folgaProvaMatches - O array de estagiários filtrados (agora com {intern, absence}).
 * @param {string} date - A data (ISO string YYYY-MM-DD) sendo visualizada.
 */
/**
 * Exibe um modal genérico listando estagiários para um tipo de afastamento.
 * @param {string} title - O título do modal (ex: "Férias Agendadas").
 * @param {string} type - O tipo de afastamento (ex: 'ferias', 'prova').
 * @param {Array} matches - O array de estagiários filtrados ({intern, absence}).
 * @param {string} date - A data (ISO string YYYY-MM-DD) sendo visualizada.
 */
function showAbsenceListModal(title, type, matches, date) {
    const formattedDate = date.split('-').reverse().join('/');

    let modalHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>${escapeHtml(title)} – ${formattedDate}</h3>
          <button id="closeAbsenceListModal" class="button ghost">Fechar</button>
        </div>
        <div style="margin-top: 15px; max-height: 70vh; overflow-y: auto; padding-right: 5px;">
    `;

    if (!matches || matches.length === 0) {
        modalHtml += '<div class="muted" style="text-align: center; padding: 20px;">Nenhum registro para esta data.</div>';
    } else {
        matches.sort((a, b) => a.intern.name.localeCompare(b.intern.name, 'pt-BR')).forEach(item => {
            const it = item.intern;
            const absence = item.absence;
            const user = findUserByIntern(it.id);

            const left = `<div>
                            <div style="font-weight:700; cursor: pointer;" class="absence-details-trigger" 
                                 data-type="${type}" 
                                 data-absence-info='${JSON.stringify(absence).replace(/'/g, '&#39;')}' 
                                 data-intern-name="${escapeHtml(it.name)}">
                                 ${escapeHtml(it.name)}
                            </div>
                            <div class="muted small">${escapeHtml(user?.username || 'N/A')}</div>
                          </div>`;

            let right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-user-id="${user?.id}"><i class="fas fa-external-link-alt"></i> Abrir</button></div>`;

            // Lógica do link (só para 'prova')
            if (type === 'prova' && absence && absence.link) {
                right = `<div style="display:flex;gap:8px;">
                            <a href="${absence.link}" target="_blank" class="button ghost" style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <i class="fas fa-link"></i> Link
                            </a>
                            <button class="button ghost" data-user-id="${user?.id}"><i class="fas fa-external-link-alt"></i> Abrir</button>
                         </div>`;
            }

            modalHtml += `<div class="row" style="background: transparent; border-color: var(--input-border);">${left}${right}</div>`;
        });
    }

    modalHtml += '</div>';

    const m = showModal(modalHtml, { allowBackdropClose: true });

    m.modal.querySelector('#closeAbsenceListModal').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });

    m.modal.querySelectorAll('[data-user-id]').forEach(button => {
        button.addEventListener('click', e => {
            const userId = e.currentTarget.dataset.userId;
            if (userId) {
                m.close();
                m.cleanup();
                openUserManagerView(userId);
            }
        });
    });

    m.modal.querySelectorAll('.absence-details-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            const target = e.currentTarget;
            try {
                const absenceInfo = JSON.parse(target.dataset.absenceInfo);
                const internName = target.dataset.internName;
                // O 'type' já está disponível no escopo da função

                m.close();
                m.cleanup();

                showAbsencePeriodModal(type, absenceInfo, internName);
            } catch (err) {
                console.error("Erro ao parsear dados do afastamento:", err, target.dataset.absenceInfo);
                showToast('Erro ao carregar detalhes do afastamento.', 'error');
            }
        });
    });
}

/**
 * Exibe um modal com o período de um afastamento específico.
 * @param {string} type - 'ferias', 'licenca', 'npj', 'oae', 'prova'
 * @param {object} absence - O objeto de afastamento (férias, licença, etc.)
 * @param {string} internName - O nome do estagiário
 */
function showAbsencePeriodModal(type, absence, internName) {
    let title = 'Detalhes do Afastamento';
    let periodHtml = '';

    const formatDate = (isoDate) => {
        if (!isoDate) return 'N/A';
        // Converte YYYY-MM-DD para DD/MM/YYYY
        return isoDate.split('-').reverse().join('/');
    };

    if (type === 'ferias' && absence.startDate && absence.days) {
        title = `Férias – ${escapeHtml(internName)}`;
        const startDate = new Date(absence.startDate + 'T00:00:00');
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + absence.days - 1);

        periodHtml = `
            <p><strong>Período:</strong> ${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}</p>
            <p><strong>Duração:</strong> ${absence.days} dias</p>
        `;
    } else if (type === 'prova' && absence.date) {
        title = `Folga-prova – ${escapeHtml(internName)}`;
        periodHtml = `<p><strong>Data da Folga:</strong> ${formatDate(absence.date)}</p>`;
        if (absence.link) {
            periodHtml += `<p style="word-break: break-all;"><strong>Link:</strong> <a href="${absence.link}" target="_blank">${escapeHtml(absence.link)}</a></p>`;
        }
    } else if (['licenca', 'npj', 'oae'].includes(type) && absence.startDate && absence.endDate) {
        const typeNames = { licenca: 'Licença Médica', npj: 'NPJ', oae: 'OAE (Outros Afastamentos)' };
        title = `${typeNames[type]} – ${escapeHtml(internName)}`;
        periodHtml = `
            <p><strong>Período:</strong> ${formatDate(absence.startDate)} a ${formatDate(absence.endDate)}</p>
            <p><strong>Motivo:</strong> ${escapeHtml(absence.reason || 'N/A')}</p>
        `;
    } else {
        periodHtml = '<p class="muted">Não foi possível determinar o período do afastamento.</p>';
    }

    const modalHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>${title}</h3>
          <button id="closePeriodModal" class="button ghost">Fechar</button>
        </div>
        <div style="margin-top: 15px;">
            ${periodHtml}
        </div>
    `;

    const m = showModal(modalHtml, { allowBackdropClose: true });
    m.modal.querySelector('#closePeriodModal').addEventListener('click', () => { m.close(); m.cleanup(); });
}

function renderAdminAfastamentosCalendar() {
    const wrap = document.getElementById('adminCalendarWrap');
    const monthStart = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), 1);
    const label = monthStart.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    wrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div><strong>Calendário de Afastamentos</strong></div>
            <div style="display:flex;gap:8px;align-items:center">
                <button class="button ghost" id="prevAdminMonth">&lt;</button>
                <div class="small-muted" id="adminMonthLabel">${label}</div>
                <button class="button ghost" id="nextAdminMonth">&gt;</button>
            </div>
        </div>
        <div class="calendar"><div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div></div>
        <div id="adminMonthGrid" class="calendar" style="margin-top:10px"></div>
    `;

    const grid = document.getElementById('adminMonthGrid');
    grid.innerHTML = '';

    const firstDay = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), 1).getDay();
    const daysInMonth = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth() + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) { grid.appendChild(document.createElement('div')); }

    let filteredInterns = state.interns || [];
    if (provasSubTypeFilter !== 'all') {
        filteredInterns = filteredInterns.filter(i => (i.subType || 'sessao') === provasSubTypeFilter);
    }
    const afastamentosByDate = {};
    filteredInterns.forEach(intern => {
        (intern.dates || []).forEach(p => {
            if (!afastamentosByDate[p.date]) afastamentosByDate[p.date] = [];
            afastamentosByDate[p.date].push({ type: 'prova', intern, absence: p });
        });
        (intern.vacations || []).forEach(v => {
            if (v.status === 'approved') {
                v.dates.forEach(d => {
                    if (!afastamentosByDate[d]) afastamentosByDate[d] = [];
                    afastamentosByDate[d].push({ type: 'ferias', intern, absence: v });
                });
            }
        });

        Object.values(intern.medicalLeaves || {}).forEach(l => {
            l.dates.forEach(d => {
                if (!afastamentosByDate[d]) afastamentosByDate[d] = [];
                afastamentosByDate[d].push({ type: 'licenca', intern, absence: l });
            });
        });

        Object.values(intern.npjAbsences || {}).forEach(p => {
            p.dates.forEach(d => {
                if (!afastamentosByDate[d]) afastamentosByDate[d] = [];
                afastamentosByDate[d].push({ type: 'npj', intern, absence: p });
            });
        });

        Object.values(intern.oaeAbsences || {}).forEach(l => {
            l.dates.forEach(d => {
                if (!afastamentosByDate[d]) afastamentosByDate[d] = [];
                afastamentosByDate[d].push({ type: 'oae', intern, absence: l });
            });
        });
    });

    for (let d = 1; d <= daysInMonth; d++) {
        const iso = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), d).toISOString().slice(0, 10);
        const dayEl = document.createElement('div');
        dayEl.className = 'day';
        dayEl.innerHTML = `<div class="date">${d}</div>`;

        if (afastamentosByDate[iso]) {
            const provasCount = afastamentosByDate[iso].filter(a => a.type === 'prova').length;
            const feriasCount = afastamentosByDate[iso].filter(a => a.type === 'ferias').length;
            const licencaCount = afastamentosByDate[iso].filter(a => a.type === 'licenca').length;
            const npjCount = afastamentosByDate[iso].filter(a => a.type === 'npj').length;
            const oaeCount = afastamentosByDate[iso].filter(a => a.type === 'oae').length;

            if (feriasCount > 0) {
                const tag = document.createElement('div');
                tag.className = 'tag vacation-approved';
                tag.textContent = `Férias: ${feriasCount}`;
                dayEl.appendChild(tag);
            }
            if (provasCount > 0) {
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.textContent = `Folgas: ${provasCount}`;
                tag.style.backgroundColor = 'rgba(245, 158, 11, 0.6)';
                tag.style.color = '#fff';
                tag.style.fontWeight = 'bold';
                tag.style.padding = '2px 6px';
                tag.style.borderRadius = '4px'; // opcional, para ficar mais bonito
                dayEl.appendChild(tag);
            }

            if (licencaCount > 0) {
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.textContent = `Lic Méd: ${licencaCount}`;
                tag.style.backgroundColor = 'rgba(249, 115, 22, 0.4)';
                tag.style.color = '#c2410c';
                dayEl.appendChild(tag);
            }
            if (npjCount > 0) {
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.textContent = `NPJ: ${npjCount}`;
                tag.style.backgroundColor = '#4b5563';
                tag.style.color = '#ffffff';
                dayEl.appendChild(tag);
            }
            if (oaeCount > 0) {
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.textContent = `OAE: ${oaeCount}`;
                tag.style.backgroundColor = '#4D7EA8'; // Fundo Azul OAE
                tag.style.color = '#FFFFFF'; // Texto Branco
                dayEl.appendChild(tag);
            }
            dayEl.addEventListener('click', () => showAfastamentosDayDetails(iso, afastamentosByDate[iso]));
        }
        grid.appendChild(dayEl);
    }

    document.getElementById('prevAdminMonth').addEventListener('click', () => {
        const newDate = new Date(adminCalendarViewing);
        newDate.setMonth(newDate.getMonth() - 1);
        setAdminCalendarViewing(newDate);
        renderAdminAfastamentosCalendar();
    });

    document.getElementById('nextAdminMonth').addEventListener('click', () => {
        const newDate = new Date(adminCalendarViewing);
        newDate.setMonth(newDate.getMonth() + 1);
        setAdminCalendarViewing(newDate);
        renderAdminAfastamentosCalendar();
    });
}

function showAfastamentosDayDetails(iso, afastamentos) {
    let modalHtml = `<div style="display:flex;justify-content:space-between;align-items:center"><h3>Afastamentos – ${iso.split('-').reverse().join('/')}</h3><button id="closeDetails" class="button ghost">Fechar</button></div>`;
    modalHtml += '<div style="margin-top: 15px; max-height: 70vh; overflow-y: auto; padding-right: 5px;">';

    const ferias = afastamentos.filter(a => a.type === 'ferias');
    const provas = afastamentos.filter(a => a.type === 'prova');
    const licencas = afastamentos.filter(a => a.type === 'licenca');
    const npjs = afastamentos.filter(a => a.type === 'npj');
    const oaes = afastamentos.filter(a => a.type === 'oae');

    // --- INÍCIO DA CORREÇÃO ---
    // Alterada a cor de 'provas' (Folgas) de volta para o laranja/marrom (#b45309)
    // e o fundo correspondente (rgba(245, 158, 11, 0.1)) para bater com a imagem
    const accordionSections = [
        { title: 'Férias Agendadas', data: ferias, type: 'ferias', badgeBg: 'rgba(16,185,129,0.1)', badgeColor: '#10b981' },
        { title: 'Folgas-prova', data: provas, type: 'provas', badgeBg: 'rgba(245, 158, 11, 0.1)', badgeColor: '#b45309' },
        { title: 'Licença Médica', data: licencas, type: 'licenca', badgeBg: 'rgba(249, 115, 22, 0.1)', badgeColor: '#c2410c' },
        { title: 'NPJ', data: npjs, type: 'npj', badgeBg: '#f3f4f6', badgeColor: '#4b5563' },
        { title: 'OAE (Outros Afastamentos)', data: oaes, type: 'oae', badgeBg: 'rgba(77, 126, 168, 0.1)', badgeColor: '#4D7EA8' }
    ];
    // --- FIM DA CORREÇÃO ---

    accordionSections.forEach((section, index) => {
        if (section.data.length > 0) {
            const uniqueId = `accordion-${section.type}-${index}`;
            modalHtml += `
                <div class="accordion-item">
                    <div class="accordion-header" data-target="#${uniqueId}">
                        
                        <h4 class="title-${section.type}" style="color: ${section.badgeColor};">${section.title}</h4>
                        
                        <div style="display: flex; align-items: center; gap: 8px;">
                           <span class="badge" style="background: ${section.badgeBg}; color: ${section.badgeColor};">${section.data.length}</span>
                           <span class="accordion-icon"><i class="fas fa-chevron-down"></i></span>
                        </div>
                    </div>
                    <div class="accordion-content" id="${uniqueId}">
            `;

            section.data.sort((a, b) => a.intern.name.localeCompare(b.intern.name, 'pt-BR')).forEach(item => {
                const intern = item.intern;
                const absence = item.absence;
                const user = findUserByIntern(intern.id);
                let linkHtml = '';

                if (section.type === 'provas') {
                    if (absence && absence.link) {
                        linkHtml = `<a href="${absence.link}" target="_blank" class="button ghost" style="padding: 4px 8px; font-size: 12px;">Ver prova</a>`;
                    }
                }

                const openButton = `<button class="button ghost" data-user-id="${user?.id}" style="padding: 4px 8px; font-size: 12px;"><i class="fas fa-external-link-alt"></i> Abrir</button>`;

                const nameHtml = `
                    <div style="font-weight:700; cursor: pointer;" class="absence-details-trigger" 
                         data-type="${section.type}" 
                         data-absence-info='${JSON.stringify(absence).replace(/'/g, '&#39;')}' 
                         data-intern-name="${escapeHtml(intern.name)}">
                         ${escapeHtml(intern.name)}
                    </div>`;

                modalHtml += `
                    <div class="row" style="background: transparent; border: none; padding: 8px 0;">
                      <div>
                        ${nameHtml}
                        <div class="muted small">${escapeHtml(user?.username || 'N/A')}</div>
                      </div>
                      <div style="display: flex; gap: 6px;">
                        ${linkHtml}
                        ${openButton}
                      </div>
                    </div>`;
            });

            modalHtml += `
                    </div>
                </div> 
            `;
        }
    });

    if (ferias.length === 0 && provas.length === 0 && licencas.length === 0 && npjs.length === 0 && oaes.length === 0) {
        modalHtml += '<div class="muted" style="text-align: center; padding: 20px;">Nenhum afastamento registrado para esta data.</div>';
    }

    modalHtml += '</div>';

    const m = showModal(modalHtml, { allowBackdropClose: true });
    m.modal.querySelector('#closeDetails').addEventListener('click', () => { m.close(); m.cleanup(); });

    m.modal.querySelectorAll('[data-user-id]').forEach(button => {
        button.addEventListener('click', e => {
            const userId = e.currentTarget.dataset.userId;
            if (userId) {
                m.close();
                m.cleanup();
                openUserManagerView(userId);
            }
        });
    });

    m.modal.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.getAttribute('data-target');
            const content = m.modal.querySelector(targetId);
            if (content) {
                content.classList.toggle('collapsed');
                header.classList.toggle('collapsed');
            }
        });
    });

    m.modal.querySelectorAll('.absence-details-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            const target = e.currentTarget;
            try {
                const type = target.dataset.type;
                const internName = target.dataset.internName;
                const absenceInfo = JSON.parse(target.dataset.absenceInfo);

                m.close();
                m.cleanup();

                showAbsencePeriodModal(type, absenceInfo, internName);
            } catch (err) {
                console.error("Erro ao parsear dados do afastamento:", err, target.dataset.absenceInfo);
                showToast('Erro ao carregar detalhes do afastamento.', 'error');
            }
        });
    });
}

// ========== LIXEIRA ==========

export function renderTrashList() {
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

        let typeLabel = 'Registro';
        if (item.type === 'user') typeLabel = 'Usuário Excluído';
        if (item.type === 'vacation') typeLabel = 'Férias Excluída';

        row.innerHTML = `
            <input type="checkbox" data-id="${item.id}" />
            <div class="trash-item-details">
                <div style="font-weight:700">${escapeHtml(item.internName || item.name || item.username || 'Item sem nome')}</div>
                <div class="muted small">${typeLabel}</div>
                <div class="muted small">Removido em: ${deletedDate.toLocaleString()}</div>
                <div class="muted small">Será excluído em ${daysLeft} dia(s)</div>
            </div>
        `;

        list.appendChild(row);
    });
}

export async function emptyTrash() {
    if ((state.trash || []).length === 0) return showToast('A lixeira já está vazia.', 'info');
    if (!confirm('Deseja esvaziar a lixeira permanentemente?')) return;

    state.trash = [];
    await save(state);
    showToast('Lixeira esvaziada com sucesso!', 'success');
    renderTrashList();
}

export async function restoreAllTrash() {
    if ((state.trash || []).length === 0) return showToast('A lixeira está vazia.', 'info');
    if (!confirm('Deseja restaurar todos os itens da lixeira?')) return;

    (state.trash || []).forEach(item => {
        if (item.type === 'user') {
            (state.users || []).push({
                id: item.userId,
                username: item.username,
                password: '123456',
                role: item.role,
                internId: item.internId,
                powers: defaultPowersFor(item.role),
                selfPasswordChange: true,
                createdAt: item.createdAt || timestamp()
            });

            if (item.internId) {
                (state.interns || []).push({
                    id: item.internId,
                    name: item.internName,
                    dates: [],
                    hoursEntries: [],
                    auditLog: []
                });
            }
        } else if (item.type !== 'vacation') { // Não restaurar férias
            (state.pendingRegistrations || []).push({ ...item, status: 'pending' });
        }
    });

    state.trash = state.trash.filter(item => item.type === 'vacation'); // Mantém férias na lixeira
    await save(state);
    showToast('Itens restaurados com sucesso (exceto férias)!', 'success');
    render();
}

export async function restoreSelectedTrash() {
    const checkboxes = document.querySelectorAll('#trashList input:checked');
    if (checkboxes.length === 0) return showToast('Selecione itens para restaurar.', 'warning');
    if (!confirm(`Deseja restaurar os ${checkboxes.length} itens selecionados?`)) return;

    const idsToRestore = Array.from(checkboxes).map(cb => cb.dataset.id);
    const itemsToRestore = (state.trash || []).filter(item => idsToRestore.includes(item.id));

    itemsToRestore.forEach(item => {
        if (item.type === 'user') {
            (state.users || []).push({
                id: item.userId,
                username: item.username,
                password: '123456',
                role: item.role,
                internId: item.internId,
                powers: defaultPowersFor(item.role),
                selfPasswordChange: true,
                createdAt: item.createdAt || timestamp()
            });

            if (item.internId) {
                (state.interns || []).push({
                    id: item.internId,
                    name: item.internName,
                    dates: [],
                    hoursEntries: [],
                    auditLog: []
                });
            }
        } else if (item.type !== 'vacation') {
            (state.pendingRegistrations || []).push({ ...item, status: 'pending' });
        }
    });

    state.trash = (state.trash || []).filter(item => !idsToRestore.includes(item.id) || item.type === 'vacation');
    await save(state);
    showToast('Itens selecionados restaurados com sucesso!', 'success');
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

// ========== LOGS DO SISTEMA ==========

export function renderSystemLogs() {
    // Configura os event listeners das abas
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    renderActivityLogs();
    renderLoginLogs();

    // Configurações dos logs de atividade
    const btnApply = document.getElementById('btnApplyLogFilter');
    const btnClearFilter = document.getElementById('btnClearLogFilter');
    const btnClearLogs = document.getElementById('btnClearActivityLogs');

    btnApply.onclick = () => {
        const date = document.getElementById('logFilterDate').value;
        renderActivityLogs(date);
    };

    btnClearFilter.onclick = () => {
        document.getElementById('logFilterDate').value = '';
        renderActivityLogs();
    };

    btnClearLogs.onclick = async () => {
        if (confirm('ATENÇÃO: Deseja apagar TODOS os registros de ATIVIDADE? Esta ação é irreversível.')) {
            (state.interns || []).forEach(intern => { intern.auditLog = []; });
            state.systemLog = [];
            await save(state);
            showToast('Logs de atividade limpos com sucesso!', 'success');
            renderActivityLogs();
        }
    };

    // Configurações dos logs de acesso
    const searchInput = document.getElementById('loginLogSearchInput');
    const dateInput = document.getElementById('loginLogDateInput');
    const btnClearLoginFilter = document.getElementById('btnClearLoginLogFilter');

    const applyLoginFilters = () => {
        const query = searchInput.value.trim().toLowerCase();
        const date = dateInput.value;
        renderLoginLogs(query, date);
    };

    searchInput.addEventListener('keyup', applyLoginFilters);
    dateInput.addEventListener('change', applyLoginFilters);

    btnClearLoginFilter.addEventListener('click', () => {
        searchInput.value = '';
        dateInput.value = '';
        applyLoginFilters();
    });

    const selectAllLoginLogs = document.getElementById('selectAllLoginLogs');
    const btnDeleteSelected = document.getElementById('btnDeleteSelectedLoginLogs');
    const btnClearAll = document.getElementById('btnClearLoginLogs');

    selectAllLoginLogs.addEventListener('change', () => {
        document.querySelectorAll('.login-log-checkbox').forEach(cb => {
            cb.checked = selectAllLoginLogs.checked;
        });
        updateDeleteLoginLogsButtonState();
    });

    btnDeleteSelected.onclick = async () => {
        const checkedBoxes = document.querySelectorAll('.login-log-checkbox:checked');
        if (checkedBoxes.length === 0) return;

        if (confirm(`Deseja apagar os ${checkedBoxes.length} registros de acesso selecionados?`)) {
            const idsToDelete = new Set(Array.from(checkedBoxes).map(cb => cb.dataset.id));
            state.loginLog = state.loginLog.filter(log => !idsToDelete.has(log.id));
            await save(state);
            renderLoginLogs();
            updateDeleteLoginLogsButtonState();
            selectAllLoginLogs.checked = false;
        }
    };

    btnClearAll.onclick = async () => {
        if (confirm('ATENÇÃO: Deseja apagar TODO o histórico de acessos? Esta ação é irreversível.')) {
            state.loginLog = [];
            await save(state);
            showToast('Histórico de acesso limpo com sucesso!', 'success');
            renderLoginLogs();
            updateDeleteLoginLogsButtonState();
            selectAllLoginLogs.checked = false;
        }
    };
}

function renderActivityLogs(filterDate = null) {
    const container = document.getElementById('logListContainer');
    if (!container) return;

    let allLogs = [];

    // Coleta logs de auditoria de cada estagiário
    (state.interns || []).forEach(intern => {
        (intern.auditLog || []).forEach(log => {
            allLogs.push({ ...log, context: `Estagiário: ${escapeHtml(intern.name)}` });
        });
    });

    // Adiciona logs do sistema
    (state.systemLog || []).forEach(log => {
        allLogs.push({ ...log, context: log.context || 'Sistema' });
    });

    allLogs.sort((a, b) => new Date(b.at) - new Date(a.at));

    if (filterDate) {
        allLogs = allLogs.filter(log => log.at.startsWith(filterDate));
    }

    if (allLogs.length === 0) {
        container.innerHTML = '<div class="muted">Nenhum registro de log de atividade encontrado.</div>';
    } else {
        container.innerHTML = allLogs.map(log => {
            const date = new Date(log.at).toLocaleString('pt-BR');
            const logContext = log.context ? `[${escapeHtml(log.context)}]` : '';
            return `
                <div class="row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div>
                        <span style="font-weight: 700;">${date}</span>
                        <span class="muted small">• Por: ${escapeHtml(log.byUserName)}</span>
                    </div>
                    <div>
                        <span>Ação: <strong style="color: var(--accent);">${escapeHtml(log.action)}</strong></span>
                        <span class="muted small">${logContext}</span>
                    </div>
                    <div class="muted small">Detalhes: ${escapeHtml(log.details || 'N/A')}</div>
                </div>
            `;
        }).join('');
    }
}

function renderLoginLogs(searchQuery = '', filterDate = '') {
    const container = document.getElementById('loginLogContainer');
    if (!container) return;

    let logs = (state.loginLog || []).slice();

    if (searchQuery) {
        logs = logs.filter(log =>
            (log.name || '').toLowerCase().includes(searchQuery) ||
            (log.username || '').toLowerCase().includes(searchQuery)
        );
    }

    if (filterDate) {
        logs = logs.filter(log => log.at && log.at.startsWith(filterDate));
    }

    logs.sort((a, b) => new Date(b.at) - new Date(a.at));

    if (logs.length === 0) {
        container.innerHTML = '<div class="muted">Nenhum registro de acesso encontrado para os filtros aplicados.</div>';
    } else {
        container.innerHTML = logs.map(log => {
            const date = new Date(log.at).toLocaleString('pt-BR');
            return `
                <div class="row" style="display: grid; grid-template-columns: auto 1fr auto; gap: 15px; align-items: center;">
                    <input type="checkbox" class="login-log-checkbox" data-id="${log.id}" style="width: auto; height: auto;">
                    <div>
                        <div style="font-weight: 700;">${escapeHtml(log.name)} (${escapeHtml(log.username)})</div>
                        <div class="muted small">IP: ${escapeHtml(log.ip)}</div>
                    </div>
                    <div class="muted small" style="text-align: right;">${date}</div>
                </div>
            `;
        }).join('');
    }

    document.querySelectorAll('.login-log-checkbox').forEach(cb => {
        cb.addEventListener('change', updateDeleteLoginLogsButtonState);
    });
}

function updateDeleteLoginLogsButtonState() {
    const selectedCount = document.querySelectorAll('.login-log-checkbox:checked').length;
    const deleteButton = document.getElementById('btnDeleteSelectedLoginLogs');
    if (deleteButton) {
        deleteButton.disabled = selectedCount === 0;
        deleteButton.textContent = `Apagar Selecionados (${selectedCount})`;
    }
}

// ========== BACKUP E EXPORTAÇÃO ==========

export function showBackupModal() {
    const currentUser = (state.users || {})[session.userId];
    if (currentUser.role !== 'super') {
        showToast('Acesso negado.', 'error');
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
                <button id="btnDownloadAllJson" class="button"><i class="fas fa-file-code"></i> Exportar (.JSON)</button>
                <button id="btnDownloadAllCsv" class="button alt"><i class="fas fa-file-csv"></i> Exportar (CSV)</button>
            </div>
          </div>
          <div class="card" style="padding: 15px;">
            <h4>CARREGAR Backup </h4>
            <div class="muted small">**Atenção: Isso irá sobrescrever todos os dados atuais!**</div>
            <button id="btnImportTrigger" class="button danger"><i class="fas fa-upload"></i> Importar (.json)</button>
          </div>
        </div>`;

    const m = showModal(html, { allowBackdropClose: false });
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
            showToast('Nenhum dado para exportar.', 'warning');
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

function generateCsvData() {
    const allEntries = [];

    (state.interns || []).forEach(intern => {
        // Adiciona entradas de horas
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

        // Adiciona folga prova
        (intern.dates || []).forEach(prova => {
            allEntries.push({
                Tipo_Registro: 'Folgas Provas',
                Estagiario_Nome: intern.name,
                Estagiario_ID: intern.id,
                Data: prova.date,
                Detalhe: 'Folga Prova Agendada',
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

    // Ordena por nome e data
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

// ========== CONFIGURAÇÃO DE PRAZO DA PAUTA ==========

export function renderPautaConfig() {
    const container = document.getElementById('prazo-pauta');
    if (!container) return;

    container.innerHTML = `
        <div style="margin-top:15px; display:flex; flex-direction:column; gap:12px;">
            <div id="pautaForm" style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; border: 1px solid var(--input-border); border-radius: 8px; padding: 12px;">
                <label>
                    <span class="small-muted">Data da Conferência</span>
                    <input type="date" id="pautaDataConferencia" value="${nowISO()}">
                </label>
                <label>
                    <span class="small-muted">Data da Pauta</span>
                    <input type="date" id="pautaDataPauta">
                </label>
                <div style="grid-column: 1 / -1;">
                    <span class="small-muted">Observações</span>
                    <div class="mini-editor" style="border: 1px solid var(--input-border); border-radius: 8px;">
                        <div id="pautaEditorToolbar" style="padding: 5px; background: var(--input-bg); border-bottom: 1px solid var(--input-border); display:flex; gap: 8px; align-items: center;">
                            <button type="button" class="button ghost" data-command="bold" style="font-weight: bold; padding: 4px 8px;">B</button>
                            <button type="button" class="button ghost" data-command="italic" style="font-style: italic; padding: 4px 8px;">I</button>
                            <input type="color" id="pautaEditorColor" data-command="foreColor" title="Cor da fonte" style="border: none; background: transparent; width: 24px; height: 24px; padding: 0; cursor: pointer;">
                        </div>
                        <div id="pautaObservacoes" contenteditable="true" style="min-height: 80px; padding: 8px; outline: none;"></div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end;">
                <button class="button" id="btnAddPauta"><i class="fas fa-plus"></i>Adicionar</button>
            </div>
            <hr>
            <div id="pautaTableContainer"></div>
        </div>
    `;

    renderPautaTable();

    const editor = container.querySelector('#pautaObservacoes');
    const toolbar = container.querySelector('#pautaEditorToolbar');

    // Event listeners para a barra de ferramentas do editor
    toolbar.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.execCommand(btn.dataset.command, false, null);
            editor.focus();
        });
    });

    const colorInput = toolbar.querySelector('#pautaEditorColor');
    colorInput.addEventListener('input', (e) => {
        e.preventDefault();
        document.execCommand(colorInput.dataset.command, false, colorInput.value);
        editor.focus();
    });

    // Event listener do botão "Adicionar"
    container.querySelector('#btnAddPauta').addEventListener('click', async () => {
        const dataConferencia = container.querySelector('#pautaDataConferencia').value;
        const dataPauta = container.querySelector('#pautaDataPauta').value;
        const observacoes = container.querySelector('#pautaObservacoes').innerHTML;

        if (!dataConferencia || !dataPauta) {
            showToast('Por favor, preencha a Data da Conferência e a Data da Pauta.', 'warning');
            return;
        }

        const newEntry = {
            id: uuid(),
            dataConferencia,
            dataPauta,
            observacoes
        };

        state.pautaPrazos = state.pautaPrazos || [];
        state.pautaPrazos.push(newEntry);

        await save(state);

        // Limpar campos do formulário
        container.querySelector('#pautaDataPauta').value = '';
        container.querySelector('#pautaObservacoes').innerHTML = '';

        renderPautaTable();
    });
}

function renderPautaTable() {
    const tableContainer = document.getElementById('pautaTableContainer');
    if (!tableContainer) return;

    const prazos = (state.pautaPrazos || []).slice().sort((a, b) => b.dataConferencia.localeCompare(a.dataConferencia));

    if (prazos.length === 0) {
        tableContainer.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">Nenhum prazo de pauta adicionado.</div>';
        return;
    }

    // Display de resumo com a última data e intervalo
    const latestEntry = prazos[0];
    const diffDaysLatest = calculateDaysBetween(latestEntry.dataConferencia, latestEntry.dataPauta);
    const formattedPautaLatest = latestEntry.dataPauta.split('-').reverse().join('/');

    const summaryHtml = `
        <div id="pautaSummary" style="width: 300px; margin: 0 auto; display: flex; gap: 20px; justify-content: center; align-items: center; padding: 10px; margin-bottom: 15px; background-color: var(--input-bg); border: 1px solid var(--input-border); border-radius: 8px;"">
            <div>
                <span class="small-muted">Última Data da Pauta:</span> <br>
                <strong style="color: var(--accent); font-size: 1.2em; margin-left: 8px;">${formattedPautaLatest}</strong>
            </div>
            <div>
                <span class="small-muted">Último Intervalo:</span> <br>
                <strong style="color: var(--accent); font-size: 1.2em; margin-left: 8px;">${diffDaysLatest} dias</strong>
            </div>
        </div>
    `;

    const tableRows = prazos.map(item => {
        const diffDays = calculateDaysBetween(item.dataConferencia, item.dataPauta);
        const formattedConferencia = item.dataConferencia.split('-').reverse().join('/');
        const formattedPauta = item.dataPauta.split('-').reverse().join('/');

        return `
            <tr class="pauta-table-row">
                <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${formattedConferencia}</td>
                <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${formattedPauta}</td>
                <td style="text-align: center; padding: 12px 8px; border-bottom: 1px solid #eee;"><strong>${diffDays} dias</strong></td>
                <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${item.observacoes}</td>
                <td style="width: 100px; text-align: right; padding: 12px 8px; border-bottom: 1px solid #eee;">
                    <div class="pauta-actions" style="opacity: 0; transition: opacity 0.2s ease;">
                        <button class="button ghost" data-edit-id="${item.id}" title="Editar linha" style="padding: 4px 8px;">✏️</button>
                        <button class="button danger ghost" data-delete-id="${item.id}" title="Excluir linha" style="padding: 4px 8px;">X</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tableContainer.innerHTML = `
        ${summaryHtml} 
        <table class="pauta-table" style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th style="text-align: left; padding: 8px; border-bottom: 2px solid var(--accent);">Data da Conferência</th>
                    <th style="text-align: left; padding: 8px; border-bottom: 2px solid var(--accent);">Data da Pauta</th>
                    <th style="text-align: center; padding: 8px; border-bottom: 2px solid var(--accent);">Intervalo</th>
                    <th style="text-align: left; padding: 8px; border-bottom: 2px solid var(--accent);">Observações</th>
                    <th style="width: 100px;"></th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;

    // Adiciona eventos de hover para mostrar/esconder botões
    tableContainer.querySelectorAll('.pauta-table-row').forEach(row => {
        const actions = row.querySelector('.pauta-actions');
        row.addEventListener('mouseenter', () => actions.style.opacity = '1');
        row.addEventListener('mouseleave', () => actions.style.opacity = '0');
    });

    // Adiciona eventos de clique para os botões de editar e excluir
    tableContainer.querySelectorAll('[data-edit-id]').forEach(button => {
        button.addEventListener('click', () => {
            showEditPautaModal(button.dataset.editId);
        });
    });

    tableContainer.querySelectorAll('[data-delete-id]').forEach(button => {
        button.addEventListener('click', () => {
            const idToDelete = button.dataset.deleteId;
            const onConfirm = async () => {
                state.pautaPrazos = state.pautaPrazos.filter(p => p.id !== idToDelete);
                await save(state);
                renderPautaTable();
            };
            showDeleteConfirmationModal(onConfirm, 1);
        });
    });
}

function showEditPautaModal(itemId) {
    const itemToEdit = state.pautaPrazos.find(p => p.id === itemId);
    if (!itemToEdit) return;

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>Editar Prazo da Pauta</h3>
          <button id="closeEditPauta" class="button ghost">Fechar</button>
        </div>
        <div style="margin-top:15px; display:flex; flex-direction:column; gap:12px;">
            <div id="editPautaForm" style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start;">
                <label>
                    <span class="small-muted">Data da Conferência</span>
                    <input type="date" id="editPautaDataConferencia" value="${itemToEdit.dataConferencia}">
                </label>
                <label>
                    <span class="small-muted">Data da Pauta</span>
                    <input type="date" id="editPautaDataPauta" value="${itemToEdit.dataPauta}">
                </label>
                <div style="grid-column: 1 / -1;">
                    <span class="small-muted">Observações</span>
                    <div class="mini-editor" style="border: 1px solid var(--input-border); border-radius: 8px;">
                        <div id="editPautaEditorToolbar" style="padding: 5px; background: var(--input-bg); border-bottom: 1px solid var(--input-border); display:flex; gap: 8px; align-items: center;">
                            <button type="button" class="button ghost" data-command="bold" style="font-weight: bold; padding: 4px 8px;">B</button>
                            <button type="button" class="button ghost" data-command="italic" style="font-style: italic; padding: 4px 8px;">I</button>
                            <input type="color" id="editPautaEditorColor" data-command="foreColor" title="Cor da fonte" style="border: none; background: transparent; width: 24px; height: 24px; padding: 0; cursor: pointer;">
                        </div>
                        <div id="editPautaObservacoes" contenteditable="true" style="min-height: 80px; padding: 8px; outline: none;">${itemToEdit.observacoes}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end;">
                <button class="button" id="btnSavePauta">Salvar Alterações</button>
            </div>
        </div>
    `;

    const m = showModal(html, { allowBackdropClose: false });

    m.modal.querySelector('#closeEditPauta').addEventListener('click', () => { m.close(); m.cleanup(); });

    const editor = m.modal.querySelector('#editPautaObservacoes');
    const toolbar = m.modal.querySelector('#editPautaEditorToolbar');

    toolbar.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.execCommand(btn.dataset.command, false, null);
            editor.focus();
        });
    });

    const colorInput = toolbar.querySelector('#editPautaEditorColor');
    colorInput.addEventListener('input', (e) => {
        e.preventDefault();
        document.execCommand(colorInput.dataset.command, false, colorInput.value);
        editor.focus();
    });

    m.modal.querySelector('#btnSavePauta').addEventListener('click', async () => {
        const updatedItem = {
            id: itemId,
            dataConferencia: m.modal.querySelector('#editPautaDataConferencia').value,
            dataPauta: m.modal.querySelector('#editPautaDataPauta').value,
            observacoes: m.modal.querySelector('#editPautaObservacoes').innerHTML
        };

        const itemIndex = state.pautaPrazos.findIndex(p => p.id === itemId);
        if (itemIndex > -1) {
            state.pautaPrazos[itemIndex] = updatedItem;
            await save(state);
            m.close();
            m.cleanup();
            renderPautaTable();
        }
    });
}

function calculateDaysBetween(startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr) return 0;

    try {
        const [y1, m1, d1] = startDateStr.split('-').map(Number);
        const [y2, m2, d2] = endDateStr.split('-').map(Number);
        const utc1 = Date.UTC(y1, m1 - 1, d1);
        const utc2 = Date.UTC(y2, m2 - 1, d2);
        return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
    } catch (e) {
        return 0;
    }

}
