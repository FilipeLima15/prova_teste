/* app.js - Arquivo Principal da Aplicação (Orquestrador) */

// ------------------- IMPORTAÇÕES DOS MÓulos 
import { database, auth } from './firebase-config.js';
import { uuid, nowISO, timestamp, escapeHtml, formatDate } from './utils.js';
import { showModal, showForgotPasswordModal, showPreRegistrationModal } from './ui-modals.js';
import { renderIntern } from './view-intern.js';
import { renderManager } from './view-manager-main.js';
import { cleanupRejectedRegistrations } from './view-manager-data.js';
// NOVO: Importa a função de renderização do novo perfil de servidor
import { renderServer } from './internal-servers.js';

// ==========================================
// 🔧 CONFIGURAÇÃO DE SEGURANÇA - VERIFICAÇÃO DE EMAIL
// ==========================================
const CONFIG_SEGURANCA = {
    // ⚠️ IMPORTANTE: Mudar para false quando colocar em PRODUÇÃO!
    AMBIENTE_TESTE: true,
    // apenas funciona se AMBIENTE_TESTE
    EMAILS_ISENTOS: [
        '@cejusc.com.br',
        // Adicione mais emails aqui se necessário
    ]
};

// Função auxiliar: verifica se o email está na lista de isentos
function emailEstaIsento(email) {
    // Se não estiver em ambiente de teste, ninguém está isento
    if (!CONFIG_SEGURANCA.AMBIENTE_TESTE) return false;

    // Verifica se o email está na lista de isentos
    return CONFIG_SEGURANCA.EMAILS_ISENTOS.some(isento => {
        if (isento.startsWith('@')) {
            // Verifica domínio (ex: @cejusc.com.br)
            return email.toLowerCase().endsWith(isento.toLowerCase());
        }
        // Verifica email específico
        return email.toLowerCase() === isento.toLowerCase();
    });
}
// ==========================================

// ✅ NOVO: Exporta CONFIG_SEGURANCA para o contexto global
// (Necessário para ui-modals.js verificar se email está isento)
if (typeof window !== 'undefined') {
    window.CONFIG_SEGURANCA = CONFIG_SEGURANCA;
}

// Configura Day.js para usar português do Brasil
if (typeof dayjs !== 'undefined') {
    dayjs.locale('pt-br');
}

// Função helper para mostrar notificações Toast
function showToast(message, type = 'success') {
    if (typeof Toastify === 'undefined') {
        console.warn('Toastify não carregado, usando alert()');
        alert(message);
        return;
    }

    const colors = {
        success: 'linear-gradient(to right, #10b981, #059669)',
        error: 'linear-gradient(to right, #ef4444, #dc2626)',
        warning: 'linear-gradient(to right, #f59e0b, #d97706)',
        info: 'linear-gradient(to right, #013e4a, #2b6cb0)'
    };

    // ✅ NOVO: Tempos diferentes por tipo
    const durations = {
        success: 4000,  // 4 segundos para sucesso
        error: 7000,    // 7 segundos para erros
        warning: 6000,  // 6 segundos para avisos
        info: 5000      // 5 segundos para informações
    };

    Toastify({
        text: message,
        duration: durations[type] || 5000,  // ← USA o tempo específico ou 5s padrão
        gravity: 'top',
        position: 'right',
        stopOnFocus: true,
        style: {
            background: colors[type] || colors.info,
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600'
        }
    }).showToast();
};
window.showToast = showToast;

// Função helper para confirmações com SweetAlert2
async function showConfirm(title, text, confirmButtonText = 'Confirmar', cancelButtonText = 'Cancelar') {
    if (typeof Swal === 'undefined') {
        return confirm(`${title}\n\n${text}`);
    }

    const result = await Swal.fire({
        title: title,
        text: text,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#013e4a',
        cancelButtonColor: '#6b7280',
        confirmButtonText: confirmButtonText,
        cancelButtonText: cancelButtonText,
        customClass: {
            popup: 'animate__animated animate__fadeIn'
        }
    });

    return result.isConfirmed;
};
window.showConfirm = showConfirm;

// Função helper para adicionar ícones Font Awesome facilmente
function addIcon(iconClass, text = '') {
    if (text) {
        return `<i class="${iconClass}"></i> ${text}`;
    }
    return `<i class="${iconClass}"></i>`;
};
window.addIcon = addIcon;

