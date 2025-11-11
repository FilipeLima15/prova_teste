/* view-manager-users.js - Gerenciamento de usuários, estagiários e pré-cadastros */

import { escapeHtml, formatDate, uuid, timestamp } from './utils.js';
import { showModal, showDeleteConfirmationModal } from './ui-modals.js';
import { showHourEntryForm, showRegistrationDataModal, markCompensated } from './view-intern.js';
// NOVO: Importa a função findServerById para podermos encontrar os dados de um servidor
// ALTERADO: Importa formatDate diretamente
// MODIFICADO: Importa 'auth' do firebase
import { state, session, save, render, findUserByIntern, findInternById, findServerById, hasPower, defaultPowersFor, showToast } from './app.js';
import { auth } from './firebase-config.js';

// Variável para armazenar dados de importação em lote
let importedUserData = [];

// ========== RENDERIZAÇÃO E LISTAGEM DE USUÁRIOS ==========

export function renderUsersList() {
    const q = document.getElementById('searchMgmt').value.trim().toLowerCase();
    const container = document.getElementById('usersList');
    container.innerHTML = '';

    // MODIFICADO: Converte o objeto de usuários em um array para filtrar
    let list = Object.values(state.users || {}).filter(u => u.role !== 'super');

    const filterTipo = document.getElementById('filterTipo')?.value || 'all';
    const filterSubtipo = document.getElementById('filterSubtipo')?.value || 'all';
    const filterLocalidade = document.getElementById('filterLocalidade')?.value || 'all';

    // 1. Filtro por Tipo
    if (filterTipo !== 'all') {
        if (filterTipo === 'intern') {
            list = list.filter(u => u.role === 'intern');
        } else {
            list = list.filter(u => u.role === filterTipo);
        }
    }

    // 2. Filtro por Subtipo
    if (filterSubtipo !== 'all') {
        list = list.filter(u => {
            if (u.role === 'intern') {
                const intern = findInternById(u.internId);
                return intern && intern.subType === filterSubtipo;
            }
            if (u.role === 'servidor') {
                const server = findServerById(u.serverId);
                return server && server.subType === filterSubtipo;
            }
            return false;
        });
    }

    // 3. Filtro por Localidade
    if (filterLocalidade !== 'all') {
        list = list.filter(u => {
            if (u.role === 'intern') {
                const intern = findInternById(u.internId);
                return intern && intern.localidade === filterLocalidade;
            }
            if (u.role === 'servidor') {
                const server = findServerById(u.serverId);
                return server && server.localidade === filterLocalidade;
            }
            return false;
        });
    }

    // Aplica busca por texto
    if (q) {
        list = list.filter(u =>
            (u.username || '').toLowerCase().includes(q) || // username (email)
            (u.name || '').toLowerCase().includes(q) ||
            (u.registrationData?.enrollmentId || '').toLowerCase().includes(q) // matrícula
        );
    }

    document.getElementById('totalUsers').textContent = list.length;
    list.sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));

    // MODIFICADO: Busca o usuário logado pelo UID
    const currentUser = (state.users || {})[session.userId];
    const canDelete = hasPower(currentUser, 'delete_user');

    const selectAllCheckbox = document.getElementById('selectAllUsersCheckbox');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;

    list.forEach(u => {
        const row = document.createElement('div');
        row.className = 'row user-row-selectable';

        const delegatedIndicator = u.delegatedAdmin?.enabled ? '🧑‍💼 ' : '';
        // MODIFICADO: O 'username' agora é o email
        let displayName = `${delegatedIndicator}${escapeHtml(u.name)} (${escapeHtml(u.username)})`;

        let userDetails = '';
        const dataCriacao = formatDate(u.createdAt);

        if (u.role === 'admin') {
            userDetails = `Admin • (${dataCriacao})`;
        } else if (u.role === 'intern') {
            const intern = findInternById(u.internId);
            const tipo = 'Estagiário';
            const subtipo = intern?.subType ? (intern.subType.charAt(0).toUpperCase() + intern.subType.slice(1)) : 'N/A';
            const localidade = intern?.localidade ? (intern.localidade.charAt(0).toUpperCase() + intern.localidade.slice(1)) : 'N/A';
            // Tenta exibir a matrícula se existir
            const matricula = intern?.registrationData?.enrollmentId ? ` • ${escapeHtml(intern.registrationData.enrollmentId)}` : '';
            userDetails = `${tipo} • ${subtipo} • ${localidade} (${dataCriacao})${matricula}`;
        } else if (u.role === 'servidor') {
            const server = findServerById(u.serverId);
            const tipo = 'Servidor';
            const subtipo = server?.subType ? (server.subType.charAt(0).toUpperCase() + server.subType.slice(1)) : 'N/A';
            const localidade = server?.localidade ? (server.localidade.charAt(0).toUpperCase() + server.localidade.slice(1)) : 'N/A';
            const matricula = server?.registrationData?.enrollmentId ? ` • ${escapeHtml(server.registrationData.enrollmentId)}` : '';
            userDetails = `${tipo} • ${subtipo} • ${localidade} (${dataCriacao})${matricula}`;
        }

        // MODIFICADO: o data-user-id agora é o UID
        const checkboxHtml = canDelete
            ? `<input type="checkbox" data-user-id="${u.id}" class="user-select-checkbox" />`
            : '<div class="icon-placeholder"></div>';

        const left = `<div><div style="font-weight:700">${displayName}</div><div class="muted small">${userDetails}</div></div>`;

        let whatsappButtonHtml = '';
        if (u.role === 'intern') {
            const intern = findInternById(u.internId);
            if (intern && intern.registrationData && intern.registrationData.mainPhoneCode && intern.registrationData.mainPhone) {
                const fullNumber = `${intern.registrationData.mainPhoneCode}${intern.registrationData.mainPhone}`;

                const currentHour = new Date().getHours();
                let greeting = 'Boa noite';
                if (currentHour >= 5 && currentHour < 12) {
                    greeting = 'Bom dia';
                } else if (currentHour >= 12 && currentHour < 18) {
                    greeting = 'Boa tarde';
                }

                const userName = escapeHtml(u.name || '');
                const message = `${greeting} ${userName}!`;
                const encodedMessage = encodeURIComponent(message);

                const whatsappUrl = `https://web.whatsapp.com/send?phone=${fullNumber}&text=${encodedMessage}`;

                const whatsappIconSvg = `
                <img src="https://images.seeklogo.com/logo-png/30/1/whatsapp-icon-logo-png_seeklogo-305567.png"
                    width="20" height="20" style="vertical-align: middle;">
                `;

                whatsappButtonHtml = `
                    <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="button ghost" title="Conversar no WhatsApp" style="padding: 6px 10px;">
                        ${whatsappIconSvg}
                    </a>
                `;
            }
        }

        const right = `
            <div style="display:flex;gap:8px;">
                ${whatsappButtonHtml}
                <button class="button ghost" data-view-id="${u.id}"><i class="fas fa-eye"></i> Abrir</button>
            </div>
        `;

        row.innerHTML = `${checkboxHtml}${left}${right}`;
        container.appendChild(row);

        row.querySelector('[data-view-id]').addEventListener('click', () => openUserManagerView(u.id));


        if (canDelete) {
            const userCheckbox = row.querySelector('.user-select-checkbox');
            userCheckbox.addEventListener('change', () => {
                updateBulkDeleteButtonState();
                const allCheckboxes = document.querySelectorAll('#usersList .user-select-checkbox');
                const allChecked = Array.from(allCheckboxes).every(cb => cb.checked) && allCheckboxes.length > 0;
                if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
            });
        }
    });

    updateBulkDeleteButtonState();
}

export function updateBulkDeleteButtonState() {
    const selectedCount = document.querySelectorAll('#usersList .user-select-checkbox:checked').length;
    const button = document.getElementById('btnDeleteSelectedUsers');
    // MODIFICADO: Busca o usuário logado pelo UID
    const currentUser = (state.users || {})[session.userId];
    const canDelete = hasPower(currentUser, 'delete_user');

    if (button) {
        button.textContent = `Excluir (${selectedCount})`;
        button.disabled = selectedCount === 0 || !canDelete;
    }
}

export async function deleteSelectedUsers() {
    const checkboxes = document.querySelectorAll('#usersList .user-select-checkbox:checked');
    // MODIFICADO: idsToDelete agora são UIDs
    const idsToDelete = Array.from(checkboxes).map(cb => cb.dataset.userId);
    const currentUser = (state.users || {})[session.userId];

    if (idsToDelete.length === 0) return showToast('Selecione perfis para excluir.', 'warning');
    if (!hasPower(currentUser, 'delete_user')) return showToast('Sem permissão.', 'error');

    // MODIFICADO: Busca o super admin pelo objeto
    const superAdmin = Object.values(state.users || {}).find(u => u.role === 'super');
    const finalIdsToDelete = idsToDelete.filter(id => id !== superAdmin.id);

    if (finalIdsToDelete.length !== idsToDelete.length) {
        showToast('O Administrador Principal não pode ser excluído.', 'error');
    }

    if (finalIdsToDelete.length === 0) return;

    const onConfirm = async () => {
        // MODIFICADO: Busca o manager pelo UID
        const manager = (state.users || {})[session.userId];
        const deletedAt = timestamp();

        // MODIFICADO: Filtra o objeto de usuários
        const usersToProcess = Object.values(state.users || {}).filter(u => finalIdsToDelete.includes(u.id));

        for (const userToDelete of usersToProcess) {
            let relatedDataName = null;
            if (userToDelete.internId) {
                relatedDataName = findInternById(userToDelete.internId)?.name;
            } else if (userToDelete.serverId) {
                relatedDataName = findServerById(userToDelete.serverId)?.name;
            }

            (state.trash || []).push({
                id: uuid(),
                type: 'user',
                userId: userToDelete.id, // Este é o UID
                username: userToDelete.username, // Este é o Email
                role: userToDelete.role,
                internId: userToDelete.internId,
                serverId: userToDelete.serverId,
                internName: relatedDataName,
                deletedAt,
                createdAt: userToDelete.createdAt
            });

            const detailsText = `Excluiu o perfil de ${userToDelete.role} '${escapeHtml(userToDelete.name || userToDelete.username)}' (${escapeHtml(userToDelete.username)}).`;
            const contextText = relatedDataName ? `${userToDelete.role}: ${relatedDataName}` : 'Gerenciamento de Usuários';

            (state.systemLog || []).push({
                id: uuid(),
                action: 'delete_user',
                byUserId: manager.id,
                byUserName: manager.username,
                at: deletedAt,
                details: detailsText,
                context: contextText
            });

            // MODIFICADO: Deleta do objeto de usuários usando o UID
            delete state.users[userToDelete.id];
        }

        // A lógica de remoção de interns/servers permanece a mesma
        state.interns = (state.interns || []).filter(i => !usersToProcess.some(u => u.internId === i.id));
        state.servers = (state.servers || []).filter(s => !usersToProcess.some(u => u.serverId === s.id));

        await save(state);
        showToast(`${finalIdsToDelete.length} perfil(s) movidos para a lixeira.`, 'success');
        render();

        // ATENÇÃO: A exclusão da conta no Firebase Authentication
        // é um processo complexo (requer Admin SDK no backend)
        // e não está implementada aqui. Os usuários excluídos
        // ainda poderão se logar, mas o app os deslogará
        // pois não encontrarão perfil no Realtime DB.
        showToast('AVISO: As contas de Auth destes usuários precisam ser excluídas manualmente no painel do Firebase.', 'warning');
    };

    showDeleteConfirmationModal(onConfirm, finalIdsToDelete.length);
}

// ========== BUSCA DE ESTAGIÁRIOS POR NOME ==========

