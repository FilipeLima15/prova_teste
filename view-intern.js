/* view-intern.js - Lógica e renderização da tela do estagiário */

import { escapeHtml, nowISO, uuid, timestamp, createCountryCodeDropdownHtml, formatDateTime } from './utils.js';
import { database } from './firebase-config.js';
import { showModal, showProvaBloqueadaModal, showFeriasBloqueadaPautaModal, showVacationChangeBlockedModal, showApprovedVacationDeletionBlockedModal } from './ui-modals.js';

// Importa funções e variáveis compartilhadas do app principal
import { state, session, save, render, findInternById, findUserByIntern, findServerById, downloadBlob, hasPower, showToast, saveInternData } from './app.js';

// Variável para controlar qual seção está ativa no painel direito
let activeSection = 'ausencia';

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

    // Verificação de 90 dias para atualização cadastral
    const lastUpdate = intern.registrationData?.lastUpdatedAt;
    let daysSinceUpdate = Infinity;
    if (lastUpdate) {
        const lastUpdateDate = new Date(lastUpdate);
        const today = new Date();
        daysSinceUpdate = Math.floor((today - lastUpdateDate) / (1000 * 60 * 60 * 24));
    }

    if (daysSinceUpdate >= 90) {
        showRegistrationDataModal(intern, user, { isForcedUpdate: true });
        return;
    }

    root.innerHTML = '';
    root.className = 'app-grid';

    // Calcula totais para exibir no resumo
    const totals = calcHoursSummary(intern);
    const blockDays = state.meta.provaBlockDays || 0;
    const today = new Date();
    const lastBlockedDate = new Date();
    lastBlockedDate.setDate(today.getDate() + blockDays);
    const formattedBlockedDate = lastBlockedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const unreadCount = (user.notifications || []).filter(n => !n.isRead).length;
    const notificationClass = unreadCount > 0 ? 'has-pending' : '';

    // Busca a última data da pauta e adiciona +1 dia
    let lastPautaDate = null;
    let formattedPautaDate = 'Não definido';
    if (state.pautaPrazos && state.pautaPrazos.length > 0) {
        const sortedPautas = [...state.pautaPrazos].sort((a, b) => b.dataConferencia.localeCompare(a.dataConferencia));
        if (sortedPautas[0] && sortedPautas[0].dataPauta) {
            const lastPauta = new Date(sortedPautas[0].dataPauta + 'T00:00:00');
            lastPauta.setDate(lastPauta.getDate() + 1);
            lastPautaDate = lastPauta;
            formattedPautaDate = lastPauta.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    }

    // Cria estrutura de dois painéis
    // --- Início da Alteração: Calcular Iniciais ---
    const nameToUse = intern?.name || user.name || user.username || '';
    let initials = '?'; // Valor padrão caso não haja nome
    if (nameToUse) {
        const nameParts = nameToUse.trim().split(/\s+/); // Divide o nome por espaços
        const firstInitial = nameParts[0]?.[0] || ''; // Pega a primeira letra do primeiro nome
        const lastInitial = nameParts.length > 1 ? (nameParts[nameParts.length - 1]?.[0] || '') : ''; // Pega a primeira letra do último nome (se houver mais de um nome)
        initials = (firstInitial + lastInitial).toUpperCase(); // Junta e converte para maiúsculas
        if (initials.length === 0) initials = '?'; // Garante que não fique vazio
    }
    // --- Fim da Alteração: Calcular Iniciais ---

    root.innerHTML = `
        <aside class="sidebar-nav" style="padding: 12px;">
            <div style="padding: 12px; margin-bottom: 16px; border-bottom: 2px solid var(--accent); text-align: center;">

                <div class="user-avatar-circle" style="
                    width: 52px;
                    height: 52px;
                    border-radius: 50%;
                    background-color: var(--accent); 
                    color: white; 
                    font-size: 1.4rem; 
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 12px auto; 
                ">
                    ${initials}
                </div>
                
                <div style="font-weight: 700; font-size: 1.1rem; color: var(--accent); margin-bottom: 4px;">
                    ${escapeHtml(intern?.name || user.username)}
                </div>
                <div style="color: var(--muted); font-size: 12px; margin-bottom: 12px;">
                    Área do estagiário
                </div>

                ${user.delegatedAdmin?.enabled ? `
                <button class="button ghost" id="btnSwitchToAdmin" style="width: 100%; font-size: 13px; margin-bottom: 8px;">
                    <i class="fas fa-user-shield"></i> Perfil Admin
                </button>
                ` : ''}

                <button id="btnLogout" style="
                    width: 100%;
                    background: white;
                    color: var(--accent);
                    border: 1px solid var(--input-border);
                    padding: 8px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    transition: all 0.2s;
                " onmouseover="this.style.color='var(--danger)'; this.style.borderColor='var(--danger-light)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-lg)';"
                onmouseout="this.style.color='var(--accent)'; this.style.borderColor='var(--input-border)'; this.style.transform='none'; this.style.boxShadow='none';">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Sair</span>
                </button>
            </div>

            <div class="sidebar-group collapsed">
                <div class="sidebar-group-header">
                    <span>PESSOAL</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="sidebar-group-content">
                    <div class="sidebar-item" data-section="dados">
                        <i class="fas fa-id-card fa-fw"></i>
                        <span>Dados cadastrais</span>
                    </div>
                    ${user.selfPasswordChange ? `
                    <div class="sidebar-item" data-section="senha">
                        <i class="fas fa-key fa-fw"></i>
                        <span>Alterar senha</span>
                    </div>
                    ` : ''}
                    <div class="sidebar-item ${notificationClass}" data-section="notificacoes">
                        <i class="fas fa-bell fa-fw"></i>
                        <span>Notificações</span>
                        ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>

            <div class="sidebar-group">
                <div class="sidebar-group-header">
                    <span>GESTÃO</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="sidebar-group-content">
                    <div class="sidebar-item active" data-section="ausencia">
                        <i class="fas fa-calendar-plus fa-fw"></i>
                        <span>Adicionar Afastamento</span>
                    </div>
                    <div class="sidebar-item" data-section="historico">
                        <i class="fas fa-history fa-fw"></i>
                        <span>Histórico de lançamentos</span>
                    </div>
                    <div class="sidebar-item" data-section="movimentacoes">
                        <i class="fas fa-tasks fa-fw"></i>
                        <span>Andamento das solicitações</span>
                    </div>
                </div>
            </div>

            <div class="sidebar-group collapsed">
                <div class="sidebar-group-header">
                    <span>DEMAIS INFORMAÇÕES</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="sidebar-group-content">
                    <div class="sidebar-item" data-section="contatos">
                        <i class="fas fa-address-book fa-fw"></i>
                        <span>Contatos</span>
                    </div>
                    <div class="sidebar-item" data-section="compiladas">
                        <i class="fas fa-layer-group fa-fw"></i>
                        <span>Informações compiladas</span>
                    </div>
                </div>
            </div>
            </aside>

        <main class="main-content" style="padding: 12px;">
            <div class="card" style="padding: 2px; margin-bottom: 4px; background: #f9fafb;">
                <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;">
                    <div class="total-pill">
                    <div class="small-muted">Férias liberada partir de</div>
                    <div class="num" style="color:var(--muted); font-size: 16px;">${formattedPautaDate}</div>
                    </div>
                    <div class="total-pill">
                        <div class="small-muted"> Bloqueio prova:</div>
                        <div class="num" style="color:var(--muted); font-size: 16px;">Até ${formattedBlockedDate}</div>
                    </div>

                    ${totals.net >= 0
            ? `<div class="total-pill">
                        <div class="small-muted">Horas positivas</div>
                        <div class="num" style="color: var(--ok); font-weight: 700;">
                            ${formatHours(totals.net)} h
                        </div>
                        </div>`
            : `<div class="total-pill"><div class="small-muted">Horas negativas</div><div class="num" style="color:var(--danger)">-${formatHours(Math.abs(totals.net))}h</div></div>`
        }

                </div>
            </div>

            <div id="dynamicContent" style="max-height: calc(100vh - 180px); overflow-y: auto;"></div>
        </main>
    `;

    // Configura eventos do painel esquerdo
    setupSidebarEvents(intern, user);

    // Renderiza a seção inicial (ausência/calendário)
    activeSection = 'ausencia';
    renderSection(activeSection, intern, user);
}

// --- NOVA FUNÇÃO ---
// Verifica se algum grupo da sidebar contém um item com notificação pendente
// e aplica uma classe de destaque ao grupo.
function updateSidebarGroupHighlights() {
    document.querySelectorAll('.sidebar-group').forEach(group => {
        // Verifica se existe um item com notificação pendente DENTRO deste grupo
        const hasPendingItem = group.querySelector('.sidebar-item.has-pending');

        if (hasPendingItem) {
            // Se encontrou, adiciona a classe de destaque ao grupo
            group.classList.add('group-has-pending');
        } else {
            // Se não, remove a classe para garantir que o destaque suma
            group.classList.remove('group-has-pending');
        }
    });
}


// Configura eventos de clique nos botões do painel esquerdo
function setupSidebarEvents(intern, user) {
    // Navegação entre seções
    document.querySelectorAll('.sidebar-item[data-section]').forEach(item => {
        item.addEventListener('click', (e) => {
            activeSection = e.currentTarget.dataset.section;

            // Atualiza visual dos botões
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            e.currentTarget.classList.add('active');

            // Renderiza nova seção
            renderSection(activeSection, intern, user);
        });
    });

    // Botão Sair
    document.getElementById('btnLogout').addEventListener('click', () => {
        window.logout();
    });

    // Botão trocar para perfil admin (se disponível)
    const btnSwitchToAdmin = document.getElementById('btnSwitchToAdmin');
    if (btnSwitchToAdmin) {
        btnSwitchToAdmin.addEventListener('click', () => {
            session.viewMode = 'admin';
            render();
        });
    }

    // --- NOVO: LÓGICA PARA MENU DOBRÁVEL ---
    document.querySelectorAll('.sidebar-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const group = header.closest('.sidebar-group');
            group.classList.toggle('collapsed');
        });
    });

    // --- NOVO: ATUALIZA DESTAQUE DOS GRUPOS ---
    updateSidebarGroupHighlights();
}

// Renderiza o conteúdo do painel direito baseado na seção ativa
function renderSection(section, intern, user) {
    const container = document.getElementById('dynamicContent');
    if (!container) return;

    container.innerHTML = '';

    switch (section) {
        case 'ausencia':
            renderAusenciaCalendarioSection(container, intern, user);
            break;
        case 'historico':
            renderHistoricoSection(container, intern);
            break;
        case 'dados':
            renderDadosCadastraisSection(container, intern, user);
            break;
        case 'senha':
            showSenhaModal(user);
            break;
        case 'movimentacoes':
            renderMovimentacoesSection(container, intern);
            break;
        case 'notificacoes':
            renderNotificacoesSection(container, user);
            break;
        case 'contatos':
            renderContatosSection(container);
            break;
        case 'compiladas':
            break;
    }
}

