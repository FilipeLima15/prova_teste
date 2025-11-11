/* ui-modals.js - Funções para criação de modais */

import { uuid, timestamp, createCountryCodeDropdownHtml } from './utils.js';

// MODIFICADO: Importa 'auth' para o pré-cadastro
import { state, session, save, render, showToast } from './app.js';
import { auth, database } from './firebase-config.js';

// ✅ NOVO: Torna CONFIG_SEGURANCA acessível globalmente
// (Necessário porque ui-modals.js precisa verificar se o email está isento)
if (typeof window !== 'undefined') {
    // Importa CONFIG_SEGURANCA do contexto global que será exportado do app.js
    window.CONFIG_SEGURANCA = null; // Será preenchido pelo app.js
}

// Função genérica para criar um modal

export function showModal(innerHtml, options = {}) {
    // --- INÍCIO DA LÓGICA ADICIONADA ---
    // Conta quantos modais já estão abertos para ajustar o z-index
    const existingModals = document.querySelectorAll('.modal-backdrop').length;
    // A cada novo modal, aumentamos o z-index para garantir que ele fique na frente
    const newZIndex = 9999 + (existingModals * 10);
    // --- FIM DA LÓGICA ADICIONADA ---

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.zIndex = newZIndex; // Aplica o novo z-index

    const modal = document.createElement('div');
    modal.className = 'modal animate__animated animate__fadeIn';
    modal.innerHTML = innerHtml;

    // Devolve o padding padrão para modais que não são o painel de gerenciamento
    if (!innerHtml.includes('user-manage-modal')) {
        modal.style.padding = '16px';
    }

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    function close() {
        if (backdrop.parentNode) backdrop.remove();
        if (options.onClose) options.onClose();
    }

    const onKey = (e) => {
        if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (ev) => {
        if (ev.target === backdrop && options.allowBackdropClose !== false) close();
    });

    return { backdrop, modal, close, cleanup: () => { document.removeEventListener('keydown', onKey); } };
}

// Modal "Esqueci a senha"
// MODIFICADO: Esta função agora usa o auth.sendPasswordResetEmail
export function showForgotPasswordModal() {
    const html = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0;">Redefinição de Senha</h3>
            <p>Digite seu email de login abaixo. Enviaremos um link para você criar uma nova senha.</p>
            <form id="formForgotPass" style="margin-top: 15px; display: flex; flex-direction: column; gap: 10px;">
                <label>
                    <span class="small-muted">Email de login</span>
                    <input type="email" id="inpForgotEmail" class="input" required />
                </label>
                <div style="display:flex;justify-content:flex-end;margin-top: 10px; gap: 8px;">
                    <button type="button" class="button ghost" id="btnCancelForgot">Cancelar</button>
                    <button type="submit" class="button" id="btnSendReset">Enviar</button>
                </div>
            </form>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: true });

    m.modal.querySelector('#btnCancelForgot').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });

    m.modal.querySelector('#formForgotPass').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = m.modal.querySelector('#inpForgotEmail').value.trim();
        if (!email) return;

        try {
            await auth.sendPasswordResetEmail(email);
            showToast('Email de redefinição enviado! Verifique sua caixa de entrada.', 'success');
            m.close();
            m.cleanup();
        } catch (error) {
            console.error("Erro ao enviar redefinição:", error);
            if (error.code === 'auth/user-not-found') {
                showToast('Nenhuma conta encontrada com este email.', 'error');
            } else {
                showToast('Erro ao enviar email de redefinição.', 'error');
            }
        }
    });
}

// Modal "Folga Bloqueada"
export function showProvaBloqueadaModal() {
    const html = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0; color: var(--danger);">Folga Bloqueada</h3>
            <p>Prezado(a) estagiário(a), a data que escolheu está bloqueada, tendo em vista o prazo determinado pela supervisão. 
            Caso tenha interesse na folga-prova nessa data, <strong style="color:var(--danger); text-decoration: underline;">entrar em contato com a supervisão</strong>.</p>
            <div style="display:flex;justify-content:flex-end;margin-top: 15px;">
                <button class="button" id="btnUnderstood"><i class="fas fa-check"></i> Entendido</button>
            </div>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: true });
    m.modal.querySelector('#btnUnderstood').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });
}

