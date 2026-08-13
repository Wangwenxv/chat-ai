// 00-bootstrap.part.js：由 build-app.js 按 setup 依赖顺序组装。
const { createApp, ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;

// 从按职责拆分的模块中装配配置、通用工具和领域服务。
const {
    APP_NAME,
    SIMPLE_CHAT_AI_MODE,
    CHAT_AI_CHARACTER_CARD_URL,
    DEFAULT_CHAT_AI_CHARACTER_UUID,
    DEFAULT_CHAT_AI_AVATAR,
    DEFAULT_USER_NAME_PLACEHOLDER,
    SYSTEM_REGEX_NAMES,
    SYSTEM_WORLD_INFO_NAMES,
    IMAGE_GEN_BASE_URL,
    DEFAULT_IMAGE_API_URL,
    DEFAULT_IMAGE_CHAT_MODEL,
    DEFAULT_IMAGE_MODEL,
    MAX_PENDING_REFERENCE_IMAGES,
    MAX_REFERENCE_IMAGE_BYTES,
    STORAGE_CONFIG,
    DEFAULT_API_PROVIDER_ID,
    DEFAULT_API_CONFIG,
    API_PROVIDER_OPTIONS
} = window.ChatAIConfig;
const { generateUUID, parseCot } = window.ChatAIUtils;
const {
    UiTemplatePending,
    EmbeddedViewContent,
    GenerationTimer,
    SettingsPageHeader
} = window.ChatAIComponents;
const appStorage = window.ChatAIStorage.createStorage(STORAGE_CONFIG);
const {
    init: initDB,
    cloneForStorage,
    isDatabaseClosingError,
    setStoredValue,
    getStoredValue,
    setScopedStoredValue,
    getScopedStoredValue,
    deleteScopedStoredValue
} = appStorage;
const {
    getConversationStorageScopeId,
    buildChatSessionMeta,
    sortChatSessions,
    normalizeChatSessionState,
    formatChatSessionTime
} = window.ChatAISession.createSessionTools({ generateUUID, parseCot });
const defaultCharacterService = window.ChatAIDefaultCharacter.createDefaultCharacterService({
    cardUrl: CHAT_AI_CHARACTER_CARD_URL,
    characterUuid: DEFAULT_CHAT_AI_CHARACTER_UUID,
    appName: APP_NAME,
    defaultAvatar: DEFAULT_CHAT_AI_AVATAR
});
const {
    getApiUsagePayload,
    extractApiUsageFromText,
    normalizeApiUsage,
    formatApiErrorMessage,
    extractApiErrorMessage,
    throwApiError
} = window.ChatAIApiProtocol;
const {
    normalizeWorldInfoEntry,
    parseCharacterCard
} = window.ChatAICharacterCardParser.createCardParser({
    systemWorldInfoNames: SYSTEM_WORLD_INFO_NAMES
});
const {
    isEmbeddingLike,
    splitLongMemoryParagraph,
    splitMemoryParagraphs,
    mergeSmallMemoryParagraphs,
    normalizeEmbedding,
    cosineSimilarity,
    getVectorMemoryContentFingerprint,
    extractVectorQueryTerms,
    getVectorLexicalMatch,
    sortVectorMemoriesByTime,
    getVectorMemoryText,
    getVectorMemoryFingerprint
} = window.ChatAIVectorMemoryUtils;
const {
    normalizeRegexScript,
    toRegexExportEntry,
    cloneUiObject,
    cloneUiValue,
    stripUiTemplateCodeFence,
    inferInitialUiTemplateState,
    normalizeUiTemplate,
    toUiTemplateExportEntry,
    sanitizeUiTemplateImportEntry
} = window.ChatAICharacterNormalizers.createCharacterNormalizers({
    systemRegexNames: SYSTEM_REGEX_NAMES,
    cardUtils: window.RPHubCardUtils,
    generateUUID
});

// Configure marked to disable indented code blocks
// This allows indented HTML (like details/summary) to be rendered as HTML instead of code
marked.use({
    breaks: true,
    tokenizer: {
        // Disable the indentation-based code block tokenizer
        code(src) {
            return undefined;
        }
    }
});

createApp({
    components: {
        CustomSelect: window.RPHubCustomSelect,
        EmbeddedViewContent,
        GenerationTimer,
        SettingsPageHeader,
        UiTemplatePending
    },
    setup() {
        const cardUtils = window.RPHubCardUtils;

        // 默认头像和旧变量名作为装配层别名，具体值由配置模块统一维护。
        const defaultAvatar = DEFAULT_CHAT_AI_AVATAR;

        // Image Compression Utility
        const compressImage = (source, maxWidth = 300, quality = 0.7) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = source;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = () => resolve(source);
            });
        };

        // 内部标准化逻辑继续使用既有命名，数据来源统一切换到配置模块。
        const systemRegexNames = SYSTEM_REGEX_NAMES;
        const systemWorldInfoNames = SYSTEM_WORLD_INFO_NAMES;
        const apiProviderOptions = API_PROVIDER_OPTIONS;