// Renderiza a seção de adicionar ausência + calendário
function renderAusenciaCalendarioSection(container, intern, user) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px';
    card.style.background = '#f9fafb';

    card.innerHTML = `
        <h3>Adicionar Afastamento</h3>
        <a href="regras-folga.html" target="_blank" class="rules-link" style="margin-bottom: 12px; display: inline-flex;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span>Regras para agendar folga prova</span>
        </a>
        
        <div style="display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-top: 12px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
            <div style="flex: 1; min-width: 150px;">
                <label class="small-muted">Tipo</label>
                <select id="absenceType" class="input">
                    <option value="prova">Folga-prova</option>
                    <option value="vacation">Intenção de Férias</option>
                </select>
            </div>
            <div style="flex: 1; min-width: 150px;">
                <label class="small-muted" id="labelDate">Data</label>
                <input type="date" id="inpDate" class="input" value="${nowISO()}" />
            </div>
            <div style="flex: 1; min-width: 150px;" id="extraField">
                <label class="small-muted">Link da prova (opcional)</label>
                <input type="text" id="inpLink" class="input" placeholder="URL" />
            </div>
            <button class="button alt" id="btnAddAbsence" style="height: 42px;"><i class="fas fa-plus"></i> Adicionar</button>
        </div>
        
        <div id="vacationDaysDisplay" class="small-muted" style="text-align: right; margin-top: 5px; min-height: 1.2em; font-weight: 600; padding-right: 10px;"></div>
        
        <div id="absenceMsg" class="small-muted" style="margin-top: 6px; color: var(--danger);"></div>
        
        <hr style="margin: 20px 0;">
        
        <h3>Calendário</h3>
        <div id="calendarWrap" style="margin-top: 12px;"></div>
    `;

    container.appendChild(card);

    // Configuração do tipo de ausência
    const absenceType = document.getElementById('absenceType');
    const labelDate = document.getElementById('labelDate');
    const extraField = document.getElementById('extraField');
    const inpDate = document.getElementById('inpDate'); // Campo de data (início)
    const daysDisplay = document.getElementById('vacationDaysDisplay'); // Novo display

    // --- LÓGICA DE CÁLCULO DE DIAS ---
    const calculateVacationDays = () => {
        const startDateInput = inpDate.value;
        const endDateInputElem = document.getElementById('inpEndDate'); // Busca o elemento dinâmico

        if (!endDateInputElem) { // Se não for o modo férias, retorna null
            daysDisplay.textContent = '';
            return null;
        }

        const endDateInput = endDateInputElem.value;

        if (startDateInput && endDateInput) {
            const date1 = new Date(startDateInput + 'T00:00:00');
            const date2 = new Date(endDateInput + 'T00:00:00');

            if (date2 < date1) {
                daysDisplay.innerHTML = '<span style="color: var(--danger);">Data fim inválida</span>';
                return null;
            }

            const diffTime = Math.abs(date2 - date1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            // Validação de 5 a 30 dias
            if (diffDays < 5) {
                daysDisplay.innerHTML = `<span style="color: var(--danger);">${diffDays} dias (Mín. 5)</span>`;
                return null;
            }
            if (diffDays > 30) {
                daysDisplay.innerHTML = `<span style="color: var(--danger);">${diffDays} dias (Máx. 30)</span>`;
                return null;
            }

            daysDisplay.textContent = `Total: ${diffDays} dias`;
            return diffDays;
        }
        daysDisplay.textContent = '';
        return null;
    };
    // --- FIM DA LÓGICA DE CÁLCULO ---

    // Adiciona listener ao campo de data de início (que é estático)
    inpDate.addEventListener('change', () => {
        const endDateInputElem = document.getElementById('inpEndDate');
        // Se o campo de data fim existir, atualiza seu 'min' e recalcula
        if (endDateInputElem) {
            endDateInputElem.min = inpDate.value;
            calculateVacationDays();
        }
    });

    absenceType.addEventListener('change', () => {
        daysDisplay.textContent = ''; // Limpa o contador ao trocar

        if (absenceType.value === 'prova') {
            labelDate.textContent = 'Data';
            extraField.innerHTML = `
                <label class="small-muted">Link da prova (opcional)</label>
                <input type="text" id="inpLink" class="input" placeholder="URL" />
            `;
        } else { // 'vacation'
            labelDate.textContent = 'Data de início';
            // ALTERAÇÃO AQUI: Troca "Dias" por "Data fim"
            extraField.innerHTML = `
                <label class="small-muted">Data fim</label>
                <input type="date" id="inpEndDate" class="input" />
            `;

            // IMPORTANTE: Adiciona listeners aos campos recém-criados
            const inpEndDate = document.getElementById('inpEndDate');
            inpEndDate.min = inpDate.value; // Define o 'min' inicial
            inpEndDate.addEventListener('change', calculateVacationDays);
        }
    });

    // Botão adicionar
    document.getElementById('btnAddAbsence').addEventListener('click', () => {
        const type = absenceType.value;
        const date = document.getElementById('inpDate').value;

        if (!date) {
            showToast('Escolha uma data', 'warning');
            return;
        }

        if (type === 'prova') {
            addProva(intern, user, date);
        } else {
            // LÓGICA MODIFICADA: Calcula os dias ao invés de ler o input
            const days = calculateVacationDays();

            if (!days) {
                showToast('Período de férias inválido. Verifique se a data fim está correta e se o total está entre 5 e 30 dias.', 'error');
                return;
            }
            // A validação de min/max já é feita em calculateVacationDays()
            addVacation(intern, user, date, days);
        }
    });

    // Renderiza calendário
    let viewing = new Date();
    renderCalendarForIntern(intern, viewing);
}

// Adiciona folga prova
async function addProva(intern, user, date) {
    const blockDays = Number(state.meta.provaBlockDays || 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const allowedFrom = new Date(today.getTime() + blockDays * 24 * 60 * 60 * 1000);
    const selected = new Date(date + 'T00:00:00');
    const allowedDate = new Date(allowedFrom.getFullYear(), allowedFrom.getMonth(), allowedFrom.getDate());

    if (selected.getTime() <= allowedDate.getTime()) {
        showProvaBloqueadaModal();
        return;
    }

    const linkInput = document.getElementById('inpLink')?.value.trim() || '';
    let link = '';

    if (linkInput) {
        try {
            const url = new URL(linkInput.startsWith('http') ? linkInput : `https://www.google.com/search?q=${linkInput}`); // Tenta forçar uma URL válida para verificação

            // Verifica se o protocolo é seguro
            if (linkInput.startsWith('javascript:')) {
                throw new Error('Protocolo inválido');
            }

            // Se o link original não tinha http, adiciona
            if (!linkInput.startsWith('http://') && !linkInput.startsWith('https://')) {
                link = 'https://' + linkInput;
            } else {
                link = linkInput;
            }

        } catch (e) {
            showToast('O link da prova parece ser inválido ou malicioso. Use apenas URLs http/https.', 'error');
            return; // Impede o envio
        }
    }

    const internName = escapeHtml(intern?.name || user.username);

    const formattedDate = date.split('-').reverse().join('/');

    const declarationHtml = `
        <div style="padding: 10px; text-align: center;">
            <h3 style="margin-top: 0; color: var(--accent);">Confirmação de Agendamento</h3>
            <p style="font-size: 1.1em; line-height: 1.6;">
                "Eu, <strong>${internName}</strong>, declaro que desejo agendar folga no dia <strong>${formattedDate}</strong>, para realização de prova, e que apresentei previamente o calendário de provas à supervisão do e-Cejusc 3."
            </p>
            <div style="display:flex;justify-content:center;gap:15px;margin-top: 25px;">
                <button class="button ghost" id="btnCancelDeclaration" style="min-width: 100px;"><i class="fas fa-times"></i> Sair</button>
                <button class="button" id="btnConfirmDeclaration" style="min-width: 100px;"><i class="fas fa-check"></i> Confirmar</button>
            </div>
        </div>
    `;

    const m = showModal(declarationHtml, { allowBackdropClose: true });

    m.modal.querySelector('#btnCancelDeclaration').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });

    m.modal.querySelector('#btnConfirmDeclaration').addEventListener('click', async () => {
        intern.dates = intern.dates || [];
        if (!intern.dates.some(p => p.date === date)) {
            intern.dates.push({ date: date, link: link });
            intern.auditLog = intern.auditLog || [];
            intern.auditLog.push({
                id: uuid(),
                action: 'create_prova',
                byUserId: session.userId,
                byUserName: user.username,
                at: timestamp(),
                details: `Solicitou folga-prova para a data ${date}`
            });
        }

        await saveInternData(intern);
        m.close();
        m.cleanup();

        // Atualiza a tela
        renderSection('ausencia', intern, user);
    });
}

// Adiciona férias
async function addVacation(intern, user, startDate, days) {

    if (state.pautaPrazos && state.pautaPrazos.length > 0) {
        const sortedPautas = [...state.pautaPrazos].sort((a, b) => b.dataConferencia.localeCompare(a.dataConferencia));
        if (sortedPautas[0] && sortedPautas[0].dataPauta) {
            const lastPauta = new Date(sortedPautas[0].dataPauta + 'T00:00:00');
            lastPauta.setDate(lastPauta.getDate() + 1);
            const selected = new Date(startDate + 'T00:00:00');

            if (selected < lastPauta) {
                showFeriasBloqueadaPautaModal();
                return;
            }
        }
    }

    const vacationDates = [];
    const start = new Date(startDate + 'T00:00:00');

    for (let i = 0; i < days; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        const isoDate = currentDate.toISOString().slice(0, 10);
        vacationDates.push(isoDate);
    }

    const formattedStart = startDate.split('-').reverse().join('/');
    const lastDate = vacationDates[vacationDates.length - 1];
    const formattedEnd = lastDate.split('-').reverse().join('/');
    const internName = escapeHtml(intern?.name || user.username);

    const declarationHtml = `
        <div style="padding: 10px; text-align: center;">
            <h3 style="margin-top: 0; color: var(--accent);">Confirmação de Intenção de Férias</h3>
            <p style="font-size: 1.1em; line-height: 1.6;">
                "Eu, <strong>${internName}</strong>, declaro que desejo registrar <strong>${days} dia(s) de intenção de férias</strong>, no período de <strong>${formattedStart}</strong> a <strong>${formattedEnd}</strong>."
            </p>
            <div style="display:flex;justify-content:center;gap:15px;margin-top: 25px;">
                <button class="button ghost" id="btnCancelVacation" style="min-width: 100px;"><i class="fas fa-times"></i> Cancelar</button>
                <button class="button" id="btnConfirmVacation" style="min-width: 100px;"><i class="fas fa-check"></i> Confirmar</button>
            </div>
        </div>
    `;

    const m = showModal(declarationHtml, { allowBackdropClose: true });

    m.modal.querySelector('#btnCancelVacation').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });

    m.modal.querySelector('#btnConfirmVacation').addEventListener('click', async () => {
        intern.vacations = intern.vacations || [];

        const vacationId = uuid();
        intern.vacations.push({
            id: vacationId,
            startDate: startDate,
            days: days,
            dates: vacationDates,
            status: 'pending',
            createdAt: timestamp()
        });

        intern.auditLog = intern.auditLog || [];
        intern.auditLog.push({
            id: uuid(),
            action: 'create_vacation',
            byUserId: session.userId,
            byUserName: user.username,
            at: timestamp(),
            details: `Registrou ${days} dia(s) de intenção de férias de ${formattedStart} a ${formattedEnd}`
        });

        await saveInternData(intern);
        m.close();
        m.cleanup();

        // Atualiza a tela
        renderSection('ausencia', intern, user);
    });
}

