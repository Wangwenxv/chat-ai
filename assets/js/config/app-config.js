(function initializeChatAIConfig(global) {
    'use strict';

    // 集中维护产品标识和精简模式开关，避免业务逻辑散落硬编码。
    const APP_NAME = 'chat-ai';
    // 集中维护产品标识和精简模式开关，避免业务逻辑散落硬编码。
    const SIMPLE_CHAT_AI_MODE = true;

    // 默认人格只由这个 JSON 地址决定；替换地址后会使用独立角色 ID 和会话空间。
    const CHAT_AI_CHARACTER_CARD_URL = 'assets/defalut/Chat-ai.json';
    const DEFAULT_CHAT_AI_CHARACTER_UUID = CHAT_AI_CHARACTER_CARD_URL === 'assets/defalut/Chat-ai.json'
        ? 'chat-ai-default'
        : `chat-ai-default:${CHAT_AI_CHARACTER_CARD_URL}`;

    // 默认头像仅在角色卡没有独立图片资源时使用。
    const DEFAULT_CHAT_AI_ROBOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="36" fill="#2f3136"/><circle cx="80" cy="54" r="18" fill="#60a5fa" opacity=".95"/><path d="M80 72v12" stroke="#93c5fd" stroke-width="8" stroke-linecap="round"/><rect x="32" y="78" width="96" height="58" rx="24" fill="#f8fafc"/><rect x="47" y="93" width="66" height="28" rx="14" fill="#111827"/><circle cx="65" cy="107" r="6" fill="#60a5fa"/><circle cx="95" cy="107" r="6" fill="#60a5fa"/><path d="M64 128h32" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/><path d="M32 104H20M140 104h-12" stroke="#e5e7eb" stroke-width="10" stroke-linecap="round"/></svg>';
    const DEFAULT_CHAT_AI_AVATAR = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(DEFAULT_CHAT_AI_ROBOT_SVG)}`;

    // 集中维护聊天、图片和系统内置条目的固定限制。
    const DEFAULT_USER_NAME_PLACEHOLDER = '请前往设置自定义你的名称';
    const SYSTEM_REGEX_NAMES = ['Auto Replace {{user}}', 'NAI画图正则'];
    const SYSTEM_WORLD_INFO_NAMES = ['自动生图'];
    const IMAGE_GEN_BASE_URL = 'https://nai.sta1n.cn';
    const DEFAULT_IMAGE_API_URL = 'https://vsllm.com/v1';
    const DEFAULT_IMAGE_CHAT_MODEL = 'gpt-image-2-chat';
    const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
    const MAX_PENDING_REFERENCE_IMAGES = 4;
    const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

    // IndexedDB 配置保持原 key 和旧库迁移规则不变，确保现有历史记录可继续读取。
    const STORAGE_CONFIG = {
        dbName: 'RPHubDB',
        legacyDbName: 'SillyTavernDB',
        storagePrefix: 'rp_hub_',
        legacyStoragePrefix: 'silly_tavern_',
        dbVersion: 1,
        storeName: 'store'
    };

    // API 默认值和供应商入口统一定义，设置面板只消费这份配置。
    const DEFAULT_API_PROVIDER_ID = 'sta1n';
    const DEFAULT_API_CONFIG = {
        apiUrl: 'https://cdn.sta1n.cn/v1',
        apiKey: '',
        model: '',
        qualityModel: '',
        balancedModel: '',
        fastModel: ''
    };
    const API_PROVIDER_OPTIONS = [
        {
            id: 'sta1n',
            name: 'STA1N API',
            apiUrl: 'https://cdn.sta1n.cn/v1',
            icon: 'https://img.cdn1.vip/i/69c18cc07538b_1774292160.webp'
        },
        {
            id: 'deepseek',
            name: 'DeepSeek',
            apiUrl: 'https://api.deepseek.com/v1',
            icon: 'https://www.deepseek.com/favicon.ico'
        },
        {
            id: 'openrouter',
            name: 'OpenRouter',
            apiUrl: 'https://openrouter.ai/api/v1',
            icon: 'https://openrouter.ai/favicon.ico'
        },
        {
            id: 'yintu',
            name: 'Yintu API',
            apiUrl: 'https://api.yintu.cc/v1',
            icon: 'https://yintu.cc/logo.png'
        },
        {
            id: 'vsllm',
            name: 'VSLLM',
            apiUrl: 'https://vsllm.com/v1',
            icon: 'https://img.scdn.io/i/6a05a96892419_1778755944.webp'
        },
        {
            id: 'siliconflow',
            name: 'SiliconFlow',
            apiUrl: 'https://api.siliconflow.cn/v1',
            icon: 'https://siliconflow.cn/favicon.ico'
        }
    ];

    // 通过单一命名空间暴露只读配置，供后续模块按职责消费。
    global.ChatAIConfig = Object.freeze({
        APP_NAME,
        SIMPLE_CHAT_AI_MODE,
        CHAT_AI_CHARACTER_CARD_URL,
        DEFAULT_CHAT_AI_CHARACTER_UUID,
        DEFAULT_CHAT_AI_ROBOT_SVG,
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
    });
})(window);
