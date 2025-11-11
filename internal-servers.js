/* internal-servers.js - Lógica e renderização da tela do servidor */

import { escapeHtml } from './utils.js';

// Função principal que renderiza a tela para o perfil "Servidor"
export function renderServer(user) {
    const root = document.getElementById('root');
    root.innerHTML = ''; // Limpa a tela
    root.className = 'app-grid'; // Usa o mesmo layout de grid da aplicação

    // Estrutura de HTML com um menu lateral e conteúdo principal
    root.innerHTML = `
        <aside class="sidebar-nav" style="padding: 12px;">
            <div style="padding: 12px; margin-bottom: 16px; border-bottom: 2px solid var(--accent);">
                <div style="font-weight: 700; font-size: 1.1rem; color: var(--accent); margin-bottom: 4px;">
                    ${escapeHtml(user.name || user.username)}
                </div>
                <div style="color: var(--muted); font-size: 12px; margin-bottom: 12px;">
                    Perfil do Servidor
                </div>
                
                <button id="btnLogoutServer" style="
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
                " onmouseover="this.style.background='var(--input-bg)'" onmouseout="this.style.background='white'">
                    <span>🚪</span>
                    <span>Sair</span>
                </button>
            </div>
        </aside>

        <main class="main-content" style="padding: 24px; display: flex; align-items: center; justify-content: center;">
            <div class="card" style="text-align: center; padding: 40px;">
                <h2 style="color: var(--accent);">Ambiente ainda em construção.</h2>
                <p class="muted">O perfil para servidores está sendo desenvolvido. Volte em breve!</p>
            </div>
        </main>
    `;

    // Adiciona o evento de clique ao botão de Sair
    document.getElementById('btnLogoutServer').addEventListener('click', () => {
        // window.logout() é uma função global definida em app.js
        window.logout();
    });
}