// Exporta funções para uso em outros módulos
export { showToast, showConfirm, addIcon };

// ------------------- ESTADO E VARIÁVEIS GLOBAIS -------------------
export let state = null;
export let session = null;
const root = document.getElementById('root');

// ------------------- FUNÇÕES GLOBAIS EXPORTADAS -------------------
export {
    findUserByIntern,
    findInternById,
    findServerById, // NOVO: Exporta a função para encontrar servidores
    hasPower,
    downloadBlob,
    render,
    defaultPowersFor,

};

export async function saveInternData(internObject) {
    if (!session || !session.internFirebaseKey) {
        console.error("Não é possível salvar: Chave do estagiário não encontrada na sessão.");
        showToast("Erro: Sua sessão está inválida. Tente relogar.", "error");
        return;
    }
    try {
        // Salva OS DADOS DO ESTAGIÁRIO no caminho exato
        const path = `/appState/interns/${session.internFirebaseKey}`;
        await database.ref(path).set(internObject);
    } catch (e) {
        console.error("Erro ao salvar dados do estagiário:", e);
        showToast("Erro ao salvar seus dados: " + e.message, "error");
    }
}
export async function save(stateObj) {
    if (!stateObj || typeof stateObj !== 'object') {
        console.warn('Recusando salvar estado inválido:', stateObj);
        return false;
    }

    try {
        // Verifica se há um usuário autenticado
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.error('Nenhum usuário autenticado ao tentar salvar.');
            showToast('Erro: Você precisa estar logado para salvar.', 'error');
            return false;
        }

        // Pega o role do usuário atual
        const userRole = (stateObj.users || {})[currentUser.uid]?.role;

        // Admins e Supers podem salvar o estado COMPLETO
        if (userRole === 'super' || userRole === 'admin') {
            await database.ref('/appState').set(stateObj);
            return true;
        }

        // ❌ Usuários não-admin NÃO podem usar save() diretamente
        // Eles devem usar saveInternData() ou salvar apenas seus campos específicos
        console.warn('Usuário sem permissão de admin tentou usar save():', userRole);
        showToast('Você não tem permissão para salvar o estado completo.', 'error');
        return false;

    } catch (e) {
        console.error("Erro ao salvar dados no Firebase:", e);
        showToast('Erro de permissão ao salvar. Verifique as regras do Firebase.', 'error');
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
    // Servidores e Estagiários não têm poderes por padrão
    return {};
}

// Objeto padrão para os dados cadastrais do estagiário
// *** ALTERAÇÃO AQUI: Adicionada a linha internshipEndDate ***
const defaultRegistrationData = {
    fullName: '',
    cpf: '',
    birthDate: '',
    mainPhone: '',
    mainPhoneCode: '55',
    altPhone: '',
    altPhoneCode: '55',
    address: '',
    instEmail: '',
    enrollmentId: '',
    internshipHours: '',
    internshipStartDate: '',
    internshipEndDate: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: '',
    emergencyContactPhoneCode: '55',
    emergencyContactWhatsapp: 'nao',
    university: '',
    universityOther: '',
    currentSemester: '',
    lastUpdatedAt: null
};

// ----------------- CARREGAMENTO E DADOS INICIAIS -----------------

// MODIFICADO: A função sampleData agora retorna uma estrutura vazia.
// O usuário "super" deve ser criado manualmente no painel do Firebase.
function sampleData() {
    const now = timestamp();
    return {
        users: {}, // Vazio. O usuário admin é criado no Auth.
        interns: [],
        servers: [],
        meta: { created: now, provaBlockDays: 0, trashRetentionDays: 10 },
        pendingRegistrations: {}, // MODIFICADO: Agora é um objeto
        trash: [],
        systemLog: [],
        loginLog: [],
        pautaPrazos: []
    };
}

