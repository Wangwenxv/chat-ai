const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const readProjectFile = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('领域模块在 app.js 之前按依赖顺序加载', () => {
    const html = readProjectFile('index.html');
    const scripts = [
        'assets/js/utils.js',
        'assets/js/config/app-config.js',
        'assets/js/core/storage.js',
        'assets/js/api/protocol.js',
        'assets/js/chat/session.js',
        'assets/js/memory/vector-utils.js',
        'assets/js/character/card-parser.js',
        'assets/js/character/normalizers.js',
        'assets/js/character/default-character.js',
        'assets/js/app.js'
    ];
    const positions = scripts.map(script => html.indexOf(script));
    positions.forEach((position, index) => assert.ok(position >= 0, `缺少脚本: ${scripts[index]}`));
    for (let index = 1; index < positions.length; index++) {
        assert.ok(positions[index] > positions[index - 1], `脚本顺序错误: ${scripts[index]}`);
    }
});

test('app.js 不再重复定义已迁出的核心实现', () => {
    const app = readProjectFile('assets/js/app.js');
    [
        'const openAppDB =',
        'const normalizeWorldInfoEntry =',
        'const normalizeApiUsage =',
        'const buildChatSessionMeta =',
        'const cosineSimilarity =',
        'const normalizeRegexScript =',
        'const normalizeUiTemplate =',
        'const parseCharacterCard ='
    ].forEach(definition => assert.equal(app.includes(definition), false, `发现重复定义: ${definition}`));
});

test('默认人格 URL 只在配置模块中声明', () => {
    const app = readProjectFile('assets/js/app.js');
    const config = readProjectFile('assets/js/config/app-config.js');
    assert.equal(app.includes("const CHAT_AI_CHARACTER_CARD_URL ="), false);
    assert.equal(config.includes("const CHAT_AI_CHARACTER_CARD_URL = 'assets/defalut/Chat-ai.json';"), true);
});