// Renderiza a seção de histórico
function renderHistoricoSection(container, intern) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px';
    card.style.background = '#f9f9fbff';

    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <h3>Histórico de lançamentos</h3>
                <div class="muted small">Banco / Negativas</div>
            </div>
            <div>
                ${hasPower((state.users || {})[session.userId], 'manage_hours') ? '<button class="button" id="btnAddEntry"><i class="fas fa-plus"></i> Lançar horas (admin)</button>' : ''}
            </div>
        </div>

        <div style="margin-top: 20px; padding: 16px; background: white; border-radius: 10px; border: 1px solid #e5e7eb;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px;">
                <div>
                    <label class="small-muted">Tipo</label>
                    <select id="filterType" class="input">
                        <option value="all">Todos</option>
                        <option value="bank">Positivas</option>
                        <option value="negative">Negativas</option>
                    </select>
                </div>
                <div>
                    <label class="small-muted">Período</label>
                    <select id="filterPeriod" class="input">
                        <option value="all">Todos</option>
                        <option value="30">Último mês</option>
                        <option value="90">Últimos 3 meses</option>
                    </select>
                </div>
                <div>
                    <label class="small-muted">Ordenar por</label>
                    <select id="filterSort" class="input">
                        <option value="desc">Mais recentes</option>
                        <option value="asc">Mais antigos</option>
                    </select>
                </div>
            </div>
            <div>
                <label class="small-muted">Buscar por data ou justificativa</label>
                <input type="text" id="filterSearch" class="input" placeholder="Digite para buscar..." />
            </div>
        </div>

        <div id="entriesList" style="margin-top:16px"></div>
        <div id="paginationControls" style="margin-top: 16px; text-align: center;"></div>
    `;

    container.appendChild(card);

    // Estado da paginação
    let currentPage = 1;
    const itemsPerPage = 10;
    const entries = intern.hoursEntries || [];

    // Função para aplicar filtros e renderizar
    function applyFiltersAndRender() {
        const filterType = document.getElementById('filterType').value;
        const filterPeriod = document.getElementById('filterPeriod').value;
        const filterSort = document.getElementById('filterSort').value;
        const filterSearch = document.getElementById('filterSearch').value.toLowerCase();

        let filtered = [...entries];

        // Filtro por tipo
        if (filterType === 'bank') {
            filtered = filtered.filter(e => e.hours > 0);
        } else if (filterType === 'negative') {
            filtered = filtered.filter(e => e.hours < 0);
        }

        // Filtro por período
        if (filterPeriod !== 'all') {
            const days = parseInt(filterPeriod);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const cutoffStr = cutoffDate.toISOString().slice(0, 10);
            filtered = filtered.filter(e => e.date >= cutoffStr);
        }

        // Busca por texto
        if (filterSearch) {
            filtered = filtered.filter(e =>
                e.date.includes(filterSearch) ||
                (e.reason || '').toLowerCase().includes(filterSearch)
            );
        }

        // Ordenação
        filtered.sort((a, b) => {
            const comparison = a.date.localeCompare(b.date);
            return filterSort === 'desc' ? -comparison : comparison;
        });

        // Paginação
        const totalPages = Math.ceil(filtered.length / itemsPerPage);
        const startIdx = (currentPage - 1) * itemsPerPage;
        const endIdx = startIdx + itemsPerPage;
        const paginatedEntries = filtered.slice(startIdx, endIdx);

        renderEntriesListModern(paginatedEntries, intern);
        renderPaginationControls(totalPages, filtered.length);
    }

    // Renderiza a lista moderna
    function renderEntriesListModern(entries, intern) {
        const list = document.getElementById('entriesList');
        if (!list) return;

        list.innerHTML = '';

        if (entries.length === 0) {
            list.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">Nenhum lançamento encontrado</div>';
            return;
        }

        entries.forEach(e => {
            const row = document.createElement('div');
            row.className = 'row';
            row.style.flexDirection = 'column';
            row.style.alignItems = 'flex-start';
            row.style.gap = '12px';
            row.style.padding = '16px';
            row.style.borderLeft = `4px solid ${e.hours > 0 ? 'var(--ok)' : 'var(--danger)'}`;

            const currentUser = (state.users || {})[session.userId];
            const canManage = hasPower(currentUser, 'manage_hours');

            const compensatedBadge = e.compensated
                ? '<span style="display:inline-block;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534;margin-left:8px;">✓ COMPENSADO</span>'
                : '';

            const actions = canManage
                ? `<div style="display:flex;gap:6px;">
                    <button class="button ghost" data-edit="${e.id}"><i class="fas fa-edit"></i> Editar</button>
                    <button class="button danger" data-delete="${e.id}"><i class="fas fa-trash-alt"></i> Excluir</button>
                   </div>`
                : '';

            const compensationBtn = e.hours < 0 && canManage
                ? (e.compensated
                    ? `<button class="button ghost" data-uncomp="${e.id}" style="margin-top:8px;"><i class="fas fa-undo"></i> Desfazer compensação</button>`
                    : `<button class="button" data-comp="${e.id}" style="margin-top:8px;"><i class="fas fa-check-circle"></i> Marcar compensado</button>`)
                : '';

            row.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
                    <div>
                        <span style="font-weight:700;font-size:16px;">${e.date.split('-').reverse().join('/')}</span>
                        <span style="font-weight:700;font-size:18px;color:${e.hours > 0 ? 'var(--ok)' : 'var(--danger)'};margin-left:12px;">
                            ${e.hours > 0 ? '+' : ''}${e.hours}h
                        </span>
                        ${compensatedBadge}
                    </div>
                    ${actions}
                </div>
                <div style="padding-left:0px;width:100%;">
                    <div class="small-muted" style="margin-bottom:8px;"><strong>Justificativa:</strong> ${escapeHtml(e.reason || 'Sem justificativa')}</div>
                    <div class="audit">
                        Criado por: ${escapeHtml(e.createdByName || '—')} em ${formatDateTime(e.createdAt)}
                        ${e.lastModifiedBy ? ' • Alterado por: ' + escapeHtml(e.lastModifiedBy) : ''}
                        ${e.compensatedBy ? ' • Compensado por: ' + escapeHtml(e.compensatedBy) + ' em ' + formatDateTime(e.compensatedAt) : ''}
                    </div>
                    ${compensationBtn}
                </div>
            `;

            list.appendChild(row);

            // Event listeners
            const editBtn = row.querySelector('[data-edit]');
            if (editBtn) {
                editBtn.addEventListener('click', () => showHourEntryForm(intern.id, e.id));
            }

            const delBtn = row.querySelector('[data-delete]');
            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    if (!confirm('Excluir lançamento?')) return;
                    const manager = (state.users || {})[session.userId];
                    const detailsText = `Excluído lançamento de ${Math.abs(e.hours)} horas (${e.type === 'bank' ? 'positivas' : 'negativas'}) da data ${e.date}`;
                    intern.auditLog = intern.auditLog || [];
                    intern.auditLog.push({ id: uuid(), action: 'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: detailsText });

                    // ADICIONA NOTIFICAÇÃO
                    const user = findUserByIntern(intern.id);
                    if (user) {
                        user.notifications = user.notifications || [];
                        user.notifications.push({
                            id: uuid(),
                            type: 'hours_deleted_by_admin',
                            timestamp: timestamp(),
                            isRead: false,
                            message: `O servidor ${manager.name || manager.username} excluiu um lançamento de ${e.hours}h do seu banco de horas (data: ${e.date.split('-').reverse().join('/')}).`
                        });
                    }

                    intern.hoursEntries = intern.hoursEntries.filter(x => x.id !== e.id);
                    await saveInternData(intern);
                    applyFiltersAndRender();
                });
            }

            const compBtn = row.querySelector('[data-comp]');
            if (compBtn) {
                compBtn.addEventListener('click', async () => {
                    await markCompensated(intern.id, e.id, true);
                    await save(state);
                    applyFiltersAndRender();
                });
            }

            const uncompBtn = row.querySelector('[data-uncomp]');
            if (uncompBtn) {
                uncompBtn.addEventListener('click', async () => {
                    await markCompensated(intern.id, e.id, false);
                    await save(state);
                    applyFiltersAndRender();
                });
            }
        });
    }

    // Renderiza controles de paginação
    function renderPaginationControls(totalPages, totalItems) {
        const controls = document.getElementById('paginationControls');
        if (!controls || totalPages <= 1) {
            if (controls) controls.innerHTML = '';
            return;
        }

        controls.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
                <button class="button ghost" id="btnPrevPage" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-arrow-left"></i> Anterior</button>
                <span class="small-muted">Página ${currentPage} de ${totalPages} (${totalItems} registros)</span>
                <button class="button ghost" id="btnNextPage" ${currentPage === totalPages ? 'disabled' : ''}>Próximo <i class="fas fa-arrow-right"></i></button>
            </div>
        `;

        const prevBtn = document.getElementById('btnPrevPage');
        const nextBtn = document.getElementById('btnNextPage');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    applyFiltersAndRender();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    applyFiltersAndRender();
                }
            });
        }
    }

    // Event listeners dos filtros
    document.getElementById('filterType').addEventListener('change', () => {
        currentPage = 1;
        applyFiltersAndRender();
    });

    document.getElementById('filterPeriod').addEventListener('change', () => {
        currentPage = 1;
        applyFiltersAndRender();
    });

    document.getElementById('filterSort').addEventListener('change', () => {
        currentPage = 1;
        applyFiltersAndRender();
    });

    document.getElementById('filterSearch').addEventListener('input', () => {
        currentPage = 1;
        applyFiltersAndRender();
    });

    const addBtn = document.getElementById('btnAddEntry');
    if (addBtn) addBtn.addEventListener('click', () => showHourEntryForm(intern.id));

    // Renderização inicial
    applyFiltersAndRender();
}

// ===================================================================
// NOVA SEÇÃO: Histórico de Movimentações (Férias) e Notificações
// ===================================================================

function renderMovimentacoesSection(container, intern) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px';

    card.innerHTML = `
        <h3>Andamento das solicitações</h3>
        <div class="tabs" style="margin-top: 15px;">
            <button class="tab-button active" data-tab="solicitadas">Férias Solicitadas</button>
            <button class="tab-button" data-tab="excluidas">Férias Excluídas</button>
        </div>
        
        <div id="solicitadasContent" class="tab-content active">
            <div style="padding: 12px 0;">
                <label class="small-muted" for="movimentacoesFilter">Filtrar por status</label>
                <select id="movimentacoesFilter" class="input" style="max-width: 300px; margin-top: 4px;">
                    <option value="all">Todas</option>
                    <option value="pending">Férias pendentes de análise</option>
                    <option value="approved">Férias Analisadas e agendada</option>
                    <option value="rejected">Férias rejeitadas</option>
                </select>
            </div>
            <div id="movimentacoesList"></div>
        </div>

        <div id="excluidasContent" class="tab-content">
            <div id="excluidasList" style="padding-top: 12px;"></div>
        </div>
    `;

    container.appendChild(card);

    const tabs = card.querySelectorAll('.tab-button');
    const contents = card.querySelectorAll('.tab-content');
    const filterSelect = card.querySelector('#movimentacoesFilter');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            if (tab.dataset.tab === 'solicitadas') {
                card.querySelector('#solicitadasContent').classList.add('active');
                renderSolicitadas();
            } else {
                card.querySelector('#excluidasContent').classList.add('active');
                renderExcluidas();
            }
        });
    });

    function renderSolicitadas() {
        const listContainer = card.querySelector('#movimentacoesList');
        const filterValue = filterSelect.value;

        const solicitadas = (intern.vacations || []).filter(v => v.status !== 'deleted');
        solicitadas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        let filtered = solicitadas;
        if (filterValue !== 'all') {
            filtered = solicitadas.filter(v => v.status === filterValue);
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="muted" style="text-align:center; padding: 20px;">Nenhuma movimentação encontrada para este filtro.</div>';
            return;
        }

        listContainer.innerHTML = filtered.map(v => {
            const statusClass = `status-${v.status}`;
            const startDate = new Date(v.startDate + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + v.days - 1);
            const period = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;
            let analysisInfo = '';
            if (v.status === 'approved' || v.status === 'rejected') {
                const analysisDate = v.analyzedAt ? new Date(v.analyzedAt).toLocaleString('pt-BR') : 'N/A';
                analysisInfo = `<div class="audit" style="margin-top: 8px;">Analisado por: ${escapeHtml(v.analyzedBy || 'N/A')} em ${analysisDate}</div>`;
            }
            const requestDate = v.createdAt ? new Date(v.createdAt).toLocaleString('pt-BR') : 'N/A';

            let statusText = '';
            if (v.status === 'pending') {
                statusText = ' - pendente';
            } else if (v.status === 'rejected') {
                statusText = ' - rejeitado';
            } else if (v.status === 'approved') {
                statusText = ' - agendado';
            }

            return `
                <div class="row ${statusClass}" style="flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px;">
                    <div>
                        <div style="font-weight:700;">Período de ${v.days} dias${statusText}</div>
                        <div class="small-muted">${period}</div>
                    </div>
                    <div class="audit">Solicitado em: ${requestDate}</div>
                    ${analysisInfo}
                </div>
            `;
        }).join('');
    }

    function renderExcluidas() {
        const listContainer = card.querySelector('#excluidasList');
        const excluidas = (intern.vacations || []).filter(v => v.status === 'deleted');
        excluidas.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

        if (excluidas.length === 0) {
            listContainer.innerHTML = '<div class="muted" style="text-align:center; padding: 20px;">Nenhuma férias excluída encontrada.</div>';
            return;
        }

        listContainer.innerHTML = excluidas.map(v => {
            const startDate = new Date(v.startDate + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + v.days - 1);
            const period = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;
            const requestDate = v.createdAt ? new Date(v.createdAt).toLocaleString('pt-BR') : 'N/A';
            const deletedDate = v.deletedAt ? new Date(v.deletedAt).toLocaleString('pt-BR') : 'N/A';

            let typeText = 'Intenção de férias';
            if (v.statusBeforeDeletion === 'approved') {
                typeText = 'Férias agendada';
            }

            return `
                <div class="row status-rejected" style="flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px;">
                    <div>
                        <div style="font-weight:700;">Período de ${v.days} dias</div>
                        <div class="small-muted" style="font-style: italic;">(${typeText} excluída)</div>
                        <div class="small-muted">${period}</div>
                    </div>
                    <div class="audit">Solicitado em: ${requestDate}</div>
                    <div class="audit" style="margin-top: 8px;">Excluído por: ${escapeHtml(v.deletedByName || v.deletedBy || 'N/A')} (${escapeHtml(v.deletedBy || 'N/A')}) em ${deletedDate}</div>
                </div>
            `;
        }).join('');
    }

    filterSelect.addEventListener('change', renderSolicitadas);
    renderSolicitadas(); // Renderização inicial
}

function renderNotificacoesSection(container, user) {
    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px';

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3>Notificações</h3>
        </div>
        
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--input-border);">
            <div class="form-check">
                <input type="checkbox" id="selectAllNotificationsCheckbox" style="width: auto; height: auto;">
                <label for="selectAllNotificationsCheckbox" style="font-size: 13px; color: var(--muted); cursor: pointer;">Selecionar Todas</label>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="btnMarkAsRead" class="button ghost" disabled><i class="fas fa-envelope-open"></i> Marcar como lida (0)</button>
                <button id="btnDeleteSelectedNotifications" class="button danger" disabled><i class="fas fa-trash-alt"></i> Excluir (0)</button>
            </div>
        </div>

        <div id="notificationList" style="margin-top: 10px;"></div>
    `;

    container.appendChild(card);

    const notificationListContainer = card.querySelector('#notificationList');
    const selectAllCheckbox = card.querySelector('#selectAllNotificationsCheckbox');
    const deleteButton = card.querySelector('#btnDeleteSelectedNotifications');
    const markAsReadButton = card.querySelector('#btnMarkAsRead');

    const getSelectedIds = () => Array.from(card.querySelectorAll('.notification-checkbox:checked')).map(cb => cb.dataset.notificationId);

    const updateButtonStates = () => {
        const selectedCheckboxes = card.querySelectorAll('.notification-checkbox:checked');
        const selectedCount = selectedCheckboxes.length;
        const allCheckboxes = card.querySelectorAll('.notification-checkbox');

        // Lógica para o botão Excluir
        deleteButton.disabled = selectedCount === 0;
        deleteButton.textContent = `Excluir (${selectedCount})`;

        // Lógica para o botão Marcar como lida
        const unreadSelectedCount = Array.from(selectedCheckboxes).filter(cb => {
            const id = cb.dataset.notificationId;
            const notification = user.notifications.find(n => n.id === id);
            return notification && !notification.isRead;
        }).length;

        markAsReadButton.disabled = unreadSelectedCount === 0;
        markAsReadButton.textContent = `Marcar como lida (${unreadSelectedCount})`;

        // Lógica para o Selecionar Todos
        selectAllCheckbox.checked = allCheckboxes.length > 0 && selectedCount === allCheckboxes.length;
    };

    const renderList = () => {
        const notifications = (user.notifications || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (notifications.length === 0) {
            notificationListContainer.innerHTML = '<div class="muted" style="text-align:center; padding: 20px;">Nenhuma notificação encontrada.</div>';
            card.querySelector('#selectAllNotificationsCheckbox').parentElement.parentElement.style.display = 'none';
            return;
        } else {
            card.querySelector('#selectAllNotificationsCheckbox').parentElement.parentElement.style.display = 'flex';
        }

        notificationListContainer.innerHTML = notifications.map(n => {
            const isUnread = !n.isRead;
            const unreadIndicator = isUnread ? '<span style="color: var(--accent); font-weight: 900; margin-right: 8px;">●</span>' : '';
            const fontWeight = isUnread ? '700' : 'normal';

            return `
                <div class="row" style="display: grid; grid-template-columns: auto auto 1fr; align-items: flex-start; gap: 8px; background: ${isUnread ? 'rgba(43, 108, 176, 0.05)' : 'transparent'};">
                    <input type="checkbox" class="notification-checkbox" data-notification-id="${n.id}" style="margin-top: 4px;"/>
                    <div>${unreadIndicator}</div>
                    <div style="flex-grow: 1;">
                        <div style="font-weight: ${fontWeight};">${escapeHtml(n.message)}</div>
                        <div class="audit">${formatDateTime(n.timestamp)}</div>
                    </div>
                </div>
            `;
        }).join('');

        card.querySelectorAll('.notification-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', updateButtonStates);
        });
    };

    selectAllCheckbox.addEventListener('change', () => {
        card.querySelectorAll('.notification-checkbox').forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
        });
        updateButtonStates();
    });

    deleteButton.addEventListener('click', async () => {
        const idsToDelete = new Set(getSelectedIds());
        if (idsToDelete.size === 0) return;

        if (confirm(`Deseja realmente excluir as ${idsToDelete.size} notificações selecionadas?`)) {
            user.notifications = user.notifications.filter(n => !idsToDelete.has(n.id));
            await database.ref(`/appState/users/${user.id}`).set(user);
            updateSidebarGroupHighlights();
            renderNotificacoesSection(container, user);
        }
    });

    markAsReadButton.addEventListener('click', async () => {
        const idsToMark = new Set(getSelectedIds());
        if (idsToMark.size === 0) return;

        let changed = false;
        user.notifications.forEach(n => {
            if (idsToMark.has(n.id) && !n.isRead) {
                n.isRead = true;
                changed = true;
            }
        });

        if (changed) {
            await database.ref(`/appState/users/${user.id}`).set(user);

            // Atualiza apenas o badge de notificações sem re-renderizar tudo
            const unreadCount = (user.notifications || []).filter(n => !n.isRead).length;
            const notificationBadge = document.querySelector('[data-section="notificacoes"] .badge');
            const notificationItem = document.querySelector('[data-section="notificacoes"]');

            if (notificationBadge) {
                if (unreadCount > 0) {
                    notificationBadge.textContent = unreadCount;
                } else {
                    notificationBadge.remove();
                }
            }

            if (notificationItem) {
                if (unreadCount > 0) {
                    notificationItem.classList.add('has-pending');
                } else {
                    notificationItem.classList.remove('has-pending');
                }
            }
            updateSidebarGroupHighlights();

            // Re-renderiza apenas a seção de notificações
            renderNotificacoesSection(container, user);
        }
    });

    renderList();
    updateButtonStates();
}