// --- FUNÇÃO LOAD TOTALMENTE MODIFICADA ---
// Agora ela carrega os dados em etapas, com base nas permissões
async function load(uid) {
    let userProfile = null;

    // ETAPA 1: Carregar APENAS o perfil do usuário logado
    try {
        const userSnapshot = await database.ref(`/appState/users/${uid}`).once('value');
        if (!userSnapshot.exists()) {
            console.error("PERFIL NÃO ENCONTRADO. Usuário logado no Auth, mas sem perfil no Realtime Database.");
            // Isso pode acontecer se um usuário for criado no Auth mas não no DB.
            return null; // Retorna nulo para acionar o logout
        }
        userProfile = userSnapshot.val();
        userProfile.id = uid; // Garante que o ID (UID) esteja no objeto
        userProfile.powers = userProfile.powers || defaultPowersFor(userProfile.role || 'intern');

    } catch (e) {
        console.error("Erro ao carregar perfil do usuário:", e);
        // Isso pode ser um erro de rede ou um problema inicial de regras
        root.innerHTML = `<div style="padding: 20px; text-align: center;"><h2>Erro ao carregar perfil</h2><p>Não foi possível ler seu perfil de usuário no banco de dados.</p></div>`;
        return null;
    }

    // ETAPA 2: Carregar o restante dos dados com base na função (role) do usuário
    let stateData = {};

    try {
        if (userProfile.role === 'admin' || userProfile.role === 'super') {
            // --- CARGA DE ADMIN (MODIFICADA PARA LEITURA GRANULAR) ---
            // O usuário é Admin, carrega nó por nó (respeitando as regras)

            // Nós públicos (meta, pautaPrazos)
            const metaSnap = await database.ref('/appState/meta').once('value');
            const pautaSnap = await database.ref('/appState/pautaPrazos').once('value');

            // Nós de Admin (logs, trash, pending)
            const trashSnap = await database.ref('/appState/trash').once('value');
            const systemLogSnap = await database.ref('/appState/systemLog').once('value');
            const loginLogSnap = await database.ref('/appState/loginLog').once('value');
            const pendingSnap = await database.ref('/appState/pendingRegistrations').once('value');

            // Nós de Dados (users, interns, servers)
            const usersSnap = await database.ref('/appState/users').once('value');
            const internsSnap = await database.ref('/appState/interns').once('value');
            const serversSnap = await database.ref('/appState/servers').once('value');
            const contactsSnap = await database.ref('/appState/publicContacts').once('value');

            // Junta todos os dados em um objeto 'stateData'
            stateData = {
                meta: metaSnap.val() || { created: timestamp(), provaBlockDays: 0, trashRetentionDays: 10 },
                pautaPrazos: pautaSnap.val() || [],
                trash: trashSnap.val() || [],
                systemLog: systemLogSnap.val() || [],
                loginLog: loginLogSnap.val() || [],
                users: usersSnap.val() || {},
                interns: internsSnap.val() || [],
                servers: serversSnap.val() || [],
                pendingRegistrations: pendingSnap.val() || {},
                publicContacts: contactsSnap.val() || {}
            };

        } else {
            // --- CARGA DE ESTAGIÁRIO / SERVIDOR ---
            // O usuário NÃO é Admin. Carrega apenas os nós permitidos.
            // Precisamos fazer vários 'await' separados.

            const metaSnap = await database.ref('/appState/meta').once('value');
            const pautaSnap = await database.ref('/appState/pautaPrazos').once('value');
            const contactsSnap = await database.ref('/appState/publicContacts').once('value');

            // Inicializa o state parcial
            stateData = {
                users: { [uid]: userProfile }, // Só contém o próprio usuário
                meta: metaSnap.val() || { created: timestamp(), provaBlockDays: 0, trashRetentionDays: 10 },
                pautaPrazos: pautaSnap.val() || [],
                publicContacts: contactsSnap.val() || {},
                interns: [],
                servers: []
            };


            // As regras do Firebase DEVEM permitir isso
            if (userProfile.internId) {
                const query = database.ref('/appState/interns').orderByChild('id').equalTo(userProfile.internId);
                const internSnap = await query.once('value');

                if (internSnap.exists()) {
                    // --- INÍCIO DA CORREÇÃO ---
                    // Pega a CHAVE aleatória do Firebase (ex: "-N_xyz...")
                    const firebaseKey = Object.keys(internSnap.val())[0];
                    const internData = internSnap.val()[firebaseKey];

                    stateData.interns = [internData];

                    // SALVA A CHAVE NA SESSÃO para usarmos ao salvar
                    session.internFirebaseKey = firebaseKey;
                    // --- FIM DA CORREÇÃO ---
                }
            }

            if (userProfile.serverId) {
                const serverSnap = await database.ref(`/appState/servers/${userProfile.serverId}`).once('value');
                if (internSnap.exists()) {
                    // --- INÍCIO DA CORREÇÃO ---
                    // Pega a CHAVE aleatória do Firebase (ex: "-N_xyz...")
                    const firebaseKey = Object.keys(internSnap.val())[0];
                    const internData = internSnap.val()[firebaseKey];

                    stateData.interns = [internData];

                    // SALVA A CHAVE NA SESSÃO para usarmos ao salvar
                    session.internFirebaseKey = firebaseKey;
                    // --- FIM DA CORREÇÃO ---
                }
            }
        }

        // ETAPA 3: Limpar e padronizar os dados (igual à função antiga)
        const parsed = stateData;
        parsed.meta = parsed.meta || {};

        // Interns (seja a lista completa de admin ou o array de 1 do estagiário)
        parsed.interns = (parsed.interns || []).map(i => ({
            ...{ dates: [], vacations: [], hoursEntries: [], auditLog: [] },
            ...i,
            registrationData: { ...defaultRegistrationData, ...(i.registrationData || {}) }
        }));

        parsed.servers = parsed.servers || [];

        // MODIFICADO: pendingRegistrations agora é um objeto
        parsed.pendingRegistrations = parsed.pendingRegistrations || {};

        parsed.trash = parsed.trash || [];
        parsed.systemLog = parsed.systemLog || [];
        parsed.loginLog = parsed.loginLog || [];
        parsed.pautaPrazos = parsed.pautaPrazos || [];

        // MODIFICADO: Os usuários agora são um objeto (chaveado por UID)
        // Se for admin, processa todos. Se for estagiário, já está processado.
        if (userProfile.role === 'admin' || userProfile.role === 'super') {
            parsed.users = (parsed.users || {});
            Object.keys(parsed.users).forEach(userUid => {
                const u = parsed.users[userUid];
                parsed.users[userUid] = {
                    id: userUid, // O ID do usuário AGORA é o UID
                    ...u,
                    powers: u.powers || defaultPowersFor(u.role || 'intern'),
                };
            });
        }
        // Garante que o perfil do usuário logado (que carregamos primeiro)
        // esteja no objeto de usuários, caso a carga principal falhe em pegá-lo
        if (!parsed.users[uid]) {
            parsed.users[uid] = userProfile;
        }

        return parsed;

    } catch (e) {
        console.error("Erro ao carregar dados do Firebase (Etapa 2):", e);
        // Este é o erro que você viu
        root.innerHTML = `<div style="padding: 20px; text-align: center;"><h2>Erro de Permissão</h2><p>Não foi possível carregar os dados. Você pode não estar logado ou as regras de segurança do Firebase estão bloqueando o acesso.</p><p><button onclick="window.logout()">Tentar Novamente</button></p></div>`;
        return null; // Retorna nulo para indicar falha
    }
}


