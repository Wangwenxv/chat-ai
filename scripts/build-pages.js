const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fragmentDir = path.join(root, 'src', 'pages', 'fragments');
const outputDir = path.join(root, 'pages');
const pageNames = [
    'chat', 'characters', 'generator', 'square', 'settings', 'presets',
    'uitemplates', 'regex', 'tools', 'usage', 'memory', 'worldinfo'
];

// 每个入口只装配自己会打开的弹窗，降低页面体积并保持页面职责清晰。
const modalNamesByPage = {
    chat: ['api-settings', 'no-memory-needed', 'user-setup', 'confirmation', 'model-selector', 'context-viewer', 'global-confirm'],
    characters: ['confirmation', 'character-editor', 'character-export', 'global-confirm'],
    generator: ['global-confirm'],
    square: ['global-confirm'],
    settings: ['api-settings', 'user-setup', 'confirmation', 'global-confirm'],
    presets: ['confirmation', 'preset-editor', 'export-selection', 'global-confirm'],
    uitemplates: ['confirmation', 'ui-template-editor', 'model-selector', 'export-selection', 'global-confirm'],
    regex: ['confirmation', 'regex-editor', 'export-selection', 'global-confirm'],
    tools: ['confirmation', 'active-tool-editor', 'global-confirm'],
    usage: ['confirmation', 'global-confirm'],
    memory: ['no-memory-needed', 'model-selector', 'confirmation', 'global-confirm'],
    worldinfo: ['confirmation', 'world-info-editor', 'export-selection', 'global-confirm']
};

const readFragment = name => fs.readFileSync(path.join(fragmentDir, name), 'utf8');
const write = (file, content) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // 统一清理行尾空格，确保生成产物通过 diff 检查。
    fs.writeFileSync(file, content.replace(/[ \t]+$/gm, ''), 'utf8');
};

// 将单页时代的视图赋值改成真实 HTML 入口导航，并为子目录页面设置站点根路径。
const transformTemplate = content => content
    .replace(/@click="currentView = '([^']+)'; closeMobileMenu\(\)"/g, "@click=\"navigateToPage('$1'); closeMobileMenu()\"")
    .replace(/@click="currentView = '([^']+)'"/g, "@click=\"navigateToPage('$1')\"")
    .replace(/:class="currentView === '([^']+)'/g, ":class=\"currentView === '$1'")
    .replace(/<head>/i, '<head>\n    <base href="../">');

// 独立入口直接显示自己的主体，精简模式只继续控制侧边栏可见性。
const transformPageBody = (content, page) => transformTemplate(content)
    .replace(new RegExp(`showAdvancedFeatures && currentView === '${page}'`, 'g'), `currentView === '${page}'`);

const buildPage = (page, version) => {
    const sharedScripts = [
        'page-navigation.js',
        'utils.js',
        'card-utils.js',
        'ui-select.js',
        'config/app-config.js',
        'components/app-components.js',
        'core/storage.js',
        'api/protocol.js',
        'chat/session.js',
        'memory/vector-utils.js',
        'character/card-parser.js',
        'character/normalizers.js',
        'character/default-character.js',
        'app.js'
    ].map(file => `    <script src="assets/js/${file}?v=${version}"></script>`).join('\n');
    const head = transformTemplate(readFragment('document-head.html'));
    const shell = transformTemplate(readFragment('shared-shell.html'));
    const body = transformPageBody(readFragment(`${page}.html`), page);
    const modals = modalNamesByPage[page]
        .map(name => transformTemplate(readFragment(`modal-${name}.html`)))
        .join('\n');
    return `${head}\n${shell}${body}${readFragment('main-close.html')}${modals}\n    </div>\n\n${sharedScripts}\n</body>\n</html>\n`;
};

// 十二个侧边栏目标各生成一个 HTML，根 index.html 保持为默认聊天入口。
const buildPages = () => {
    const version = Date.now();
    fs.mkdirSync(outputDir, { recursive: true });
    pageNames.forEach(page => write(path.join(outputDir, `${page}.html`), buildPage(page, version)));
    write(path.join(root, 'index.html'), buildPage('chat', version).replace('<base href="../">', '<base href="./">'));
};

buildPages();
