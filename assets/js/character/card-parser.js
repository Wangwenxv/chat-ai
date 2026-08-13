(function initializeCharacterCardParser(global) {
    'use strict';

    // 将外部布尔值规范为明确 true/false，兼容字符串形式。
    const toBoolean = (value, defaultValue) => {
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'string') {
            if (value.toLowerCase() === 'false') return false;
            if (value.toLowerCase() === 'true') return true;
        }
        return !!value;
    };

    // 将外部数字字段转换为有限数字，非法值回退默认值。
    const toNumber = (value, defaultValue) => {
        if (value === undefined || value === null || value === '') return defaultValue;
        const number = Number(value);
        return Number.isNaN(number) ? defaultValue : number;
    };

    // 创建角色卡解析器，并注入系统世界书名称以维持作用域规则。
    const createCardParser = ({ systemWorldInfoNames }) => {
        // 标准化世界书字段、扩展字段和多种位置编码。
        const normalizeWorldInfoEntry = (entry = {}) => {
            const mergedEntry = { ...entry };
            const extensions = entry.extensions || {};
            Object.keys(extensions).forEach((key) => {
                if (extensions[key] !== undefined && extensions[key] !== null) {
                    mergedEntry[key] = extensions[key];
                }
            });
            delete mergedEntry.extensions;

            let keys = mergedEntry.keys || mergedEntry.key || [];
            if (typeof keys === 'string') {
                keys = keys.split(/[,，]/).map(key => key.trim()).filter(Boolean);
            } else if (!Array.isArray(keys)) {
                keys = [];
            }

            const validPositions = ['system_top', 'global_note', 'before_char', 'after_char', 'at_depth', 'user_top', 'assistant_top'];
            const positionAliases = {
                before_character: 'before_char',
                after_character: 'after_char',
                character_top: 'before_char',
                character_bottom: 'after_char',
                before_examples: 'before_char',
                after_examples: 'after_char',
                example_top: 'before_char',
                example_bottom: 'after_char',
                an_top: 'global_note',
                author_note: 'global_note',
                an_bottom: 'global_note'
            };
            const numericPositions = {
                0: 'before_char',
                1: 'after_char',
                2: 'global_note',
                3: 'global_note',
                4: 'at_depth'
            };
            let position = 'at_depth';
            const sourcePosition = mergedEntry.position;
            if (typeof sourcePosition === 'string') {
                const normalizedPosition = sourcePosition.toLowerCase().replace(/ /g, '_');
                const mappedPosition = positionAliases[normalizedPosition] || normalizedPosition;
                if (validPositions.includes(mappedPosition)) position = mappedPosition;
            } else if (typeof sourcePosition === 'number') {
                position = numericPositions[Number(sourcePosition)] || 'at_depth';
            }

            const getValue = (fieldNames, defaultValue) => {
                for (const fieldName of fieldNames) {
                    if (mergedEntry[fieldName] !== undefined && mergedEntry[fieldName] !== null) {
                        return mergedEntry[fieldName];
                    }
                }
                return defaultValue;
            };
            const comment = getValue(['comment'], '');
            return {
                comment,
                content: getValue(['content'], ''),
                enabled: toBoolean(getValue(['enabled'], true), true)
                    && !toBoolean(getValue(['disable', 'disabled'], false), false),
                scope: systemWorldInfoNames.includes(comment) || getValue(['scope'], 'character') === 'global'
                    ? 'global'
                    : 'character',
                keys,
                useRegex: toBoolean(getValue(['use_regex', 'useRegex'], false), false),
                constant: toBoolean(getValue(['constant'], false), false),
                position,
                order: toNumber(getValue(['insertion_order', 'order'], 0), 0),
                depth: toNumber(getValue(['depth'], 4), 4),
                scanDepth: toNumber(getValue(['scan_depth', 'scanDepth'], null), null),
                probability: toNumber(getValue(['probability'], 100), 100),
                useProbability: toBoolean(getValue(['useProbability', 'use_probability'], true), true)
            };
        };

        // 将对象或数组形式的 character_book entries 统一为数组。
        const getCharacterBookEntries = (characterBook) => {
            if (Array.isArray(characterBook?.entries)) return characterBook.entries;
            if (characterBook?.entries && typeof characterBook.entries === 'object') {
                return Object.values(characterBook.entries);
            }
            return Array.isArray(characterBook) ? characterBook : [];
        };

        // 保留外部正则字段，同时补齐应用内部读取的标准字段。
        const normalizeImportedRegexScript = (script, normalizeRegexScript) => {
            const normalized = { ...script };
            normalized.name = normalized.name || script.scriptName || 'Regex Script';
            normalized.regex = normalized.regex || script.findRegex || '';
            if (normalized.regex.startsWith('/') && normalized.regex.lastIndexOf('/') > 0) {
                const lastSlash = normalized.regex.lastIndexOf('/');
                const potentialFlags = normalized.regex.substring(lastSlash + 1);
                if (/^[gimsuy]*$/.test(potentialFlags)) {
                    normalized.flags = potentialFlags;
                    normalized.regex = normalized.regex.substring(1, lastSlash);
                }
            }
            normalized.replacement = normalized.replacement || script.replaceString;
            normalized.flags = normalized.flags || script.regexFlags || 'g';
            if (!Object.prototype.hasOwnProperty.call(normalized, 'enabled')) {
                normalized.enabled = Object.prototype.hasOwnProperty.call(script, 'disabled') ? !script.disabled : true;
            }
            if (!normalized.placement) normalized.placement = script.placement || [1, 2];
            if (normalized.markdownOnly === undefined) normalized.markdownOnly = script.markdownOnly || false;
            if (normalized.promptOnly === undefined) normalized.promptOnly = script.promptOnly || false;
            if (normalized.runOnEdit === undefined) normalized.runOnEdit = script.runOnEdit || false;
            if (normalized.minDepth === undefined) normalized.minDepth = script.minDepth || null;
            if (normalized.maxDepth === undefined) normalized.maxDepth = script.maxDepth || null;
            return normalizeRegexScript({ ...normalized, scope: 'character' }, 'character');
        };

        // 将 V1、V2 和松散 JSON 角色卡统一转换为应用内部角色对象。
        const parseCharacterCard = (rawData, avatarUrl, dependencies) => {
            const {
                defaultAvatar,
                generateUUID,
                normalizeRegexScript,
                normalizeUiTemplate,
                sanitizeUiTemplateImportEntry
            } = dependencies;
            const characterData = rawData.data || rawData;
            const characterBook = characterData.character_book || rawData.character_book || null;
            const regexScripts = characterData.extensions?.regex_scripts
                || rawData.extensions?.regex_scripts
                || characterData.regex_scripts
                || rawData.regex_scripts
                || [];
            const uiTemplates = characterData.uiTemplates
                || characterData.ui_templates
                || rawData.uiTemplates
                || rawData.ui_templates
                || characterData.extensions?.ui_templates
                || characterData.extensions?.rp_hub_ui_templates
                || rawData.extensions?.ui_templates
                || rawData.extensions?.rp_hub_ui_templates
                || [];

            return {
                name: characterData.name || characterData.char_name || 'Unknown',
                description: characterData.description || characterData.char_persona || '',
                first_mes: characterData.first_mes || '',
                avatar: avatarUrl || defaultAvatar,
                personality: characterData.personality || '',
                scenario: characterData.scenario || '',
                system_prompt: characterData.system_prompt || '',
                post_history_instructions: characterData.post_history_instructions || '',
                mes_example: characterData.mes_example || '',
                alternate_greetings: Array.isArray(characterData.alternate_greetings) ? characterData.alternate_greetings : [],
                creator_notes: characterData.creator_notes || characterData.creatorcomment || characterData.creator_comment || '',
                worldInfo: getCharacterBookEntries(characterBook)
                    .map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'character' }))
                    .filter(entry => entry.scope !== 'global'),
                regexScripts: Array.isArray(regexScripts)
                    ? regexScripts
                        .map(script => normalizeImportedRegexScript(script, normalizeRegexScript))
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
                uuid: generateUUID(),
                createdAt: Date.now()
            };
        };

        return { normalizeWorldInfoEntry, parseCharacterCard };
    };

    global.ChatAICharacterCardParser = { createCardParser };
})(window);