// ----------------- LÓGICA PRINCIPAL DA APLICAÇÃO -----------------

// Função de limpeza para férias excluídas com mais de 6 meses
async function cleanupDeletedVacations() {
    // ... (nenhuma alteração nesta função)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let needsSave = false;
    (state.interns || []).forEach(intern => {
        if (!intern.vacations || intern.vacations.length === 0) return;

        const originalCount = intern.vacations.length;
        intern.vacations = intern.vacations.filter(vacation => {
            if (vacation.status === 'deleted' && vacation.deletedAt) {
                return new Date(vacation.deletedAt) > sixMonthsAgo;
            }
            return true;
        });

        if (intern.vacations.length < originalCount) {
            needsSave = true;
        }
    });

    if (needsSave) {
        console.log('Limpando registros de férias excluídas com mais de 6 meses...');
        await save(state);
    }
}

// NOVO: Função de limpeza para notificações com mais de 365 dias
async function cleanupOldNotifications() {
    // ... (nenhuma alteração nesta função)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    let needsSave = false;
    // MODIFICADO: Itera sobre o OBJETO de usuários
    Object.values(state.users || {}).forEach(user => {
        if (!user.notifications || user.notifications.length === 0) return;

        const originalCount = user.notifications.length;
        user.notifications = user.notifications.filter(notification => {
            return !notification.timestamp || new Date(notification.timestamp) > oneYearAgo;
        });

        if (user.notifications.length < originalCount) {
            needsSave = true;
        }
    });

    if (needsSave) {
        console.log('Limpando notificações com mais de 365 dias...');
        await save(state);
    }
}


