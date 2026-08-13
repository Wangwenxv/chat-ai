(function initializeCharacterNormalizers(global) {
    'use strict';

    // 创建角色卡附属字段标准化服务，保持正则和 UI 模板的兼容规则集中管理。
    const createCharacterNormalizers = ({ systemRegexNames, cardUtils, generateUUID }) => {
        // 标准化正则开关、执行位置、深度和角色作用域。
        const normalizeRegexScript = (script = {}, fallbackScope = 'character') => {
            const normalized = { ...script };
            if (normalized.disabled !== undefined) {
                normalized.enabled = !normalized.disabled;
            } else if (normalized.enabled === undefined) {
                normalized.enabled = true;
            }
            if (!normalized.name && normalized.scriptName) normalized.name = normalized.scriptName;
            if (!normalized.regex && normalized.findRegex) normalized.regex = normalized.findRegex;
            if (!normalized.replacement && normalized.replaceString) normalized.replacement = normalized.replaceString;
            if (!normalized.flags && normalized.regexFlags) normalized.flags = normalized.regexFlags;
            if (!normalized.flags) normalized.flags = 'g';
            if (!Array.isArray(normalized.placement)) normalized.placement = [1, 2];
            if (normalized.markdownOnly === undefined) normalized.markdownOnly = false;
            if (normalized.promptOnly === undefined) normalized.promptOnly = false;
            if (normalized.markdownOnly && normalized.promptOnly) normalized.promptOnly = false;
            if (normalized.runOnEdit === undefined) normalized.runOnEdit = false;
            if (normalized.minDepth === undefined) normalized.minDepth = null;
            if (normalized.maxDepth === undefined) normalized.maxDepth = null;
            normalized.scope = normalized.scope === 'global'
                || fallbackScope === 'global'
                || systemRegexNames.includes(normalized.name || normalized.scriptName)
                ? 'global'
                : 'character';
            delete normalized.disabled;
            return normalized;
        };

        // 使用既有卡片工具生成标准角色卡导出字段。
        const toRegexExportEntry = (script = {}, fallbackScope = 'character') => (
            cardUtils.toRegexExportEntry(normalizeRegexScript(script, fallbackScope))
        );

        // 深拷贝模板状态，避免编辑预览直接修改持久化对象。
        const cloneUiObject = (value) => JSON.parse(JSON.stringify(value || {}));
        const cloneUiValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

        // 去除模板外层 Markdown 代码围栏后再送入渲染或导出流程。
        const stripUiTemplateCodeFence = (value) => {
            const text = String(value || '').trim();
            const fenced = text.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\s*```$/);
            return (fenced ? fenced[1] : text).trim();
        };

        // 根据初始变量和变更日志恢复模板第一次渲染所需状态。
        const inferInitialUiTemplateState = (template = {}, variableState = null) => {
            if (template.initialVariableState && typeof template.initialVariableState === 'object') {
                return cloneUiObject(template.initialVariableState);
            }
            let baseState = cloneUiObject(variableState || template.variableState || template.variables || {});
            const logs = Array.isArray(template.changeLog)
                ? [...template.changeLog].sort((left, right) => (left.time || 0) - (right.time || 0))
                : [];
            const initializedKeys = new Set();
            logs.forEach((log) => {
                Object.entries(log.changes || {}).forEach(([key, change]) => {
                    if (!initializedKeys.has(key) && change && Object.prototype.hasOwnProperty.call(change, 'from')) {
                        if (key === '$root') baseState = cloneUiValue(change.from) || {};
                        else baseState[key] = change.from;
                        initializedKeys.add(key);
                    }
                });
            });
            return baseState;
        };

        // 标准化 UI 模板字段、作用域、顺序、变量和运行时状态。
        const normalizeUiTemplate = (template = {}) => {
            const variableState = template.variableState && typeof template.variableState === 'object'
                ? cloneUiObject(template.variableState)
                : template.variables && typeof template.variables === 'object'
                    ? cloneUiObject(template.variables)
                    : template.initialVariableState && typeof template.initialVariableState === 'object'
                        ? cloneUiObject(template.initialVariableState)
                        : {};
            return {
                id: template.id || generateUUID(),
                name: template.name || 'UI模板',
                enabled: template.enabled !== false,
                scope: template.scope === 'global' ? 'global' : 'character',
                order: Number.isFinite(Number(template.order)) ? Number(template.order) : 100,
                placement: ['top', 'bottom'].includes(template.placement) ? template.placement : 'bottom',
                htmlTemplate: stripUiTemplateCodeFence(template.htmlTemplate || template.template || ''),
                initialVariableState: inferInitialUiTemplateState(template, variableState),
                variableState,
                variableSchema: template.variableSchema
                    && (typeof template.variableSchema === 'object' || typeof template.variableSchema === 'string')
                    ? template.variableSchema
                    : '',
                changeLog: Array.isArray(template.changeLog) ? template.changeLog : [],
                runtimeByCharacter: template.runtimeByCharacter && typeof template.runtimeByCharacter === 'object'
                    ? cloneUiObject(template.runtimeByCharacter)
                    : {},
                updateMode: template.updateMode || 'merge'
            };
        };

        // 按角色卡格式导出 UI 模板，排除当前会话的运行时变量。
        const toUiTemplateExportEntry = (template = {}) => (
            cardUtils.toUiTemplateExportEntry(normalizeUiTemplate(template))
        );

        // 导入模板时移除运行时字段，并把旧 variableState 转为初始状态。
        const sanitizeUiTemplateImportEntry = (template = {}) => {
            const { changeLog, runtimeByCharacter, variableState, model, version, ...cleanTemplate } = template || {};
            if (!cleanTemplate.initialVariableState && !cleanTemplate.variables && variableState && typeof variableState === 'object') {
                cleanTemplate.initialVariableState = cloneUiObject(variableState);
            }
            return cleanTemplate;
        };

        return {
            normalizeRegexScript,
            toRegexExportEntry,
            cloneUiObject,
            cloneUiValue,
            stripUiTemplateCodeFence,
            inferInitialUiTemplateState,
            normalizeUiTemplate,
            toUiTemplateExportEntry,
            sanitizeUiTemplateImportEntry
        };
    };

    global.ChatAICharacterNormalizers = { createCharacterNormalizers };
})(window);