// REMOVIDO: showChangePwdModalManager
// A alteração de senha de todos os usuários (admin, super, intern)
// será feita pelo "Esqueci a senha" (login) ou pelo "Alterar Senha" (view-intern.js)


// Modal de pré-cadastro para estagiários
// MODIFICADO: Alterado para usar Email/Senha como login principal
export function showPreRegistrationModal() {
    const universities = [
        'Centro Universitário de Brasília (UniCEUB)', 'Centro Universitário do Distrito Federal (UDF)',
        'Centro Universitário Estácio de Brasília', 'Centro Universitário IESB', 'Faculdade Presbiteriana Mackenzie Brasília',
        'Instituto Brasileiro de Ensino, Desenvolvimento e Pesquisa (IDP)', 'Universidade Católica de Brasília (UCB)',
        'Universidade de Brasília (UnB)', 'UniProcessus', 'UNIEURO - Centro Universitário', 'UNIP - Universidade Paulista (Campus Brasília)',
        'UPIS - Faculdades Integradas'
    ];

    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3>PRÉ-CADASTRO</h3>
        <div class="muted small">Seu cadastro será analisado pelo supervisor. Preencha todos os dados obrigatórios (*).</div>
      </div>
      <button id="closePreReg" class="button ghost">Cancelar</button>
    </div>
    <form id="formPreReg" style="margin-top:10px; max-height: 70vh; overflow-y: auto; padding-right: 15px;">
        <div id="error-message" style="color:var(--danger); font-weight: bold; display: none; text-align:center; margin-bottom: 10px; padding: 10px; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">Preencha os campos obrigatórios!</div>
        
        <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
            <legend style="font-weight:bold; color:var(--accent);">Dados de Acesso</legend>
            <div class="form-row">
                <label><span class="small-muted">Tipo</span><input value="Estagiário" disabled class="input" /></label>
            </div>
            <div class="form-row">
                <label><span class="small-muted">Subtipo *</span>
                <select id="preRegSubType"><option value="sessao">Sessão</option><option value="administrativo">Administrativo</option></select>
                </label>
            </div>
            
            <div class="form-row">
                <label id="label-preRegEmail"><span class="small-muted">Email de Acesso (Login) *</span>
                <input id="preRegEmail" type="email" required placeholder="seunome@email.com" />
                </label>
            </div>

            <div class="form-row">
                <label id="preRegUserLabel"><span class="small-muted">Matrícula (ex: e710856)</span>
                <input id="preRegUser" placeholder="Opcional" />
                </label>
            </div>
             <div class="form-row">
                 <label style="position:relative;"><span class="small-muted">Senha (mínimo 6 caracteres) *</span>
                    <input type="password" id="preRegPass" required style="padding-right: 36px;"/>
                    <span class="password-toggle-icon" id="togglePreRegPass1">🔒</span>
                </label>
            </div>
            <div class="form-row">
                <label style="position:relative;"><span class="small-muted">Confirmar senha *</span>
                    <input type="password" id="preRegPassConfirm" required style="padding-right: 36px;"/>
                    <span class="password-toggle-icon" id="togglePreRegPass2">🔒</span>
                </label>
            </div>
        </fieldset>

        <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
            <legend style="font-weight:bold; color:var(--accent);">Dados Pessoais</legend>
            <div class="form-row">
                <label id="label-fullName" for="fullName"><strong>Nome completo *</strong></label>
                <input id="fullName">
            </div>
            <div class="form-row">
                <label id="label-cpf" for="cpf"><strong>CPF (somente números) *</strong></label>
                <input id="cpf" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
            </div>
            <div class="form-row">
                <label id="label-birthDate" for="birthDate"><strong>Data de nascimento *</strong></label>
                <input id="birthDate" type="date">
            </div>
            <div class="form-row">
                <label id="label-mainPhone" for="mainPhone"><strong>Telefone principal (WhatsApp) *</strong></label>
                <div style="display: flex; gap: 8px;">
                    ${createCountryCodeDropdownHtml('mainPhoneCode')}
                    <input id="mainPhone" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex-grow: 1;">
                </div>
            </div>
            <div class="form-row">
                <label for="altPhone"><strong>Telefone alternativo</strong></label>
                 <div style="display: flex; gap: 8px;">
                    ${createCountryCodeDropdownHtml('altPhoneCode')}
                    <input id="altPhone" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex-grow: 1;">
                </div>
            </div>
            <div class="form-row">
                <label id="label-address" for="address"><strong>Endereço residencial com CEP *</strong></label>
                <textarea id="address" rows="3"></textarea>
            </div>
             <div class="form-row">
                <label for="instEmail"><strong>E-mail institucional (se souber)</strong></label>
                <input id="instEmail" type="email">
            </div>
        </fieldset>

        <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
            <legend style="font-weight:bold; color:var(--accent);">Estágio</legend>
            <div class="form-row">
                <label id="label-internshipHours" for="internshipHours"><strong>Horário de estágio *</strong></label>
                <select id="internshipHours">
                    <option value="">Selecione...</option>
                    <option value="13h-17h">13h—17h</option>
                    <option value="14h-18h">14h—18h</option>
                </select>
            </div>
            <div class="form-row">
                <label for="internshipStartDate"><strong>Data de início do estágio</strong></label>
                <input id="internshipStartDate" type="date">
            </div>
        </fieldset>

        <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
            <legend style="font-weight:bold; color:var(--accent);">Contato de Emergência</legend>
            <div class="form-row">
                <label id="label-emergencyContactName" for="emergencyContactName"><strong>Nome da pessoa *</strong></label>
                <input id="emergencyContactName">
            </div>
            <div class="form-row">
                <label id="label-emergencyContactRelation" for="emergencyContactRelation"><strong>Parentesco *</strong></label>
                <input id="emergencyContactRelation">
            </div>
            <div class="form-row">
                <label id="label-emergencyContactPhone" for="emergencyContactPhone"><strong>Telefone *</strong></label>
                <div style="display: flex; gap: 8px;">
                    ${createCountryCodeDropdownHtml('emergencyContactPhoneCode')}
                    <input id="emergencyContactPhone" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="flex-grow: 1;">
                </div>
            </div>
            <div class="form-row">
                 <label id="label-emergencyContactWhatsapp"><strong>Funciona WhatsApp? *</strong></label>
                 <select id="emergencyContactWhatsapp">
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                 </select>
            </div>
        </fieldset>

        <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
            <legend style="font-weight:bold; color:var(--accent);">Formação Acadêmica</legend>
             <div class="form-row">
                <label id="label-university" for="university"><strong>Instituição de Ensino Superior *</strong></label>
                <select id="university">
                    <option value="">Selecione...</option>
                    ${universities.map(u => `<option value="${u}">${u}</option>`).join('')}
                    <option value="outros">Outros</option>
                </select>
            </div>
            <div class="form-row" id="otherUniversityWrapper" style="display: none;">
                <label id="label-universityOther" for="universityOther"><strong>Qual instituição? *</strong></label>
                <input id="universityOther">
            </div>
            <div class="form-row">
                <label id="label-currentSemester" for="currentSemester"><strong>Semestre cursando *</strong></label>
                <input id="currentSemester">
            </div>
        </fieldset>
        
        <div style="display:flex;gap:8px;justify-content:flex-end">
            <button type="submit" class="button">Enviar pré-cadastro</button>
        </div>
    </form>
  `;
    const m = showModal(html);
    m.modal.querySelector('#closePreReg').addEventListener('click', () => { m.close(); m.cleanup(); });

    // REMOVIDA: Lógica do 'idTypeSelect' (CPF/Matrícula)
    const userInput = m.modal.querySelector('#preRegUser');
    const universitySelect = m.modal.querySelector('#university');
    const otherUniversityWrapper = m.modal.querySelector('#otherUniversityWrapper');

    // Validação da matrícula (opcional)
    userInput.maxLength = 7;
    userInput.oninput = () => {
        // Permite apenas o formato e123456 (ou t123456)
        userInput.value = userInput.value.replace(/[^et0-9]/gi, '');
    };

    const checkOtherUniversity = () => {
        otherUniversityWrapper.style.display = universitySelect.value === 'outros' ? 'block' : 'none';
    };

    universitySelect.addEventListener('change', checkOtherUniversity);
    checkOtherUniversity();

    const togglePreRegPass1 = m.modal.querySelector('#togglePreRegPass1');
    const preRegPass = m.modal.querySelector('#preRegPass');
    togglePreRegPass1.addEventListener('click', () => {
        const type = preRegPass.getAttribute('type') === 'password' ? 'text' : 'password';
        preRegPass.setAttribute('type', type);
        togglePreRegPass1.textContent = type === 'password' ? '🔒' : '🔓';
    });

    const togglePreRegPass2 = m.modal.querySelector('#togglePreRegPass2');
    const preRegPassConfirm = m.modal.querySelector('#preRegPassConfirm');
    togglePreRegPass2.addEventListener('click', () => {
        const type = preRegPassConfirm.getAttribute('type') === 'password' ? 'text' : 'password';
        preRegPassConfirm.setAttribute('type', type);
        togglePreRegPass2.textContent = type === 'password' ? '🔒' : '🔓';
    });

    m.modal.querySelector('#formPreReg').addEventListener('submit', async (ev) => {
        ev.preventDefault();

        let isValid = true;
        m.modal.querySelectorAll('label[id^="label-"]').forEach(label => label.style.color = '');
        m.modal.querySelector('#error-message').style.display = 'none';

        // CAMPOS OBRIGATÓRIOS (DADOS PESSOAIS)
        const mandatoryFields = [
            'fullName'
        ];

        mandatoryFields.forEach(id => {
            const input = m.modal.querySelector(`#${id}`);
            if (!input.value.trim()) {
                const label = m.modal.querySelector(`#label-${id}`);
                if (label) label.style.color = 'var(--danger)';
                isValid = false;
            }
        });

        /*if (universitySelect.value === 'outros' && !m.modal.querySelector('#universityOther').value.trim()) {
            m.modal.querySelector(`#label-universityOther`).style.color = 'var(--danger)';
            isValid = false;
        }*/

        // CAMPOS OBRIGATÓRIOS (ACESSO)
        const name = m.modal.querySelector('#fullName').value.trim();
        const email = m.modal.querySelector('#preRegEmail').value.trim();
        const pass = m.modal.querySelector('#preRegPass').value;
        const passConfirm = m.modal.querySelector('#preRegPassConfirm').value;
        const enrollmentId = userInput.value.trim(); // Matrícula (opcional)

        if (!name || !email || !pass || !passConfirm) {
            isValid = false;
        }
        if (!email) {
            m.modal.querySelector('#label-preRegEmail').style.color = 'var(--danger)';
        }
        if (pass !== passConfirm) {
            alert('As senhas não coincidem.');
            return;
        }

        // Validação da matrícula (se preenchida)
        if (enrollmentId) {
            const matriculaRegex = /^[et]\d{6}$/i;
            if (!matriculaRegex.test(enrollmentId)) {
                alert("Formato de matrícula inválido. Use a letra 'e' ou 't' seguida por 6 números (ex: e123456 ou t123456).");
                m.modal.querySelector('#preRegUserLabel').style.color = 'var(--danger)';
                isValid = false;
            }
        }

        if (!isValid) {
            m.modal.querySelector('#error-message').style.display = 'block';
            const form = m.modal.querySelector('#formPreReg');
            if (form) form.scrollTop = 0;
            return;
        }

        // --- INÍCIO DA CORREÇÃO DE SEGURANÇA ---

        // ETAPA 1: Criar o usuário no Firebase Authentication
        let userCredential;
        const submitButton = m.modal.querySelector('button[type="submit"]');

        try {
            // Desabilita o botão para evitar cliques duplos
            submitButton.disabled = true;
            submitButton.textContent = 'Enviando...';

            userCredential = await auth.createUserWithEmailAndPassword(email, pass);

            // Reabilita o botão (caso algo falhe na próxima etapa)
            submitButton.disabled = false;
            submitButton.textContent = 'Enviar pré-cadastro';

        } catch (error) {
            console.error("Erro ao criar usuário no Auth:", error);
            submitButton.disabled = false;
            submitButton.textContent = 'Enviar pré-cadastro';

            if (error.code === 'auth/email-already-in-use') {
                alert('Erro: Este email já está em uso. Se você já se cadastrou, aguarde a aprovação. Se esqueceu a senha, use a opção "Esqueci a senha" na tela de login.');
                m.modal.querySelector('#label-preRegEmail').style.color = 'var(--danger)';
            } else if (error.code === 'auth/weak-password') {
                alert('Erro: A senha é muito fraca. A senha deve ter no mínimo 6 caracteres.');
            } else {
                alert('Erro ao criar seu login: ' + error.message);
            }
            return; // Interrompe a submissão
        }

        // Se chegou aqui, o usuário foi criado no Auth (etapa 1 OK)
        // ETAPA 2: Salvar os dados do pré-cadastro no Realtime Database

        // MODIFICADO: Não salva mais a senha.
        // MODIFICADO: Adiciona o UID do Auth.
        const newPreReg = {
            id: uuid(),
            uid: userCredential.user.uid, // UID do Auth
            name,
            email: email,
            // A SENHA NÃO É MAIS SALVA (password: pass)
            identifier: enrollmentId || email, // Apenas para exibição
            identifierType: 'email',
            subType: m.modal.querySelector('#preRegSubType').value,
            createdAt: timestamp(),
            status: 'pending',
            registrationData: {
                fullName: name,
                cpf: m.modal.querySelector('#cpf').value,
                birthDate: m.modal.querySelector('#birthDate').value,
                mainPhone: m.modal.querySelector('#mainPhone').value,
                mainPhoneCode: m.modal.querySelector('#mainPhoneCode').value,
                altPhone: m.modal.querySelector('#altPhone').value,
                altPhoneCode: m.modal.querySelector('#altPhoneCode').value,
                address: m.modal.querySelector('#address').value,
                instEmail: m.modal.querySelector('#instEmail').value,
                enrollmentId: enrollmentId, // Salva a matrícula
                internshipHours: m.modal.querySelector('#internshipHours').value,
                internshipStartDate: m.modal.querySelector('#internshipStartDate').value,
                emergencyContactName: m.modal.querySelector('#emergencyContactName').value,
                emergencyContactRelation: m.modal.querySelector('#emergencyContactRelation').value,
                emergencyContactPhone: m.modal.querySelector('#emergencyContactPhone').value,
                emergencyContactPhoneCode: m.modal.querySelector('#emergencyContactPhoneCode').value,
                emergencyContactWhatsapp: m.modal.querySelector('#emergencyContactWhatsapp').value,
                university: universitySelect.value,
                universityOther: m.modal.querySelector('#universityOther').value,
                currentSemester: m.modal.querySelector('#currentSemester').value,
                lastUpdatedAt: null
            }
        };

        try {
            // MODIFICADO: Salva usando o UID como chave, em vez de .push()
            // Isso facilita ao admin encontrar o registro pendente.
            await database.ref('/appState/pendingRegistrations').child(userCredential.user.uid).set(newPreReg);

            // ✅ NOVO: Envia email de verificação automaticamente
            // (Só envia se o email NÃO estiver na lista de isentos)
            // Importa a função emailEstaIsento de app.js
            const emailIsento = window.CONFIG_SEGURANCA?.AMBIENTE_TESTE &&
                window.CONFIG_SEGURANCA?.EMAILS_ISENTOS?.some(isento => {
                    if (isento.startsWith('@')) {
                        return email.toLowerCase().endsWith(isento.toLowerCase());
                    }
                    return email.toLowerCase() === isento.toLowerCase();
                });

            if (!emailIsento) {
                try {
                    await userCredential.user.sendEmailVerification();
                    console.log('📧 Email de verificação enviado para:', email);
                    alert('Pré-cadastro enviado com sucesso!\n\n📧 Enviamos um email de verificação para ' + email + '.\n\nPor favor, verifique sua caixa de entrada e clique no link para ativar sua conta.\n\nDepois, aguarde a aprovação de um supervisor.');
                } catch (emailError) {
                    console.error('Erro ao enviar email de verificação:', emailError);
                    alert('Pré-cadastro enviado com sucesso!\n\nSua conta foi criada, mas houve um problema ao enviar o email de verificação. Entre em contato com o supervisor.\n\nAguarde a aprovação.');
                }
            } else {
                alert('Pré-cadastro enviado com sucesso! Sua conta de login foi criada e agora aguarda a aprovação de um supervisor.');
            }

            m.close(); m.cleanup();

        } catch (error) {
            console.error("Erro ao salvar pré-cadastro no RTDB:", error);
            // Isso é um problema: o usuário existe no Auth mas não no RTDB.
            // O admin terá que criar manualmente.
            alert('Seu login foi criado, mas houve um erro ao salvar seus dados. Por favor, contate o supervisor e informe o email: ' + email);
        }
        // --- FIM DA CORREÇÃO DE SEGURANÇA ---
    });
}