// FUNÇÃO PRINCIPAL MODIFICADA (initApp)
async function initApp() {
    root.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;"><h2>Inicializando aplicação...</h2></div>';

    // session (de sessionStorage) não é mais usado para autenticação,
    // mas pode ser mantido se você usá-lo para guardar estado da UI (como viewMode)
    const savedSessionUI = sessionStorage.getItem('app_session_ui');
    let uiState = {};
    if (savedSessionUI) {
        try { uiState = JSON.parse(savedSessionUI); } catch (e) { uiState = {}; }
    }

    // Ouve as mudanças de autenticação
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // ----- USUÁRIO ESTÁ LOGADO -----
            console.log("Usuário autenticado:", user.uid);
            session = {
                userId: user.uid, // O session.userId AGORA é o Firebase UID
                viewMode: uiState.viewMode || null // Restaura o viewMode
            };

            // MODIFICADO: Carrega o estado passando o UID
            state = await load(user.uid);

            if (state === null) {
                // Falha ao carregar (perfil não encontrado ou erro de permissão)
                // A função 'load' já exibiu o erro.
                await auth.signOut(); // Chama o logout
                return;
            }

            // --- Somente admins executam limpeza ---
            const userProfile = (state.users || {})[user.uid];
            if (userProfile && (userProfile.role === 'admin' || userProfile.role === 'super')) {
                // Executa as rotinas de limpeza
                await cleanupDeletedVacations();
                await cleanupOldNotifications();
                await cleanupRejectedRegistrations();
            }

            render(); // Usuário logado e perfil encontrado, renderiza o app

        } else {
            // ----- USUÁRIO ESTÁ DESLOGADO -----
            console.log("Nenhum usuário autenticado.");
            session = null;
            state = {}; // Estado vazio, pois não podemos ler o DB
            render(); // Renderiza a tela de login
        }
    });
}

// MODIFICADO: Agora procura usuários pelo UID no objeto
function findUserByIntern(internId) {
    return Object.values(state.users || {}).find(u => u.internId === internId);
}
function findInternById(id) { return (state.interns || []).find(i => i.id === id); }
function findServerById(id) { return (state.servers || []).find(s => s.id === id); }

function hasPower(user, power) {
    if (!user) return false;
    if (user.role === 'super') return true;

    if (user.delegatedAdmin?.enabled && session.viewMode === 'admin') {
        return !!(user.delegatedAdmin.powers && user.delegatedAdmin.powers[power]);
    }

    return !!(user.powers && user.powers[power]);
}

// FUNÇÃO DE LOGOUT MODIFICADA
window.logout = () => {
    // Limpa apenas o estado da UI da sessão
    sessionStorage.removeItem('app_session_ui');
    // Pede ao Firebase para deslogar
    auth.signOut().catch(error => {
        // Mesmo se houver um erro, força a renderização da tela de login
        console.error("Erro ao deslogar:", error);
        session = null;
        state = {};
        render();
    });
    // O onAuthStateChanged vai detectar o logout e chamar render()
};

// ----------------- ROTEADOR DE RENDERIZAÇÃO -----------------
function render() {
    if (!session) {
        // Se a sessão (do app) é nula, renderiza o login
        return renderLogin();
    }

    // Se a sessão existe, mas o state não foi carregado (ex: durante o 1º load)
    if (!state || !state.users) {
        root.innerHTML = '<h2>Carregando dados do usuário...</h2>';
        return;
    }

    // MODIFICADO: Busca o usuário pelo session.userId (que é o UID)
    const user = (state.users || {})[session.userId];
    if (!user) {
        // Se o usuário logado (session) não existe no state.users
        console.error("Usuário logado (session) não encontrado no state.users. Deslogando.");
        window.logout();
        return;
    }

    // Salva o viewMode na sessionStorage para persistir F5
    sessionStorage.setItem('app_session_ui', JSON.stringify({ viewMode: session.viewMode }));

    // --- (Nenhuma alteração na lógica de roteamento de perfis) ---
    if (user.role === 'intern') {
        if (user.delegatedAdmin?.enabled && session.viewMode === 'admin') {
            renderManager(user, true);
        } else {
            session.viewMode = 'intern';
            renderIntern(user);
        }
    } else if (user.role === 'servidor') {
        renderServer(user);
    } else {
        renderManager(user);
    }
    // --- FIM DA ALTERAÇÃO ---
}

