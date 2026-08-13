const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

// 在隔离的浏览器式上下文中加载无构建全局模块。
const loadModules = (...relativePaths) => {
    const context = vm.createContext({
        window: {},
        console,
        structuredClone,
        ArrayBuffer,
        Uint8Array,
        Date,
        Map,
        Set,
        WeakMap,
        JSON,
        Math,
        Object,
        String,
        Number,
        RegExp,
        Error
    });
    context.window.window = context.window;
    context.window.Vue = { toRaw: value => value };
    relativePaths.forEach((relativePath) => {
        const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
        vm.runInContext(source, context, { filename: relativePath });
    });
    return context.window;
};

test('配置模块保留唯一默认人格入口和历史存储配置', () => {
    const window = loadModules('assets/js/config/app-config.js');
    assert.equal(window.ChatAIConfig.CHAT_AI_CHARACTER_CARD_URL, 'assets/defalut/Chat-ai.json');
    assert.equal(window.ChatAIConfig.DEFAULT_CHAT_AI_CHARACTER_UUID, 'chat-ai-default');
    assert.equal(window.ChatAIConfig.STORAGE_CONFIG.dbName, 'RPHubDB');
    assert.equal(window.ChatAIConfig.STORAGE_CONFIG.storagePrefix, 'rp_hub_');
});

test('会话模块生成摘要并兼容旧数组状态', () => {
    const window = loadModules('assets/js/utils.js', 'assets/js/chat/session.js');
    const tools = window.ChatAISession.createSessionTools(window.ChatAIUtils);
    const session = tools.buildChatSessionMeta(
        { id: 'session-1', createdAt: 100, updatedAt: 200 },
        [
            { role: 'user', content: '第一条问题' },
            { role: 'assistant', content: '<think>内部思考</think>回答正文' }
        ],
        { name: '测试角色' }
    );
    assert.equal(session.id, 'session-1');
    assert.equal(session.title, '第一条问题');
    assert.equal(session.preview, '回答正文');
    assert.equal(session.messageCount, 2);

    const normalized = tools.normalizeChatSessionState([session, session], { name: '测试角色' });
    assert.equal(normalized.sessions.length, 1);
    assert.equal(normalized.sessions[0].id, 'session-1');
});

test('API 协议模块兼容 JSON、SSE usage 和结构化错误', () => {
    const window = loadModules('assets/js/api/protocol.js');
    const protocol = window.ChatAIApiProtocol;
    const usage = protocol.extractApiUsageFromText([
        'data: {"choices":[]}',
        'data: {"usage":{"prompt_tokens":12,"completion_tokens":5,"total_tokens":17}}',
        'data: [DONE]'
    ].join('\n'));
    assert.deepEqual(JSON.parse(JSON.stringify(protocol.normalizeApiUsage(usage))), {
        inputTokens: 12,
        outputTokens: 5,
        totalTokens: 17,
        cacheReadTokens: null,
        cacheWriteTokens: 0,
        reasoningTokens: null,
        reported: true
    });
    assert.equal(
        protocol.extractApiErrorMessage({ error: { message: 'Key 无效', code: 401 } }),
        'API Error: 401\nKey 无效'
    );
});

test('角色卡 parser 保留原生人格字段并标准化附属数据', () => {
    const window = loadModules('assets/js/character/card-parser.js');
    const parser = window.ChatAICharacterCardParser.createCardParser({ systemWorldInfoNames: ['自动生图'] });
    const identity = value => value;
    const character = parser.parseCharacterCard({
        spec: 'chara_card_v2',
        data: {
            name: 'Linwan',
            description: '角色描述',
            personality: '角色人格',
            system_prompt: '系统人格',
            first_mes: '你好',
            character_book: {
                entries: {
                    0: { comment: '地点', key: ['学校'], content: '世界书内容', position: 0 }
                }
            },
            extensions: {
                regex_scripts: [{ scriptName: '清理', findRegex: '/foo/gi', replaceString: 'bar' }]
            }
        }
    }, null, {
        defaultAvatar: 'avatar',
        generateUUID: () => 'uuid-1',
        normalizeRegexScript: identity,
        normalizeUiTemplate: identity,
        sanitizeUiTemplateImportEntry: identity
    });
    assert.equal(character.name, 'Linwan');
    assert.equal(character.personality, '角色人格');
    assert.equal(character.system_prompt, '系统人格');
    assert.equal(character.worldInfo[0].position, 'before_char');
    assert.equal(character.regexScripts[0].regex, 'foo');
    assert.equal(character.regexScripts[0].flags, 'gi');
});

test('角色附属字段标准化模块兼容正则和 UI 模板', () => {
    const window = loadModules('assets/js/character/normalizers.js');
    const normalizers = window.ChatAICharacterNormalizers.createCharacterNormalizers({
        systemRegexNames: ['系统正则'],
        generateUUID: () => 'template-1',
        cardUtils: {
            toRegexExportEntry: value => value,
            toUiTemplateExportEntry: value => value
        }
    });
    const regex = normalizers.normalizeRegexScript({
        scriptName: '系统正则',
        findRegex: 'foo',
        disabled: true
    });
    assert.equal(regex.name, '系统正则');
    assert.equal(regex.regex, 'foo');
    assert.equal(regex.enabled, false);
    assert.equal(regex.scope, 'global');

    const template = normalizers.normalizeUiTemplate({
        name: '状态栏',
        template: '```html\n<div>{{value}}</div>\n```',
        variables: { value: 1 }
    });
    assert.equal(template.id, 'template-1');
    assert.equal(template.htmlTemplate, '<div>{{value}}</div>');
    assert.equal(template.variableState.value, 1);
});

test('向量工具拆分文本、归一向量并稳定排序', () => {
    const window = loadModules('assets/js/memory/vector-utils.js');
    const tools = window.ChatAIVectorMemoryUtils;
    assert.deepEqual(Array.from(tools.normalizeEmbedding({ values: ['1', 2, 'bad'] })), [1, 2]);
    assert.equal(tools.cosineSimilarity([1, 0], [1, 0]), 1);
    assert.equal(tools.cosineSimilarity([0, 0], [1, 0]), -1);
    assert.deepEqual(
        JSON.parse(JSON.stringify(tools.mergeSmallMemoryParagraphs(['第一段', '第二段'], 20))),
        [{ text: '第一段\n\n第二段', start: 1, end: 2 }]
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(tools.sortVectorMemoriesByTime([
            { turn: 2, sequence: 1 },
            { turn: 1, sequence: 2 },
            { turn: 1, sequence: 1 }
        ]))).map(item => `${item.turn}:${item.sequence}`),
        ['1:1', '1:2', '2:1']
    );
});