// Renderiza dados cadastrais no painel direito
function renderDadosCadastraisSection(container, intern, user) {
    const dataToRender = { ...(intern.registrationData || {}) };

    const universities = [
        'Centro Universitário de Brasília (UniCEUB)', 'Centro Universitário do Distrito Federal (UDF)',
        'Centro Universitário Estácio de Brasília', 'Centro Universitário IESB', 'Faculdade Presbiteriana Mackenzie Brasília',
        'Instituto Brasileiro de Ensino, Desenvolvimento e Pesquisa (IDP)', 'Universidade Católica de Brasília (UCB)',
        'Universidade de Brasília (UnB)', 'UniProcessus', 'UNIEURO - Centro Universitário', 'UNIP - Universidade Paulista (Campus Brasília)',
        'UPIS - Faculdades Integradas'
    ];

    let lastUpdateText = 'Nunca atualizado.';
    if (intern.registrationData?.lastUpdatedAt) {
        const days = Math.floor((new Date() - new Date(intern.registrationData.lastUpdatedAt)) / (1000 * 60 * 60 * 24));
        lastUpdateText = `Dados atualizados há ${days} dia(s).`;
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px';
    card.style.background = '#ffffff';

    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <h3>Dados Cadastrais</h3>
            <span id="error-message" style="color:var(--danger); font-weight: bold; display: none;">Preencha os campos obrigatórios!</span>
        </div>

        <div class="muted small" style="margin-top: 4px; margin-bottom: 10px; text-align: center; font-weight: bold; color: var(--accent);">
            ${lastUpdateText}
        </div>
        
        <form id="formRegData" style="margin-top:10px;">
            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Dados Pessoais</legend>
                <div class="form-row">
                    <label id="label-fullName" for="fullName"><strong>Nome completo *</strong></label>
                    <input id="fullName" value="${escapeHtml(dataToRender.fullName || intern.name)}">
                </div>
                <div class="form-row">
                    <label id="label-cpf" for="cpf"><strong>CPF (somente números) *</strong></label>
                    <input id="cpf" value="${escapeHtml(dataToRender.cpf)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                </div>
                <div class="form-row">
                    <label id="label-birthDate" for="birthDate"><strong>Data de nascimento *</strong></label>
                    <input id="birthDate" type="date" value="${escapeHtml(dataToRender.birthDate)}">
                </div>
                <div class="form-row">
                    <label id="label-mainPhone" for="mainPhone"><strong>Telefone principal (WhatsApp) *</strong></label>
                    <div style="display: flex; gap: 8px;">
                        ${createCountryCodeDropdownHtml('mainPhoneCode', dataToRender.mainPhoneCode)}
                        <input id="mainPhone" value="${escapeHtml(dataToRender.mainPhone)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex-grow: 1;">
                    </div>
                </div>
                <div class="form-row">
                    <label id="label-altPhone" for="altPhone"><strong>Telefone alternativo</strong></label>
                    <div style="display: flex; gap: 8px;">
                        ${createCountryCodeDropdownHtml('altPhoneCode', dataToRender.altPhoneCode)}
                        <input id="altPhone" value="${escapeHtml(dataToRender.altPhone)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex-grow: 1;">
                    </div>
                </div>
                <div class="form-row">
                    <label id="label-address" for="address"><strong>Endereço residencial com CEP *</strong></label>
                    <textarea id="address" rows="3">${escapeHtml(dataToRender.address)}</textarea>
                </div>
                 <div class="form-row">
                    <label id="label-instEmail" for="instEmail"><strong>E-mail institucional (se souber)</strong></label>
                    <input id="instEmail" type="email" value="${escapeHtml(dataToRender.instEmail)}">
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Estágio</legend>
                <div class="form-row">
                    <label id="label-enrollmentId" for="enrollmentId"><strong>Matrícula (login) *</strong></label>
                    <input id="enrollmentId" value="${escapeHtml(dataToRender.enrollmentId || user.username)}">
                </div>
                <div class="form-row">
                    <label id="label-internshipHours" for="internshipHours"><strong>Horário de estágio *</strong></label>
                    <select id="internshipHours">
                        <option value="" ${dataToRender.internshipHours === '' ? 'selected' : ''}>Selecione...</option>
                        <option value="13h-17h" ${dataToRender.internshipHours === '13h-17h' ? 'selected' : ''}>13h—17h</option>
                        <option value="14h-18h" ${dataToRender.internshipHours === '14h-18h' ? 'selected' : ''}>14h—18h</option>
                    </select>
                </div>
                <div class="form-row">
                    <label id="label-internshipStartDate" for="internshipStartDate"><strong>Data de início do estágio</strong></label>
                    <input id="internshipStartDate" type="date" value="${escapeHtml(dataToRender.internshipStartDate)}">
                </div>
                <div class="form-row">
                    <label id="label-internshipEndDate" for="internshipEndDate"><strong>Data de término do estágio</strong></label>
                    <input id="internshipEndDate" type="date" value="${escapeHtml(dataToRender.internshipEndDate || '')}" readonly style="background-color: var(--input-bg); cursor: not-allowed;">
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Contato de Emergência</legend>
                <div class="form-row">
                    <label id="label-emergencyContactName" for="emergencyContactName"><strong>Nome da pessoa *</strong></label>
                    <input id="emergencyContactName" value="${escapeHtml(dataToRender.emergencyContactName)}">
                </div>
                <div class="form-row">
                    <label id="label-emergencyContactRelation" for="emergencyContactRelation"><strong>Parentesco *</strong></label>
                    <input id="emergencyContactRelation" value="${escapeHtml(dataToRender.emergencyContactRelation)}">
                </div>
                <div class="form-row">
                    <label id="label-emergencyContactPhone" for="emergencyContactPhone"><strong>Telefone *</strong></label>
                    <div style="display: flex; gap: 8px;">
                        ${createCountryCodeDropdownHtml('emergencyContactPhoneCode', dataToRender.emergencyContactPhoneCode)}
                        <input id="emergencyContactPhone" value="${escapeHtml(dataToRender.emergencyContactPhone)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex-grow: 1;">
                    </div>
                </div>
                <div class="form-row">
                     <label id="label-emergencyContactWhatsapp"><strong>Funciona WhatsApp? *</strong></label>
                     <select id="emergencyContactWhatsapp">
                        <option value="sim" ${dataToRender.emergencyContactWhatsapp === 'sim' ? 'selected' : ''}>Sim</option>
                        <option value="nao" ${dataToRender.emergencyContactWhatsapp === 'nao' ? 'selected' : ''}>Não</option>
                     </select>
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Formação Acadêmica</legend>
                 <div class="form-row">
                    <label id="label-university" for="university"><strong>Instituição de Ensino Superior *</strong></label>
                    <select id="university">
                        <option value="">Selecione...</option>
                        ${universities.map(u => `<option value="${u}" ${dataToRender.university === u ? 'selected' : ''}>${u}</option>`).join('')}
                        <option value="outros" ${dataToRender.university === 'outros' ? 'selected' : ''}>Outros</option>
                    </select>
                </div>
                <div class="form-row" id="otherUniversityWrapper" style="display: none;">
                    <label id="label-universityOther" for="universityOther"><strong>Qual instituição? *</strong></label>
                    <input id="universityOther" value="${escapeHtml(dataToRender.universityOther || '')}">
                </div>
                <div class="form-row">
                    <label id="label-currentSemester" for="currentSemester"><strong>Semestre cursando *</strong></label>
                    <input id="currentSemester" value="${escapeHtml(dataToRender.currentSemester)}">
                </div>
            </fieldset>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:15px;">
                <button type="submit" class="button"><i class="fas fa-save"></i> Salvar e Atualizar</button>
            </div>
        </form>
    `;

    container.appendChild(card);

    const form = card.querySelector('#formRegData');
    const universitySelect = card.querySelector('#university');
    const otherUniversityWrapper = card.querySelector('#otherUniversityWrapper');

    const checkOtherUniversity = () => {
        otherUniversityWrapper.style.display = universitySelect.value === 'outros' ? 'block' : 'none';
    };
    universitySelect.addEventListener('change', checkOtherUniversity);
    checkOtherUniversity();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        let isValid = true;
        card.querySelectorAll('label').forEach(label => label.style.color = '');
        card.querySelector('#error-message').style.display = 'none';

        const mandatoryFields = [
            'fullName', 'cpf', 'birthDate', 'mainPhone', 'address', 'enrollmentId', 'internshipHours',
            'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone',
            'university', 'currentSemester'
        ];

        mandatoryFields.forEach(id => {
            const input = card.querySelector(`#${id}`);
            if (!input.value.trim()) {
                card.querySelector(`#label-${id}`).style.color = 'var(--danger)';
                isValid = false;
            }
        });

        if (universitySelect.value === 'outros' && !card.querySelector('#universityOther').value.trim()) {
            card.querySelector(`#label-universityOther`).style.color = 'var(--danger)';
            isValid = false;
        }

        const newEnrollmentId = card.querySelector('#enrollmentId').value.trim();
        if (newEnrollmentId && !/^[et]\d{6}$/i.test(newEnrollmentId) && !newEnrollmentId.startsWith('temp_')) {
            showToast("Formato de matrícula inválido. Use a letra 'e' ou 't' seguida por 6 números.", 'error');
            card.querySelector('#label-enrollmentId').style.color = 'var(--danger)';
            isValid = false;
        }

        if (!isValid) {
            card.querySelector('#error-message').style.display = 'block';
            container.scrollTop = 0;
            return;
        }

        const userToUpdate = findUserByIntern(intern.id);
        if (!userToUpdate) {
            return showToast('Erro: não foi possível encontrar o perfil de usuário associado a este estagiário.', 'error');
        }

        if (newEnrollmentId) {
            const existingUser = Object.values(state.users || {}).find(u => u.username.toLowerCase() === newEnrollmentId.toLowerCase());
            if (existingUser && existingUser.id !== userToUpdate.id) {
                m.modal.querySelector('#label-enrollmentId').style.color = 'var(--danger)';
                return showToast('Erro: Esta matrícula já está em uso por outro usuário.', 'error');
            }
            userToUpdate.username = newEnrollmentId;
        }

        userToUpdate.name = card.querySelector('#fullName').value;

        intern.registrationData = {
            fullName: card.querySelector('#fullName').value,
            cpf: card.querySelector('#cpf').value,
            birthDate: card.querySelector('#birthDate').value,
            mainPhone: card.querySelector('#mainPhone').value,
            mainPhoneCode: card.querySelector('#mainPhoneCode').value,
            altPhone: card.querySelector('#altPhone').value,
            altPhoneCode: card.querySelector('#altPhoneCode').value,
            address: card.querySelector('#address').value,
            instEmail: card.querySelector('#instEmail').value,
            enrollmentId: newEnrollmentId,
            internshipHours: card.querySelector('#internshipHours').value,
            internshipStartDate: card.querySelector('#internshipStartDate').value,
            internshipEndDate: card.querySelector('#internshipEndDate').value,
            emergencyContactName: card.querySelector('#emergencyContactName').value,
            emergencyContactRelation: card.querySelector('#emergencyContactRelation').value,
            emergencyContactPhone: card.querySelector('#emergencyContactPhone').value,
            emergencyContactPhoneCode: card.querySelector('#emergencyContactPhoneCode').value,
            emergencyContactWhatsapp: card.querySelector('#emergencyContactWhatsapp').value,
            university: universitySelect.value,
            universityOther: card.querySelector('#universityOther').value,
            currentSemester: card.querySelector('#currentSemester').value,
            lastUpdatedAt: new Date().toISOString()
        };

        // Salva os dados do estagiário no Firebase
        await saveInternData(intern);

        // Salva os dados atualizados do usuário (username e name)
        await database.ref(`appState/users/${user.id}`).update({
            username: userToUpdate.username,
            name: userToUpdate.name
        });

        showToast('Dados cadastrais atualizados com sucesso!', 'success');

        // Atualiza a tela para mostrar nova data
        renderSection('dados', intern, user);
    });
}