export function renderNameDropdown(q) {
    const dropdown = document.getElementById('mgrNameDropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';

    if (!q || q.length < 1) {
        dropdown.style.display = 'none';
        return;
    }

    const matches = (state.interns || [])
        .filter(i => i.name.toLowerCase().includes(q))
        .slice(0, 50);

    if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    matches.forEach(it => {
        const item = document.createElement('div');
        item.style.padding = '8px';
        item.style.cursor = 'pointer';
        item.innerHTML = `<div style="font-weight:700">${escapeHtml(it.name)}</div><div class="muted small">${it.id}</div>`;
        item.addEventListener('click', () => {
            document.getElementById('mgrNameDropdown').style.display = 'none';
            document.getElementById('mgrNameSearch').value = '';
            openUserManagerView(findUserByIntern(it.id)?.id);
        });
        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

// ========== CRIAÇÃO DE USUÁRIOS (GRANDES MUDANÇAS) ==========

// NOVO: Função helper para criar o usuário no Firebase Auth
// Esta é uma função "Admin" que só funciona no backend, mas aqui
// estamos simulando-a. Em um app real, isso seria uma 'Cloud Function'.
// Como estamos burlando isso, o admin terá que criar o usuário no Auth manualmente
// E depois criar o perfil no DB.
//
// VAMOS MUDAR A LÓGICA: O Admin não vai mais *criar* a conta Auth.
// Ele vai *aprovar* o pré-cadastro, que já contém o email/senha.

export function showCreateUserForm(currentManager) {
    if (!hasPower(currentManager, 'create_intern') && currentManager.role !== 'super') {
        return showToast('Sem permissão.', 'error');
    }

    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>Criar usuário (Manual)</h3>
        <button id="closeC" class="button ghost">Fechar</button>
    </div>
    <form id="formCreate" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      
      <div class="card" style="background: var(--warning-light); border-color: var(--warning);">
        <strong>Atenção:</strong> A criação manual de usuários agora é um processo de 2 etapas:
        <ol style="margin: 5px 0 0 20px; font-size: 0.9em;">
            <li>Crie o usuário (com Email/Senha) no painel do <strong>Firebase Authentication</strong> primeiro.</li>
            <li>Copie o <strong>User UID</strong> gerado lá e cole no campo abaixo.</li>
        </ol>
        <p style="font-size: 0.9em;">Recomenda-se usar o sistema de <strong>Pré-Cadastro</strong>, que é mais simples.</p>
      </div>

      <label><span class="small-muted">Tipo</span>
        <select id="newType">
          <option value="intern">Estagiário</option>
          <option value="servidor">Servidor</option>
          <option value="admin">Admin secundário</option>
        </select>
      </label>
      
      <div id="internFields">
        <label><span class="small-muted">Subtipo</span>
          <select id="newSubType">
            <option value="sessao">Sessão</option>
            <option value="administrativo">Administrativo</option>
          </select>
        </label>
        
        <label id="localidadeWrapper" style="display:none;"><span class="small-muted">Localidade</span>
          <select id="newLocalidade">
          </select>
        </label>
      </div>
      
      <label id="labelNewName">
        <span class="small-muted">Nome completo *</span>
        <input id="newName" required/>
      </label>
      
      <label id="labelNewUser">
        <span class="small-muted">Email de Login (deve ser idêntico ao do Firebase Auth) *</span>
        <input id="newUser" type="email" required/>
      </label>

      <label id="labelNewUID">
        <span class="small-muted">User UID (copiado do Firebase Auth) *</span>
        <input id="newUID" required placeholder="Ex: a1b2c3d4e5..."/>
      </label>
      
      <div id="adminPowers" style="display:none">
        <div class="small-muted" style="margin-bottom: 8px;">Poderes do admin</div>
        <div class="form-check-group">
          <label class="form-check"><input type="checkbox" id="p_create"/> Criar estagiários</label>
          <label class="form-check"><input type="checkbox" id="p_edit"/> Editar usuários</label>
          <label class="form-check"><input type="checkbox" id="p_delete"/> Excluir usuários</label>
          <label class="form-check"><input type="checkbox" id="p_reset"/> Resetar senhas (REMOVIDO)</label>
          <label class="form-check"><input type="checkbox" id="p_manage"/> Gerenciar horas</label>
          <label class="form-check"><input type="checkbox" id="p_provas"/> Gerenciar folgas provas</label>
          <label class="form-check">
            <input type="checkbox" id="p_delegate" ${currentManager.role !== 'super' ? 'disabled' : ''}/>
            Delegar admins
          </label>
        </div>
      </div>
      
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button"><i class="fas fa-plus"></i> Criar Perfil no DB</button>
      </div>
    </form>
    `;

    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#closeC').addEventListener('click', () => { m.close(); m.cleanup(); });

    const newTypeSelect = m.modal.querySelector('#newType');
    const newSubTypeSelect = m.modal.querySelector('#newSubType');
    const localidadeWrapper = m.modal.querySelector('#localidadeWrapper');
    const localidadeSelect = m.modal.querySelector('#newLocalidade');

    // REMOVIDO: Toggle de senha

    const updateLocalidadeOptions = () => {
        const tipo = newTypeSelect.value;
        const subtipo = newSubTypeSelect.value;
        let options = [];

        if ((tipo === 'intern' || tipo === 'servidor') && subtipo === 'sessao') {
            options = ['Administrativo', 'Audiência'];
        } else if (tipo === 'servidor' && subtipo === 'administrativo') {
            options = ['Cartório', 'Gabinete'];
        } else if (tipo === 'intern' && subtipo === 'administrativo') {
            options = ['Cartório'];
        }

        if (options.length > 0) {
            localidadeSelect.innerHTML = options.map(opt => `<option value="${opt.toLowerCase()}">${opt}</option>`).join('');
            localidadeWrapper.style.display = 'block';
        } else {
            localidadeWrapper.style.display = 'none';
        }
    };

    // REMOVIDA: Lógica do 'idTypeSelect' (CPF/Matrícula)

    newTypeSelect.addEventListener('change', () => {
        const tipo = newTypeSelect.value;
        const isInternOrServidor = tipo === 'intern' || tipo === 'servidor';

        m.modal.querySelector('#internFields').style.display = isInternOrServidor ? 'block' : 'none';
        m.modal.querySelector('#adminPowers').style.display = tipo === 'admin' ? 'block' : 'none';

        if (tipo === 'admin') {
            const defaultAdminPowers = defaultPowersFor('admin');
            m.modal.querySelector('#p_create').checked = defaultAdminPowers.create_intern;
            m.modal.querySelector('#p_edit').checked = defaultAdminPowers.edit_user;
            m.modal.querySelector('#p_delete').checked = defaultAdminPowers.delete_user;
            m.modal.querySelector('#p_reset').checked = false; // Removido
            m.modal.querySelector('#p_reset').parentElement.style.textDecoration = 'line-through';
            m.modal.querySelector('#p_manage').checked = defaultAdminPowers.manage_hours;
            m.modal.querySelector('#p_provas').checked = defaultAdminPowers.manage_provas;
            m.modal.querySelector('#p_delegate').checked = false;
        }
        updateLocalidadeOptions();
    });

    newSubTypeSelect.addEventListener('change', updateLocalidadeOptions);
    // REMOVIDO: Listener do idTypeSelect

    m.modal.querySelector('#formCreate').addEventListener('submit', async (ev) => {
        ev.preventDefault();

        const type = m.modal.querySelector('#newType').value;
        const name = m.modal.querySelector('#newName').value.trim();
        const email = m.modal.querySelector('#newUser').value.trim(); // Email
        const uid = m.modal.querySelector('#newUID').value.trim(); // UID do Auth

        if (!name || !email || !uid) return showToast('Nome, Email e UID são obrigatórios', 'warning');

        // REMOVIDO: Leitura de senha
        const manager = (state.users || {})[session.userId];
        const creationDate = timestamp();

        if (state.users[uid]) {
            return showToast(`O usuário com UID '${uid}' já existe no banco de dados.`, 'warning');
        }

        // Prepara o objeto do novo usuário
        let newUserProfile = {
            id: uid,
            username: email, // 'username' agora é o email
            name: name,
            // REMOVIDA: 'password'
            role: type,
            selfPasswordChange: true,
            createdAt: creationDate
        };

        if (type === 'intern') {
            const subType = newSubTypeSelect.value;
            const localidade = localidadeWrapper.style.display !== 'none' ? localidadeSelect.value : null;

            const internId = uuid();
            (state.interns || []).push({ id: internId, name, subType, localidade, dates: [], hoursEntries: [], auditLog: [], registrationData: { enrollmentId: '' } });

            newUserProfile.internId = internId;
            newUserProfile.powers = defaultPowersFor('intern');

        } else if (type === 'servidor') {
            const subType = newSubTypeSelect.value;
            const localidade = localidadeWrapper.style.display !== 'none' ? localidadeSelect.value : null;

            const serverId = uuid();
            (state.servers || []).push({ id: serverId, name, subType, localidade });

            newUserProfile.serverId = serverId;
            newUserProfile.powers = defaultPowersFor('servidor');

        } else { // admin
            const powers = {
                create_intern: m.modal.querySelector('#p_create').checked,
                edit_user: m.modal.querySelector('#p_edit').checked,
                delete_user: m.modal.querySelector('#p_delete').checked,
                reset_password: false, // Removido
                manage_hours: m.modal.querySelector('#p_manage').checked,
                manage_provas: m.modal.querySelector('#p_provas').checked,
                delegate_admins: m.modal.querySelector('#p_delegate').checked && currentManager.role === 'super'
            };
            newUserProfile.powers = powers;
        }

        // MODIFICADO: Salva o usuário no objeto usando o UID como chave
        state.users[uid] = newUserProfile;

        await save(state);
        showToast('Perfil de usuário criado no banco de dados!', 'success');
        m.close();
        m.cleanup();
        render();
    });

    newTypeSelect.dispatchEvent(new Event('change'));
}

// ========== EDIÇÃO DE USUÁRIOS ==========
export function showEditUserForm(userId) {
    // MODIFICADO: Busca o usuário pelo UID
    const u = (state.users || {})[userId];
    if (!u) return;

    // MODIFICADO: Busca o manager pelo UID
    const currentManager = (state.users || {})[session.userId];
    if (u.id !== currentManager.id && !hasPower(currentManager, 'edit_user')) return showToast('Sem permissão', 'error');
    if (u.role === 'super' && currentManager.role !== 'super') return showToast('Apenas o Super Admin pode se editar.', 'error');

    const canEditPowers = currentManager.role === 'super' && u.role === 'admin';
    let specificFieldsHtml = '';

    if (u.role === 'intern') {
        const intern = findInternById(u.internId);
        if (intern) {
            specificFieldsHtml = `
                <label><span class="small-muted">Tipo</span><input value="Estagiário" class="input" disabled /></label>
                <label><span class="small-muted">Subtipo</span>
                    <select id="editSubType" class="input">
                        <option value="sessao" ${intern.subType === 'sessao' ? 'selected' : ''}>Sessão</option>
                        <option value="administrativo" ${intern.subType === 'administrativo' ? 'selected' : ''}>Administrativo</option>
                    </select>
                </label>
                <label id="editLocalidadeWrapper" style="display:none;"><span class="small-muted">Localidade</span><select id="editLocalidade" class="input"></select></label>
            `;
        }
    } else if (u.role === 'servidor') {
        const server = findServerById(u.serverId);
        if (server) {
            specificFieldsHtml = `
                <label><span class="small-muted">Tipo</span><input value="Servidor" class="input" disabled /></label>
                <label><span class="small-muted">Subtipo</span>
                    <select id="editSubType" class="input">
                        <option value="sessao" ${server.subType === 'sessao' ? 'selected' : ''}>Sessão</option>
                        <option value="administrativo" ${server.subType === 'administrativo' ? 'selected' : ''}>Administrativo</option>
                    </select>
                </label>
                <label id="editLocalidadeWrapper" style="display:none;"><span class="small-muted">Localidade</span><select id="editLocalidade" class="input"></select></label>
            `;
        }
    } else if (u.role === 'admin') {
        specificFieldsHtml = `
            <div id="adminPowersEdit" style="margin-top:15px; border-top: 1px solid #eee; padding-top: 10px;">
              <div class="small-muted" style="margin-bottom: 8px;">Poderes do Admin</div>
              <div class="form-check-group">
                <label class="form-check"><input type="checkbox" id="p_create_edit" ${u.powers.create_intern ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Criar estagiários</label>
                <label class="form-check"><input type="checkbox" id="p_edit_edit" ${u.powers.edit_user ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Editar usuários</label>
                <label class="form-check"><input type="checkbox" id="p_delete_edit" ${u.powers.delete_user ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Excluir usuários</label>
                <label class="form-check" style="text-decoration: line-through;"><input type="checkbox" id="p_reset_edit" disabled/> Resetar senhas</label>
                <label class="form-check"><input type="checkbox" id="p_manage_edit" ${u.powers.manage_hours ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Gerenciar horas</label>
                <label class="form-check"><input type="checkbox" id="p_provas_edit" ${u.powers.manage_provas ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Gerenciar folgas</label>
                <label class="form-check"><input type="checkbox" id="p_delegate_edit" ${u.powers.delegate_admins ? 'checked' : ''} ${currentManager.role === 'super' && u.role !== 'super' ? '' : 'disabled'}/> Delegar admins</label>
              </div>
            </div>`;
    }

    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>Editar usuário</h3>
        <div>
            <button id="btnBackToUserManagement" class="button ghost">Voltar</button>
            <button id="closeE" class="button ghost">Fechar</button>
        </div>
    </div>
    <form id="formEdit" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      <label><span class="small-muted">Nome completo</span><input id="editName" value="${escapeHtml(u.name || '')}" required/></label>
      
      <label><span class="small-muted">Email (Login)</span>
        <input id="editUser" value="${escapeHtml(u.username)}" required disabled style="background: var(--input-bg); color: var(--muted); cursor: not-allowed;"/>
        <div class="small-muted" style="font-size: 0.8em; margin-top: 2px;">O Email de login não pode ser alterado por aqui. Use o painel do Firebase Auth.</div>
      </label>
      
      ${specificFieldsHtml}
      
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="submit" class="button"><i class="fas fa-save"></i> Salvar</button></div>
    </form>
    `;

    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#closeE').addEventListener('click', () => { m.close(); m.cleanup(); });

    m.modal.querySelector('#btnBackToUserManagement').addEventListener('click', () => {
        m.close();
        m.cleanup();
        openUserManagerView(userId);
    });

    if (u.role === 'intern' || u.role === 'servidor') {
        const editSubTypeSelect = m.modal.querySelector('#editSubType');
        const editLocalidadeWrapper = m.modal.querySelector('#editLocalidadeWrapper');
        const editLocalidadeSelect = m.modal.querySelector('#editLocalidade');
        const relatedObject = u.role === 'intern' ? findInternById(u.internId) : findServerById(u.serverId);

        const updateEditLocalidadeOptions = () => {
            const tipo = u.role;
            const subtipo = editSubTypeSelect.value;
            let options = [];

            if ((tipo === 'intern' || tipo === 'servidor') && subtipo === 'sessao') {
                options = ['Administrativo', 'Audiência'];
            } else if (tipo === 'servidor' && subtipo === 'administrativo') {
                options = ['Cartório', 'Gabinete'];
            } else if (tipo === 'intern' && subtipo === 'administrativo') {
                options = ['Cartório'];
            }

            if (options.length > 0) {
                editLocalidadeSelect.innerHTML = options.map(opt => `<option value="${opt.toLowerCase()}">${opt}</option>`).join('');
                if (relatedObject.localidade) editLocalidadeSelect.value = relatedObject.localidade;
                editLocalidadeWrapper.style.display = 'block';
            } else {
                editLocalidadeWrapper.style.display = 'none';
            }
        };

        editSubTypeSelect.addEventListener('change', updateEditLocalidadeOptions);
        updateEditLocalidadeOptions();
    }

    m.modal.querySelector('#formEdit').addEventListener('submit', async (ev) => {
        ev.preventDefault();

        u.name = m.modal.querySelector('#editName').value.trim();
        // REMOVIDO: Edição do username (email)
        // REMOVIDO: Edição do selfPasswordChange

        if (u.role === 'intern') {
            const intern = findInternById(u.internId);
            if (intern) {
                intern.name = u.name;
                intern.subType = m.modal.querySelector('#editSubType').value;
                intern.localidade = m.modal.querySelector('#editLocalidadeWrapper').style.display !== 'none' ? m.modal.querySelector('#editLocalidade').value : null;
            }
        } else if (u.role === 'servidor') {
            const server = findServerById(u.serverId);
            if (server) {
                server.name = u.name;
                server.subType = m.modal.querySelector('#editSubType').value;
                server.localidade = m.modal.querySelector('#editLocalidadeWrapper').style.display !== 'none' ? m.modal.querySelector('#editLocalidade').value : null;
            }
        } else if (u.role === 'admin' && canEditPowers) {
            u.powers.create_intern = !!m.modal.querySelector('#p_create_edit').checked;
            u.powers.edit_user = !!m.modal.querySelector('#p_edit_edit').checked;
            u.powers.delete_user = !!m.modal.querySelector('#p_delete_edit').checked;
            // u.powers.reset_password (removido)
            u.powers.manage_hours = !!m.modal.querySelector('#p_manage_edit').checked;
            u.powers.manage_provas = !!m.modal.querySelector('#p_provas_edit').checked;
            if (currentManager.role === 'super') u.powers.delegate_admins = !!m.modal.querySelector('#p_delegate_edit').checked;
        }

        // MODIFICADO: Salva o usuário no objeto state.users usando o UID
        state.users[u.id] = u;

        await save(state);
        showToast('Atualizado', 'success');
        render();
        m.close();
        m.cleanup();
        openUserManagerView(userId);
    });
}

// ========== IMPORTAÇÃO EM LOTE (DESABILITADO) ==========
// MODIFICADO: Esta função agora explica por que o recurso foi desabilitado.
export function showBulkImportModal() {
    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>CRIAR USUÁRIOS EM LOTE (ESTAGIÁRIO)</h3>
            <button id="closeBulkImport" class="button ghost">Cancelar</button>
        </div>
        
        <div class="card" style="margin-top:10px; padding: 15px; background: var(--warning-light); border-color: var(--warning); border-width: 2px;">
            <h4>Recurso Desabilitado Temporariamente</h4>
            <div class="muted small" style="line-height: 1.5;">
                Com o novo sistema de segurança, a criação de usuários em lote tornou-se um processo complexo que exige a criação de contas no <strong>Firebase Authentication</strong> (o que não pode ser feito em massa por aqui).
                <br><br>
                Por favor, use o sistema de <strong>"Pré-Cadastro"</strong> (na tela de login) ou a <strong>"Criação Manual de Usuário"</strong> (requer que você crie a conta no Firebase Auth manualmente primeiro).
            </div>
        </div>
    `;

    const m = showModal(html, { allowBackdropClose: true });
    m.modal.querySelector('#closeBulkImport').addEventListener('click', () => { m.close(); m.cleanup(); });
}

// Esta função permanece, mas não será chamada.
export function validateExcelData(sheetData) {
    const validUsers = [];
    // MODIFICADO: Checa emails (username) no objeto
    const existingUsernames = new Set(Object.values(state.users || {}).map(u => u.username.toLowerCase()));
    const dataRows = sheetData.slice(1);

    dataRows.forEach((row, index) => {
        if (!row || row.filter(cell => String(cell).trim() !== '').length === 0) return;

        const name = String(row[0] || '').trim();
        const username = String(row[1] || '').trim().toLowerCase(); // No formato antigo, isso era matrícula
        // ... (lógica antiga de validação)

        // A lógica antiga de validação de matrícula não se aplica mais ao login por email
        // Deixaremos a função aqui, mas ela não é mais compatível.
    });

    return validUsers;
}

// ========== VISUALIZAÇÃO DETALHADA DE USUÁRIO ==========
// ========== MODAL DE GERENCIAMENTO COM SISTEMA DE ABAS ==========

export function showManagementOptionsModal(user, options = {}) {
    const intern = findInternById(user.internId);
    if (!intern) return;

    // MODIFICADO: Busca manager pelo UID
    const currentManager = (state.users || {})[session.userId];
    const initialTab = options.initialTab || 'vacation';

    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>Gerenciar: ${escapeHtml(intern.name)}</h3>
      <div>
        <button class="button ghost" id="btnBackToUserManagement">Voltar</button>
        <button class="button ghost" id="btnCloseManagement">Fechar</button>
      </div>
    </div>
    
    <div class="tabs" style="margin-top: 15px; position: relative;">
        <button class="tab-button ${initialTab === 'vacation' ? 'active' : ''}" data-tab="vacation"><i class="fas fa-umbrella-beach"></i> Férias</button>
        <button class="tab-button" data-tab="medicalLeave"><i class="fas fa-notes-medical"></i> Licença Médica</button>
        
        ${hasPower(currentManager, 'manage_provas') ? `<button class="tab-button ${initialTab === 'provas' ? 'active' : ''}" data-tab="provas"><i class="fas fa-calendar-check"></i> Folgas provas</button>` : ''}
        ${hasPower(currentManager, 'manage_hours') ? `<button class="tab-button ${initialTab === 'hours' ? 'active' : ''}" data-tab="hours"><i class="fas fa-clock"></i> Banco de horas</button>` : ''}

        <div class="tab-dropdown-container">
            <button class="tab-button" id="btnMoreTab" style="gap: 6px;">
                <i class="fas fa-ellipsis-h"></i> Mais
            </button>
            <div class="tab-dropdown-menu" id="moreTabDropdown" style="left: auto; right: 0;"> <div class="tab-dropdown-item" data-tab="npj">
                    <i class="fas fa-balance-scale"></i>
                    <span title="Núcleo de Prática Jurídica">NPJ</span>
                </div>
                <div class="tab-dropdown-item" data-tab="oae">
                    <i class="fas fa-exclamation-circle"></i>
                    <span title="Outros Afastamentos Estagiário">OAE</span>
                </div>
            </div>
        </div>
        </div>
    
    <div id="tab-content" style="margin-top: 20px; max-height: 60vh; overflow-y: auto; padding-right: 15px;"></div>
    `;

    const m = showModal(html, { allowBackdropClose: false });

    // ... (O restante desta função e suas sub-funções (renderTabContent, renderNpjTab, renderOaeTab, renderVacationTab, renderMedicalLeaveTab, renderProvasTab, renderHoursTab) não precisam de alteração, pois elas operam no 'intern' ou 'user' que já foi encontrado corretamente.)
    // --- NENHUMA ALTERAÇÃO NECESSÁRIA DA LINHA 641 ATÉ A 1916 (renderHoursTab) ---

    // Sistema de troca de abas (COM LÓGICA DE DROPDOWN)
    const allTabs = m.modal.querySelectorAll('.tab-button'); // Inclui o "Mais"
    const standardTabs = m.modal.querySelectorAll('.tab-button[data-tab]');
    const moreTabButton = m.modal.querySelector('#btnMoreTab');
    const moreTabDropdown = m.modal.querySelector('#moreTabDropdown');
    const dropdownItems = m.modal.querySelectorAll('.tab-dropdown-item');

    const closeDropdown = () => moreTabDropdown.classList.remove('show');

    // 1. Cliques nas abas padrão (Férias, Licença, Folgas, Horas)
    standardTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            allTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            closeDropdown();

            const tabType = tab.dataset.tab;
            renderTabContent(tabType, intern, user, m);
        });
    });

    // 2. Clique no botão "Mais"
    if (moreTabButton) {
        moreTabButton.addEventListener('click', (e) => {
            e.stopPropagation();
            moreTabDropdown.classList.toggle('show');
        });
    }

    // 3. Cliques nos itens do dropdown (NPJ, OAE)
    dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
            allTabs.forEach(t => t.classList.remove('active'));
            moreTabButton.classList.add('active');
            closeDropdown();

            const tabType = item.dataset.tab;
            renderTabContent(tabType, intern, user, m);
        });
    });

    // 4. Fechar o dropdown se clicar em qualquer outro lugar do modal
    m.modal.addEventListener('click', closeDropdown);

    // Botões de navegação
    m.modal.querySelector('#btnBackToUserManagement').addEventListener('click', () => {
        m.close();
        m.cleanup();
        openUserManagerView(user.id);
    });

    m.modal.querySelector('#btnCloseManagement').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });

    // Adiciona lógica para ativar a aba "Mais" se a aba inicial for NPJ ou OAE
    if (initialTab === 'npj' || initialTab === 'oae') {
        allTabs.forEach(t => t.classList.remove('active'));
        if (moreTabButton) {
            moreTabButton.classList.add('active');
        }
    }

    // Renderiza a aba inicial definida
    renderTabContent(initialTab, intern, user, m);
}