// ==========================================
// 🛡️ SISTEMA DE RATE LIMITING - PROTEÇÃO CONTRA FORÇA BRUTA
// ==========================================
// Este sistema limita tentativas de login para prevenir ataques automatizados

// Armazena tentativas de login por email
const loginAttempts = new Map();

// Configurações de segurança
const RATE_LIMIT_CONFIG = {
    MAX_ATTEMPTS: 5,              // Máximo de tentativas permitidas
    LOCKOUT_TIME: 15 * 60 * 1000, // Tempo de bloqueio (15 minutos em milissegundos)
    CLEANUP_INTERVAL: 60 * 60 * 1000 // Limpa registros antigos a cada 1 hora
};

// Função que verifica se o usuário ESTÁ BLOQUEADO (sem incrementar contador)
function checkRateLimit(email) {
    const now = Date.now();
    const normalizedEmail = email.toLowerCase().trim();

    // Busca o histórico de tentativas deste email
    const attempts = loginAttempts.get(normalizedEmail);

    // Se não há tentativas anteriores, permite
    if (!attempts) {
        return { allowed: true, remainingAttempts: RATE_LIMIT_CONFIG.MAX_ATTEMPTS };
    }

    // Calcula quanto tempo passou desde a primeira tentativa
    const timeSinceFirst = now - attempts.firstAttempt;

    // Se passou o tempo de bloqueio, permite e reseta
    if (timeSinceFirst > RATE_LIMIT_CONFIG.LOCKOUT_TIME) {
        loginAttempts.delete(normalizedEmail);
        return { allowed: true, remainingAttempts: RATE_LIMIT_CONFIG.MAX_ATTEMPTS };
    }

    // Verifica se ultrapassou o limite de tentativas
    if (attempts.count >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS) {
        const timeLeft = Math.ceil((RATE_LIMIT_CONFIG.LOCKOUT_TIME - timeSinceFirst) / 60000);
        return {
            allowed: false,
            reason: `Muitas tentativas de login. Tente novamente em ${timeLeft} minuto(s).`,
            remainingTime: timeLeft
        };
    }

    // Retorna quantas tentativas restam (SEM incrementar ainda)
    return {
        allowed: true,
        remainingAttempts: RATE_LIMIT_CONFIG.MAX_ATTEMPTS - attempts.count
    };
}

// NOVA FUNÇÃO: Registra uma tentativa FALHA
function recordFailedAttempt(email) {
    const now = Date.now();
    const normalizedEmail = email.toLowerCase().trim();

    const attempts = loginAttempts.get(normalizedEmail);

    if (!attempts) {
        // Primeira tentativa falha
        loginAttempts.set(normalizedEmail, {
            count: 1,
            firstAttempt: now,
            lastAttempt: now
        });
    } else {
        // Incrementa contador de falhas
        attempts.count++;
        attempts.lastAttempt = now;
        loginAttempts.set(normalizedEmail, attempts);
    }

    // Retorna quantas tentativas restam
    return RATE_LIMIT_CONFIG.MAX_ATTEMPTS - (loginAttempts.get(normalizedEmail)?.count || 0);
}

// Função para resetar tentativas após login bem-sucedido
function resetRateLimit(email) {
    const normalizedEmail = email.toLowerCase().trim();
    loginAttempts.delete(normalizedEmail);
}

// Limpeza automática de registros antigos (evita uso excessivo de memória)
setInterval(() => {
    const now = Date.now();
    for (const [email, data] of loginAttempts.entries()) {
        // Remove registros com mais de 1 hora de inatividade
        if (now - data.lastAttempt > RATE_LIMIT_CONFIG.CLEANUP_INTERVAL) {
            loginAttempts.delete(email);
        }
    }
}, RATE_LIMIT_CONFIG.CLEANUP_INTERVAL);