// Mostra modal de alteração de senha (MODIFICADO PARA USAR FIREBASE AUTH)
function showSenhaModal(user) {
    // Importa o 'auth' do firebase-config
    import('./firebase-config.js').then(module => {
        const auth = module.auth;

        const html = `
            <div style="display:flex;justify-content:space-between;align-items:center"><h3>Alterar minha senha</h3><button id="closeP" class="button ghost"><i class="fas fa-times"></i> Fechar</button></div>
            <form id="formPwd" style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
              <p class="small-muted">Para alterar sua senha, você precisará confirmar sua senha atual. Se você não se lembra, use a opção "Esqueci a senha" na tela de login.</p>
              
              <label style="position:relative;"><span class="small-muted">Senha atual</span>
                <input type="password" id="curPwd" required style="padding-right: 36px;"/>
                <span class="password-toggle-icon" id="toggleCurPwd">🔒️</span>
              </label>
              <label style="position:relative;"><span class="small-muted">Nova senha (mínimo 6 caracteres)</span>
                <input type="password" id="newPwd" required style="padding-right: 36px;"/>
                <span class="password-toggle-icon" id="toggleNewPwd">🔒️</span>
              </label>
              <div style="display:flex;justify-content:flex-end;gap:8px"><button type="submit" class="button"><i class="fas fa-save"></i> Alterar</button></div>
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

            if (!np || np.length < 6) {
                return showToast('A nova senha deve ter no mínimo 6 caracteres.', 'error');
            }

            const currentUserAuth = auth.currentUser;
            if (!currentUserAuth) {
                return showToast('Erro: Usuário não autenticado. Tente fazer login novamente.', 'error');
            }

            // 1. Criar a credencial com a senha atual
            const credential = firebase.auth.EmailAuthProvider.credential(currentUserAuth.email, cur);

            // 2. Re-autenticar o usuário
            try {
                await currentUserAuth.reauthenticateWithCredential(credential);
            } catch (error) {
                console.error("Erro ao reautenticar:", error);
                return showToast('Senha atual incorreta.', 'error');
            }

            // 3. Se a reautenticação deu certo, atualizar a senha
            try {
                await currentUserAuth.updatePassword(np);

                // A senha foi alterada no Auth. Agora, atualizamos o 'state' local
                const u = (state.users || {})[session.userId];
                if (u) {
                    u.selfPasswordChange = true; // Isso estava em 'app.js' antes, mas pertence aqui
                    await database.ref(`/appState/users/${session.userId}`).set(u);
                }

                showToast('Senha alterada com sucesso!', 'success');
                m.close();
                m.cleanup();

            } catch (error) {
                console.error("Erro ao atualizar senha:", error);
                if (error.code === 'auth/weak-password') {
                    return showToast('A nova senha é muito fraca. Tente outra.', 'error');
                }
                return showToast('Erro ao atualizar a senha.', 'error');
            }
        });
    }).catch(err => {
        console.error("Falha ao carregar o módulo de autenticação", err);
        showToast("Erro crítico ao carregar a função de senha. Avise o administrador.", 'error');
    });
}

function renderCalendarForIntern(intern, viewing) {
    const wrap = document.getElementById('calendarWrap');
    const monthStart = new Date(viewing.getFullYear(), viewing.getMonth(), 1);
    let label = monthStart.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    label = label.charAt(0).toUpperCase() + label.slice(1);

    // A estrutura do HTML foi alterada aqui para centralizar a navegação
    wrap.innerHTML = `
    <div class="calendar-nav">
      <button class="button ghost" id="prevMonth" title="Mês anterior"><i class="fas fa-chevron-left"></i></button>
      <div class="calendar-nav-label" id="monthLabel">${label}</div>
      <button class="button ghost" id="nextMonth" title="Próximo mês"><i class="fas fa-chevron-right"></i></button>
    </div>
    <div class="calendar" style="grid-template-columns:repeat(7,1fr);font-weight:700;color:var(--muted); padding: 0 10px; border-bottom: 1px solid var(--input-border); padding-bottom: 10px;">
      <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
    </div>
    <div id="monthGrid" class="calendar" style="margin-top:10px"></div>
  `;

    const grid = document.getElementById('monthGrid');
    grid.innerHTML = '';
    const firstDay = new Date(viewing.getFullYear(), viewing.getMonth(), 1).getDay();
    const daysInMonth = new Date(viewing.getFullYear(), viewing.getMonth() + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div');
        blank.className = 'day';
        blank.style.visibility = 'hidden';
        blank.innerHTML = '&nbsp;';
        grid.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(viewing.getFullYear(), viewing.getMonth(), d);
        const iso = date.toISOString().slice(0, 10);
        const dayEl = document.createElement('div');
        dayEl.className = 'day';
        dayEl.innerHTML = `<div class="date">${d}</div>`;

        // Verifica se é folga-prova
        const prova = (intern.dates || []).find(p => p.date === iso);
        if (prova) {
            const pill = document.createElement('div');
            pill.className = 'tag bank';
            pill.textContent = 'Folga-prova';
            const currentUser = (state.users || {})[session.userId];
            if (currentUser && currentUser.role === 'intern' && currentUser.internId === intern.id) {
                const rem = document.createElement('button');
                rem.className = 'button ghost';
                rem.innerHTML = '<i class="fas fa-trash-alt"></i>';
                const wrapper = document.createElement('div');
                wrapper.className = 'wrapper';
                rem.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    if (confirm('Remover sua folga-prova nesta data?')) {
                        intern.auditLog = intern.auditLog || [];
                        intern.auditLog.push({
                            id: uuid(),
                            action: 'remove_prova',
                            byUserId: session.userId,
                            byUserName: currentUser.username,
                            at: timestamp(),
                            details: `Excluiu solicitação de folga-prova da data ${iso}`
                        });
                        intern.dates = intern.dates.filter(x => x.date !== iso);
                        await saveInternData(intern);
                        renderCalendarForIntern(intern, viewing);
                    }
                });

                wrapper.appendChild(pill);
                wrapper.appendChild(rem);
                dayEl.appendChild(wrapper);
            } else {
                dayEl.appendChild(pill);
            }
        }

        // Verifica se é férias (e não foi rejeitada ou excluída)
        const vacation = (intern.vacations || []).find(v => v.status !== 'rejected' && v.status !== 'deleted' && v.dates && v.dates.includes(iso));
        if (vacation) {
            const pill = document.createElement('div');
            // Define estilo e texto com base no status
            if (vacation.status === 'approved') {
                pill.className = 'tag vacation-approved';
                pill.textContent = 'Férias Agendadas';
            } else { // 'pending'
                pill.className = 'tag vacation';
                pill.textContent = 'Intenção de Férias';
            }

            const currentUser = (state.users || {})[session.userId];
            // Só permite remover se for o próprio estagiário
            if (currentUser && currentUser.internId === intern.id) {
                const rem = document.createElement('button');
                rem.className = 'button ghost';
                rem.innerHTML = '<i class="fas fa-trash-alt"></i>';
                const wrapper = document.createElement('div');
                wrapper.className = 'wrapper';

                rem.addEventListener('click', async (ev) => {
                    ev.stopPropagation();

                    // Bloqueia exclusão de férias já aprovadas
                    if (vacation.status === 'approved') {
                        showApprovedVacationDeletionBlockedModal();
                        return;
                    }

                    const blockDays = Number(state.meta.vacationBlockDays || 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const blockedUntil = new Date(today.getTime() + blockDays * 24 * 60 * 60 * 1000);

                    const canManageProvas = hasPower(currentUser, 'manage_provas');

                    let hasBlockedDay = false;
                    if (!canManageProvas) {
                        for (const vDate of vacation.dates) {
                            const vDateObj = new Date(vDate + 'T00:00:00');
                            if (vDateObj < blockedUntil) {
                                hasBlockedDay = true;
                                break;
                            }
                        }
                    }

                    if (hasBlockedDay) {
                        showVacationChangeBlockedModal();
                        return;
                    }

                    if (confirm('Remover este período de férias?')) {
                        const vacationIndex = intern.vacations.findIndex(v => v.id === vacation.id);
                        if (vacationIndex > -1) {
                            const originalStatus = intern.vacations[vacationIndex].status;
                            intern.vacations[vacationIndex].statusBeforeDeletion = originalStatus;
                            intern.vacations[vacationIndex].status = 'deleted';
                            intern.vacations[vacationIndex].deletedAt = timestamp();
                            intern.vacations[vacationIndex].deletedBy = currentUser.username;
                            intern.vacations[vacationIndex].deletedByName = currentUser.name || currentUser.username;
                        }

                        intern.auditLog = intern.auditLog || [];
                        const formattedStart = vacation.startDate.split('-').reverse().join('/');
                        intern.auditLog.push({
                            id: uuid(),
                            action: 'delete_vacation',
                            byUserId: session.userId,
                            byUserName: currentUser.username,
                            at: timestamp(),
                            details: `Excluiu período de ${vacation.days} dia(s) de férias iniciado em ${formattedStart}`
                        });

                        await saveInternData(intern);
                        renderCalendarForIntern(intern, viewing);
                    }
                });

                wrapper.appendChild(pill);
                wrapper.appendChild(rem);
                dayEl.appendChild(wrapper);
            } else {
                dayEl.appendChild(pill);
            }
        }

        // --- INÍCIO DA CORREÇÃO 1 ---
        // Verifica se é licença médica
        const medicalLeave = Object.values(intern.medicalLeaves || {}).find(l => l.dates && l.dates.includes(iso));
        // --- FIM DA CORREÇÃO 1 ---
        if (medicalLeave) {
            const pill = document.createElement('div');
            pill.className = 'tag';
            pill.textContent = 'Licença Médica';
            // Estilo Laranja para a tag
            pill.style.backgroundColor = 'rgba(249, 115, 22, 0.1)';
            pill.style.color = '#c2410c';
            pill.style.fontWeight = '600';

            // Adiciona a tag ao dia do calendário (sem botão de excluir)
            dayEl.appendChild(pill);
        }

        // --- INÍCIO DA CORREÇÃO 2 ---
        // Verifica se é dia de NPJ
        const isNpjDay = Object.values(intern.npjAbsences || {}).some(period => period.dates.includes(iso));
        // --- FIM DA CORREÇÃO 2 ---
        if (isNpjDay) {
            const pill = document.createElement('div');
            pill.className = 'tag';
            pill.textContent = 'NPJ';
            // Estilo Cinza Escuro para a tag (conforme imagem)
            pill.style.backgroundColor = '#4b5563';
            pill.style.color = '#ffffff';
            pill.style.fontWeight = '700';
            dayEl.appendChild(pill);
        }

        // --- INÍCIO DA CORREÇÃO 3 ---
        // Verifica se é OAE
        const oaeLeave = Object.values(intern.oaeAbsences || {}).find(l => l.dates && l.dates.includes(iso));
        // --- FIM DA CORREÇÃO 3 ---
        if (oaeLeave) {
            const pill = document.createElement('div');
            pill.className = 'tag'; // Classe base
            pill.style.backgroundColor = '#4D7EA8'; // Fundo Azul
            pill.style.color = '#FFFFFF'; // Texto Branco
            pill.style.fontWeight = '600';
            pill.textContent = 'OAE';
            // Adiciona a descrição ao passar o mouse
            pill.title = 'Outro(s) Afastamento(s) Estagiário';
            dayEl.appendChild(pill);
        }

        // Adiciona lançamentos de horas
        ((intern.hoursEntries) || []).filter(e => e.date === iso).forEach(e => {
            const tag = document.createElement('div');
            tag.className = 'tag ' + (e.hours > 0 ? 'bank' : 'neg');
            tag.textContent = `${e.hours > 0 ? '+' : ''}${e.hours}h`;
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

    // Filtra as férias por status ANTES de montar o HTML
    const allVacationsForDay = (intern.vacations || []).filter(v => v.dates && v.dates.includes(iso));
    const approvedVacations = allVacationsForDay.filter(v => v.status === 'approved');
    const pendingVacations = allVacationsForDay.filter(v => v.status === 'pending');

    //detalhes dia calendário
    // A LINHA COM ERRO (htmlParts.push('</div>');) FOI REMOVIDA DAQUI
    htmlParts.push(`<div style="display:flex;justify-content:space-between;align-items:center"><h3>Detalhes — ${iso.split('-').reverse().join('/')}</h3><button id="closeD" class="button ghost"><i class="fas fa-times"></i> Fechar</button></div>`);
    htmlParts.push('<div style="margin-top:8px; max-height: 55vh; overflow-y: auto; padding-right: 15px;">');

    // Seção de Folga prova
    htmlParts.push('<h4>Folgas provas</h4>');
    if (provas.length === 0) {
        htmlParts.push('<div class="muted small">Nenhuma folga-prova nesta data</div>');
    } else {
        provas.forEach(p => htmlParts.push(`<div class="row"><div>${p.date.split('-').reverse().join('/')} • <span class="small-muted">Folga-prova registrada</span></div> ${p.link ? `<a href="${p.link}" target="_blank" class="button ghost"><i class="fas fa-external-link-alt"></i> Ver prova</a>` : ''}</div>`));
    }

    // Seção de Férias Agendadas (Aprovadas)
    htmlParts.push('<hr style="margin: 12px 0"/>');
    htmlParts.push('<h4>Férias Agendadas</h4>');
    if (approvedVacations.length === 0) {
        htmlParts.push('<div class="muted small">Nenhuma férias agendada para esta data</div>');
    } else {
        approvedVacations.forEach(v => {
            const formattedStart = v.startDate.split('-').reverse().join('/');
            const formattedEnd = v.dates[v.dates.length - 1].split('-').reverse().join('/');
            htmlParts.push(`<div class="row"><div><strong>Período de ${v.days} dia(s)</strong><br><span class="small-muted">De ${formattedStart} até ${formattedEnd}</span></div></div>`);
        });
    }

    // Seção de Intenção de Férias (Pendentes)
    htmlParts.push('<hr style="margin: 12px 0"/>');
    htmlParts.push('<h4>Intenção de Férias</h4>');
    if (pendingVacations.length === 0) {
        htmlParts.push('<div class="muted small">Nenhuma intenção de férias para esta data</div>');
    } else {
        pendingVacations.forEach(v => {
            const formattedStart = v.startDate.split('-').reverse().join('/');
            const formattedEnd = v.dates[v.dates.length - 1].split('-').reverse().join('/');
            htmlParts.push(`<div class="row"><div><strong>Período de ${v.days} dia(s)</strong><br><span class="small-muted">De ${formattedStart} até ${formattedEnd}</span></div></div>`);
        });
    }

    // Seção de Licença Médica
    const medicalLeaves = Object.values(intern.medicalLeaves || {}).filter(l => l.dates && l.dates.includes(iso));
    htmlParts.push('<hr style="margin: 12px 0"/>');
    htmlParts.push('<h4>Licença Médica</h4>');
    if (medicalLeaves.length === 0) {
        htmlParts.push('<div class="muted small">Nenhuma licença médica nesta data</div>');
    } else {
        medicalLeaves.forEach(leave => {
            const formattedStart = leave.startDate.split('-').reverse().join('/');
            const formattedEnd = leave.dates[leave.dates.length - 1].split('-').reverse().join('/');
            htmlParts.push(`<div class="row"><div><strong>Período de ${leave.days} dia(s)</strong><br><span class="small-muted">De ${formattedStart} até ${formattedEnd}</span></div></div>`);
        });
    }

    // Seção de NPJ
    const npjPeriodsForDay = Object.values(intern.npjAbsences || {}).filter(p => p.dates && p.dates.includes(iso));
    htmlParts.push('<hr style="margin: 12px 0"/>');
    htmlParts.push('<h4>NPJ (Núcleo de Prática Jurídica)</h4>');
    if (npjPeriodsForDay.length === 0) {
        htmlParts.push('<div class="muted small">Nenhum registro de NPJ nesta data</div>');
    } else {
        npjPeriodsForDay.forEach(period => {
            const weekdaysMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            const weekdaysStr = period.weekdays.map(d => weekdaysMap[d]).join(', ');
            htmlParts.push(`<div class="row"><div><strong>Afastamento recorrente</strong><br><span class="small-muted">Aplicado toda(o) ${weekdaysStr}</span></div></div>`);
        });
    }

    // Seção de OAE (Outros Afastamentos)
    const oaePeriodsForDay = Object.values(intern.oaeAbsences || {}).filter(p => p.dates && p.dates.includes(iso));
    htmlParts.push('<hr style="margin: 12px 0"/>');
    htmlParts.push('<h4>OAE (Outros Afastamentos)</h4>');
    if (oaePeriodsForDay.length === 0) {
        htmlParts.push('<div class="muted small">Nenhum OAE nesta data</div>');
    } else {
        oaePeriodsForDay.forEach(period => {
            const formattedStart = period.startDate.split('-').reverse().join('/');
            const formattedEnd = period.dates[period.dates.length - 1].split('-').reverse().join('/');
            htmlParts.push(`
                <div class="row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div><strong>${escapeHtml(period.description)}</strong></div>
                    <span class="small-muted">Período: de ${formattedStart} até ${formattedEnd} (${period.days} dias)</span>
                </div>
            `);
        });
    }

    // Seção de Lançamentos de Horas
    htmlParts.push('<hr style="margin: 12px 0"/>');
    htmlParts.push('<h4>Lançamentos</h4>');
    if (entries.length === 0) {
        htmlParts.push('<div class="muted small">Nenhum lançamento</div>');
    } else {
        entries.forEach(e => {
            const currentUser = (state.users || {})[session.userId];
            const canManageHours = hasPower(currentUser, 'manage_hours');

            const actions = canManageHours
                ? `<div style="display:flex;gap:6px;"><button class="button ghost" data-edit="${e.id}"><i class="fas fa-edit"></i> Editar</button><button class="button" data-delete="${e.id}"><i class="fas fa-trash-alt"></i> Excluir</button></div>`
                : '';
            const compensation = e.hours < 0 && canManageHours
                ? (e.compensated
                    ? `<button class="button ghost" data-uncomp="${e.id}"><i class="fas fa-undo"></i> Desfazer comp.</button>`
                    : `<button class="button" data-comp="${e.id}"><i class="fas fa-check-circle"></i> Marcar comp.</button>`)
                : '';

            htmlParts.push(`
    <div class="row" style="flex-direction:column;align-items:flex-start;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
        <div style="font-weight:700;">${e.date.split('-').reverse().join('/')} • ${e.hours > 0 ? '+' : ''}${e.hours}h ${e.type === 'bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div>
          <div style="display:flex;gap:6px">${actions}</div>
        </div>
        <div class="small-muted" style="margin-left:8px;">${escapeHtml(e.reason || 'Sem justificativa')}</div>
        <div class="audit" style="margin-left:8px;">Criado por: ${escapeHtml(e.createdByName || '—')} em ${formatDateTime(e.createdAt)}${e.lastModifiedBy ? ' • Alterado por: ' + escapeHtml(e.lastModifiedBy) : ''}${e.compensatedBy ? ' • Compensado por: ' + escapeHtml(e.compensatedBy) + ' em ' + formatDateTime(e.compensatedAt) : ''}</div>
        ${compensation ? `<div style="margin-top:8px;">${compensation}</div>` : ''}
      </div>
    `);
        });
    }
    htmlParts.push('</div>');

    const m = showModal(htmlParts.join(''), { allowBackdropClose: true });
    m.modal.querySelector('#closeD').addEventListener('click', () => { m.close(); m.cleanup(); });

    m.modal.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        if (!confirm('Excluir lançamento?')) return;
        const entry = (intern.hoursEntries || []).find(x => x.id === id);
        const manager = (state.users || {})[session.userId];
        if (entry) {
            const detailsText = `Excluído lançamento de ${Math.abs(entry.hours)} horas (${entry.type === 'bank' ? 'positivas' : 'negativas'}) da data ${entry.date}`;
            intern.auditLog.push({ id: uuid(), action: 'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: detailsText });

            // ADICIONA NOTIFICAÇÃO
            const user = findUserByIntern(intern.id);
            if (user) {
                user.notifications = user.notifications || [];
                user.notifications.push({
                    id: uuid(),
                    type: 'hours_deleted_by_admin',
                    timestamp: timestamp(),
                    isRead: false,
                    message: `${manager.name || manager.username} excluiu um lançamento de ${entry.hours}h do seu banco de horas (data: ${entry.date.split('-').reverse().join('/')}).`
                });
            }

            intern.hoursEntries = intern.hoursEntries.filter(x => x.id !== id);
            await save(state);
            m.close();
            m.cleanup();
        }
    }));

    m.modal.querySelectorAll('[data-comp]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-comp');
        markCompensated(intern.id, id, true);
        intern.auditLog.push({ id: uuid(), action: 'compensated', byUserId: session.userId, at: timestamp(), details: `Compensou ${id}` });
        await save(state);
        m.close();
        m.cleanup();
    }));

    m.modal.querySelectorAll('[data-uncomp]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-uncomp');
        markCompensated(intern.id, id, false);
        intern.auditLog.push({ id: uuid(), action: 'uncompensated', byUserId: session.userId, at: timestamp(), details: `Desfez compensação ${id}` });
        await save(state);
        m.close();
        m.cleanup();
    }));

    m.modal.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit');
        m.close();
        m.cleanup();
        showHourEntryForm(intern.id, id);
    }));
}

export function showHourEntryForm(internId, entryId) {
    const intern = findInternById(internId);
    if (!intern) return;
    const isEdit = !!entryId;
    const existing = isEdit ? ((intern.hoursEntries) || []).find(e => e.id === entryId) : null;
    const currentManager = (state.users || {})[session.userId];
    if (!hasPower(currentManager, 'manage_hours')) return showToast('Sem permissão para gerenciar horas.', 'error');
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>${isEdit ? 'Editar' : 'Lançar'} horas — ${escapeHtml(intern.name)}</h3><button id="closeH" class="button ghost"><i class="fas fa-times"></i> Fechar</button></div>
    <form id="formHours" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
      <label><span class="small-muted">Data</span><input type="date" id="h_date" value="${existing ? existing.date : nowISO()}" required /></label>
      <label><span class="small-muted">Tipo</span>
        <select id="h_type"><option value="bank">Banco (crédito)</option><option value="negative">Negativa (falta)</option></select>
      </label>
      <label><span class="small-muted">Quantidade de horas (número)</span><input id="h_hours" value="${existing ? Math.abs(existing.hours) : 8}" type="number" min="0.25" step="0.25" required /></label>
      <label><span class="small-muted">Justificativa / observações</span><textarea id="h_reason" rows="3">${existing ? escapeHtml(existing.reason || '') : ''}</textarea></label>
      <label><input type="checkbox" id="h_comp" ${existing && existing.compensated ? 'checked' : ''}/> Marcar como compensado (aplica-se a negativas)</label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button"><i class="fas ${isEdit ? 'fa-save' : 'fa-check'}"></i> ${isEdit ? 'Salvar' : 'Lançar'}</button>
      </div>
    </form>
  `;
    const m = showModal(html, { allowBackdropClose: false });
    const modal = m.modal;
    modal.querySelector('#closeH').addEventListener('click', () => { m.close(); m.cleanup(); });
    if (existing) modal.querySelector('#h_type').value = existing.type;
    modal.querySelector('#formHours').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const date = modal.querySelector('#h_date').value;
        const type = modal.querySelector('#h_type').value;
        const hoursRaw = modal.querySelector('#h_hours').value;
        const hoursNum = Number(hoursRaw);
        if (!date || !hoursNum || isNaN(hoursNum) || hoursNum <= 0) return showToast('Dados inválidos', 'error');
        const reason = modal.querySelector('#h_reason').value || '';
        const comp = !!modal.querySelector('#h_comp').checked;
        const manager = (state.users || {})[session.userId];
        const detailsText = `Lançamento de ${hoursNum} horas ${type === 'bank' ? 'positivas' : 'negativas'} para a data ${date}. Razão: ${reason || 'N/A'}`;

        if (isEdit && existing) {
            existing.date = date;
            existing.type = type;
            existing.hours = type === 'bank' ? hoursNum : -hoursNum;
            existing.reason = reason;
            existing.lastModifiedBy = manager.username;
            existing.lastModifiedAt = timestamp();
            existing.compensated = comp;
            intern.auditLog.push({ id: uuid(), action: 'edit_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Editou ${detailsText}` });

            // NOTIFICAÇÃO DE EDIÇÃO
            const user = findUserByIntern(intern.id);
            if (user) {
                user.notifications = user.notifications || [];
                user.notifications.push({
                    id: uuid(),
                    type: 'hours_edited_by_admin',
                    timestamp: timestamp(),
                    isRead: false,
                    message: `${manager.name || manager.username} editou um lançamento de ${existing.hours}h no seu banco de horas (data: ${date.split('-').reverse().join('/')}).`
                });
            }

        } else {
            const entry = { id: uuid(), date, type, hours: type === 'bank' ? hoursNum : -hoursNum, reason, compensated: comp, createdById: manager.id, createdByName: manager.username, createdAt: timestamp() };
            intern.hoursEntries = intern.hoursEntries || [];
            intern.hoursEntries.push(entry);
            intern.auditLog.push({ id: uuid(), action: 'create_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Criou ${detailsText}` });

            // NOTIFICAÇÃO DE CRIAÇÃO
            const user = findUserByIntern(intern.id);
            if (user) {
                user.notifications = user.notifications || [];
                user.notifications.push({
                    id: uuid(),
                    type: 'hours_added_by_admin',
                    timestamp: timestamp(),
                    isRead: false,
                    message: `O Servidor ${manager.name || manager.username} ${entry.hours > 0 ? 'adicionou' : 'lançou'} ${entry.hours}h no seu banco de horas (data: ${date.split('-').reverse().join('/')}).`
                });
            }
        }
        await save(state);
        m.close();
        m.cleanup();
        render();
    });
}

export async function markCompensated(internId, entryId, flag) {
    const intern = findInternById(internId);
    if (!intern) return;
    const entry = ((intern.hoursEntries) || []).find(e => e.id === entryId);
    if (!entry) return;
    entry.compensated = !!flag;
    if (flag) {
        entry.compensatedBy = ((state.users || {})[session.userId] || {}).username;
        entry.compensatedAt = timestamp();
    } else {
        entry.compensatedBy = null;
        entry.compensatedAt = null;
    }
    await saveInternData(intern); // CORREÇÃO
}

export function showRegistrationDataModal(intern, user, options = {}) {
    let dataToRender = { ...(intern.registrationData || {}) };

    if (options.isForcedUpdate) {
        dataToRender.address = '';
        dataToRender.emergencyContactName = '';
        dataToRender.emergencyContactRelation = '';
        dataToRender.emergencyContactPhone = '';
        dataToRender.university = '';
        dataToRender.universityOther = '';
        dataToRender.currentSemester = '';
    }

    const universities = [
        'Centro Universitário de Brasília (UniCEUB)', 'Centro Universitário do Distrito Federal (UDF)',
        'Centro Universitário Estácio de Brasília', 'Centro Universitário IESB', 'Faculdade Presbiteriana Mackenzie Brasília',
        'Instituto Brasileiro de Ensino, Desenvolvimento e Pesquisa (IDP)', 'Universidade Católica de Brasília (UCB)',
        'Universidade de Brasília (UnB)', 'UniProcessus', 'UNIEURO - Centro Universitário', 'UNIP - Universidade Paulista (Campus Brasília)',
        'UPIS - Faculdades Integradas'
    ];

    let lastUpdateText = 'Nunca atualizado.';
    if (intern.registrationData?.lastUpdatedAt) {
        const days = Math.floor((new Date() - new Date(intern.registrationData.lastUpdatedAt)) / (1000 * 60 * 60 * 24));
        lastUpdateText = `Dados atualizados há ${days} dia(s).`;
    }

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <h3>${options.isAdminView ? `Dados de ${intern.name}` : 'Dados Cadastrais'}</h3>
            <span id="error-message" style="color:var(--danger); font-weight: bold; display: none; text-align:center; flex-grow:1;"></span>
            <div>
                ${options.isAdminView ? '<button id="btnBackToUserManagement" class="button ghost">Voltar</button>' : ''}
                ${options.isForcedUpdate ? '' : '<button id="closeRegData" class="button ghost"><i class="fas fa-times"></i> Fechar</button>'}
            </div>
        </div>

        <div class="muted small" style="margin-top: 4px; margin-bottom: 10px; text-align: center; font-weight: bold; color: var(--accent);">
            ${options.isForcedUpdate ? 'Por favor, revise e atualize seus dados para continuar.' : lastUpdateText}
        </div>
        
        <form id="formRegData" style="margin-top:10px; max-height: 70vh; overflow-y: auto; padding-right: 15px;">
            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Dados Pessoais</legend>
                <div class="form-row">
                    <label id="label-fullName" for="fullName"><strong>Nome completo *</strong></label>
                    <input id="fullName" value="${escapeHtml(dataToRender.fullName || intern.name)}">
                </div>
                <div class="form-row">
                    <label id="label-cpf" for="cpf"><strong>CPF (somente números) *</strong></label>
                    <input id="cpf" value="${escapeHtml(dataToRender.cpf)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                </div>
                <div class="form-row">
                    <label id="label-birthDate" for="birthDate"><strong>Data de nascimento *</strong></label>
                    <input id="birthDate" type="date" value="${escapeHtml(dataToRender.birthDate)}">
                </div>
                <div class="form-row">
                    <label id="label-mainPhone" for="mainPhone"><strong>Telefone principal (WhatsApp) *</strong></label>
                    <div style="display: flex; gap: 8px;">
                        ${createCountryCodeDropdownHtml('mainPhoneCode', dataToRender.mainPhoneCode)}
                        <input id="mainPhone" value="${escapeHtml(dataToRender.mainPhone)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex-grow: 1;">
                    </div>
                </div>
                <div class="form-row">
                    <label id="label-altPhone" for="altPhone"><strong>Telefone alternativo</strong></label>
                    <div style="display: flex; gap: 8px;">
                        ${createCountryCodeDropdownHtml('altPhoneCode', dataToRender.altPhoneCode)}
                        <input id="altPhone" value="${escapeHtml(dataToRender.altPhone)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex-grow: 1;">
                    </div>
                </div>
                <div class="form-row">
                    <label id="label-address" for="address"><strong>Endereço residencial com CEP *</strong></label>
                    <textarea id="address" rows="3">${escapeHtml(dataToRender.address)}</textarea>
                </div>
                 <div class="form-row">
                    <label id="label-instEmail" for="instEmail"><strong>E-mail institucional (se souber)</strong></label>
                    <input id="instEmail" type="email" value="${escapeHtml(dataToRender.instEmail)}">
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Estágio</legend>
                <div class="form-row">
                    <label id="label-enrollmentId" for="enrollmentId"><strong>Matrícula (login) *</strong></label>
                    <input id="enrollmentId" value="${escapeHtml(dataToRender.enrollmentId || user.username)}">
                </div>
                <div class="form-row">
                    <label id="label-internshipHours" for="internshipHours"><strong>Horário de estágio *</strong></label>
                    <select id="internshipHours">
                        <option value="" ${dataToRender.internshipHours === '' ? 'selected' : ''}>Selecione...</option>
                        <option value="13h-17h" ${dataToRender.internshipHours === '13h-17h' ? 'selected' : ''}>13h—17h</option>
                        <option value="14h-18h" ${dataToRender.internshipHours === '14h-18h' ? 'selected' : ''}>14h—18h</option>
                    </select>
                </div>
                <div class="form-row">
                    <label id="label-internshipStartDate" for="internshipStartDate"><strong>Data de início do estágio</strong></label>
                    <input id="internshipStartDate" type="date" value="${escapeHtml(dataToRender.internshipStartDate)}">
                </div>
                <div class="form-row">
                    <label id="label-internshipEndDate" for="internshipEndDate"><strong>Data de término do estágio</strong></label>
                    <input id="internshipEndDate" type="date" value="${escapeHtml(dataToRender.internshipEndDate || '')}" ${!options.isAdminView ? 'readonly style="background-color: var(--input-bg); cursor: not-allowed;"' : ''}>
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Contato de Emergência</legend>
                <div class="form-row">
                    <label id="label-emergencyContactName" for="emergencyContactName"><strong>Nome da pessoa *</strong></label>
                    <input id="emergencyContactName" value="${escapeHtml(dataToRender.emergencyContactName)}">
                </div>
                <div class="form-row">
                    <label id="label-emergencyContactRelation" for="emergencyContactRelation"><strong>Parentesco *</strong></label>
                    <input id="emergencyContactRelation" value="${escapeHtml(dataToRender.emergencyContactRelation)}">
                </div>
                <div class="form-row">
                    <label id="label-emergencyContactPhone" for="emergencyContactPhone"><strong>Telefone *</strong></label>
                    <div style="display: flex; gap: 8px;">
                        ${createCountryCodeDropdownHtml('emergencyContactPhoneCode', dataToRender.emergencyContactPhoneCode)}
                        <input id="emergencyContactPhone" value="${escapeHtml(dataToRender.emergencyContactPhone)}" oninput="this.value = this.value.replace(/[^0-g, '')" style="flex-grow: 1;">
                    </div>
                </div>
                <div class="form-row">
                     <label id="label-emergencyContactWhatsapp"><strong>Funciona WhatsApp? *</strong></label>
                     <select id="emergencyContactWhatsapp">
                        <option value="sim" ${dataToRender.emergencyContactWhatsapp === 'sim' ? 'selected' : ''}>Sim</option>
                        <option value="nao" ${dataToRender.emergencyContactWhatsapp === 'nao' ? 'selected' : ''}>Não</option>
                     </select>
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Formação Acadêmica</legend>
                 <div class="form-row">
                    <label id="label-university" for="university"><strong>Instituição de Ensino Superior *</strong></label>
                    <select id="university">
                        <option value="">Selecione...</option>
                        ${universities.map(u => `<option value="${u}" ${dataToRender.university === u ? 'selected' : ''}>${u}</option>`).join('')}
                        <option value="outros" ${dataToRender.university === 'outros' ? 'selected' : ''}>Outros</option>
                    </select>
                </div>
                <div class="form-row" id="otherUniversityWrapper" style="display: none;">
                    <label id="label-universityOther" for="universityOther"><strong>Qual instituição? *</strong></label>
                    <input id="universityOther" value="${escapeHtml(dataToRender.universityOther || '')}">
                </div>
                <div class="form-row">
                    <label id="label-currentSemester" for="currentSemester"><strong>Semestre cursando *</strong></label>
                    <input id="currentSemester" value="${escapeHtml(dataToRender.currentSemester)}">
                </div>
            </fieldset>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:15px;">
                <button type="submit" class="button"><i class="fas fa-save"></i> Salvar e Atualizar</button>
            </div>
        </form>
    `;

    const m = showModal(html, { allowBackdropClose: !options.isForcedUpdate && !options.isAdminView });
    const form = m.modal.querySelector('#formRegData');
    const universitySelect = m.modal.querySelector('#university');
    const otherUniversityWrapper = m.modal.querySelector('#otherUniversityWrapper');

    const checkOtherUniversity = () => {
        otherUniversityWrapper.style.display = universitySelect.value === 'outros' ? 'block' : 'none';
    };
    universitySelect.addEventListener('change', checkOtherUniversity);
    checkOtherUniversity();

    const closeBtn = m.modal.querySelector('#closeRegData');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => { m.close(); m.cleanup(); });
    }
    const backBtn = m.modal.querySelector('#btnBackToUserManagement');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            m.close();
            m.cleanup();
            import('./view-manager-users.js').then(module => {
                module.openUserManagerView(user.id);
            });
        });
    }
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        let isValid = true;
        m.modal.querySelectorAll('label').forEach(label => label.style.color = '');
        m.modal.querySelector('#error-message').style.display = 'none';

        if (!options.isAdminView) {
            const mandatoryFields = [
                'fullName', 'cpf', 'birthDate', 'mainPhone', 'address', 'enrollmentId', 'internshipHours',
                'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone',
                'university', 'currentSemester'
            ];

            mandatoryFields.forEach(id => {
                const input = m.modal.querySelector(`#${id}`);
                if (!input.value.trim()) {
                    m.modal.querySelector(`#label-${id}`).style.color = 'var(--danger)';
                    isValid = false;
                }
            });

            if (universitySelect.value === 'outros' && !m.modal.querySelector('#universityOther').value.trim()) {
                m.modal.querySelector(`#label-universityOther`).style.color = 'var(--danger)';
                isValid = false;
            }
        }

        const newEnrollmentId = m.modal.querySelector('#enrollmentId').value.trim();
        if (newEnrollmentId === '' && !options.isAdminView) {
            m.modal.querySelector('#label-enrollmentId').style.color = 'var(--danger)';
            isValid = false;
        }

        if (newEnrollmentId && !/^[et]\d{6}$/i.test(newEnrollmentId) && !newEnrollmentId.startsWith('temp_')) {
            showToast("Formato de matrícula inválido. Use a letra 'e' ou 't' seguida por 6 números.", 'error');
            m.modal.querySelector('#label-enrollmentId').style.color = 'var(--danger)';
            isValid = false;
        }

        if (!isValid) {
            m.modal.querySelector('#error-message').style.display = 'block';
            return;
        }

        const userToUpdate = findUserByIntern(intern.id);
        if (!userToUpdate) {
            return showToast('Erro: não foi possível encontrar o perfil de usuário associado a este estagiário.', 'error');
        }

        if (newEnrollmentId) {
            const existingUser = Object.values(state.users || {}).find(u => u.username.toLowerCase() === newEnrollmentId.toLowerCase());
            if (existingUser && existingUser.id !== userToUpdate.id) {
                m.modal.querySelector('#label-enrollmentId').style.color = 'var(--danger)';
                return showToast('Erro: Esta matrícula já está em uso por outro usuário.', 'error');
            }
            userToUpdate.username = newEnrollmentId;
        }

        userToUpdate.name = m.modal.querySelector('#fullName').value;

        intern.registrationData = {
            fullName: m.modal.querySelector('#fullName').value,
            cpf: m.modal.querySelector('#cpf').value,
            birthDate: m.modal.querySelector('#birthDate').value,
            mainPhone: m.modal.querySelector('#mainPhone').value,
            mainPhoneCode: m.modal.querySelector('#mainPhoneCode').value,
            altPhone: m.modal.querySelector('#altPhone').value,
            altPhoneCode: m.modal.querySelector('#altPhoneCode').value,
            address: m.modal.querySelector('#address').value,
            instEmail: m.modal.querySelector('#instEmail').value,
            enrollmentId: newEnrollmentId,
            internshipHours: m.modal.querySelector('#internshipHours').value,
            internshipStartDate: m.modal.querySelector('#internshipStartDate').value,
            internshipEndDate: m.modal.querySelector('#internshipEndDate').value,
            emergencyContactName: m.modal.querySelector('#emergencyContactName').value,
            emergencyContactRelation: m.modal.querySelector('#emergencyContactRelation').value,
            emergencyContactPhone: m.modal.querySelector('#emergencyContactPhone').value,
            emergencyContactPhoneCode: m.modal.querySelector('#emergencyContactPhoneCode').value,
            emergencyContactWhatsapp: m.modal.querySelector('#emergencyContactWhatsapp').value,
            university: universitySelect.value,
            universityOther: m.modal.querySelector('#universityOther').value,
            currentSemester: m.modal.querySelector('#currentSemester').value,
            lastUpdatedAt: options.isAdminView
                ? intern.registrationData.lastUpdatedAt
                : new Date().toISOString()
        };

        await saveInternData(intern);
        await database.ref(`/appState/users/${userToUpdate.id}`).set(userToUpdate);
        showToast('Dados cadastrais atualizados com sucesso!', 'success');
        m.close();
        m.cleanup();

        render();
    });
}

