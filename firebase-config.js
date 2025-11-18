/* firebase-config.js - Configuração e inicialização do Firebase */

// Cole suas credenciais do Firebase aqui.
const firebaseConfig = {
    apiKey: "AIzaSyALtBA7Vbeatqhq4xNKyDvdRcN90fYgWlY",
    authDomain: "teste-ccad6.firebaseapp.com",
    databaseURL: "https://teste-ccad6-default-rtdb.firebaseio.com",
    projectId: "teste-ccad6",
    storageBucket: "teste-ccad6.firebasestorage.app",
    messagingSenderId: "693322842881",
    appId: "1:693322842881:web:6a2f49e86b897c6b065100"

};

// Inicializa o Firebase
const app = firebase.initializeApp(firebaseConfig);

// Exporta a instância do database para ser usada no app principal
export const database = firebase.database();

// NOVO: Exporta o serviço de autenticação para ser usado no login
export const auth = firebase.auth();

// REMOVIDO: A função initAuth() (login anônimo) foi removida.

// ==========================================
// 🛡️ APP CHECK - PROTEÇÃO CONTRA BOTS E ABUSOS
// ==========================================

// Ativa o App Check usando reCAPTCHA v3
if (typeof firebase.appCheck === 'function') {
    const appCheck = firebase.appCheck();
    
    appCheck.activate(
        '6LfQeQksAAAAAHFK1LihId7OXpEvBmBg1Sc9-3sL', // Site Key do reCAPTCHA
        true // Permite passar requisições em localhost para desenvolvimento
        //https://console.cloud.google.com/security/recaptcha/6LfQeQksAAAAAHFK1LihId7OXpEvBmBg1Sc9-3sL/overview?project=teste-ccad6&authuser=0
        //https://www.google.com/recaptcha/admin/site/738818512/setup
    );
    
    console.log('✅ App Check ativado com sucesso!');
} else {
    console.warn('⚠️ App Check não disponível. Verifique se o script foi carregado.');
}

