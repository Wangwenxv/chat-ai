(function initializeChatAISession(global) {
    'use strict';

    const CHAT_SESSION_TITLE_MAX_LENGTH = 24;
    const CHAT_SESSION_PREVIEW_MAX_LENGTH = 42;

    // 创建会话领域工具时显式注入通用函数，避免依赖隐式全局变量。
    const createSessionTools = ({ generateUUID, parseCot }) => {
        // 统一生成角色级或具体会话级存储作用域。
        const getConversationStorageScopeId = (characterId, sessionId) => {
            if (!characterId) return null;
            return sessionId ? `${characterId}_${sessionId}` : characterId;
        };

        // 压缩标题和预览文本，同时保持中文省略号行为不变。
        const truncateChatSessionText = (text, maxLength) => {
            const normalized = String(text || '').replace(/\s+/g, ' ').trim();
            if (!normalized) return '';
            return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
        };

        // 从消息中移除思维链、HTML 和 Markdown 标记，生成历史列表摘要。
        const getChatMessageSummaryText = (message) => {
            const content = parseCot(message?.content || '').main || message?.content || '';
            return String(content)
                .replace(/<[^>]+>/g, ' ')
                .replace(/[#*_`~>\[\](){}|]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        // 根据当前消息生成稳定的会话标题、预览和时间元数据。
        const buildChatSessionMeta = (base = {}, messages = [], character = null) => {
            const now = Date.now();
            const dialogMessages = (Array.isArray(messages) ? messages : [])
                .filter(message => message && ['user', 'assistant'].includes(message.role));
            const firstUserText = dialogMessages
                .filter(message => message.role === 'user')
                .map(getChatMessageSummaryText)
                .find(Boolean);
            const latestText = [...dialogMessages]
                .reverse()
                .map(getChatMessageSummaryText)
                .find(Boolean);
            const titleSource = firstUserText || base.title || (character?.name ? `${character.name}的新对话` : '新对话');
            const createdAt = Number(base.createdAt) || now;

            return {
                id: String(base.id || generateUUID()),
                title: truncateChatSessionText(titleSource, CHAT_SESSION_TITLE_MAX_LENGTH) || '新对话',
                preview: truncateChatSessionText(latestText || base.preview || '暂无内容', CHAT_SESSION_PREVIEW_MAX_LENGTH),
                createdAt,
                updatedAt: Number(base.updatedAt) || createdAt,
                messageCount: dialogMessages.length,
                legacy: base.legacy === true
            };
        };

        // 所有历史会话按最后更新时间倒序展示。
        const sortChatSessions = (sessions = []) => [...sessions].sort((left, right) => (
            (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0)
            || (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0)
        ));

        // 修复旧会话缺失字段，并限制消息计数为非负数。
        const normalizeChatSessionMeta = (session = {}, character = null) => {
            const normalized = buildChatSessionMeta(session, [], character);
            normalized.updatedAt = Number(session.updatedAt) || normalized.createdAt;
            normalized.messageCount = Number.isFinite(Number(session.messageCount))
                ? Math.max(0, Number(session.messageCount))
                : 0;
            return normalized;
        };

        // 兼容旧数组格式和新对象格式，并过滤重复会话 ID。
        const normalizeChatSessionState = (rawState, character = null) => {
            const rawSessions = Array.isArray(rawState)
                ? rawState
                : (Array.isArray(rawState?.sessions) ? rawState.sessions : []);
            const seen = new Set();
            const sessions = [];
            rawSessions.forEach((item) => {
                const session = normalizeChatSessionMeta(item, character);
                if (!session.id || seen.has(session.id)) return;
                seen.add(session.id);
                sessions.push(session);
            });
            return {
                activeId: typeof rawState?.activeId === 'string' ? rawState.activeId : null,
                sessions: sortChatSessions(sessions)
            };
        };

        // 生成历史列表所需的相对时间或简短日期。
        const formatChatSessionTime = (timestamp) => {
            const time = Number(timestamp);
            if (!Number.isFinite(time) || time <= 0) return '';
            const now = Date.now();
            const diffMs = Math.max(0, now - time);
            const minute = 60 * 1000;
            const hour = 60 * minute;
            if (diffMs < minute) return '刚刚';
            if (diffMs < hour) return `${Math.floor(diffMs / minute)}分钟前`;
            const date = new Date(time);
            const today = new Date(now);
            if (date.toDateString() === today.toDateString()) {
                return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
            }
            if (date.getFullYear() === today.getFullYear()) {
                return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
            }
            return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
        };

        return {
            getConversationStorageScopeId,
            buildChatSessionMeta,
            sortChatSessions,
            normalizeChatSessionState,
            formatChatSessionTime
        };
    };

    global.ChatAISession = { createSessionTools };
})(window);