// ABA CONTATOS
// --- FUNÇÃO ATUALIZADA ---
// Renderiza a seção "Contatos" com a lista de usuários
function renderContatosSection(container) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px';

    // HTML para os filtros e a lista (baseado no painel do admin)
    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Contatos</h3>
        </div>
        <div class="muted small" style="margin-bottom: 15px;">Lista de usuários do sistema para facilitar o contato.</div>

        <div style="padding: 12px; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 8px; display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; margin-bottom: 10px;">
            <div style="flex-grow: 1; min-width: 120px;">
                <label class="small-muted" for="contactFilterTipo">Tipo</label>
                <select id="contactFilterTipo" class="input">
                  <option value="all">Todos</option>
                  <option value="intern">Estagiário</option>
                  <option value="servidor">Servidor</option>
                  <option value="admin">Admin</option>
                </select>
            </div>
            <div style="flex-grow: 1; min-width: 120px;">
                <label class="small-muted" for="contactFilterSubtipo">Subtipo</label>
                <select id="contactFilterSubtipo" class="input">
                  <option value="all">Todos</option>
                  <option value="administrativo">Administrativo</option>
                  <option value="sessao">Sessão</option>
                </select>
            </div>
            <div style="flex-grow: 1; min-width: 120px;">
                <label class="small-muted" for="contactFilterLocalidade">Localidade</label>
                <select id="contactFilterLocalidade" class="input">
                  </select>
            </div>
            <button id="contactBtnClearFilters" class="button ghost"><i class="fas fa-eraser"></i> Limpar</button>
        </div>

        <input id="contactSearchMgmt" placeholder="Pesquisar por nome ou matrícula..." class="input" style="margin-bottom: 10px;" />
        
        <div class="muted small" style="margin-bottom: 10px;">Total de usuários: <span id="contactTotalUsers">0</span></div>
        
        <div class="list" id="contactsUserList" style="margin-top:10px; max-height: 400px; overflow-y: auto;">
            </div>
    `;

    container.appendChild(card);

    // Pega os elementos de filtro que acabamos de criar
    const filterTipo = card.querySelector('#contactFilterTipo');
    const filterSubtipo = card.querySelector('#contactFilterSubtipo');
    const filterLocalidade = card.querySelector('#contactFilterLocalidade');
    const searchInput = card.querySelector('#contactSearchMgmt');
    const clearButton = card.querySelector('#contactBtnClearFilters');

    // --- Lógica do filtro de localidade (copiada de view-manager-main.js e adaptada) ---
    // Guarda as opções originais para poder restaurá-las
    const allLocalidadeOptions = `
        <option value="all">Todos</option>
        <option value="administrativo">Administrativo</option>
        <option value="cartório">Cartório</option>
        <option value="gabinete">Gabinete</option>
        <option value="audiência">Audiência</option>
    `;
    filterLocalidade.innerHTML = allLocalidadeOptions; // Define o estado inicial

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
            filterLocalidade.innerHTML = allLocalidadeOptions;
        }
        filterLocalidade.value = 'all';
        renderContactsList(); // Atualiza a lista
    });
    // --- Fim da lógica do filtro ---

    // Adiciona os eventos para atualizar a lista quando os filtros mudarem
    filterTipo.addEventListener('change', renderContactsList);
    // O filtro de subtipo já chama renderContactsList
    filterLocalidade.addEventListener('change', renderContactsList);
    searchInput.addEventListener('input', renderContactsList);

    clearButton.addEventListener('click', () => {
        filterTipo.value = 'all';
        filterSubtipo.value = 'all';
        filterLocalidade.innerHTML = allLocalidadeOptions; // Restaura
        filterLocalidade.value = 'all';
        searchInput.value = '';
        renderContactsList();
    });

    // Renderiza a lista pela primeira vez
    renderContactsList();
}
// --- NOVA FUNÇÃO ---
// Esta função é chamada por renderContatosSection
function renderContactsList() {
    const container = document.getElementById('contactsUserList');
    if (!container) return; // Sai se a aba não estiver ativa

    // Pega os valores dos filtros da aba Contatos
    const q = document.getElementById('contactSearchMgmt').value.trim().toLowerCase();
    const filterTipo = document.getElementById('contactFilterTipo').value;
    const filterSubtipo = document.getElementById('contactFilterSubtipo').value;
    const filterLocalidade = document.getElementById('contactFilterLocalidade').value;
    const totalUsersSpan = document.getElementById('contactTotalUsers');

    container.innerHTML = '';

    // --- ALTERAÇÃO DA FONTE DE DADOS ---
    // Antes: let list = Object.values(state.users || {});
    // Agora: Lemos de state.publicContacts e usamos Object.entries()
    // para obter [ [uid1, contato1], [uid2, contato2], ... ]
    let list = Object.entries(state.publicContacts || {});

    // --- ATUALIZAÇÃO DA LÓGICA DE FILTRO ---
    // A sintaxe muda de 'u' para '[uid, u]' para desestruturar o array

    // 1. Filtro por Tipo
    if (filterTipo !== 'all') {
        list = list.filter(([uid, u]) => u.role === filterTipo);
    }

    // 2. Filtro por Subtipo
    if (filterSubtipo !== 'all') {
        list = list.filter(([uid, u]) => u.subType === filterSubtipo);
    }

    // 3. Filtro por Localidade
    if (filterLocalidade !== 'all') {
        list = list.filter(([uid, u]) => u.localidade === filterLocalidade);
    }

    // 4. Aplica busca por texto
    if (q) {
        list = list.filter(([uid, u]) =>
            (u.username || '').toLowerCase().includes(q) ||
            (u.name || '').toLowerCase().includes(q)
        );
    }

    if (totalUsersSpan) totalUsersSpan.textContent = list.length;

    // Ordena pelo nome (o 'u' está na segunda posição do array, índice 1)
    list.sort(([uidA, a], [uidB, b]) => (a.name || a.username).localeCompare(b.name || b.username));

    if (list.length === 0) {
        container.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">Nenhum usuário encontrado com esses filtros.</div>';
        return;
    }

    // --- ATUALIZAÇÃO DA LÓGICA DE RENDERIZAÇÃO ---
    // A sintaxe muda de 'u' para '[uid, u]'
    list.forEach(([uid, u]) => {
        const row = document.createElement('div');
        row.className = 'row';

        const displayName = `${escapeHtml(u.name)} (${escapeHtml(u.username)})`;
        let userDetails = '';
        const tipo = u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : 'N/A';
        const subtipo = u.subType ? (u.subType.charAt(0).toUpperCase() + u.subType.slice(1)) : 'N/A';
        const localidade = u.localidade ? (u.localidade.charAt(0).toUpperCase() + u.localidade.slice(1)) : 'N/A';

        if (u.role === 'admin') {
            userDetails = 'Admin';
        } else if (u.role === 'intern') {
            userDetails = `Estagiário • ${subtipo} • ${localidade}`;
        } else if (u.role === 'servidor') {
            userDetails = `Servidor • ${subtipo} • ${localidade}`;
        }

        const left = `<div><div style="font-weight:700">${displayName}</div><div class="muted small">${userDetails}</div></div>`;

        let whatsappButtonHtml = '';
        if (u.mainPhoneCode && u.mainPhone) {
            const fullNumber = `${u.mainPhoneCode}${u.mainPhone}`;
            const greeting = 'Olá!';
            const encodedMessage = encodeURIComponent(greeting);
            const whatsappUrl = `https://web.whatsapp.com/send?phone=${fullNumber}&text=${encodedMessage}`;
            const whatsappIconSvg = `<img src="https://images.seeklogo.com/logo-png/30/1/whatsapp-icon-logo-png_seeklogo-305567.png" width="20" height="20" style="vertical-align: middle;">`;

            whatsappButtonHtml = `
                <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="button ghost" title="Conversar no WhatsApp" style="padding: 6px 10px;">
                    ${whatsappIconSvg}
                </a>
            `;
        }

        // --- ATUALIZAÇÃO DO BOTÃO DE DETALHES ---
        // Passamos o 'uid' (a chave do Firebase) para o data-user-id
        const detailsButtonHtml = `
            <button class="button ghost contact-details-btn" data-user-id="${uid}" title="Ver detalhes de contato" style="padding: 6px 10px;">
                <i class="fas fa-phone-alt"></i>
            </button>
        `;

        const right = `<div style="display:flex;gap:8px;">${whatsappButtonHtml} ${detailsButtonHtml}</div>`;
        row.innerHTML = `${left}${right}`;
        container.appendChild(row);

        const detailsButton = row.querySelector('.contact-details-btn');
        if (detailsButton) {
            detailsButton.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.userId; // Agora 'userId' é o UID
                showContactDetailsModal(userId);
            });
        }
    });
}