// Modal "Férias Bloqueadas por Pauta"
export function showFeriasBloqueadaPautaModal() {
    const html = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0; color: var(--danger);">Férias Bloqueadas</h3>
            <p>Prezado(a) estagiário(a), a solicitação de férias não foi registrada.</p>
            <p>O(A) senhor(a) escolheu uma data posterior ao prazo da pauta, ou seja, sua sala não foi fechada com antecedência e já temos audiência designada nela nesse período.</p>
            <p><strong>Neste caso, você tem duas opções:</strong></p>
            <ol style="margin-left: 20px; line-height: 1.8;">
                <li>Escolher outra data após a pauta;</li>
                <li>Entrar em contato com a supervisão e justificar a necessidade desse período.</li>
            </ol>
            <div style="display:flex;justify-content:flex-end;margin-top: 15px;">
                <button class="button" id="btnUnderstood"><i class="fas fa-check"></i> Entendido</button>
            </div>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: true });
    m.modal.querySelector('#btnUnderstood').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });
}

// Modal "Férias Bloqueadas - Alteração não permitida"
export function showVacationChangeBlockedModal() {
    const html = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0; color: var(--danger);">Alteração Bloqueada</h3>
            <p>Prezado(a) estagiário(a),</p>
            <p>A alteração (exclusão) solicitada não pode ser concluída, porque a sua sala foi fechada e não vai ser possível preenchê-la a tempo.</p>
            <p style="margin-top: 15px;"><strong style="color: var(--danger);">* Entrar em contato com a supervisão do setor.</strong></p>
            <div style="display:flex;justify-content:flex-end;margin-top: 15px;">
                <button class="button" id="btnUnderstood"><i class="fas fa-check"></i> Entendido</button>
            </div>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: true });
    m.modal.querySelector('#btnUnderstood').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });
}

