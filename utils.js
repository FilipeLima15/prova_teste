/* utils.js - Funções utilitárias */

// Exportamos cada função para que outros arquivos possam usá-las
export function uuid() {
    return 'id-' + Math.random().toString(36).slice(2, 9);
}

export function nowISO() {
    return new Date().toISOString().slice(0, 10);
}

export function timestamp() {
    return new Date().toISOString();
}

export function escapeHtml(s) {
    return String(s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Função para download de blob (agora movida para o contexto do Manager)
// A função downloadBlob foi mantida no app.js por enquanto, pois ela é específica do contexto do Manager.
// Se quisermos movê-la depois para um utils de UI, podemos fazer isso.

// Novo helper para formatar a data (dd/mm/aaaa)
export function formatDate(isoString) {
    if (!isoString) return new Date().toLocaleDateString('pt-BR');
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('pt-BR');
    } catch (e) {
        return new Date().toLocaleDateString('pt-BR');
    }
}

// --- NOVAS FUNÇÕES ---

// Lista de países com códigos e bandeiras (emojis)
export function getCountryData() {
    return [
        { name: 'Brasil', code: '55', flag: '🇧🇷' },
        { name: 'Portugal', code: '351', flag: '🇵🇹' },
        { name: 'United States', code: '1', flag: '🇺🇸' },
        { name: 'Argentina', code: '54', flag: '🇦🇷' },
        { name: 'Angola', code: '244', flag: '🇦🇴' },
        { name: 'Bolivia', code: '591', flag: '🇧🇴' },
        { name: 'Cabo Verde', code: '238', flag: '🇨🇻' },
        { name: 'Chile', code: '56', flag: '🇨🇱' },
        { name: 'Colombia', code: '57', flag: '🇨🇴' },
        { name: 'France', code: '33', flag: '🇫🇷' },
        { name: 'Germany', code: '49', flag: '🇩🇪' },
        { name: 'Italy', code: '39', flag: '🇮🇹' },
        { name: 'Japan', code: '81', flag: '🇯🇵' },
        { name: 'Mozambique', code: '258', flag: '🇲🇿' },
        { name: 'Paraguay', code: '595', flag: '🇵🇾' },
        { name: 'Peru', code: '51', flag: '🇵🇪' },
        { name: 'Spain', code: '34', flag: '🇪🇸' },
        { name: 'United Kingdom', code: '44', flag: '🇬🇧' },
        { name: 'Uruguay', code: '598', flag: '🇺🇾' },
        { name: 'Venezuela', code: '58', flag: '🇻🇪' },
    ];
}

// Gera o HTML para o dropdown de seleção de país
export function createCountryCodeDropdownHtml(elementId, selectedCode = '55') {
    const countries = getCountryData();
    let optionsHtml = countries.map(country =>
        `<option value="${country.code}" ${country.code === selectedCode ? 'selected' : ''}>
            ${country.flag} +${country.code}
        </option>`
    ).join('');

    return `
        <select id="${elementId}" class="input" style="flex: 0 0 120px; padding-left: 5px; padding-right: 5px; -moz-appearance: none; -webkit-appearance: none; appearance: none; background-position: right 5px center !important;">
            ${optionsHtml}
        </select>
    `;
}

// ------------------- FUNÇÕES AUXILIARES COM DAY.JS -------------------

// Formata data usando Day.js (alternativa mais moderna ao formatDate)
export function formatDateDayjs(dateString, format = 'DD/MM/YYYY') {
    if (!dateString) return '';
    if (typeof dayjs === 'undefined') {
        // Fallback para formatDate original se Day.js não estiver disponível
        return formatDate(dateString);
    }
    try {
        return dayjs(dateString).format(format);
    } catch (e) {
        return '';
    }
}

// Formata data e hora juntos
export function formatDateTime(dateString) {
    if (!dateString) return '';
    if (typeof dayjs === 'undefined') {
        return formatDate(dateString);
    }
    try {
        return dayjs(dateString).format('DD/MM/YYYY [às] HH:mm');
    } catch (e) {
        return '';
    }
}

// Retorna tempo relativo (ex: "há 2 dias", "daqui a 1 semana")
export function getRelativeTime(dateString) {
    if (!dateString) return '';
    if (typeof dayjs === 'undefined') {
        return formatDate(dateString);
    }
    try {
        return dayjs(dateString).fromNow();
    } catch (e) {
        return '';
    }
}

// Adiciona dias a uma data
export function addDays(dateString, days) {
    if (typeof dayjs === 'undefined') {
        const date = new Date(dateString);
        date.setDate(date.getDate() + days);
        return date.toISOString();
    }
    try {
        return dayjs(dateString).add(days, 'day').toISOString();
    } catch (e) {
        return dateString;
    }
}

// Calcula diferença em dias entre duas datas
export function diffDays(dateString1, dateString2) {
    if (typeof dayjs === 'undefined') {
        const d1 = new Date(dateString1);
        const d2 = new Date(dateString2);
        return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
    }
    try {
        return dayjs(dateString2).diff(dayjs(dateString1), 'day');
    } catch (e) {
        return 0;
    }
}