// --- NOVA FUNÇÃO ---
/**
 * Mostra um modal com os detalhes de contato de um usuário específico
 * LENDO DO NÓ SEGURO 'publicContacts'
 */
function showContactDetailsModal(userId) {
    // --- ALTERAÇÃO DA FONTE DE DADOS ---
    // Antes: const user = (state.users || {})[userId];
    // Agora:
    const user = (state.publicContacts || {})[userId];

    if (!user) {
        showToast('Usuário não encontrado.', 'error');
        return;
    }

    // O restante da função permanece idêntico, pois
    // o objeto 'user' que pegamos de 'publicContacts'
    // já tem todos os dados que precisamos (name, role, subType, mainPhone, etc.)

    let subtype = user.subType ? (user.subType.charAt(0).toUpperCase() + user.subType.slice(1)) : 'N/A';
    let location = user.localidade ? (user.localidade.charAt(0).toUpperCase() + user.localidade.slice(1)) : 'N/A';
    let mainPhone = user.mainPhone;
    let altPhone = user.altPhone;
    let mainPhoneCode = user.mainPhoneCode || '55';
    let altPhoneCode = user.altPhoneCode || '55';

    let roleDisplay = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    if (user.role === 'intern') roleDisplay = 'Estagiário';
    if (user.role === 'servidor') roleDisplay = 'Servidor';
    if (user.role === 'admin') roleDisplay = 'Admin';

    let modalContentHtml = '<div style="margin-top: 15px; display: flex; flex-direction: column; gap: 10px;">';

    modalContentHtml += `
        <div style="display: flex; flex-wrap: wrap; gap: 10px; padding: 10px; background: var(--input-bg); border-radius: 8px;">
            <span class="detail-item" title="Tipo">
                <i class="fas fa-user"></i> ${escapeHtml(roleDisplay)}
            </span>
            <span class="detail-item" title="Subtipo">
                <i class="fas fa-tag"></i> ${escapeHtml(subtype)}
            </span>
            <span class="detail-item" title="Localidade">
                <i class="fas fa-map-marker-alt"></i> ${escapeHtml(location)}
            </span>
        </div>
    `;

    modalContentHtml += '<div style="display: flex; flex-direction: column; gap: 8px;">';

    let phoneInfoAdded = false;

    if (mainPhone) {
        modalContentHtml += `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: rgba(16, 185, 129, 0.05); border-radius: 6px;">
                <i class="fab fa-whatsapp fa-fw" style="color:var(--ok);"></i>
                <span class="small-muted">Principal:</span>
                <strong>+${mainPhoneCode} ${escapeHtml(mainPhone)}</strong>
            </div>
        `;
        phoneInfoAdded = true;
    }
    if (altPhone) {
        modalContentHtml += `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--input-bg); border-radius: 6px;">
                <i class="fas fa-phone fa-fw" style="color:var(--muted);"></i>
                <span class="small-muted">Alternativo:</span>
                <strong>+${altPhoneCode} ${escapeHtml(altPhone)}</strong>
            </div>
        `;
        phoneInfoAdded = true;
    }

    if (!phoneInfoAdded && (user.role === 'intern' || user.role === 'servidor')) {
        modalContentHtml += '<div class="muted small" style="text-align:center; padding: 10px;">Nenhum telefone cadastrado para este usuário.</div>';
    }

    modalContentHtml += '</div>';
    modalContentHtml += '</div>';

    const fullModalHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h3><i class="fas fa-address-card" style="color:var(--accent); margin-right: 8px;"></i> ${escapeHtml(user.name || user.username)}</h3>
            <button id="closeContactDetails" class="button ghost"><i class="fas fa-times"></i> Fechar</button>
        </div>
        ${modalContentHtml}
    `;

    const m = showModal(fullModalHtml, { allowBackdropClose: true });

    m.modal.querySelector('#closeContactDetails').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });
}