// Função para renderizar o conteúdo de cada aba
function renderTabContent(tabType, intern, user, modalInstance) {
    const container = modalInstance.modal.querySelector('#tab-content');

    switch (tabType) {
        case 'vacation':
            renderVacationTab(container, intern, user, modalInstance);
            break;
        case 'medicalLeave':
            renderMedicalLeaveTab(container, intern, user, modalInstance);
            break;
        case 'npj':
            renderNpjTab(container, intern, user, modalInstance);
            break;
        case 'provas':
            renderProvasTab(container, intern, user, modalInstance);
            break;
        case 'hours':
            renderHoursTab(container, intern, user, modalInstance);
            break;
        case 'oae':
            renderOaeTab(container, intern, user, modalInstance);
            break;
    }
}

// ========== ABA NOVA: NPJ (NÚCLEO DE PRÁTICA JURÍDICA) ==========
function renderNpjTab(container, intern, user, modalInstance) {
    const npjPeriods = (intern.npjAbsences || []).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const weekdaysMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    let scheduledListHtml = '';
    if (npjPeriods.length === 0) {
        scheduledListHtml = '<div class="muted small" style="text-align: center; padding: 10px;">Nenhum período de NPJ registrado para este estagiário.</div>';
    } else {
        scheduledListHtml = npjPeriods.map(period => {
            const startDate = new Date(period.startDate + 'T00:00:00').toLocaleDateString('pt-BR');
            const endDate = new Date(period.endDate + 'T00:00:00').toLocaleDateString('pt-BR');
            const weekdaysStr = period.weekdays.map(d => weekdaysMap[d]).join(', ');

            return `
                <div class="row" style="background: var(--input-bg); font-size: 14px; justify-content: space-between;">
                    <div>
                        <span><b>Período:</b> ${startDate} a ${endDate}</span><br>
                        <span class="small-muted"><b>Aplicado em:</b> <strong>${weekdaysStr}</strong></span>
                    </div>
                    <button class="button danger ghost icon-button" data-delete-npj-id="${period.id}" title="Excluir lançamento"> <i class="fas fa-trash-alt"></i> </button>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = `
        <h4 style="margin-top:0; margin-bottom: 10px;">Períodos de NPJ Registrados</h4>
        <div style="max-height: 150px; overflow-y: auto; padding: 5px; border: 1px solid var(--input-border); border-radius: 8px;">
            ${scheduledListHtml}
        </div>
        <hr style="margin: 15px 0;">

        <form id="formAdminNpj" style="margin-top:10px;display:flex;flex-direction:column;gap:15px">
            <div class="muted small">Selecione o(s) dia(s) da semana e o período em que o afastamento de NPJ será aplicado. O sistema registrará todas as ocorrências automaticamente.</div>
            
            <div>
                <span class="small-muted">Dias da Semana</span>
                <div id="npjWeekdays" class="form-check-group" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 15px; justify-content: space-between; padding: 10px; background: var(--input-bg); border-radius: 8px; margin-top: 5px;">
                    <label class="form-check"><input type="checkbox" class="weekday-check" value="0"> Dom</label>
                    <label class="form-check"><input type="checkbox" class="weekday-check" value="1"> Seg</label>
                    <label class="form-check"><input type="checkbox" class="weekday-check" value="2"> Ter</label>
                    <label class="form-check"><input type="checkbox" class="weekday-check" value="3"> Qua</label>
                    <label class="form-check"><input type="checkbox" class="weekday-check" value="4"> Qui</label>
                    <label class="form-check"><input type="checkbox" class="weekday-check" value="5"> Sex</label>
                    <label class="form-check"><input type="checkbox" class="weekday-check" value="6"> Sáb</label>
                </div>
            </div>

            <div style="display: flex; gap: 10px;">
                <label style="flex: 1;">
                    <span class="small-muted">Data de Início</span>
                    <input type="date" id="adminNpjStartDate" class="input" required />
                </label>
                <label style="flex: 1;">
                    <span class="small-muted">Data Fim</span>
                    <input type="date" id="adminNpjEndDate" class="input" required />
                </label>
            </div>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button type="submit" class="button">Adicionar Período NPJ</button>
            </div>
        </form>
    `;

    // Listener para os botões de exclusão
    container.querySelectorAll('[data-delete-npj-id]').forEach(button => {
        button.addEventListener('click', async () => {
            const periodId = button.dataset.deleteNpjId;
            if (confirm('Tem certeza que deseja excluir este período de NPJ? Todas as ausências relacionadas serão removidas.')) {
                // MODIFICADO: Busca manager pelo UID
                const manager = (state.users || {})[session.userId];
                const periodToDelete = (intern.npjAbsences || []).find(p => p.id === periodId);

                if (periodToDelete) {
                    // Remove o período da lista
                    intern.npjAbsences = (intern.npjAbsences || []).filter(p => p.id !== periodId);

                    // Cria a notificação para o usuário
                    const notification = {
                        id: uuid(),
                        type: 'npj_period_deleted_by_admin',
                        timestamp: timestamp(),
                        isRead: false,
                        message: `O servidor ${escapeHtml(manager.name || manager.username)} removeu seu registro de período de NPJ que começava em ${periodToDelete.startDate.split('-').reverse().join('/')}.`
                    };
                    user.notifications = user.notifications || [];
                    user.notifications.push(notification);
                }

                await save(state);
                showToast('Período NPJ removido.', 'success');
                renderNpjTab(container, intern, user, modalInstance);
            }
        });
    });

    // Listener para o formulário de adicionar período NPJ
    container.querySelector('#formAdminNpj').addEventListener('submit', async (e) => {
        e.preventDefault();

        const startDate = container.querySelector('#adminNpjStartDate').value;
        const endDate = container.querySelector('#adminNpjEndDate').value;
        const selectedWeekdays = Array.from(container.querySelectorAll('.weekday-check:checked')).map(cb => parseInt(cb.value));

        if (!startDate || !endDate || selectedWeekdays.length === 0) {
            return showToast('Preencha as datas de início, fim e selecione ao menos um dia da semana.', 'warning');
        }

        const date1 = new Date(startDate);
        const date2 = new Date(endDate);
        if (date2 < date1) {
            return showToast('A data final não pode ser anterior à data inicial.', 'error');
        }

        // --- ALGORITMO PARA CALCULAR DATAS RECORRENTES ---
        const calculatedDates = [];
        let currentDate = new Date(startDate + 'T00:00:00');
        const finalDate = new Date(endDate + 'T00:00:00');
        const weekdaySet = new Set(selectedWeekdays);

        while (currentDate <= finalDate) {
            if (weekdaySet.has(currentDate.getDay())) {
                calculatedDates.push(currentDate.toISOString().slice(0, 10));
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (calculatedDates.length === 0) {
            return showToast('Nenhum dia correspondente encontrado no período selecionado.', 'info');
        }

        // MODIFICADO: Busca manager pelo UID
        const manager = (state.users || {})[session.userId];
        const newPeriod = {
            id: uuid(),
            startDate,
            endDate,
            weekdays: selectedWeekdays,
            dates: calculatedDates, // Armazena todas as datas calculadas
            createdAt: timestamp(),
            addedBy: manager?.name || 'Admin',
        };

        intern.npjAbsences = intern.npjAbsences || [];
        intern.npjAbsences.push(newPeriod);

        intern.auditLog = intern.auditLog || [];
        intern.auditLog.push({
            id: uuid(), action: 'admin_add_npj', byUserId: manager.id, byUserName: manager.username, at: timestamp(),
            details: `Registrou período de NPJ de ${startDate} a ${endDate} para o(s) dia(s) da semana: ${selectedWeekdays.map(d => weekdaysMap[d]).join(', ')}.`
        });

        // Adiciona notificação para o usuário
        const notification = {
            id: uuid(),
            type: 'npj_period_added_by_admin',
            timestamp: timestamp(),
            isRead: false,
            message: `O servidor ${escapeHtml(manager.name || manager.username)} registrou um período de NPJ para você de ${newPeriod.startDate.split('-').reverse().join('/')} a ${newPeriod.endDate.split('-').reverse().join('/')}.`
        };
        user.notifications = user.notifications || [];
        user.notifications.push(notification);

        await save(state);
        showToast(`Período NPJ registrado com ${calculatedDates.length} afastamentos.`, 'success');

        renderNpjTab(container, intern, user, modalInstance);
    });
}
// ========== ABA NOVA: OAE (OUTROS AFASTAMENTOS ESTAGIÁRIO) ==========
function renderOaeTab(container, intern, user, modalInstance) {
    const oaeAbsences = (intern.oaeAbsences || [])
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

    // Calcula o total de dias
    const totalLeaveDays = oaeAbsences.reduce((sum, leave) => sum + leave.days, 0);

    let scheduledListHtml = '';
    if (oaeAbsences.length === 0) {
        scheduledListHtml = '<div class="muted small" style="text-align: center; padding: 10px;">Nenhum OAE registrado para este estagiário.</div>';
    } else {
        scheduledListHtml = oaeAbsences.map(leave => {
            const startDate = new Date(leave.startDate + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + leave.days - 1);
            const period = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;
            return `
                <div class="row" style="background: var(--input-bg); font-size: 14px; justify-content: space-between; flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold;">${period} (${leave.days} dias)</span>
                        <button class="button danger ghost icon-button" data-delete-oae-id="${leave.id}" title="Excluir lançamento"> <i class="fas fa-trash-alt"></i> </button>
                    </div>
                    <div class="small-muted" style="font-style: italic;">Motivo: ${escapeHtml(leave.description)}</div>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin:0;">Outros Afastamentos Estagiário Registrados</h4>
            <div class="total-pill" style="padding: 6px 12px; font-size: 0.9em; border-color: var(--warning);">
                <span class="small-muted">Total de dias: </span>
                <span class="num" style="font-size: 1em; color: var(--warning);">${totalLeaveDays}</span>
            </div>
        </div>
        <div style="max-height: 150px; overflow-y: auto; padding: 5px; border: 1px solid var(--input-border); border-radius: 8px;">
            ${scheduledListHtml}
        </div>
        <hr style="margin: 15px 0;">

        <form id="formAdminOAE" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
            <div class="muted small">O período de afastamento será registrado e o estagiário será notificado.</div>
            
            <label id="labelOaeDescription">
                <span class="small-muted">Descrição (Motivo do Afastamento) *</span>
                <input type="text" id="adminOaeDescription" required />
            </label>
            
            <label>
                <span class="small-muted">Data de Início</span>
                <input type="date" id="adminOaeStartDate" required />
            </label>
            
            <label>
                <span class="small-muted">Data Fim</span>
                <input type="date" id="adminOaeEndDate" required />
            </label>
            
            <div class="muted small" id="adminOaeDaysDisplay" style="text-align: right; margin-top: -5px; min-height: 1.2em; font-weight: 600;"></div>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button type="submit" class="button">Adicionar OAE</button>
            </div>
        </form>
    `;

    // Lógica de cálculo de dias
    const startDateInput = container.querySelector('#adminOaeStartDate');
    const endDateInput = container.querySelector('#adminOaeEndDate');
    const daysDisplay = container.querySelector('#adminOaeDaysDisplay');

    const calculateDays = () => {
        const start = startDateInput.value;
        const end = endDateInput.value;

        if (start && end) {
            const date1 = new Date(start + 'T00:00:00');
            const date2 = new Date(end + 'T00:00:00');

            if (date2 < date1) {
                daysDisplay.innerHTML = '<span style="color: var(--danger);">Data fim inválida</span>';
                return null;
            }

            const diffTime = Math.abs(date2 - date1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            daysDisplay.textContent = `Total: ${diffDays} dias`;
            return diffDays;
        }
        daysDisplay.textContent = '';
        return null;
    };

    startDateInput.addEventListener('change', () => {
        endDateInput.min = startDateInput.value;
        calculateDays();
    });
    endDateInput.addEventListener('change', calculateDays);

    // Listeners para os botões de exclusão
    container.querySelectorAll('[data-delete-oae-id]').forEach(button => {
        button.addEventListener('click', async () => {
            const leaveId = button.dataset.deleteOaeId;
            if (confirm('Tem certeza que deseja excluir este período de OAE? A ação notificará o estagiário.')) {
                // MODIFICADO: Busca manager pelo UID
                const manager = (state.users || {})[session.userId];

                intern.oaeAbsences = intern.oaeAbsences || [];
                const leaveIndex = intern.oaeAbsences.findIndex(l => l.id === leaveId);

                if (leaveIndex > -1) {
                    const leaveToDelete = intern.oaeAbsences[leaveIndex];
                    intern.oaeAbsences.splice(leaveIndex, 1);

                    const notification = {
                        id: uuid(),
                        type: 'oae_deleted_by_admin',
                        timestamp: timestamp(),
                        isRead: false,
                        message: `O servidor ${manager.name || manager.username} removeu seu registro de OAE (${escapeHtml(leaveToDelete.description)}) que iniciaria em ${formatDate(leaveToDelete.startDate)}.`
                    };
                    user.notifications = user.notifications || [];
                    user.notifications.push(notification);

                    intern.auditLog = intern.auditLog || [];
                    intern.auditLog.push({
                        id: uuid(), action: 'admin_delete_oae', byUserId: manager.id, byUserName: manager.username, at: timestamp(),
                        details: `Excluiu período de ${leaveToDelete.days} dia(s) de OAE (${escapeHtml(leaveToDelete.description)}) que se iniciava em ${leaveToDelete.startDate}.`
                    });

                    await save(state);
                    renderOaeTab(container, intern, user, modalInstance);
                }
            }
        });
    });

    // Listener para o formulário de adicionar
    container.querySelector('#formAdminOAE').addEventListener('submit', async (e) => {
        e.preventDefault();

        const description = container.querySelector('#adminOaeDescription').value;
        const descriptionLabel = container.querySelector('#labelOaeDescription');

        // Validação da descrição
        if (!description || description.trim() === '') {
            showToast('O campo "Descrição" é obrigatório.', 'error');
            descriptionLabel.style.color = 'var(--danger)';
            container.querySelector('#adminOaeDescription').focus();
            return;
        }
        descriptionLabel.style.color = ''; // Reseta a cor

        const days = calculateDays();
        if (!days || days < 1) {
            showToast('Período inválido. Verifique as datas.', 'error');
            return;
        }

        const startDate = startDateInput.value;
        const leaveDates = [];
        const start = new Date(startDate + 'T00:00:00');

        for (let i = 0; i < days; i++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            leaveDates.push(currentDate.toISOString().slice(0, 10));
        }

        // MODIFICADO: Busca manager pelo UID
        const manager = (state.users || {})[session.userId];
        const newLeave = {
            id: uuid(),
            description: description, // CAMPO NOVO
            startDate: startDate,
            days: days,
            dates: leaveDates,
            createdAt: timestamp(),
            addedBy: manager?.name || 'Admin',
        };

        intern.oaeAbsences = intern.oaeAbsences || [];
        intern.oaeAbsences.push(newLeave);

        const notification = {
            id: uuid(),
            type: 'oae_added_by_admin',
            timestamp: timestamp(),
            isRead: false,
            message: `O servidor ${manager.name || manager.username} registrou um OAE (Outro Afastamento) para você a partir do dia ${formatDate(startDate)} (${days} dias). Motivo: ${escapeHtml(description)}`
        };
        user.notifications = user.notifications || [];
        user.notifications.push(notification);

        intern.auditLog = intern.auditLog || [];
        intern.auditLog.push({
            id: uuid(), action: 'admin_add_oae', byUserId: manager.id, byUserName: manager.username, at: timestamp(),
            details: `Registrou ${days} dia(s) de OAE (${escapeHtml(description)}) iniciando em ${startDate}.`
        });

        await save(state);
        showToast('Afastamento (OAE) registrado com sucesso!', 'success');

        renderOaeTab(container, intern, user, modalInstance);
    });
}
// ========== ABA 1: FÉRIAS ==========
function renderVacationTab(container, intern, user, modalInstance) {
    const approvedVacations = (intern.vacations || [])
        .filter(v => v.status === 'approved')
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

    let scheduledListHtml = '';
    if (approvedVacations.length === 0) {
        scheduledListHtml = '<div class="muted small" style="text-align: center; padding: 10px;">Nenhuma férias agendada para este estagiário.</div>';
    } else {
        scheduledListHtml = approvedVacations.map(v => {
            const startDate = new Date(v.startDate + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + v.days - 1);
            const period = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;
            return `
                <div class="row" style="background: var(--input-bg); font-size: 14px; justify-content: space-between;">
                    <span>${period} (${v.days} dias)</span>
                    <button class="button danger ghost icon-button" data-delete-vacation-id="${v.id}" title="Excluir lançamento"> <i class="fas fa-trash-alt"></i> 
                    </button>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = `
        <h4 style="margin-top:0; margin-bottom: 10px;">Férias Já Agendadas</h4>
        <div style="max-height: 150px; overflow-y: auto; padding: 5px; border: 1px solid var(--input-border); border-radius: 8px;">
            ${scheduledListHtml}
        </div>
        <hr style="margin: 15px 0;">

        <form id="formAdminVacation" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
            <div class="muted small">O período de férias será agendado diretamente com o status "Aprovado". O estagiário será notificado.</div>
            <label>
                <span class="small-muted">Data de Início</span>
                <input type="date" id="adminVacationStartDate" required />
            </label>
            
            <label>
                <span class="small-muted">Data Fim</span>
                <input type="date" id="adminVacationEndDate" required />
            </label>
            
            <div class="muted small" id="adminVacationDaysDisplay" style="text-align: right; margin-top: -5px; min-height: 1.2em; font-weight: 600;"></div>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button type="submit" class="button">Agendar Férias</button>
            </div>
        </form>
    `;

    // Lógica de cálculo de dias
    const startDateInput = container.querySelector('#adminVacationStartDate');
    const endDateInput = container.querySelector('#adminVacationEndDate');
    const daysDisplay = container.querySelector('#adminVacationDaysDisplay');

    const calculateDays = () => {
        const start = startDateInput.value;
        const end = endDateInput.value;

        if (start && end) {
            const date1 = new Date(start + 'T00:00:00');
            const date2 = new Date(end + 'T00:00:00');

            if (date2 < date1) {
                daysDisplay.innerHTML = '<span style="color: var(--danger);">Data fim inválida</span>';
                return null;
            }

            const diffTime = Math.abs(date2 - date1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

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

    startDateInput.addEventListener('change', () => {
        endDateInput.min = startDateInput.value;
        calculateDays();
    });

    endDateInput.addEventListener('change', calculateDays);

    // Listeners para os botões de exclusão
    container.querySelectorAll('[data-delete-vacation-id]').forEach(button => {
        button.addEventListener('click', async () => {
            const vacationId = button.dataset.deleteVacationId;
            if (confirm('Tem certeza que deseja excluir este período de férias agendado? A ação notificará o estagiário.')) {
                // MODIFICADO: Busca manager pelo UID
                const manager = (state.users || {})[session.userId];
                if (!manager || !user) return showToast('Erro ao identificar usuários.', 'error');

                const vacationIndex = intern.vacations.findIndex(v => v.id === vacationId);
                if (vacationIndex > -1) {
                    const vacationToDelete = intern.vacations[vacationIndex];

                    vacationToDelete.status = 'deleted';
                    vacationToDelete.deletedAt = timestamp();
                    vacationToDelete.deletedBy = manager.username;
                    vacationToDelete.deletedByName = manager.name || manager.username;
                    vacationToDelete.statusBeforeDeletion = 'approved';

                    const notification = {
                        id: uuid(),
                        type: 'vacation_deleted_by_admin',
                        timestamp: timestamp(),
                        isRead: false,
                        message: `O servidor ${escapeHtml(manager.name || manager.username)} cancelou seu período de férias agendada a partir de ${vacationToDelete.startDate.split('-').reverse().join('/')}.`
                    };
                    user.notifications = user.notifications || [];
                    user.notifications.push(notification);

                    intern.auditLog = intern.auditLog || [];
                    intern.auditLog.push({
                        id: uuid(), action: 'admin_delete_vacation', byUserId: manager.id, byUserName: manager.username, at: timestamp(),
                        details: `Excluiu período de ${vacationToDelete.days} dia(s) de férias que se iniciava em ${vacationToDelete.startDate}.`
                    });

                    await save(state);

                    // Re-renderiza a aba
                    renderVacationTab(container, intern, user, modalInstance);
                }
            }
        });
    });

    // Listener para o formulário de agendar férias
    container.querySelector('#formAdminVacation').addEventListener('submit', async (e) => {
        e.preventDefault();

        const days = calculateDays();
        if (!days) {
            showToast('Período inválido. Verifique as datas.', 'error');
            return;
        }

        const startDate = startDateInput.value;
        const vacationDates = [];
        const start = new Date(startDate + 'T00:00:00');

        for (let i = 0; i < days; i++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            const isoDate = currentDate.toISOString().slice(0, 10);
            vacationDates.push(isoDate);
        }

        // MODIFICADO: Busca manager pelo UID
        const manager = (state.users || {})[session.userId];
        const newVacation = {
            id: uuid(),
            startDate: startDate,
            days: days,
            dates: vacationDates,
            status: 'approved',
            createdAt: timestamp(),
            analyzedBy: manager?.name || 'Admin',
            analyzedAt: timestamp()
        };

        intern.vacations = intern.vacations || [];
        intern.vacations.push(newVacation);

        const notification = {
            id: uuid(),
            type: 'vacation_scheduled_by_admin',
            timestamp: timestamp(),
            isRead: false,
            message: `${escapeHtml(manager.name || manager.username)} agendou férias para você de ${startDate.split('-').reverse().join('/')} (${days} dias).`
        };
        user.notifications = user.notifications || [];
        user.notifications.push(notification);

        intern.auditLog = intern.auditLog || [];
        intern.auditLog.push({
            id: uuid(), action: 'admin_add_vacation', byUserId: manager.id, byUserName: manager.username, at: timestamp(),
            details: `Agendou ${days} dia(s) de férias iniciando em ${startDate}.`
        });

        await save(state);
        showToast('Férias agendadas com sucesso!', 'success');

        // Re-renderiza a aba
        renderVacationTab(container, intern, user, modalInstance);
    });
}

// ========== ABA NOVA: LICENÇA MÉDICA ==========
function renderMedicalLeaveTab(container, intern, user, modalInstance) {
    const medicalLeaves = (intern.medicalLeaves || [])
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

    // NOVO: Calcula o total de dias de licença
    const totalLeaveDays = (intern.medicalLeaves || []).reduce((sum, leave) => sum + leave.days, 0);

    let scheduledListHtml = '';
    if (medicalLeaves.length === 0) {
        scheduledListHtml = '<div class="muted small" style="text-align: center; padding: 10px;">Nenhuma licença médica registrada para este estagiário.</div>';
    } else {
        scheduledListHtml = medicalLeaves.map(leave => {
            const startDate = new Date(leave.startDate + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + leave.days - 1);
            const period = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;
            return `
                <div class="row" style="background: var(--input-bg); font-size: 14px; justify-content: space-between;">
                    <span>${period} (${leave.days} dias)</span>
                    <button class="button danger ghost icon-button" data-delete-leave-id="${leave.id}" title="Excluir lançamento"> <i class="fas fa-trash-alt"></i> </button>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin:0;">Licenças Médicas Registradas</h4>
            <div class="total-pill" style="padding: 6px 12px; font-size: 0.9em; border-color: var(--danger-light);">
                <span class="small-muted">Total de dias: </span>
                <span class="num" style="font-size: 1em; color: var(--danger);">${totalLeaveDays}</span>
            </div>
        </div>
        <div style="max-height: 150px; overflow-y: auto; padding: 5px; border: 1px solid var(--input-border); border-radius: 8px;">
            ${scheduledListHtml}
        </div>
        <hr style="margin: 15px 0;">

        <form id="formAdminMedicalLeave" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
            <div class="muted small">O período de licença será registrado e o estagiário será notificado.</div>
            <label>
                <span class="small-muted">Data de Início</span>
                <input type="date" id="adminLeaveStartDate" required />
            </label>
            
            <label>
                <span class="small-muted">Data Fim</span>
                <input type="date" id="adminLeaveEndDate" required />
            </label>
            
            <div class="muted small" id="adminLeaveDaysDisplay" style="text-align: right; margin-top: -5px; min-height: 1.2em; font-weight: 600;"></div>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button type="submit" class="button">Adicionar Licença</button>
            </div>
        </form>
    `;

    // Lógica de cálculo de dias
    const startDateInput = container.querySelector('#adminLeaveStartDate');
    const endDateInput = container.querySelector('#adminLeaveEndDate');
    const daysDisplay = container.querySelector('#adminLeaveDaysDisplay');

    const calculateDays = () => {
        const start = startDateInput.value;
        const end = endDateInput.value;

        if (start && end) {
            const date1 = new Date(start + 'T00:00:00');
            const date2 = new Date(end + 'T00:00:00');

            if (date2 < date1) {
                daysDisplay.innerHTML = '<span style="color: var(--danger);">Data fim inválida</span>';
                return null;
            }

            const diffTime = Math.abs(date2 - date1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            daysDisplay.textContent = `Total: ${diffDays} dias`;
            return diffDays;
        }
        daysDisplay.textContent = '';
        return null;
    };

    startDateInput.addEventListener('change', () => {
        endDateInput.min = startDateInput.value;
        calculateDays();
    });
    endDateInput.addEventListener('change', calculateDays);

    // Listeners para os botões de exclusão
    container.querySelectorAll('[data-delete-leave-id]').forEach(button => {
        button.addEventListener('click', async () => {
            const leaveId = button.dataset.deleteLeaveId;
            if (confirm('Tem certeza que deseja excluir este período de licença médica? A ação notificará o estagiário.')) {
                // MODIFICADO: Busca manager pelo UID
                const manager = (state.users || {})[session.userId];

                intern.medicalLeaves = intern.medicalLeaves || [];
                const leaveIndex = intern.medicalLeaves.findIndex(l => l.id === leaveId);

                if (leaveIndex > -1) {
                    const leaveToDelete = intern.medicalLeaves[leaveIndex];
                    intern.medicalLeaves.splice(leaveIndex, 1);

                    const notification = {
                        id: uuid(),
                        type: 'medical_leave_deleted_by_admin',
                        timestamp: timestamp(),
                        isRead: false,
                        message: `O servidor ${escapeHtml(manager.name || manager.username)} removeu seu registro de licença médica que iniciaria em ${leaveToDelete.startDate.split('-').reverse().join('/')}.`
                    };
                    user.notifications = user.notifications || [];
                    user.notifications.push(notification);

                    intern.auditLog = intern.auditLog || [];
                    intern.auditLog.push({
                        id: uuid(), action: 'admin_delete_medical_leave', byUserId: manager.id, byUserName: manager.username, at: timestamp(),
                        details: `Excluiu período de ${leaveToDelete.days} dia(s) de licença médica que se iniciava em ${leaveToDelete.startDate}.`
                    });

                    await save(state);
                    renderMedicalLeaveTab(container, intern, user, modalInstance);
                }
            }
        });
    });

    // Listener para o formulário de adicionar licença
    container.querySelector('#formAdminMedicalLeave').addEventListener('submit', async (e) => {
        e.preventDefault();

        const days = calculateDays();
        if (!days || days < 1) {
            showToast('Período inválido. Verifique as datas.', 'error');
            return;
        }

        const startDate = startDateInput.value;
        const leaveDates = [];
        const start = new Date(startDate + 'T00:00:00');

        for (let i = 0; i < days; i++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            leaveDates.push(currentDate.toISOString().slice(0, 10));
        }

        // MODIFICADO: Busca manager pelo UID
        const manager = (state.users || {})[session.userId];
        const newLeave = {
            id: uuid(),
            startDate: startDate,
            days: days,
            dates: leaveDates,
            createdAt: timestamp(),
            addedBy: manager?.name || 'Admin',
        };

        intern.medicalLeaves = intern.medicalLeaves || [];
        intern.medicalLeaves.push(newLeave);

        const notification = {
            id: uuid(),
            type: 'medical_leave_added_by_admin',
            timestamp: timestamp(),
            isRead: false,
            message: `O servidor ${escapeHtml(manager.name || manager.username)} registrou uma licença médica para você a partir do dia ${startDate.split('-').reverse().join('/')} (${days} dias).`
        };
        user.notifications = user.notifications || [];
        user.notifications.push(notification);

        intern.auditLog = intern.auditLog || [];
        intern.auditLog.push({
            id: uuid(), action: 'admin_add_medical_leave', byUserId: manager.id, byUserName: manager.username, at: timestamp(),
            details: `Registrou ${days} dia(s) de licença médica iniciando em ${startDate}.`
        });

        await save(state);
        showToast('Licença médica registrada com sucesso!', 'success');

        renderMedicalLeaveTab(container, intern, user, modalInstance);
    });
}

// ========== ABA 2: FOLGAS PROVAS ==========
function renderProvasTab(container, intern, user, modalInstance) {
    const datesHtml = (intern.dates || [])
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(p => `
            <div class="row" style="background: var(--input-bg); font-size: 14px; justify-content:space-between;">
                <span><strong>${p.date.split('-').reverse().join('/')}</strong></span>
               <div style="display:flex;gap:4px;">
                    ${p.link ? `
                    <a href="${p.link}" target="_blank"
                    class="button ghost icon-button"
                    style="font-size: 12px;"
                    title="Ver comprovante">
                        <i class="fa fa-link"></i>
                    </a>
                    ` : ''}
                    <button class="button danger ghost icon-button"
                            data-remove-date="${p.date}"
                            title="Excluir lançamento">
                            <i class="fas fa-trash-alt"></i>
                    </button>
                </div>

            </div>
        `).join('');

    const emptyMessage = (intern.dates || []).length === 0
        ? '<div class="muted small" style="text-align: center; padding: 10px;">Nenhuma folga-prova cadastrada para este estagiário.</div>'
        : '';

    container.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center; margin-bottom: 12px;">
            <input type="date" id="mgrAddDate" style="flex: 1;" />
            <input type="text" id="mgrAddLink" class="input" placeholder="Link da prova (opcional)" style="flex: 1;" />
            <button id="mgrAddDateBtn" class="button"><i class="fas fa-plus"></i> Adicionar</button>
        </div>
        
        <h4 style="margin-top:15px; margin-bottom: 10px;">Folgas Provas Cadastradas</h4>
        <div style="max-height: 300px; overflow-y: auto; padding: 5px; border: 1px solid var(--input-border); border-radius: 8px;">
            ${datesHtml || emptyMessage}
        </div>
    `;

    // Adicionar folga
    container.querySelector('#mgrAddDateBtn').addEventListener('click', async () => {
        const date = container.querySelector('#mgrAddDate').value;
        const link = container.querySelector('#mgrAddLink').value;

        if (!date) {
            showToast('Escolha uma data', 'warning');
            return;
        }

        if (intern.dates && intern.dates.some(d => d.date === date)) {
            showToast('Esta data já está cadastrada', 'warning');
            return;
        }

        intern.dates = intern.dates || [];
        intern.dates.push({ date, link });

        await save(state);
        showToast('Folga-prova adicionada', 'success');

        // Re-renderiza a aba
        renderProvasTab(container, intern, user, modalInstance);
    });

    // Remover folga
    container.querySelectorAll('[data-remove-date]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const dateToRemove = btn.dataset.removeDate;
            if (confirm(`Remover a folga-prova do dia ${dateToRemove.split('-').reverse().join('/')}?`)) {
                intern.dates = (intern.dates || []).filter(d => d.date !== dateToRemove);
                await save(state);
                showToast('Folga-prova removida', 'success');

                // Re-renderiza a aba
                renderProvasTab(container, intern, user, modalInstance);
            }
        });
    });
}

// ========== ABA 3: BANCO DE HORAS ==========
function renderHoursTab(container, intern, user, modalInstance, activeFilter = 'all') {
    // 1. Calcular o resumo de horas
    const entries = (intern.hoursEntries || []).sort((a, b) => b.date.localeCompare(a.date));

    let totalPositive = 0;
    let totalNegative = 0;

    entries.forEach(e => {
        if (e.hours > 0) {
            totalPositive += e.hours;
        } else if (e.hours < 0) {
            // Soma apenas as negativas não compensadas para o saldo
            if (!e.compensated) {
                totalNegative += e.hours;
            }
        }
    });

    const netHours = totalPositive + totalNegative;

    // 2. Filtrar entradas com base no filtro ativo
    let filteredEntries = entries;
    if (activeFilter === 'positive') {
        filteredEntries = entries.filter(e => e.hours > 0);
    } else if (activeFilter === 'negative') {
        filteredEntries = entries.filter(e => e.hours < 0);
    }

    // 3. Gerar HTML das entradas filtradas
    const entriesHtml = filteredEntries.map(e => {
        const compensatedBadge = e.compensated
            ? '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:#dcfce7;color:#166534;margin-left:6px;">✓ COMPENSADO</span>'
            : '';

        return `
            <div class="row" style="border-left: 4px solid ${e.hours > 0 ? 'var(--ok)' : 'var(--danger)'}; padding: 12px; margin-bottom: 8px; background: var(--input-bg);">
                <div style="flex: 1;">
                    <div>
                        <strong>${e.date.split('-').reverse().join('/')}</strong>
                        <span style="font-weight:700;color:${e.hours > 0 ? 'var(--ok)' : 'var(--danger)'};margin-left:8px;">
                            ${e.hours > 0 ? '+' : ''}${e.hours}h
                        </span>
                        ${compensatedBadge}
                    </div>
                    <div class="muted small" style="margin-top: 4px;">${escapeHtml(e.reason || 'Sem justificativa')}</div>
                    <div class="audit" style="margin-top: 2px;">Criado por: ${escapeHtml(e.createdByName || '—')}</div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    ${e.hours < 0 ? (e.compensated
                ? `<button class="button ghost icon-button" data-comp-hours="${e.id}" title="Desfazer compensação"><i class="fas fa-undo"></i></button>`
                : `<button class="button ghost icon-button" data-comp-hours="${e.id}" title="Marcar como compensado"><i class="fas fa-check"></i></button>`)
                : ''}

                    <button class="button ghost icon-button" data-edit-hours="${e.id}" title="Editar lançamento">
                        <i class="fas fa-pencil-alt"></i>
                    </button>

                    <button class="button danger ghost icon-button" data-delete-hours="${e.id}" title="Excluir lançamento">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    const emptyMessage = filteredEntries.length === 0
        ? '<div class="muted" style="text-align:center; padding: 20px;">Nenhum lançamento encontrado para este filtro.</div>'
        : '';

    // 4. Montar o HTML completo com resumo e filtros
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px;">
            
            <div class="total-pill" style="background: white; padding: 8px 12px; border: 1px solid var(--input-border); box-shadow: none;">
                <span class="small-muted">Saldo: </span>
                <span class="num" style="font-size: 1em; color: ${netHours >= 0 ? 'var(--ok)' : 'var(--danger)'};">
                    ${netHours.toLocaleString('pt-BR')}h
                </span>
            </div>
            
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <h4 style="margin:0; font-size: 1.1em; color: var(--accent);">Lançamentos no Banco de Horas</h4>
                <div class="filter-button-group">
                    <button class="button ${activeFilter === 'all' ? '' : 'ghost'}" data-filter="all">Todos</button>
                    <button class="button ${activeFilter === 'positive' ? '' : 'ghost'}" data-filter="positive">Positivas</button>
                    <button class="button ${activeFilter === 'negative' ? '' : 'ghost'}" data-filter="negative">Negativas</button>
                </div>
            </div>

            <button class="button" id="btnAddEntry"><i class="fas fa-plus"></i> Lançar horas</button>
        </div>
        
        <div style="max-height: 400px; overflow-y: auto; padding: 5px; border: 1px solid var(--input-border); border-radius: 8px;">
            ${entriesHtml || emptyMessage}
        </div>
    `;

    // 5. Adicionar listeners para os novos filtros
    container.querySelectorAll('.filter-button-group .button').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.dataset.filter;
            // Re-renderiza a aba passando o novo filtro
            renderHoursTab(container, intern, user, modalInstance, filter);
        });
    });

    // --- FIM DA ALTERAÇÃO ---

    // Adicionar horas
    container.querySelector('#btnAddEntry').addEventListener('click', () => {
        showHourEntryForm(intern.id, null);
    });

    // Editar horas
    container.querySelectorAll('[data-edit-hours]').forEach(btn => {
        btn.addEventListener('click', () => {
            const entryId = btn.dataset.editHours;
            showHourEntryForm(intern.id, entryId);
        });
    });

    // Excluir horas
    container.querySelectorAll('[data-delete-hours]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Deseja realmente excluir este lançamento?')) {
                const entryId = btn.dataset.deleteHours;

                // ENCONTRA O LANÇAMENTO ANTES DE EXCLUIR
                const entryToDelete = (intern.hoursEntries || []).find(x => x.id === entryId);

                if (entryToDelete) {
                    // ADICIONA A NOTIFICAÇÃO
                    // MODIFICADO: Busca manager pelo UID
                    const manager = (state.users || {})[session.userId];
                    if (user && manager) { // 'user' é o estagiário, vindo dos parâmetros da função
                        user.notifications = user.notifications || [];
                        user.notifications.push({
                            id: uuid(),
                            type: 'hours_deleted_by_admin',
                            timestamp: timestamp(),
                            isRead: false,
                            message: `${escapeHtml(manager.name || manager.username)} excluiu um lançamento de ${entryToDelete.hours}h do seu banco de horas (data: ${formatDate(entryToDelete.date)}).`
                        });
                    }
                }

                intern.hoursEntries = (intern.hoursEntries || []).filter(x => x.id !== entryId);
                await save(state);
                showToast('Lançamento excluído', 'success');

                // Re-renderiza a aba mantendo o filtro ativo
                renderHoursTab(container, intern, user, modalInstance, activeFilter);
            }
        });
    });

    // Compensar/Descompensar
    container.querySelectorAll('[data-comp-hours]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const entryId = btn.dataset.compHours;
            const entry = (intern.hoursEntries || []).find(item => item.id === entryId);

            if (entry) {
                await markCompensated(intern.id, entryId, !entry.compensated);
                await save(state);
                showToast(entry.compensated ? 'Compensação desfeita' : 'Marcado como compensado', 'success');

                // Re-renderiza a aba mantendo o filtro ativo
                renderHoursTab(container, intern, user, modalInstance, activeFilter);
            }
        });
    });
}


export function openUserManagerView(userId) {
    // MODIFICADO: Busca o usuário pelo UID
    const u = (state.users || {})[userId];
    if (!u) return;

    // MODIFICADO: Busca o manager pelo UID
    const currentManager = (state.users || {})[session.userId];

    // --- Lógica de permissões e dados (com a adição da permissão de Editar) ---
    const intern = u.internId ? findInternById(u.internId) : null;
    const server = u.serverId ? findServerById(u.serverId) : null;
    const nameParts = (u.name || u.username || '').split(' ');
    const initials = ((nameParts[0]?.[0] || '') + (nameParts.length > 1 ? nameParts[nameParts.length - 1]?.[0] || '' : '')).toUpperCase();

    // NOVO: Adicionada a verificação de permissão para editar
    const canEdit = hasPower(currentManager, 'edit_user') || u.id === currentManager.id;

    let roleTagClass = '';
    let roleTagText = u.role;
    if (u.role === 'intern') { roleTagClass = 'role-tag-intern'; roleTagText = 'Estagiário'; }
    else if (u.role === 'servidor') { roleTagClass = 'role-tag-servidor'; roleTagText = 'Servidor'; }
    else if (u.role === 'admin') { roleTagClass = 'role-tag-admin'; roleTagText = 'Admin'; }

    let detailsHtml = '';
    const roleTagHtml = `<div class="role-tag ${roleTagClass}">${roleTagText}</div>`;
    let otherDetailsHtml = '';

    // Lógica unificada para estagiários e servidores
    if ((u.role === 'intern' && intern) || (u.role === 'servidor' && server)) {
        const relatedObject = u.role === 'intern' ? intern : server;

        const subtipo = relatedObject.subType ? relatedObject.subType.charAt(0).toUpperCase() + relatedObject.subType.slice(1) : 'N/A';
        const localidade = relatedObject.localidade ? relatedObject.localidade.charAt(0).toUpperCase() + relatedObject.localidade.slice(1) : 'N/A';
        const creationDate = u.createdAt ? formatDate(u.createdAt) : 'N/A';

        // Monta os detalhes, agora incluindo o subtipo na ordem correta
        otherDetailsHtml = `
            <span class="detail-item" title="Subtipo"><i class="fas fa-tag"></i> ${subtipo}</span>
            <span class="detail-item" title="Localidade"><i class="fas fa-map-marker-alt"></i> ${localidade}</span>
            <span class="detail-item" title="Data de criação"><i class="fas fa-calendar-alt"></i> Criado em ${creationDate}</span>
        `;

        // Adiciona a data de término apenas para estagiários
        if (u.role === 'intern' && intern.registrationData?.internshipEndDate) {
            const endDate = new Date(intern.registrationData.internshipEndDate + 'T00:00:00');
            const currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0); // Normaliza a data atual para o início do dia

            // Define a data limite (3 meses a partir de hoje)
            const threeMonthsFromNow = new Date(currentDate);
            threeMonthsFromNow.setMonth(currentDate.getMonth() + 3);

            // Estilo padrão (laranja)
            let endDateStyle = 'background-color: rgba(245, 158, 11, 0.1); color: #b45309; border-color: rgba(245, 158, 11, 0.2);';

            // Se a data de término estiver nos próximos 3 meses (e não for no passado), muda o estilo para vermelho
            if (endDate <= threeMonthsFromNow && endDate >= currentDate) {
                endDateStyle = 'background-color: rgba(239, 68, 68, 0.1); color: #b91c1c; border-color: rgba(239, 68, 68, 0.2);';
            }

            otherDetailsHtml += `
                <span class="detail-item" title="Término do Estágio" style="${endDateStyle}"><i class="fas fa-calendar-times"></i> Término: ${formatDate(intern.registrationData.internshipEndDate)}</span>
            `;
        }
    }

    // Envolve as tags em um contêiner flexível
    detailsHtml = `<div class="user-details-row" style="display: flex; flex-wrap: wrap; gap: 10px; flex-grow: 1;">${roleTagHtml}${otherDetailsHtml}</div>`;

    let quickActionsHtml = '<div class="muted small" style="text-align:center; padding: 20px;">Nenhuma ação rápida disponível para este perfil.</div>';
    if (u.role === 'intern' && intern) {
        const canManage = hasPower(currentManager, 'manage_provas') || hasPower(currentManager, 'manage_hours');
        quickActionsHtml = `
            ${canManage ? `<button id="btnManage" class="action-card"><i class="fas fa-cog"></i><div class="action-card-text"><strong>Gerenciar</strong><span>Afastamentos e Horas</span></div></button>` : ''}
            <button id="btnViewRegData" class="action-card"><i class="fas fa-id-card"></i><div class="action-card-text"><strong>Exibir/Editar Dados</strong><span>Informações Cadastrais</span></div></button>
        `;
    }

    const canDelegate = hasPower(currentManager, 'delegate_admins') && u.role === 'intern';
    // REMOVIDO: canReset
    let whatsappButtonHtml = '';
    if (u.role === 'intern' && intern?.registrationData?.mainPhone) {
        const fullNumber = `${intern.registrationData.mainPhoneCode || '55'}${intern.registrationData.mainPhone}`;
        const whatsappUrl = `https://web.whatsapp.com/send?phone=${fullNumber}`;
        whatsappButtonHtml = `<a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="button ghost admin-tool-btn"><i class="fab fa-whatsapp"></i> WhatsApp</a>`;
    }
    const canDelete = u.role !== 'super' && hasPower(currentManager, 'delete_user');

    const html = `
        <div class="user-manage-modal">
            <div class="modal-header">
                <div class="user-avatar" style="background-color: var(--accent-2);">${initials}</div>
                <div class="user-info" style="flex-grow: 1; display: flex; flex-direction: column; gap: 5px;"> 
                    <div> 
                        <span class="user-name">${escapeHtml(u.name || u.username)}</span>
                        <span class="user-username">${escapeHtml(u.username)}</span>
                    </div>
                    ${detailsHtml}
                </div>
                <button class="button ghost modal-close-btn" id="btnCloseView" style="flex-shrink: 0;">Fechar</button>
            </div>
            <div class="modal-section">
                <h4 class="section-title">Ações Rápidas</h4>
                <div class="action-grid">${quickActionsHtml}</div>
            </div>
            <div class="modal-section">
                <h4 class="section-title">Ferramentas Administrativas</h4>
                <div class="admin-tools">
                  
                    ${canEdit ? `<button id="btnEditUser" class="button ghost admin-tool-btn"><i class="fas fa-edit"></i> Editar</button>` : ''}
                    ${canDelegate ? `<button id="btnDelegateAdmin" class="button ghost admin-tool-btn"><i class="fas fa-user-shield"></i> ${u.delegatedAdmin?.enabled ? 'Gerenciar Delegação' : 'Delegar Admin'}</button>` : ''}
                    
                    ${whatsappButtonHtml}
                </div>
            </div>
            ${canDelete ? `<div class="modal-section danger-zone"><div class="danger-zone-content"><button id="btnDeleteUser" class="button danger" title="Uma vez que o usuário é excluído..."><i class="fas fa-trash"></i> Excluir Usuário</button></div></div>` : ''}
        </div>
    `;

    const m = showModal(html, { allowBackdropClose: false });
    m.modal.classList.add('modal-user-management');

    // --- Reatribuir Event Listeners (com a adição da ação de Editar) ---
    m.modal.querySelector('#btnCloseView').addEventListener('click', () => { m.close(); m.cleanup(); });

    // NOVO: Adicionada a ação para o botão Editar
    const btnEdit = m.modal.querySelector('#btnEditUser');
    if (btnEdit) {
        btnEdit.addEventListener('click', () => {
            m.close();
            m.cleanup();
            showEditUserForm(u.id);
        });
    }

    const btnManage = m.modal.querySelector('#btnManage');
    if (btnManage) {
        btnManage.addEventListener('click', () => { m.close(); m.cleanup(); showManagementOptionsModal(u); });
    }
    const btnViewRegData = m.modal.querySelector('#btnViewRegData');
    if (btnViewRegData) {
        btnViewRegData.addEventListener('click', () => { showRegistrationDataModal(intern, u, { isAdminView: true }); m.close(); m.cleanup(); });
    }
    const btnDelegate = m.modal.querySelector('#btnDelegateAdmin');
    if (btnDelegate) {
        btnDelegate.addEventListener('click', () => { m.close(); m.cleanup(); showDelegationModal(u); });
    }

    // REMOVIDO: Lógica do botão Resetar Senha

    const btnDelete = m.modal.querySelector('#btnDeleteUser');
    if (btnDelete) {
        btnDelete.addEventListener('click', () => {
            const onConfirm = async () => {
                // Esta lógica de "fake checkbox" ainda funciona pois deleteSelectedUsers
                // foi atualizado na Parte 1 para ler o data-user-id (que é o UID)
                const fakeCheckbox = { dataset: { userId: u.id } };
                document.body.innerHTML += `<input type="checkbox" id="temp-delete-cb" data-user-id="${u.id}" checked style="display:none;">`;
                await deleteSelectedUsers();
                document.getElementById('temp-delete-cb')?.remove();
                m.close(); m.cleanup();
            };
            showDeleteConfirmationModal(onConfirm, 1);
        });
    }
}

// ========== DELEGAÇÃO DE PODERES ADMINISTRATIVOS ==========

export function showDelegationModal(user) {
    const isDelegated = user.delegatedAdmin?.enabled;
    const currentPowers = user.delegatedAdmin?.powers || {};
    // MODIFICADO: Busca manager pelo UID
    const currentManager = (state.users || {})[session.userId];

    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>Delegar Poderes – ${escapeHtml(user.name)}</h3>
      <div>
        <button id="btnBackToUserManagement" class="button ghost">Voltar</button>
        <button class="button ghost" id="closeDelegate">Fechar</button>
      </div>
    </div>
    <form id="formDelegate" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
        <label class="form-check" style="background: var(--input-bg); padding: 10px; border-radius: 8px;">
            <input type="checkbox" id="delegateEnabled" ${isDelegated ? 'checked' : ''} />
            <strong style="color: var(--accent);">Habilitar acesso de "Admin Delegado" para este estagiário</strong>
        </label>
        
        <div id="adminPowersDelegate" style="display:${isDelegated ? 'block' : 'none'};">
            <div class="small-muted" style="margin: 8px 0;">Selecione os poderes a serem delegados:</div>
            <div class="form-check-group">
                <label class="form-check"><input type="checkbox" id="p_create" ${currentPowers.create_intern ? 'checked' : ''}/> Criar estagiários</label>
                <label class="form-check"><input type="checkbox" id="p_edit" ${currentPowers.edit_user ? 'checked' : ''}/> Editar usuários</label>
                <label class="form-check"><input type="checkbox" id="p_delete" ${currentPowers.delete_user ? 'checked' : ''}/> Excluir usuários</label>
                <label class="form-check" style="text-decoration: line-through;"><input type="checkbox" id="p_reset" disabled/> Resetar senhas</label>
                <label class="form-check"><input type="checkbox" id="p_manage" ${currentPowers.manage_hours ? 'checked' : ''}/> Gerenciar horas</label>
                <label class="form-check"><input type="checkbox" id="p_provas" ${currentPowers.manage_provas ? 'checked' : ''}/> Gerenciar folgas provas</label>
                ${hasPower(currentManager, 'delegate_admins') && currentManager.role === 'super' ? `<label class="form-check"><input type="checkbox" id="p_delegate"/> Delegar admins</label>` : ''}
            </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end; margin-top: 15px;">
            <button type="submit" class="button">Salvar Delegação</button>
        </div>
    </form>
    `;

    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#closeDelegate').addEventListener('click', () => { m.close(); m.cleanup(); });

    m.modal.querySelector('#btnBackToUserManagement').addEventListener('click', () => {
        m.close();
        m.cleanup();
        openUserManagerView(user.id);
    });

    const enabledCheckbox = m.modal.querySelector('#delegateEnabled');
    const powersDiv = m.modal.querySelector('#adminPowersDelegate');

    enabledCheckbox.addEventListener('change', () => {
        powersDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';
    });

    m.modal.querySelector('#formDelegate').addEventListener('submit', async (ev) => {
        ev.preventDefault();

        const enabled = enabledCheckbox.checked;
        const delegateCheckbox = m.modal.querySelector('#p_delegate');

        const powers = {
            create_intern: m.modal.querySelector('#p_create').checked,
            edit_user: m.modal.querySelector('#p_edit').checked,
            delete_user: m.modal.querySelector('#p_delete').checked,
            reset_password: false, // Removido
            manage_hours: m.modal.querySelector('#p_manage').checked,
            manage_provas: m.modal.querySelector('#p_provas').checked,
            delegate_admins: delegateCheckbox ? delegateCheckbox.checked : false
        };

        user.delegatedAdmin = { enabled, powers };

        // MODIFICADO: Salva o usuário no objeto state.users usando o UID
        state.users[user.id] = user;

        await save(state);
        showToast('Delegação de poderes atualizada com sucesso!', 'success');
        m.close();
        m.cleanup();
        openUserManagerView(user.id);
    });
}

// ========== GERENCIAMENTO DE FOLGAS-PROVA DE ESTAGIÁRIO ==========
// (Nenhuma mudança necessária nestas funções auxiliares, pois elas operam no 'intern')

export function openInternManagerView(internId) {
    const intern = findInternById(internId);
    if (!intern) return;

    const user = findUserByIntern(intern.id);

    const datesHtml = (intern.dates || [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(p => `
            <div class="row">
                <div>
                    <div style="font-weight:700; color: var(--accent);">${p.date}</div>
                    <div class="muted small">Data da folga-prova</div>
                </div>
                <div style="display:flex;gap:8px;">
                    ${p.link ? `<a href="${p.link}" target="_blank" class="button ghost">Link</a>` : ''}
                    <button class="button ghost" data-remove-date="${p.date}">Remover</button>
                </div>
            </div>
        `).join('') || '<div class="muted">Nenhuma folga-prova cadastrada</div>';

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Gerenciar Folgas – ${escapeHtml(intern.name)}</h3>
            <div>
                <button class="button ghost" id="btnBackToUser">Voltar</button>
                <button class="button ghost" id="btnCloseViewIntern">Fechar</button>
            </div>
        </div>
        <div style="margin-top:12px;padding-top:12px; border-top:1px solid #eee;">
            <div style="display:flex;gap:8px;align-items:center; margin-bottom: 12px;">
                <input type="date" id="mgrAddDate" />
                <input type="text" id="mgrAddLink" class="input" placeholder="Link da prova (opcional)" />
                <button id="mgrAddDateBtn" class="button"><i class="fas fa-plus"></i> Adicionar</button>
            </div>
            <div id="mgrDates">${datesHtml}</div>
        </div>
    `;

    const m = showModal(html, { allowBackdropClose: false });

    m.modal.querySelector('#btnCloseViewIntern').addEventListener('click', () => { m.close(); m.cleanup(); });

    if (user) {
        m.modal.querySelector('#btnBackToUser').addEventListener('click', () => {
            m.close();
            m.cleanup();
            showManagementOptionsModal(user);
        });
    }

    m.modal.querySelector('#mgrAddDateBtn').addEventListener('click', async () => {
        const d = m.modal.querySelector('#mgrAddDate').value;
        const link = m.modal.querySelector('#mgrAddLink').value;

        if (!d) return showToast('Escolha uma data.', 'warning');

        if (!((intern.dates || []).some(p => p.date === d))) {
            intern.dates = intern.dates || [];
            intern.dates.push({ date: d, link: link });
        }

        // MODIFICADO: Busca manager pelo UID
        const manager = (state.users || {})[session.userId];
        intern.auditLog = intern.auditLog || [];
        intern.auditLog.push({
            id: uuid(),
            action: 'create_prova',
            byUserId: manager.id,
            byUserName: manager.username,
            at: timestamp(),
            details: `Adicionou folga-prova para a data ${d}`
        });

        await save(state);
        m.close();
        m.cleanup();
        openInternManagerView(intern.id);
    });

    m.modal.querySelectorAll('[data-remove-date]').forEach(button => {
        button.addEventListener('click', async (e) => {
            const dateToRemove = e.target.dataset.removeDate;

            if (confirm(`Remover folga-prova de ${dateToRemove}?`)) {
                intern.dates = (intern.dates || []).filter(x => x.date !== dateToRemove);

                // MODIFICADO: Busca manager pelo UID
                const manager = (state.users || {})[session.userId];
                intern.auditLog = intern.auditLog || [];
                intern.auditLog.push({
                    id: uuid(),
                    action: 'remove_prova',
                    byUserId: manager.id,
                    byUserName: manager.username,
                    at: timestamp(),
                    details: `Removeu folga-prova da data ${dateToRemove}`
                });

                await save(state);
                m.close();
                m.cleanup();
                openInternManagerView(intern.id);
            }
        });
    });
}

// ========== GERENCIAMENTO DE HORAS DE ESTAGIÁRIO ==========
// (Nenhuma mudança necessária nestas funções auxiliares, pois elas operam no 'intern')

export function openInternHoursView(internId) {
    const intern = findInternById(internId);
    if (!intern) return;

    const user = findUserByIntern(intern.id);

    const hoursHtml = ((intern.hoursEntries) || [])
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(e => `
            <div class="row">
                <div style="flex-grow: 1;">
                    <div style="font-weight:700">${e.date} • ${e.hours > 0 ? '+' : ''}${e.hours}h ${e.type === 'bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div>
                    <div class="muted small" style="margin-top:4px">${escapeHtml(e.reason || 'Sem justificativa')}</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
                    <div style="display:flex;gap:6px">
                        <button class="button ghost" data-edit-hours="${e.id}">Editar</button>
                        <button class="button" data-delete-hours="${e.id}">Excluir</button>
                    </div>
                    ${e.hours < 0 ? (e.compensated ? `<button class="button ghost" data-comp-hours="${e.id}">Desfazer comp.</button>` : `<button class="button" data-comp-hours="${e.id}">Marcar comp.</button>`) : ''}
                </div>
            </div>
        `).join('') || '<div class="muted">Nenhum lançamento de horas.</div>';

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Horas – ${escapeHtml(intern.name)}</h3>
            <div>
                <button class="button ghost" id="btnBackToUser">Voltar</button>
                <button class="button ghost" id="btnCloseHours">Fechar</button>
            </div>
        </div>
        <div style="margin-top:10px;padding-top:10px; border-top:1px solid #eee;">
            <div style="margin-bottom:12px;">
                <button id="btnAddHoursAdmin" class="button">Lançar horas</button>
            </div>
            <div id="mgrHoursList" style="max-height: 400px; overflow-y: auto;">${hoursHtml}</div>
        </div>
    `;

    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#btnCloseHours').addEventListener('click', () => { m.close(); m.cleanup(); });

    if (user) {
        m.modal.querySelector('#btnBackToUser').addEventListener('click', () => {
            m.close();
            m.cleanup();
            showManagementOptionsModal(user);
        });
    }

    m.modal.querySelector('#btnAddHoursAdmin').addEventListener('click', () => {
        showHourEntryForm(intern.id);
    });

    m.modal.querySelectorAll('[data-edit-hours]').forEach(btn => {
        btn.addEventListener('click', e => showHourEntryForm(intern.id, e.target.dataset.editHours));
    });

    m.modal.querySelectorAll('[data-delete-hours]').forEach(btn => {
        btn.addEventListener('click', async e => {
            if (confirm('Excluir este lançamento?')) {
                const entryId = e.target.dataset.deleteHours;
                intern.hoursEntries = (intern.hoursEntries || []).filter(x => x.id !== entryId);
                await save(state);
                m.close();
                m.cleanup();
                openInternHoursView(intern.id);
            }
        });
    });

    m.modal.querySelectorAll('[data-comp-hours]').forEach(btn => {
        btn.addEventListener('click', async e => {
            const entryId = e.target.dataset.compHours;
            const entry = (intern.hoursEntries || []).find(item => item.id === entryId);

            if (entry) {
                // Importa a função markCompensated do módulo view-intern
                const { markCompensated } = await import('./view-intern.js');
                await markCompensated(intern.id, entryId, !entry.compensated);
                await save(state);
                m.close();
                m.cleanup();
                openInternHoursView(intern.id);
            }
        });
    });
}


// NOVO: Modal para Admin adicionar férias
export function showAdminAddVacationModal(intern) {
    const approvedVacations = (intern.vacations || [])
        .filter(v => v.status === 'approved')
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

    let scheduledListHtml = '';
    if (approvedVacations.length === 0) {
        scheduledListHtml = '<div class="muted small" style="text-align: center; padding: 10px;">Nenhuma férias agendada para este estagiário.</div>';
    } else {
        scheduledListHtml = approvedVacations.map(v => {
            const startDate = new Date(v.startDate + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + v.days - 1);
            const period = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;
            return `
                <div class="row" style="background: var(--input-bg); font-size: 14px; justify-content: space-between;">
                    <span>${period} (${v.days} dias)</span>
                    <button class="button danger ghost" data-delete-vacation-id="${v.id}" style="padding: 2px 8px; font-size: 12px;">Excluir</button>
                </div>
            `;
        }).join('');
    }

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Agendar Férias para ${escapeHtml(intern.name)}</h3>
            <div>
                <button class="button ghost" id="btnBackToUserFromVacation">Voltar</button>
                <button class="button ghost" id="closeAdminVacation">Fechar</button>
            </div>
        </div>
        
        <hr style="margin: 15px 0;">
        <h4 style="margin-top:0; margin-bottom: 10px;">Férias Já Agendadas</h4>
        <div style="max-height: 150px; overflow-y: auto; padding: 5px; border: 1px solid var(--input-border); border-radius: 8px;">
            ${scheduledListHtml}
        </div>
        <hr style="margin: 15px 0;">

        <form id="formAdminVacation" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
            <div class="muted small">O período de férias será agendado diretamente com o status "Aprovado". O estagiário será notificado.</div>
            <label>
                <span class="small-muted">Data de Início</span>
                <input type="date" id="adminVacationStartDate" required />
            </label>
            
            <label>
                <span class="small-muted">Data Fim</span>
                <input type="date" id="adminVacationEndDate" required />
            </label>
            
            <div class="muted small" id="adminVacationDaysDisplay" style="text-align: right; margin-top: -5px; min-height: 1.2em; font-weight: 600;"></div>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button type="submit" class="button">Agendar Férias</button>
            </div>
        </form>
    `;

    const m = showModal(html, { allowBackdropClose: false });

    // --- LÓGICA NOVA PARA CÁLCULO DE DIAS ---
    const startDateInput = m.modal.querySelector('#adminVacationStartDate');
    const endDateInput = m.modal.querySelector('#adminVacationEndDate');
    const daysDisplay = m.modal.querySelector('#adminVacationDaysDisplay');

    // Função para calcular e exibir os dias
    const calculateDays = () => {
        const start = startDateInput.value;
        const end = endDateInput.value;

        if (start && end) {
            // Usamos T00:00:00 para evitar problemas de fuso horário no cálculo
            const date1 = new Date(start + 'T00:00:00');
            const date2 = new Date(end + 'T00:00:00');

            if (date2 < date1) {
                daysDisplay.innerHTML = '<span style="color: var(--danger);">Data fim inválida</span>';
                return null;
            }

            // Calcula a diferença em milissegundos, converte para dias e adiciona 1 (para ser inclusivo)
            const diffTime = Math.abs(date2 - date1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

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

    // Adiciona listeners para atualizar em tempo real
    startDateInput.addEventListener('change', () => {
        // Impede que a data fim seja anterior à data início
        endDateInput.min = startDateInput.value;
        calculateDays();
    });

    endDateInput.addEventListener('change', calculateDays);
    // --- FIM DA LÓGICA NOVA ---


    m.modal.querySelector('#btnBackToUserFromVacation').addEventListener('click', () => {
        m.close();
        m.cleanup();
        const user = findUserByIntern(intern.id);
        if (user) {
            showManagementOptionsModal(user);
        }
    });

    m.modal.querySelector('#closeAdminVacation').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });

    // Listeners para os novos botões de exclusão
    m.modal.querySelectorAll('[data-delete-vacation-id]').forEach(button => {
        button.addEventListener('click', async () => {
            const vacationId = button.dataset.deleteVacationId;
            if (confirm('Tem certeza que deseja excluir este período de férias agendado? A ação notificará o estagiário.')) {
                // MODIFICADO: Busca manager pelo UID
                const manager = (state.users || {})[session.userId];
                const user = findUserByIntern(intern.id);
                if (!manager || !user) return showToast('Erro ao identificar usuários.', 'error');

                const vacationIndex = intern.vacations.findIndex(v => v.id === vacationId);
                if (vacationIndex > -1) {
                    const vacationToDelete = intern.vacations[vacationIndex];

                    // Soft delete
                    vacationToDelete.status = 'deleted';
                    vacationToDelete.deletedAt = timestamp();
                    vacationToDelete.deletedBy = manager.username;
                    vacationToDelete.deletedByName = manager.name || manager.username;
                    vacationToDelete.statusBeforeDeletion = 'approved';

                    // Notificação
                    const notification = {
                        id: uuid(),
                        type: 'vacation_deleted_by_admin',
                        timestamp: timestamp(),
                        isRead: false,
                        message: `O(A) servidor(a) ${escapeHtml(manager.name || manager.username)} cancelou seu período de férias agendada a partir de ${vacationToDelete.startDate.split('-').reverse().join('/')}.`
                    };
                    user.notifications = user.notifications || [];
                    user.notifications.push(notification);

                    // Audit Log
                    intern.auditLog = intern.auditLog || [];
                    intern.auditLog.push({
                        id: uuid(), action: 'admin_delete_vacation', byUserId: manager.id, byUserName: manager.username, at: timestamp(),
                        details: `Excluiu período de ${vacationToDelete.days} dia(s) de férias que se iniciava em ${vacationToDelete.startDate}.`
                    });

                    await save(state);

                    // Recarrega o modal para atualizar a lista
                    m.close();
                    m.cleanup();
                    showAdminAddVacationModal(intern);
                }
            }
        });
    });

    m.modal.querySelector('#formAdminVacation').addEventListener('submit', async (ev) => {
        ev.preventDefault();

        const startDate = m.modal.querySelector('#adminVacationStartDate').value;
        // ALTERAÇÃO AQUI: Calcula os dias usando a função
        const days = calculateDays();

        if (!startDate || !days) {
            showToast('Período inválido. Verifique se as datas estão corretas e se o total não excede 30 dias.', 'error');
            return;
        }

        // A validação original (isNaN, < 1, > 30) é tratada dentro de calculateDays()

        // MODIFICADO: Busca manager pelo UID
        const manager = (state.users || {})[session.userId];
        const user = findUserByIntern(intern.id);
        if (!manager || !user) {
            showToast('Erro: não foi possível identificar o admin ou o usuário do estagiário.', 'error');
            return;
        }

        const vacationDates = [];
        const start = new Date(startDate + 'T00:00:00');
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            vacationDates.push(currentDate.toISOString().slice(0, 10));
        }

        const newVacation = {
            id: uuid(),
            startDate: startDate,
            days: days,
            dates: vacationDates,
            status: 'approved',
            createdAt: timestamp(),
            analyzedBy: manager.name || manager.username,
            analyzedAt: timestamp(),
            addedByAdmin: true
        };

        intern.vacations = intern.vacations || [];
        intern.vacations.push(newVacation);

        const notification = {
            id: uuid(),
            type: 'vacation_added_by_admin',
            timestamp: timestamp(),
            isRead: false,
            message: `O servidor ${escapeHtml(manager.name || manager.username)} agendou um período de ${days} dia(s) de férias para você.`
        };

        user.notifications = user.notifications || [];
        user.notifications.push(notification);

        intern.auditLog = intern.auditLog || [];
        intern.auditLog.push({
            id: uuid(),
            action: 'admin_create_vacation',
            byUserId: manager.id,
            byUserName: manager.username,
            at: timestamp(),
            details: `Agendou ${days} dia(s) de férias para o estagiário, com início em ${startDate}.`
        });

        await save(state);
        showToast('Férias agendadas com sucesso!', 'success');

        // Recarrega o modal para atualizar a lista
        m.close();
        m.cleanup();
        showAdminAddVacationModal(intern);
    });
}


// ========== PRÉ-CADASTROS PENDENTES (GRANDES MUDANÇAS) ==========

export function renderPendingList() {
    const list = document.getElementById('pendingList');
    if (!list) return;

    list.innerHTML = '';

    const pending = Object.values(state.pendingRegistrations || {}).filter(r => r.status !== 'rejected');

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
                <div class="muted small">Email: ${escapeHtml(reg.email)}</div>
                <div class="muted small">Matrícula: ${escapeHtml(reg.registrationData?.enrollmentId || 'Não informada')}</div>
                <div class="muted small">Solicitado em: ${new Date(reg.createdAt).toLocaleString()}</div>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="button" data-approve-id="${reg.id}">Aprovar</button>
                <button class="button danger" data-reject-id="${reg.id}">Recusar</button>
            </div>
        `;

        list.appendChild(row);

        // MODIFICADO: 'approveRegistration' agora abre um modal
        row.querySelector(`[data-approve-id="${reg.id}"]`).addEventListener('click', () => {
            showApproveRegistrationModal(reg.id);
        });
        row.querySelector(`[data-reject-id="${reg.id}"]`).addEventListener('click', () => rejectRegistration(reg.id));
    });
}

// NOVO: Modal de Aprovação de Pré-Cadastro
function showApproveRegistrationModal(regId) {
    const reg = Object.values(state.pendingRegistrations || {}).find(r => r.id === regId);

    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>Aprovar Pré-Cadastro</h3>
      <button id="closeApprove" class="button ghost">Cancelar</button>
    </div>
    
    <div class="card" style="margin-top: 15px; background: var(--input-bg);">
        <h4 style="margin-top: 0;">Dados do Pré-Cadastro:</h4>
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.9em;">
            <div><strong>Nome:</strong> ${escapeHtml(reg.name)}</div>
            <div><strong>Email de Login:</strong> ${escapeHtml(reg.email)}</div>
            <div><strong>Senha:</strong> <span style="font-family: monospace; background: #fff; padding: 2px 4px; border-radius: 4px;">${escapeHtml(reg.password)}</span></div>
            <div><strong>Matrícula:</strong> ${escapeHtml(reg.registrationData?.enrollmentId || 'N/A')}</div>
        </div>
    </div>

    <div style="margin-top:15px;display:flex;flex-direction:column;gap:10px">
        <div class="card" style="background: var(--warning-light); border-color: var(--warning);">
            <strong>Ação Manual Necessária (2 Etapas):</strong>
            <ol style="margin: 5px 0 0 20px; font-size: 0.9em; line-height: 1.6;">
                <li>Abra o painel do <strong>Firebase Authentication</strong> em outra aba.</li>
                <li>Clique em "Add user" e crie uma conta usando o <strong>Email</strong> e <strong>Senha</strong> informados acima.</li>
                <li>O Firebase irá gerar um <strong>User UID</strong>. Copie esse UID.</li>
                <li>Cole o <strong>User UID</strong> no campo abaixo e clique em "Confirmar Aprovação".</li>
            </ol>
        </div>

        <label id="labelApproveUID">
            <span class="small-muted">Cole o User UID (copiado do Firebase Auth) *</span>
            <input id="approveUID" required placeholder="Ex: a1b2c3d4e5..."/>
        </label>
      
        <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="btnConfirmApproval" class="button">Confirmar Aprovação</button>
        </div>
    </div>
    `;

    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#closeApprove').addEventListener('click', () => { m.close(); m.cleanup(); });

    m.modal.querySelector('#btnConfirmApproval').addEventListener('click', async () => {
        const uid = m.modal.querySelector('#approveUID').value.trim();
        if (!uid) {
            return showToast('O User UID é obrigatório.', 'error');
        }

        // Desativa o botão para evitar clique duplo
        m.modal.querySelector('#btnConfirmApproval').disabled = true;
        m.modal.querySelector('#btnConfirmApproval').textContent = "Aguarde...";

        await approveRegistration(regId, uid);

        m.close();
        m.cleanup();
    });
}


// MODIFICADO: 'approveRegistration' agora é a 2ª parte do processo
export async function approveRegistration(regId, uid) {
    // Encontra a "chave" (o UID) do registro pendente que corresponde ao ID interno
    const regKey = Object.keys(state.pendingRegistrations || {}).find(key => state.pendingRegistrations[key].id === regId);

    if (!regKey) {
        showToast('Erro: Pré-cadastro não encontrado.', 'error');
        return;
    }

    // Pega o registro e remove do objeto de pendentes
    const reg = state.pendingRegistrations[regKey];
    delete state.pendingRegistrations[regKey];

    // Verifica se o UID já existe no DB
    if ((state.users || {})[uid]) {
        showToast('Erro: Este UID já existe no banco de dados. O usuário já foi aprovado?', 'error');
        // Devolve o registro para a lista de pendentes
        state.pendingRegistrations.push(reg);
        return;
    }

    const internId = uuid();
    const creationDate = timestamp();

    // Utiliza os dados cadastrais completos fornecidos no pré-cadastro
    const registrationData = reg.registrationData || {};
    registrationData.lastUpdatedAt = creationDate; // Define a primeira "atualização"

    // Cria o registro do estagiário
    const newIntern = {
        id: internId,
        name: reg.name,
        subType: reg.subType || 'sessao',
        dates: [],
        hoursEntries: [],
        auditLog: [],
        registrationData // Usa o objeto completo do pré-cadastro
    };
    (state.interns || []).push(newIntern);

    // Cria o perfil do usuário no Realtime Database, usando o UID como chave
    const newUserProfile = {
        id: uid,
        username: reg.email, // 'username' é o email
        name: reg.name,
        // REMOVIDO: 'password'
        role: 'intern',
        internId,
        powers: defaultPowersFor('intern'),
        selfPasswordChange: true,
        createdAt: creationDate
    };

    // MODIFICADO: Salva no objeto 'users'
    state.users[uid] = newUserProfile;

    // MODIFICADO: Busca manager pelo UID
    const manager = (state.users || {})[session.userId];
    newIntern.auditLog.push({
        id: uuid(),
        action: 'approve_registration',
        byUserId: manager.id,
        byUserName: manager.username,
        at: creationDate,
        details: `Pré-cadastro de '${reg.name}' (${reg.email}) foi aprovado.`
    });

    // A remoção da lista de pendentes já foi feita com 'splice'

    await save(state);
    showToast('Pré-cadastro aprovado e usuário criado no banco de dados!', 'success');
    render();
}

export async function rejectRegistration(regId) {
    if (!confirm('Deseja recusar este pré-cadastro? Ele será movido para a lixeira.')) return;

    // Encontra a "chave" (o UID) do registro pendente que corresponde ao ID interno
    const regKey = Object.keys(state.pendingRegistrations || {}).find(key => state.pendingRegistrations[key].id === regId);

    if (!regKey) return;

    // Pega o registro e remove do objeto de pendentes
    const reg = state.pendingRegistrations[regKey];
    delete state.pendingRegistrations[regKey];

    reg.status = 'rejected';
    reg.rejectedAt = timestamp();

    // IMPORTANTE: Remove a senha antes de mover para a lixeira
    delete reg.password;

    (state.trash || []).push(reg);

    // MODIFICADO: Busca manager pelo UID
    const manager = (state.users || {})[session.userId];
    (state.systemLog || []).push({
        id: uuid(),
        action: 'reject_registration',
        byUserId: manager.id,
        byUserName: manager.username,
        at: timestamp(),
        details: `Pré-cadastro de '${reg.name}' (${reg.email}) foi recusado.`,
        context: 'Gerenciamento de Usuários'
    });

    // A remoção da lista de pendentes já foi feita com 'splice'

    await save(state);
    alert(`Usuário recusado e movido para a lixeira.\n\nIMPORTANTE: Você agora precisa excluir este usuário (${reg.email}) manualmente no painel do Firebase Authentication para liberar o e-mail.`);
    // FIM DA ALTERAÇÃO

    showToast('Pré-cadastro recusado e movido para a lixeira.', 'success');
    render();
}