// Modal de bloqueio de exclusão de férias aprovadas
export function showApprovedVacationDeletionBlockedModal() {
    const html = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0; color: var(--danger);"><strong>Exclusão Bloqueada</strong></h3>
            <p>Prezado(a) estagiário(a),</p>
            <p>A alteração (exclusão) solicitada não pode ser concluída.</p>
            <p style="margin-top: 15px;"><strong style="color: var(--danger);">Entrar em contato com a supervisão do setor.</strong></p>
            <div style="display:flex;justify-content:flex-end;margin-top: 15px;">
                <button class="button" id="btnUnderstood"><i class="fas fa-check"></i> Entendido</button>
            </div>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: true });
    m.modal.querySelector('#btnUnderstood').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });
}

// NOVO: Modal de confirmação de aprovação de férias
export function showVacationApprovalModal(onConfirm) {
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>Confirmar Aprovação de Férias</h3>
        <button id="cancelApprovalBtn" class="button ghost">Voltar</button>
    </div>
    <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 15px;">
        <p>Prezado(a), marque os checkbox para confirmar a concordância com as férias e que seguiu os procedimentos:</p>
        
        <label id="checkLabel1" class="form-check" style="padding: 10px; border-radius: 8px; background: var(--input-bg); transition: color 0.3s; cursor: pointer;">
            <input type="checkbox" id="confirmCheckbox1" />
            <span>Declaro que verifiquei o sistema do TJDFT e que o(a) estagiário(a) possui a quantidade de férias solicitada;</span>
        </label>
        
        <label id="checkLabel2" class="form-check" style="padding: 10px; border-radius: 8px; background: var(--input-bg); transition: color 0.3s; cursor: pointer;">
            <input type="checkbox" id="confirmCheckbox2" />
            <span>Declaro, também, que lancei no sistema do TJDFT o período de férias ou que lançarei, após concluir esta etapa.</span>
        </label>

        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top: 10px;">
            <button id="confirmApprovalBtn" class="button" disabled>Confirmar férias</button>
        </div>
    </div>
    `;

    const m = showModal(html, { allowBackdropClose: true });
    const checkbox1 = m.modal.querySelector('#confirmCheckbox1');
    const checkbox2 = m.modal.querySelector('#confirmCheckbox2');
    const label1 = m.modal.querySelector('#checkLabel1');
    const label2 = m.modal.querySelector('#checkLabel2');
    const confirmBtn = m.modal.querySelector('#confirmApprovalBtn');
    const cancelBtn = m.modal.querySelector('#cancelApprovalBtn');

    const updateState = () => {
        // Atualiza a cor dos textos
        label1.style.color = checkbox1.checked ? 'black' : 'var(--muted)';
        label2.style.color = checkbox2.checked ? 'black' : 'var(--muted)';

        // Habilita ou desabilita o botão de confirmação
        confirmBtn.disabled = !(checkbox1.checked && checkbox2.checked);
    };

    checkbox1.addEventListener('change', updateState);
    checkbox2.addEventListener('change', updateState);

    confirmBtn.addEventListener('click', () => {
        onConfirm();
        m.close();
        m.cleanup();
    });

    cancelBtn.addEventListener('click', () => {
        m.close();
        m.cleanup();
    });

    // Define o estado inicial
    updateState();
}


// Modal de confirmação de exclusão
export function showDeleteConfirmationModal(onConfirm, count = 1) {
    const plural = count > 1 ? 'itens' : 'item';
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="color: var(--danger);">Confirmar Exclusão</h3>
        <button id="cancelDeleteBtn" class="button ghost">Cancelar</button>
    </div>
    <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 12px;">
           <p>Para confirmar a <strong style="color: var(--danger);">exclusão de ${count} ${plural}</strong>, digite <strong style="color: var(--danger);">excluir</strong> no campo abaixo e clique em "OK".</p>
        <input type="text" id="deleteConfirmInput" placeholder="excluir" />
        <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button id="confirmDeleteBtn" class="button danger" disabled>OK</button>
        </div>
    </div>
    `;

    const m = showModal(html, { allowBackdropClose: true });
    const confirmInput = m.modal.querySelector('#deleteConfirmInput');
    const confirmBtn = m.modal.querySelector('#confirmDeleteBtn');
    const cancelBtn = m.modal.querySelector('#cancelDeleteBtn');

    confirmInput.addEventListener('input', () => {
        confirmBtn.disabled = confirmInput.value.toLowerCase() !== 'excluir';
    });

    confirmInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && !confirmBtn.disabled) {
            confirmBtn.click();
        }
    });

    confirmBtn.addEventListener('click', () => {
        onConfirm();
        m.close();
        m.cleanup();
    });

    cancelBtn.addEventListener('click', () => {
        m.close();
        m.cleanup();
    });

}