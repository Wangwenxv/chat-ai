(function initializeChatAIUtils(global) {
    'use strict';

    // 生成本地实体 ID，保持现有 UUID v4 兼容格式。
    const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.random() * 16 | 0;
        const value = character === 'x' ? random : (random & 0x3 | 0x8);
        return value.toString(16);
    });

    // 缓存思维链解析结果，避免同一条消息在模板渲染期间重复执行正则。
    const parseCotCache = new Map();
    const parseCot = (text) => {
        if (!text) return { cot: '', main: '', sys: '', isFinished: false };
        if (parseCotCache.has(text)) return parseCotCache.get(text);

        // 同时兼容 think/cot、未闭合标签、带空格闭合标签和缺失斜杠的模型输出。
        const cotPattern = /<(think|cot)>([\s\S]*?)(?:<\/\s*\1\s*>|<\s*\1\s*>|$)/gi;
        let cotContent = '';
        let mainContent = text;
        let isFinished = false;

        // 从正文移除思维链，并仅转义非代码片段中的左尖括号。
        mainContent = mainContent.replace(cotPattern, (match, tag, content) => {
            const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/);
            const escapedContent = parts.map((part, index) => (
                index % 2 === 1 ? part : part.replace(/</g, '&lt;')
            )).join('');
            cotContent += escapedContent;
            if (match.includes('</') || (match.match(new RegExp(`<${tag}>`, 'gi')) || []).length > 1) {
                isFinished = true;
            }
            return '';
        });

        // 提取末尾的系统指令展示段，避免把它混入普通正文。
        let sys = '';
        const sysMatch = mainContent.match(/\n\n\[系统指令:\s*([\s\S]*?)\]\s*$/);
        if (sysMatch) {
            sys = sysMatch[1];
            mainContent = mainContent.slice(0, sysMatch.index).trim();
        }

        // 写入有界缓存，长会话中最多保留 2000 个解析结果。
        const result = { cot: cotContent.trim(), main: mainContent.trim(), sys, isFinished };
        parseCotCache.set(text, result);
        if (parseCotCache.size > 2000) {
            const firstKey = parseCotCache.keys().next().value;
            parseCotCache.delete(firstKey);
        }
        return result;
    };

    // 新代码使用命名空间；旧全局入口继续保留，兼容模板和已有扩展脚本。
    global.ChatAIUtils = { generateUUID, parseCot };
    global.generateUUID = generateUUID;
    global.parseCot = parseCot;
})(window);
