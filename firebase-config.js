/* firebase-config.js - Configuração e inicialização do Firebase */

// Cole suas credenciais do Firebase aqui.
const firebaseConfig = {
    apiKey: "AIzaSyAqiu15IVDPZ2gQORplVy0Q1m85Swy0hzQ",
    authDomain: "prova-teste-5fe84.firebaseapp.com",
    databaseURL: "https://prova-teste-5fe84-default-rtdb.firebaseio.com",
    projectId: "prova-teste-5fe84",
    storageBucket: "prova-teste-5fe84.firebasestorage.app",
    messagingSenderId: "443315928347",
    appId: "1:443315928347:web:64e80177b91f7cea4a67be"
};

// Inicializa o Firebase
const app = firebase.initializeApp(firebaseConfig);

// Exporta a instância do database para ser usada no app principal
export const database = firebase.database();