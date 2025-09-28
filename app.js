/* app.js - Arquivo Principal da Aplicação (Orquestrador) */

// ------------------- IMPORTAÇÕES DOS MÓDULOS -------------------
import { database } from './firebase-config.js';
import { uuid, nowISO, timestamp, escapeHtml, formatDate } from './utils.js';
import { showModal, showForgotPasswordModal, showPreRegistrationModal } from './ui-modals.js';
import { renderIntern } from './view-intern.js';
import { renderManager, cleanupRejectedRegistrations } from './view-manager.js';

// ------------------- ESTADO E VARIÁVEIS GLOBAIS -------------------
export let state = null;
export let session = null;
export let userFilter = 'all'; // Exportado para ser usado pelo view-manager
const root = document.getElementById('root');

// ------------------- FUNÇÕES GLOBAIS EXPORTADAS -------------------
export {
    findUserByIntern,
    findInternById,
    hasPower,
    downloadBlob,
    render,
    defaultPowersFor
};

export async function save(stateObj) {
    if (!stateObj || typeof stateObj !== 'object') {
        console.warn('Recusando salvar estado inválido:', stateObj);
        return false;
    }
    try {
        await database.ref('/appState').set(stateObj);
        return true;
    } catch (e) {
        console.error("Erro ao salvar dados no Firebase:", e);
        return false;
    }
}

function downloadBlob(txt, filename, mimeType = 'application/json') {
    const blob = new Blob([txt], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function defaultPowersFor(role) {
    if (role === 'super') return { create_intern: true, edit_user: true, delete_user: true, reset_password: true, delegate_admins: true, manage_hours: true, manage_provas: true };
    if (role === 'admin') return { create_intern: true, edit_user: true, delete_user: true, reset_password: true, delegate_admins: false, manage_hours: true, manage_provas: false };
    return { manage_hours: false, manage_provas: false };
}

// ----------------- CARREGAMENTO E DADOS INICIAIS -----------------
function sampleData() {
    const now = timestamp();
    const interns = [{ id: 'intern-1', name: `Estagiário 1`, dates: [], hoursEntries: [], auditLog: [] }];
    const users = [
        { id: uuid(), username: 'admin', name: 'Administrador Principal', password: '', role: 'super', powers: defaultPowersFor('super'), selfPasswordChange: true, createdAt: now },
        { id: uuid(), username: 'est1', password: '123456', role: 'intern', internId: 'intern-1', powers: defaultPowersFor('intern'), selfPasswordChange: true, createdAt: now }
    ];
    return { users, interns, meta: { created: now, provaBlockDays: 0, trashRetentionDays: 10 }, pendingRegistrations: [], trash: [] };
}

async function load() {
    try {
        const snapshot = await database.ref('/appState').once('value');
        const data = snapshot.val();
        if (!data) {
            return { users: [], interns: [], meta: { created: timestamp(), provaBlockDays: 0, trashRetentionDays: 10 }, pendingRegistrations: [], trash: [] };
        }
        const parsed = data;
        parsed.meta = parsed.meta || {};
        parsed.interns = (parsed.interns || []).map(i => ({ ...{ dates: [], hoursEntries: [], auditLog: [] }, ...i }));
        parsed.pendingRegistrations = parsed.pendingRegistrations || [];
        parsed.trash = parsed.trash || [];
        parsed.users = (parsed.users || []).map(u => ({
            id: u.id || uuid(),
            ...u,
            powers: u.powers || defaultPowersFor(u.role || 'intern'),
        }));
        return parsed;
    } catch (e) {
        console.error("Erro ao carregar dados do Firebase:", e);
        return { users: [], interns: [], meta: { created: timestamp(), provaBlockDays: 0, trashRetentionDays: 10 }, pendingRegistrations: [], trash: [] };
    }
}

// ----------------- LÓGICA PRINCIPAL DA APLICAÇÃO -----------------
async function initApp() {
    const savedSession = sessionStorage.getItem('app_session');
    if (savedSession) {
        try { session = JSON.parse(savedSession); } catch (e) { session = null; }
    }

    state = await load();

    if ((state.users || []).length === 0) {
        state = sampleData();
        const adminUser = state.users.find(u => u.role === 'super');
        if (adminUser) {
            adminUser.password = 'default_init_pass_12345';
        }
        await save(state);
    }

    render();
    cleanupRejectedRegistrations();
}

// Funções de busca globais
function findUserByIntern(internId) { return state.users.find(u => u.internId === internId); }
function findInternById(id) { return (state.interns || []).find(i => i.id === id); }
function hasPower(user, power) { if (!user) return false; if (user.role === 'super') return true; return !!(user.powers && user.powers[power]); }

// Função de logout acessível globalmente
window.logout = () => {
    session = null;
    sessionStorage.removeItem('app_session');
    render();
};

// ----------------- ROTEADOR DE RENDERIZAÇÃO -----------------
function render() {
    if (!state) {
        root.innerHTML = '<h2>Carregando...</h2>';
        return;
    }
    if (!session) return renderLogin();
    const user = (state.users || []).find(u => u.id === session.userId);
    if (!user) {
        window.logout();
        return;
    }
    if (user.role === 'intern') return renderIntern(user);
    return renderManager(user);
}

// ----------------- TELA DE LOGIN -----------------
function renderLogin() {
    root.innerHTML = '';
    root.className = 'login-screen';
    const card = document.createElement('div'); card.className = 'login-card';
    card.innerHTML = `
    <h2>Entrar</h2>
    <div class="login-input-group">
      <input id="inpUser" placeholder="Usuário" class="input-modern" />
      <div class="password-wrapper">
        <input id="inpPass" placeholder="Senha" type="password" class="input-modern" />
        <span class="password-toggle-icon" id="toggleLoginPass">🔒</span>
      </div>
      <div class="login-buttons">
        <button class="button" id="btnLogin">Entrar</button>
        <button class="button ghost" id="btnNewUserLogin">Novo usuário</button>
        <button class="button ghost small" id="btnForgotPass">Esqueci a senha</button>
      </div>
    </div>
  `;
    root.appendChild(card);

    document.getElementById('btnLogin').addEventListener('click', async () => {
        const u = document.getElementById('inpUser').value.trim();
        const p = document.getElementById('inpPass').value;
        const user = (state.users || []).find(x => x.username === u && x.password === p);
        if (!user) return alert('Usuário ou senha inválidos');
        session = { userId: user.id };
        sessionStorage.setItem('app_session', JSON.stringify(session));
        root.className = 'app';
        render();
    });

    document.getElementById('btnNewUserLogin').addEventListener('click', showPreRegistrationModal);
    document.getElementById('btnForgotPass').addEventListener('click', showForgotPasswordModal);

    const toggleLoginPass = document.getElementById('toggleLoginPass');
    toggleLoginPass.addEventListener('click', () => {
        const inpPass = document.getElementById('inpPass');
        const type = inpPass.getAttribute('type') === 'password' ? 'text' : 'password';
        inpPass.setAttribute('type', type);
        toggleLoginPass.textContent = type === 'password' ? '🔒' : '🔓';
    });
}

// ------------------- INICIALIZAÇÃO DA APLICAÇÃO -------------------
initApp();