// ----------------- TELA DE LOGIN (GRANDES MUDANÇAS) -----------------
function renderLogin() {
    root.innerHTML = '';
    root.className = 'login-screen';
    const card = document.createElement('div'); card.className = 'login-card';

    // MODIFICADO: HTML simplificado
    card.innerHTML = `
    <h2>Entrar</h2>
    <div class="login-input-group">
        
        <input id="inpEmail" placeholder="Digite seu email" type="email" class="input-modern" style="width: 100%;" />
        
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

    // REMOVIDA: Lógica do seletor de tipo

    // MODIFICADO: Lógica do botão de Login
    document.getElementById('btnLogin').addEventListener('click', async () => {
        const email = document.getElementById('inpEmail').value.trim();
        const pass = document.getElementById('inpPass').value;

        if (!email || !pass) {
            return alert('Preencha o email e a senha.');
        }

        // ✅ VERIFICA se o usuário está bloqueado (SEM incrementar contador)
        const rateLimitCheck = checkRateLimit(email);
        if (!rateLimitCheck.allowed) {
            showToast(rateLimitCheck.reason, 'error');
            return;
        }

        const btnLogin = document.getElementById('btnLogin');
        btnLogin.disabled = true;
        btnLogin.textContent = 'Entrando...';

        try {
            // Tenta fazer o login seguro com o Firebase Auth
            const userCredential = await auth.signInWithEmailAndPassword(email, pass);
            const user = userCredential.user; // ← ADICIONAR ESTA LINHA!

            // ✅ VERIFICAÇÃO DE EMAIL
            if (!user.emailVerified && !emailEstaIsento(user.email)) {
                // Email não verificado e não está na lista de isentos
                showToast('⚠️ Por favor, verifique seu email antes de fazer login. Verifique sua caixa de entrada.', 'warning');

                // Faz logout automático
                await auth.signOut();

                btnLogin.disabled = false;
                btnLogin.textContent = 'Entrar';
                return;
            }

            // ✅ Login bem-sucedido! Reseta o contador de tentativas
            resetRateLimit(email);

            // Se chegou aqui, está tudo OK (email verificado ou está isento)
            // O onAuthStateChanged vai detectar e carregar o app
        }
        catch (error) {
            // FALHA!
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';

            // ✅ REGISTRA a tentativa FALHA e pega tentativas restantes
            const remainingAttempts = recordFailedAttempt(email);

            // ✅ AVISO: Mostra tentativas restantes (desde a primeira falha)
            if (remainingAttempts > 0 && remainingAttempts <= 3) {
                showToast(`⚠️ Atenção: Restam ${remainingAttempts} tentativa(s) antes do bloqueio temporário.`, 'warning');
            }

            console.error("Falha no login:", error.code, error.message);

            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                showToast('❌ Credenciais inválidas. Verifique o email e a senha.', 'error');
            } else {
                showToast('❌ Erro ao tentar logar: ' + error.message, 'error');
            }
        }
    });

    document.getElementById('btnNewUserLogin').addEventListener('click', showPreRegistrationModal);

    // MODIFICADO: Lógica de "Esqueci a senha"
    document.getElementById('btnForgotPass').addEventListener('click', async () => {
        // Tenta pegar o email do campo de login, se já estiver preenchido
        let email = document.getElementById('inpEmail').value.trim();

        if (!email) {
            email = prompt("Digite o email da sua conta para redefinir a senha:");
        }

        if (!email) {
            return; // Usuário cancelou
        }

        try {
            // Pede ao Firebase para enviar o email de redefinição
            await auth.sendPasswordResetEmail(email);
            showToast('Email de redefinição enviado! Verifique sua caixa de entrada.', 'success');
        } catch (error) {
            console.error("Erro ao enviar redefinição:", error);
            if (error.code === 'auth/user-not-found') {
                alert('Nenhuma conta encontrada com este email.');
            } else {
                alert('Erro ao enviar email de redefinição.');
            }
        }
    });

    // Lógica do botão de ver senha (sem alteração)
    document.getElementById('toggleLoginPass').addEventListener('click', () => {
        const inpPass = document.getElementById('inpPass');
        const type = inpPass.getAttribute('type') === 'password' ? 'text' : 'password';
        inpPass.setAttribute('type', type);
        document.getElementById('toggleLoginPass').textContent = type === 'password' ? '🔒' : '🔓';
    });

    // REMOVIDA: Lógica do "Remember Me" (localStorage)
}

// ------------------- INICIALIZAÇÃO DA APLICAÇÃO -------------------
initApp();