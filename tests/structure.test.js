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

test('侧边栏的十二个页面都有独立 HTML 入口', () => {
    const pages = [
        'chat', 'usage', 'memory', 'uitemplates', 'characters', 'generator',
        'square', 'presets', 'worldinfo', 'regex', 'tools', 'settings'
    ];
    pages.forEach(page => {
        const entry = path.join(projectRoot, 'pages', `${page}.html`);
        assert.equal(fs.existsSync(entry), true, `缺少页面入口: ${page}`);
        const html = fs.readFileSync(entry, 'utf8');
        assert.ok(html.includes('assets/js/page-navigation.js'), `页面未加载导航模块: ${page}`);
        assert.ok(html.includes('assets/js/app.js'), `页面未加载应用运行时: ${page}`);
    });
});

test('每个页面入口只包含自己的主视图', () => {
    const pageMarkers = {
        chat: '<!-- Chat View -->',
        usage: '<!-- Token Usage View -->',
        memory: '<!-- Memory View -->',
        uitemplates: '<!-- UI Templates View -->',
        characters: '<!-- Characters Management -->',
        generator: '<!-- Generator View -->',
        square: '<!-- Square View -->',
        presets: '<!-- Presets View -->',
        worldinfo: '<!-- World Info View -->',
        regex: '<!-- Regex View -->',
        tools: '<!-- Tools View -->',
        settings: '<!-- Settings View -->'
    };
    Object.entries(pageMarkers).forEach(([page, expectedMarker]) => {
        const html = readProjectFile(`pages/${page}.html`);
        Object.entries(pageMarkers).forEach(([otherPage, marker]) => {
            assert.equal(
                html.includes(marker),
                page === otherPage,
                `${page} 入口包含了错误的主视图: ${otherPage}`
            );
        });
        assert.ok(html.includes(expectedMarker));
    });
});

test('页面导航使用真实入口，运行时由轻量加载器按领域片段装配', () => {
    const generatedHtml = readProjectFile('pages/chat.html');
    const appSourceDir = path.join(projectRoot, 'src', 'app');
    const appParts = fs.readdirSync(appSourceDir).filter(file => file.endsWith('.part.js')).sort();
    assert.equal(generatedHtml.includes("@click=\"currentView = '"), false);
    assert.ok(generatedHtml.includes("navigateToPage('chat')"));
    assert.ok(appParts.length >= 20, 'app 运行时仍未按领域充分拆分');
    appParts.forEach(file => {
        const lines = fs.readFileSync(path.join(appSourceDir, file), 'utf8').split(/\r?\n/).length;
        assert.ok(lines < 1800, `${file} 仍然过长: ${lines} 行`);
    });
    const loader = readProjectFile('assets/js/app.js');
    assert.ok(loader.split(/\r?\n/).length < 80, 'app.js 应只保留轻量加载器');
    assert.ok(loader.includes("new URL('src/app/' + fragment, projectRootUrl)"));
    appParts.forEach(file => assert.ok(loader.includes(file), `加载器缺少片段: ${file}`));
});
