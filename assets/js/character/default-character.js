(function initializeDefaultCharacterService(global) {
    'use strict';

    // 把同步读取限制在默认人格启动阶段，确保首次渲染即可获得 JSON 角色字段。
    const readCharacterCardSync = (url) => {
        if (typeof XMLHttpRequest === 'undefined') return null;
        try {
            const request = new XMLHttpRequest();
            request.open('GET', url, false);
            request.overrideMimeType?.('application/json; charset=utf-8');
            request.send(null);
            const succeeded = request.status === 0 || (request.status >= 200 && request.status < 300);
            return succeeded && request.responseText ? JSON.parse(request.responseText) : null;
        } catch (error) {
            console.warn('Failed to read chat-ai character card synchronously:', error);
            return null;
        }
    };

    // 创建默认人格服务，集中管理卡片原始数据、刷新和内部字段映射。
    const createDefaultCharacterService = ({ cardUrl, characterUuid, appName, defaultAvatar }) => {
        let characterCard = readCharacterCardSync(cardUrl);

        // 标准 V2 卡使用 data 包裹字段，旧卡则直接使用根对象。
        const getCardData = () => {
            const cardData = characterCard?.data || characterCard || {};
            return cardData && typeof cardData === 'object' && !Array.isArray(cardData) ? cardData : {};
        };

        // 异步刷新卡片，绕过浏览器缓存以响应配置文件替换。
        const load = async () => {
            const response = await fetch(cardUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const content = await response.json();
            if (content && typeof content === 'object') characterCard = content;
            return characterCard;
        };

        // 将 character_book 的数组或对象 entries 统一为内部数组。
        const getWorldInfoEntries = (cardData) => {
            const characterBook = cardData.character_book || characterCard?.character_book || null;
            if (Array.isArray(characterBook?.entries)) return characterBook.entries;
            if (characterBook?.entries && typeof characterBook.entries === 'object') {
                return Object.values(characterBook.entries);
            }
            return Array.isArray(characterBook) ? characterBook : [];
        };

        // 使用应用层注入的标准化函数构建内置角色，避免角色模块依赖 Vue 状态。
        const createCharacter = ({
            normalizeWorldInfoEntry,
            normalizeRegexScript,
            normalizeUiTemplate,
            sanitizeUiTemplateImportEntry,
            generateUUID
        }) => {
            const cardData = getCardData();
            const extensions = cardData.extensions || {};
            const regexScripts = extensions.regex_scripts || characterCard?.extensions?.regex_scripts || [];
            const uiTemplates = cardData.uiTemplates
                || cardData.ui_templates
                || extensions.ui_templates
                || extensions.rp_hub_ui_templates
                || [];

            return {
                name: cardData.name || cardData.char_name || appName,
                description: cardData.description || cardData.char_persona || '通用 AI 助手',
                first_mes: cardData.first_mes || '',
                avatar: defaultAvatar,
                personality: cardData.personality || '',
                scenario: cardData.scenario || '',
                system_prompt: cardData.system_prompt || '',
                post_history_instructions: cardData.post_history_instructions || '',
                creator_notes: cardData.creator_notes || cardData.creatorcomment || cardData.creator_comment || '',
                mes_example: cardData.mes_example || '',
                alternate_greetings: Array.isArray(cardData.alternate_greetings) ? cardData.alternate_greetings : [],
                worldInfo: getWorldInfoEntries(cardData)
                    .map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'character' }))
                    .filter(entry => entry.scope !== 'global'),
                regexScripts: Array.isArray(regexScripts)
                    ? regexScripts
                        .map(script => normalizeRegexScript({ ...script, scope: 'character' }, 'character'))
                        .filter(script => script.scope !== 'global')
                    : [],
                uiTemplates: Array.isArray(uiTemplates)
                    ? uiTemplates.map(template => normalizeUiTemplate({
                        ...sanitizeUiTemplateImportEntry(template),
                        id: generateUUID(),
                        scope: 'character'
                    }))
                    : [],
                recentGenerationTimes: [],
                uuid: characterUuid,
                createdAt: 0,
                isBuiltinChatAi: true,
                defaultCardSource: cardUrl
            };
        };

        return { load, createCharacter };
    };

    global.ChatAIDefaultCharacter = { createDefaultCharacterService };
})(window);
