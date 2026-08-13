// 30-computed.part.js：由 build-app.js 按 setup 依赖顺序组装。
// --- Computed ---
        const currentCharacter = computed(() => {
            return currentCharacterIndex.value >= 0 ? characters.value[currentCharacterIndex.value] : null;
        });
        const currentChatSessions = computed(() => (
            currentCharacter.value ? sortChatSessions(chatSessions.value) : []
        ));
        const scopeOptions = computed(() => [
            { value: 'character', label: '绑定当前角色卡', disabled: !currentCharacter.value },
            { value: 'global', label: '全局生效' }
        ]);

        const combineRegexScriptsForCharacter = (char = currentCharacter.value) => {
            const globalScripts = JSON.parse(JSON.stringify(globalRegexScripts.value || []))
                .map(script => normalizeRegexScript(script, 'global'));
            const characterScripts = Array.isArray(char?.regexScripts)
                ? JSON.parse(JSON.stringify(char.regexScripts)).map(script => normalizeRegexScript(script, 'character')).filter(script => script.scope !== 'global')
                : [];
            regexScripts.value = [...globalScripts, ...characterScripts];
        };

        const finishApplyingCharacterScopedData = () => {
            nextTick(() => {
                _isApplyingCharacterScopedData = false;
            });
        };

        const defaultUiTemplateHtml = '';

        const defaultUiTemplateVariables = {};

        const ensureCurrentUiTemplates = () => {
            if (!currentCharacter.value) return [];
            if (!Array.isArray(currentCharacter.value.uiTemplates)) currentCharacter.value.uiTemplates = [];
            if (currentCharacter.value.uiTemplates.some(template => template.scope !== 'character' || !template.id)) {
                currentCharacter.value.uiTemplates = currentCharacter.value.uiTemplates.map(template => normalizeUiTemplate({ ...template, scope: 'character' }));
            }
            return currentCharacter.value.uiTemplates;
        };

        const ensureGlobalUiTemplates = () => {
            if ((globalUiTemplates.value || []).some(template => template.scope !== 'global' || !template.id)) {
                globalUiTemplates.value = globalUiTemplates.value.map(template => normalizeUiTemplate({ ...template, scope: 'global' }));
            }
            return globalUiTemplates.value;
        };

        const getUiTemplateListByScope = (scope) => scope === 'global' ? ensureGlobalUiTemplates() : ensureCurrentUiTemplates();

        const currentUiTemplates = computed(() => [
            ...ensureGlobalUiTemplates(),
            ...ensureCurrentUiTemplates()
        ].map((template, index) => ({ template, index }))
            .sort((a, b) => (Number(b.template.order) || 0) - (Number(a.template.order) || 0) || a.index - b.index)
            .map(item => item.template));
        const activeUiTemplates = computed(() => currentUiTemplates.value.filter(t => t.enabled !== false));

        const isUiTemplateObject = (value) => value !== null && typeof value === 'object';

        const splitUiTemplatePath = (path) => String(path || '')
            .trim()
            .replace(/\[(?:'([^']+)'|"([^"]+)"|([^\]]+))\]/g, (_, single, double, bare) => `.${single ?? double ?? String(bare || '').trim()}`)
            .split('.')
            .map(part => part.trim())
            .filter(Boolean);

        const readUiTemplatePath = (source, path) => {
            const normalizedPath = String(path || '').trim();
            if (!normalizedPath || normalizedPath === 'this' || normalizedPath === '.') return source;
            if (isUiTemplateObject(source) && Object.prototype.hasOwnProperty.call(source, normalizedPath)) {
                return source[normalizedPath];
            }
            return splitUiTemplatePath(normalizedPath).reduce((acc, key) => (
                acc !== undefined && acc !== null && acc[key] !== undefined ? acc[key] : undefined
            ), source);
        };

        const getUiTemplateValue = (source, path, context = null) => {
            const expression = String(path || '').trim();
            if (!expression) return undefined;
            if (context) {
                if (expression === 'this' || expression === '.') return context.current;
                if (expression === '@index') return context.index ?? 0;
                if (expression === '@number') return (context.index ?? 0) + 1;
                if (expression === '@first') return (context.index ?? 0) === 0;
                if (expression === '@last') return (context.index ?? 0) === (context.length ?? 0) - 1;
                if (expression === '@key') return context.key ?? context.index ?? '';
                if (expression.startsWith('root.')) return readUiTemplatePath(context.root, expression.slice(5));
                if (expression === 'root') return context.root;
                if (expression.startsWith('../')) {
                    let parentContext = context.parentContext;
                    let parentPath = expression;
                    while (parentPath.startsWith('../')) {
                        parentPath = parentPath.slice(3);
                        if (parentPath.startsWith('../') && parentContext?.parentContext) {
                            parentContext = parentContext.parentContext;
                        }
                    }
                    const fallbackParent = { root: context.root, current: context.root, parentContext: null };
                    return getUiTemplateValue(context.root, parentPath, parentContext || fallbackParent);
                }
                if (context.alias && (expression === context.alias || expression.startsWith(`${context.alias}.`))) {
                    return expression === context.alias
                        ? context.current
                        : readUiTemplatePath(context.current, expression.slice(context.alias.length + 1));
                }
                const localValue = readUiTemplatePath(context.current, expression);
                if (localValue !== undefined) return localValue;
            }
            return readUiTemplatePath(source, expression);
        };

        const setUiTemplateValue = (source, path, value) => {
            const expression = String(path || '').trim();
            if (!expression) return source;
            if (expression === '$root' || expression === 'this' || expression === '.') return cloneUiValue(value);
            const root = isUiTemplateObject(source) ? source : {};
            if (Object.prototype.hasOwnProperty.call(root, expression) || !/[.[\]]/.test(expression)) {
                root[expression] = cloneUiValue(value);
                return root;
            }
            const parts = splitUiTemplatePath(expression);
            if (!parts.length) return root;
            let target = root;
            parts.forEach((part, index) => {
                if (index === parts.length - 1) {
                    target[part] = cloneUiValue(value);
                    return;
                }
                const nextPart = parts[index + 1];
                if (!isUiTemplateObject(target[part])) {
                    target[part] = /^\d+$/.test(nextPart) ? [] : {};
                }
                target = target[part];
            });
            return root;
        };

        const stringifyUiTemplateValue = (value) => {
            if (value === undefined || value === null) return '';
            if (typeof value === 'string') return value;
            if (typeof value === 'object') {
                try {
                    return JSON.stringify(value, null, 2);
                } catch (e) {
                    return String(value);
                }
            }
            return String(value);
        };

        const formatUiTemplateChangeValue = (value) => {
            const text = stringifyUiTemplateValue(value);
            return text === '' ? '空' : text;
        };

        const escapeUiValue = (value) => stringifyUiTemplateValue(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const createUiTemplateRenderContext = (variables, overrides = {}) => ({
            root: variables,
            current: variables,
            parentContext: null,
            index: 0,
            key: '',
            length: 1,
            alias: '',
            ...overrides
        });

        const renderUiTemplateString = (templateText, variables = {}, context = null) => {
            const activeContext = context || createUiTemplateRenderContext(variables);
            const withArrays = renderUiTemplateEachBlocks(String(templateText || ''), variables, activeContext);
            return withArrays.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, expression) => {
                const key = String(expression || '').trim();
                if (!key || key === 'else' || key.startsWith('#') || key.startsWith('/')) return match;
                return escapeUiValue(getUiTemplateValue(variables, key, activeContext));
            });
        };

        const renderUiTemplateEachBlocks = (templateText, variables = {}, context = null) => {
            let output = String(templateText || '');
            const eachBlockPattern = /\{\{\s*#each\s+([^\s}]+)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*\}\}((?:(?!\{\{\s*#each\b)[\s\S])*?)\{\{\s*\/each\s*\}\}/g;
            for (let pass = 0; pass < 50; pass++) {
                let replaced = false;
                output = output.replace(eachBlockPattern, (match, path, alias, body) => {
                    replaced = true;
                    const value = getUiTemplateValue(variables, path, context);
                    const [itemTemplate, emptyTemplate = ''] = String(body || '').split(/\{\{\s*else\s*\}\}/i);
                    const entries = Array.isArray(value)
                        ? value.map((item, index) => ({ item, key: index, index }))
                        : (isUiTemplateObject(value)
                            ? Object.entries(value).map(([key, item], index) => ({ item, key, index }))
                            : []);
                    if (!entries.length) {
                        return renderUiTemplateString(emptyTemplate, variables, context);
                    }
                    return entries.map(({ item, key, index }) => renderUiTemplateString(itemTemplate, variables, createUiTemplateRenderContext(variables, {
                        current: item,
                        parentContext: context,
                        index,
                        key,
                        length: entries.length,
                        alias: alias || ''
                    }))).join('');
                });
                if (!replaced) break;
            }
            return output;
        };

        const htmlIframeSandbox = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-same-origin allow-downloads allow-pointer-lock allow-presentation allow-top-navigation-by-user-activation';

        const buildExecutableHtmlDocument = (rawHtml) => {
            const metaViewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';
            const hudCSS = '.sinan-hud{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding:12px;background:linear-gradient(to bottom right,rgba(255,255,255,0.9),rgba(255,255,255,0.6));border-radius:12px;border:1px solid rgba(0,0,0,0.08);backdrop-filter:blur(4px)}.char-card{flex:1 1 140px;background:#fff;padding:10px;border-radius:8px;border-left:4px solid #ddd;box-shadow:0 2px 6px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:4px;font-size:12px;position:relative;overflow:hidden;transition:transform 0.2s}.char-card:hover{transform:translateY(-2px);box-shadow:0 4px 8px rgba(0,0,0,0.1)}.char-name{font-weight:700;font-size:14px;color:#374151;display:flex;justify-content:space-between;align-items:center}.char-mood{color:#6b7280;font-size:12px}.char-loc{color:#9ca3af;font-size:11px;margin-top:auto;padding-top:4px}.bar-bg{height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden;margin-top:6px}.bar-fill{height:100%;background:#10b981;border-radius:2px}.c-tongqiu{border-left-color:#f59e0b}.c-tongqiu .bar-fill{background:#f59e0b}.c-yufan{border-left-color:#3b82f6}.c-yufan .bar-fill{background:#3b82f6}.c-linghu{border-left-color:#8b5cf6}.c-linghu .bar-fill{background:#8b5cf6}.c-chongtian{border-left-color:#ef4444}.c-chongtian .bar-fill{background:#ef4444}';
            const resetStyle = '<style>html,body{margin:0!important;padding:0!important;width:100%!important;height:auto!important;min-height:auto!important;word-wrap:break-word!important;box-sizing:border-box!important;overflow:hidden!important;}::-webkit-scrollbar{display:none;}*,*::before,*::after{box-sizing:inherit!important;}img,video,canvas,svg{max-width:100%!important;height:auto!important;}table{display:block!important;overflow-x:auto!important;max-width:100%!important;}pre{white-space:pre-wrap!important;word-wrap:break-word!important;max-width:100%!important;}.container,.reality-panel,.app-container{max-width:100%!important;width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;border:none!important;height:auto!important;min-height:0!important;}body>div:first-child{margin:0!important;max-width:100%!important;height:auto!important;min-height:0!important;}#app{height:auto!important;min-height:auto!important;}.bottom-safe{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;}' + hudCSS + '</style>';
            const jqueryScript = '<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js" defer><\/script>';
            const scriptShim = `
                <script>
                    window.triggerSlash = function(text) {
                        if (window.parent && window.parent.triggerSlash) {
                            window.parent.triggerSlash(text);
                        }
                    };

                    let lastHeight = 0;
                    let isUpdating = false;
                    function updateHeight() {
                        if (!window.frameElement || isUpdating) return;
                        isUpdating = true;
                        requestAnimationFrame(function() {
                            var body = document.body;
                            var html = document.documentElement;
                            if (!body || !html) {
                                isUpdating = false;
                                return;
                            }
                            var maxBottom = 0;
                            for (var i = 0; i < body.children.length; i++) {
                                var child = body.children[i];
                                if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'LINK') continue;
                                var style = window.getComputedStyle(child);
                                if (style.position === 'fixed') continue;
                                var rect = child.getBoundingClientRect();
                                var itemMax = Math.max(rect.bottom, child.offsetTop + child.offsetHeight);
                                if (itemMax > maxBottom) maxBottom = itemMax;
                            }
                            var bodyStyle = window.getComputedStyle(body);
                            var marginBottom = parseFloat(bodyStyle.marginBottom) || 0;
                            var newHeight = Math.max(maxBottom + marginBottom, body.scrollHeight) + 4;
                            if (Math.abs(newHeight - lastHeight) > 0) {
                                lastHeight = newHeight;
                                window.frameElement.style.height = newHeight + 'px';
                            }
                            isUpdating = false;
                        });
                    }

                    window.addEventListener('load', function() {
                        updateHeight();
                        setTimeout(updateHeight, 200);
                        setTimeout(updateHeight, 1000);
                    });
                    window.addEventListener('resize', updateHeight);
                    window.addEventListener('click', function(event) {
                        var slashTarget = event.target && event.target.closest && event.target.closest('[data-slash]');
                        if (slashTarget) {
                            event.preventDefault();
                            var command = slashTarget.getAttribute('data-slash');
                            if (command) window.triggerSlash(command);
                        }
                        var start = Date.now();
                        var tick = function() {
                            if (Date.now() - start >= 600) return;
                            updateHeight();
                            requestAnimationFrame(tick);
                        };
                        tick();
                    });
                    window.addEventListener('DOMContentLoaded', function() {
                        document.querySelectorAll('img').forEach(function(img) {
                            img.addEventListener('load', updateHeight);
                        });
                        updateHeight();
                    });
                    if (window.ResizeObserver) {
                        var ro = new ResizeObserver(updateHeight);
                        if (document.body) ro.observe(document.body);
                    } else {
                        setInterval(updateHeight, 1000);
                    }
                    if (document.readyState === 'complete') updateHeight();
                <\/script>
            `;

            let content = rawHtml || '';
            const trimmed = content.trim();
            if (/^\s*(<!doctype|<html)/i.test(trimmed)) {
                const headRegex = /<head(\s[^>]*)?>/i;
                const htmlRegex = /<html(\s[^>]*)?>/i;
                if (headRegex.test(content)) {
                    return content.replace(headRegex, (match) => match + metaViewport + resetStyle + jqueryScript + scriptShim);
                }
                if (htmlRegex.test(content)) {
                    return content.replace(htmlRegex, (match) => match + '<head>' + metaViewport + resetStyle + jqueryScript + scriptShim + '</head>');
                }
                return metaViewport + resetStyle + jqueryScript + scriptShim + content;
            }

            return `<!DOCTYPE html>
<html>
<head>
${metaViewport}
${resetStyle}
${jqueryScript}
${scriptShim}
</head>
<body>
${content}
</body>
</html>`;
        };

        const createExecutableHtmlIframe = (rawHtml, extraClass = '') => {
            const iframe = document.createElement('iframe');
            iframe.className = `w-full bg-white block executable-html-frame ${extraClass}`.trim();
            iframe.style.height = 'auto';
            iframe.style.overflow = 'hidden';
            iframe.style.transition = 'height 0.2s ease-out';
            iframe.style.margin = '0';
            iframe.style.padding = '0';
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('sandbox', htmlIframeSandbox);
            iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; autoplay; encrypted-media; picture-in-picture');
            iframe.onload = function () {
                try {
                    setTimeout(() => {
                        if (this.contentWindow && this.contentWindow.document) {
                            const doc = this.contentWindow.document;
                            this.style.height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight) + 'px';
                        }
                    }, 100);
                } catch (e) {
                    console.warn('Failed to resize iframe:', e);
                }
            };
            iframe.srcdoc = buildExecutableHtmlDocument(rawHtml);
            return iframe;
        };

        const renderExecutableHtmlFrame = (rawHtml, extraClass = '') => {
            const container = document.createElement('div');
            container.className = 'html-card-container ui-template-frame-container';
            container.style.margin = '0';
            container.style.padding = '0';
            container.style.overflow = 'hidden';
            container.appendChild(createExecutableHtmlIframe(rawHtml, extraClass));
            return container.outerHTML;
        };

        const renderUiTemplateHtml = (template) => {
            if (!template || !template.htmlTemplate) return '';
            const variables = template.variableState || {};
            const html = renderUiTemplateString(stripUiTemplateCodeFence(template.htmlTemplate), variables);
            return renderExecutableHtmlFrame(html, 'ui-template-iframe');
        };

        const handleUiTemplateClick = (event) => {
            const trigger = event.target?.closest?.('[data-slash]');
            if (!trigger) return;
            const command = trigger.getAttribute('data-slash');
            if (!command) return;
            event.preventDefault();
            event.stopPropagation();
            window.triggerSlash(command);
        };

        const renderEditingUiTemplatePreview = () => {
            let variableState = editingUiTemplate.data.previewVariableState || {};
            try {
                variableState = JSON.parse(editingUiTemplate.data.variableStateText || '{}');
            } catch (e) {
                // 预览里 JSON 写错时，先沿用打开弹窗时的变量，避免整个弹窗空掉。
            }
            return renderUiTemplateHtml({
                htmlTemplate: editingUiTemplate.data.htmlTemplate,
                variableState
            });
        };

        const stringifyUiSchema = (schema) => {
            if (!schema) return '';
            return typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2);
        };

        const getLastAssistantMessage = () => [...chatHistory.value].reverse().find(msg => msg && msg.role === 'assistant');

        const UI_TEMPLATE_UPDATES_OPEN_TAG = '<ui_template_updates>';
        const UI_TEMPLATE_UPDATES_CLOSE_TAG = '</ui_template_updates>';
        const UI_TEMPLATE_UPDATES_PATTERN = /<ui_template_updates\b[^>]*>([\s\S]*?)<\/ui_template_updates>/i;
        const UI_TEMPLATE_UPDATES_STRIP_PATTERN = /<ui_template_updates\b[^>]*>[\s\S]*?<\/ui_template_updates>/gi;
        const UI_TEMPLATE_UPDATES_OPEN_STRIP_PATTERN = /<ui_template_updates\b[^>]*>[\s\S]*$/i;

        const stripUiTemplateUpdateBlock = (text) => String(text || '')
            .replace(UI_TEMPLATE_UPDATES_STRIP_PATTERN, '')
            .replace(UI_TEMPLATE_UPDATES_OPEN_STRIP_PATTERN, '')
            .trimEnd();

        const buildMainModelUiTemplateUpdatePrompt = () => {
            if (!settings.uiTemplateEnabled || !settings.uiTemplateMainModelAnalysis) return '';
            const templates = activeUiTemplates.value;
            if (!templates.length) return '';

            const templatePayload = templates.map(template => ({
                id: template.id,
                name: template.name || 'UI模板',
                currentVariables: template.variableState || {},
                variableSchema: template.variableSchema || ''
            }));

            return [
                '[UI模板变量更新]',
                '你需要在正文结束后追加一个隐藏变量更新块。这个块只给前端读取，不属于正文，不要在正文中提到它。',
                '格式必须严格如下：',
                UI_TEMPLATE_UPDATES_OPEN_TAG,
                '{"updates":[{"id":"模板id","variables":{"变量路径":"新值"},"reason":"简短原因"}]}',
                UI_TEMPLATE_UPDATES_CLOSE_TAG,
                '没有变量变化也必须输出：',
                `${UI_TEMPLATE_UPDATES_OPEN_TAG}{"updates":[]}${UI_TEMPLATE_UPDATES_CLOSE_TAG}`,
                '只更新下方模板已定义的变量；不要修改HTML；不要编造无关字段。',
                '变量值可以是文字、数字、对象或数组；数组字段可返回完整数组，也可用 "items.0.name" 这种路径更新单项。',
                '模板变量如下：',
                JSON.stringify(templatePayload, null, 2)
            ].join('\n');
        };

        const parseUiTemplateUpdateJson = (rawContent) => {
            const normalizedContent = String(rawContent || '')
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();
            try {
                return JSON.parse(normalizedContent);
            } catch (primaryError) {
                const objectStart = normalizedContent.indexOf('{');
                const arrayStart = normalizedContent.indexOf('[');
                const candidates = [
                    [objectStart, normalizedContent.lastIndexOf('}')],
                    [arrayStart, normalizedContent.lastIndexOf(']')]
                ].filter(([start, end]) => start >= 0 && end > start);
                for (const [start, end] of candidates) {
                    try {
                        return JSON.parse(normalizedContent.slice(start, end + 1));
                    } catch (_) { }
                }
                throw primaryError;
            }
        };

        const normalizeUiTemplateUpdateList = (parsed) => {
            if (Array.isArray(parsed)) return parsed;
            if (!parsed || typeof parsed !== 'object') return [];
            if (Array.isArray(parsed.updates)) return parsed.updates;
            if (Object.prototype.hasOwnProperty.call(parsed, 'variables')) return [parsed];
            return [{ variables: parsed, reason: '' }];
        };

        const applyUiTemplateUpdateListToTemplate = (template, updates, { model = '', turn = null, source = 'ai', matchName = true } = {}) => {
            let fieldCount = 0;
            let changed = false;
            updates.forEach(update => {
                if (!template || !update || typeof update !== 'object') return;
                if (update.id && update.id !== template.id) return;
                if (matchName && update.name && update.name !== template.name) return;
                if (update.variables === null || typeof update.variables !== 'object') return;
                const changes = {};
                const variableEntries = Array.isArray(update.variables)
                    ? [['$root', update.variables]]
                    : Object.entries(update.variables);
                variableEntries.forEach(([key, value]) => {
                    const oldValue = key === '$root'
                        ? template.variableState
                        : getUiTemplateValue(template.variableState || {}, key);
                    if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                        template.variableState = setUiTemplateValue(template.variableState || {}, key, value);
                        changes[key] = { from: oldValue, to: value };
                    }
                });
                if (Object.keys(changes).length > 0) {
                    if (!Array.isArray(template.changeLog)) template.changeLog = [];
                    template.changeLog.unshift({
                        id: generateUUID(),
                        time: Date.now(),
                        source,
                        model,
                        turn,
                        changes,
                        reason: update.reason || ''
                    });
                    template.changeLog = template.changeLog.slice(0, 50);
                    fieldCount += Object.keys(changes).length;
                    changed = true;
                }
            });
            return { changed, fieldCount };
        };

        const applyMainModelUiTemplateUpdates = (targetMessage, model = settings.model) => {
            if (!settings.uiTemplateEnabled || !settings.uiTemplateMainModelAnalysis || !targetMessage) {
                return { handled: false, changed: false };
            }
            const match = String(targetMessage.content || '').match(UI_TEMPLATE_UPDATES_PATTERN);
            if (!match) {
                markUiTemplateStatus('skipped', '主模型未返回变量块', 0, targetMessage.id || null);
                return { handled: false, changed: false };
            }

            targetMessage.content = stripUiTemplateUpdateBlock(targetMessage.content);

            let updates = [];
            try {
                updates = normalizeUiTemplateUpdateList(parseUiTemplateUpdateJson(match[1]));
            } catch (e) {
                failUiTemplateAnalysis('变量分析失败', targetMessage.id || null);
                console.warn('[UI模板] 主模型变量块解析失败:', e.message, match[1]);
                return { handled: true, changed: false };
            }

            if (!updates.length) {
                attachUiTemplateBlocksToLastAssistant({ targetMessageId: targetMessage.id });
                markUiTemplateStatus('skipped', '无变化', 0, targetMessage.id || null);
                return { handled: true, changed: false };
            }

            const targetMessageIndex = chatHistory.value.findIndex(msg => msg === targetMessage || (targetMessage.id && msg.id === targetMessage.id));
            const turn = targetMessageIndex >= 0 ? getAssistantTurnAtIndex(targetMessageIndex) : null;
            let changedTemplateCount = 0;
            let changedFieldCount = 0;
            updates.forEach(update => {
                const targets = update?.id
                    ? activeUiTemplates.value.filter(template => template.id === update.id)
                    : (update?.name
                        ? activeUiTemplates.value.filter(template => template.name === update.name)
                        : (activeUiTemplates.value.length === 1 ? [activeUiTemplates.value[0]] : []));
                targets.forEach(template => {
                    const result = applyUiTemplateUpdateListToTemplate(template, [update], { model, turn, source: 'main_model' });
                    if (result.changed) {
                        changedTemplateCount++;
                        changedFieldCount += result.fieldCount;
                    }
                });
            });

            attachUiTemplateBlocksToLastAssistant({ targetMessageId: targetMessage.id });

            if (changedFieldCount > 0) {
                saveGlobalUiTemplateRuntimeForCharacter();
                saveData({ saveMemories: false });
                markUiTemplateStatus('success', `更新 ${changedFieldCount} 项`, 0, targetMessage.id || null);
                return { handled: true, changed: true };
            }

            markUiTemplateStatus('skipped', '无变化', 0, targetMessage.id || null);
            return { handled: true, changed: false };
        };

        const attachUiTemplateBlocksToLastAssistant = ({ excludeTemplateIds = new Set(), targetMessageId = null } = {}) => {
            const targetMessage = targetMessageId
                ? chatHistory.value.find(msg => msg && msg.role === 'assistant' && msg.id === targetMessageId)
                : getLastAssistantMessage();
            if (!targetMessage) return false;
            const top = activeUiTemplates.value
                .filter(template => template.placement === 'top' && !excludeTemplateIds.has(template.id))
                .map(renderUiTemplateHtml)
                .filter(Boolean);
            const bottom = activeUiTemplates.value
                .filter(template => template.placement === 'bottom' && !excludeTemplateIds.has(template.id))
                .map(renderUiTemplateHtml)
                .filter(Boolean);
            targetMessage.uiTemplateBlocks = {
                top,
                bottom,
                updatedAt: Date.now()
            };
            return top.length > 0 || bottom.length > 0;
        };

        const getAssistantTurnAtIndex = (index) => {
            const normalizedIndex = Math.max(0, Math.min(index, chatHistory.value.length - 1));
            return getConversationTurnAtIndex(normalizedIndex);
        };

        const buildUiTemplateStateAtTurn = (template, turn) => {
            let state = cloneUiObject(inferInitialUiTemplateState(template));
            const logs = Array.isArray(template.changeLog)
                ? template.changeLog
                    .filter(log => Number(log.turn || 0) <= turn)
                    .sort((a, b) => (a.turn || 0) - (b.turn || 0) || (a.time || 0) - (b.time || 0))
                : [];
            logs.forEach(log => {
                Object.entries(log.changes || {}).forEach(([key, change]) => {
                    if (change && Object.prototype.hasOwnProperty.call(change, 'to')) {
                        state = setUiTemplateValue(state, key, change.to);
                    }
                });
            });
            return state;
        };

        const UI_TEMPLATE_CONTEXT_OPEN_TAG = '<ui_template_state_context>';
        const UI_TEMPLATE_CONTEXT_CLOSE_TAG = '</ui_template_state_context>';

        const stripUiTemplateContextInjection = (text) => String(text || '')
            .replace(/<ui_template_state_context>[\s\S]*?<\/ui_template_state_context>/gi, '')
            .replace(/<ui_template_state_context>[\s\S]*$/gi, '');

        const buildUiTemplateContextSystemPrompt = () => {
            if (!settings.uiTemplateEnabled || !settings.uiTemplateInjectContext || settings.uiTemplateMainModelAnalysis) return '';
            const turn = getLatestCompleteConversationTurn()?.turn;
            const referenceTurn = Number(turn) || 0;
            if (referenceTurn <= 0) return '';

            const sections = activeUiTemplates.value
                .map(template => {
                    const state = buildUiTemplateStateAtTurn(template, referenceTurn);
                    if (!state || Object.keys(state).length === 0) return null;
                    const title = escapeXmlAttribute(template.name || template.id || 'UI模板');
                    return [
                        `  <template_state name="${title}">`,
                        indentXmlText(JSON.stringify(state, null, 2), 4),
                        '  </template_state>'
                    ].join('\n');
                })
                .filter(Boolean);

            if (!sections.length) return '';
            return [
                UI_TEMPLATE_CONTEXT_OPEN_TAG,
                '  <description>以下内容是给你参考当前剧情状态的 UI 模板变量快照，不是正文，也不要复述、改写或输出这些变量。请只用它理解角色状态、关系、地点和其他模板变量。</description>',
                ...sections,
                UI_TEMPLATE_CONTEXT_CLOSE_TAG
            ].join('\n');
        };

        const rebuildUiTemplateStateFromLogs = (template, remainingLogs, allLogs) => {
            let rebuilt = cloneUiObject(inferInitialUiTemplateState(template));
            [...remainingLogs]
                .sort((a, b) => (a.time || 0) - (b.time || 0))
                .forEach(log => {
                    Object.entries(log.changes || {}).forEach(([key, change]) => {
                        if (change && Object.prototype.hasOwnProperty.call(change, 'to')) {
                            rebuilt = setUiTemplateValue(rebuilt, key, change.to);
                        }
                    });
                });
            template.variableState = rebuilt;
        };

        const pruneUiTemplateChangesFromTurn = (turn) => {
            if (!Number.isFinite(turn) || turn < 1) return { logs: 0, blocks: 0 };
            let removedLogs = 0;
            currentUiTemplates.value.forEach(template => {
                const allLogs = Array.isArray(template.changeLog) ? template.changeLog : [];
                const remainingLogs = allLogs.filter(log => (log.turn || 0) < turn);
                removedLogs += allLogs.length - remainingLogs.length;
                if (allLogs.length !== remainingLogs.length) {
                    rebuildUiTemplateStateFromLogs(template, remainingLogs, allLogs);
                    template.changeLog = remainingLogs;
                }
            });

            let removedBlocks = 0;
            const snapshot = buildConversationTurnSnapshot();
            const blockMessageIndexes = new Set();
            snapshot.turns.forEach(turnInfo => {
                if ((turnInfo.turn || 0) < turn) return;
                (turnInfo.sourceIndexes || []).forEach(sourceIndex => blockMessageIndexes.add(sourceIndex));
            });
            blockMessageIndexes.forEach(msgIndex => {
                const msg = chatHistory.value[msgIndex];
                if (msg?.role === 'assistant' && msg.uiTemplateBlocks) {
                    delete msg.uiTemplateBlocks;
                    removedBlocks++;
                }
            });

            if (uiTemplateUpdateStatus.targetMessageId) {
                const targetStillExists = chatHistory.value.some(msg => msg.id === uiTemplateUpdateStatus.targetMessageId);
                if (!targetStillExists) {
                    abortUiTemplateUpdate(uiTemplateUpdateStatus.targetMessageId);
                }
            }

            return { logs: removedLogs, blocks: removedBlocks };
        };

        const resetUiTemplateRuntimeState = () => {
            abortUiTemplateUpdate();
            currentUiTemplates.value.forEach(template => {
                template.variableState = cloneUiObject(template.initialVariableState || {});
                template.changeLog = [];
            });
            saveGlobalUiTemplateRuntimeForCharacter();
            chatHistory.value.forEach(msg => {
                if (msg.uiTemplateBlocks) delete msg.uiTemplateBlocks;
            });
            markUiTemplateStatus('idle', '待命');
        };

        const getUiTemplateRuntimeKey = (char = currentCharacter.value, sessionId = currentConversationId.value) => (
            getConversationStorageScopeId(char?.uuid, sessionId) || null
        );

        const saveGlobalUiTemplateRuntimeForCharacter = (char = currentCharacter.value) => {
            const key = getUiTemplateRuntimeKey(char);
            if (!key) return;
            currentUiTemplates.value.forEach(template => {
                if (!template.runtimeByCharacter || typeof template.runtimeByCharacter !== 'object') {
                    template.runtimeByCharacter = {};
                }
                template.runtimeByCharacter[key] = {
                    variableState: cloneUiObject(template.variableState || template.initialVariableState || {}),
                    changeLog: Array.isArray(template.changeLog) ? JSON.parse(JSON.stringify(template.changeLog)) : []
                };
            });
        };

        const loadGlobalUiTemplateRuntimeForCharacter = (char = currentCharacter.value) => {
            const key = getUiTemplateRuntimeKey(char);
            currentUiTemplates.value.forEach(template => {
                const runtime = key && template.runtimeByCharacter ? template.runtimeByCharacter[key] : null;
                template.variableState = cloneUiObject(runtime?.variableState || template.initialVariableState || {});
                template.changeLog = Array.isArray(runtime?.changeLog) ? JSON.parse(JSON.stringify(runtime.changeLog)) : [];
            });
            markUiTemplateStatus('idle', '待命');
        };

        const getCharacterFavoriteTime = (char) => {
            const time = Number(char?.favoriteAt || 0);
            return Number.isFinite(time) && time > 0 ? time : 0;
        };

        const isCharacterFavorite = (char) => getCharacterFavoriteTime(char) > 0;

        const filteredCharacters = computed(() => {
            let result = characters.value.map((char, index) => ({ ...char, originalIndex: index }));

            if (characterSearchQuery.value) {
                const query = characterSearchQuery.value.toLowerCase();
                result = result.filter(char =>
                    char.name.toLowerCase().includes(query) ||
                    (char.description && char.description.toLowerCase().includes(query))
                );
            }

            // Favorites stay on top, with the most recently favorited first.
            result.sort((a, b) => {
                const favoriteDiff = getCharacterFavoriteTime(b) - getCharacterFavoriteTime(a);
                if (favoriteDiff !== 0) return favoriteDiff;
                const timeA = a.createdAt || 0;
                const timeB = b.createdAt || 0;
                if (timeB !== timeA) return timeB - timeA;
                // Fallback to UUID if timestamps are missing or identical
                return (b.uuid || '').localeCompare(a.uuid || '');
            });

            return result;
        });

        const displayedCharacters = computed(() => {
            return filteredCharacters.value.slice(0, characterDisplayLimit.value);
        });

        const loadMoreCharacters = () => {
            characterDisplayLimit.value += 8;
        };

        const resetChatRenderWindow = () => {
            chatRenderLimit.value = CHAT_RENDER_INITIAL_LIMIT;
            isChatTopUnlockArmed = true;
        };

        const hiddenChatMessageCount = computed(() => Math.max(0, chatHistory.value.length - chatRenderLimit.value));

        const displayedChatMessages = computed(() => {
            const startIndex = Math.max(0, chatHistory.value.length - chatRenderLimit.value);
            return chatHistory.value.slice(startIndex).map((msg, offset) => ({
                msg,
                index: startIndex + offset
            }));
        });

        const getChatScrollAnchor = () => {
            const container = chatContainer.value;
            const elements = (messageElements.value || [])
                .filter(el => el && el.dataset && el.dataset.chatIndex)
                .sort((a, b) => Number(a.dataset.chatIndex) - Number(b.dataset.chatIndex));
            if (!container || elements.length === 0) return null;

            const containerTop = container.getBoundingClientRect().top;
            const anchorElement = elements.find(el => el.getBoundingClientRect().bottom >= containerTop + 8) || elements[0];

            return {
                index: anchorElement.dataset.chatIndex,
                topOffset: anchorElement.getBoundingClientRect().top - containerTop
            };
        };

        const restoreChatScrollAnchor = async (anchor, scrollSnapshot = null) => {
            const container = chatContainer.value;
            if (!container) return;

            await nextTick();

            const restoreByHeight = () => {
                if (!scrollSnapshot) return;
                container.scrollTop = scrollSnapshot.scrollTop + (container.scrollHeight - scrollSnapshot.scrollHeight);
            };

            if (!anchor) {
                restoreByHeight();
                return;
            }

            const anchorElement = container.querySelector(`[data-chat-index="${anchor.index}"]`);
            if (!anchorElement) {
                restoreByHeight();
                return;
            }

            const containerTop = container.getBoundingClientRect().top;
            const newTopOffset = anchorElement.getBoundingClientRect().top - containerTop;
            container.scrollTop += newTopOffset - anchor.topOffset;
        };

        const loadEarlierChatMessages = async (batchSize = CHAT_RENDER_BATCH_SIZE) => {
            if (hiddenChatMessageCount.value <= 0 || isLoadingEarlierChatMessages) return;
            isLoadingEarlierChatMessages = true;
            const anchor = getChatScrollAnchor();
            const container = chatContainer.value;
            const scrollSnapshot = container ? {
                scrollTop: container.scrollTop,
                scrollHeight: container.scrollHeight
            } : null;
            const previousStartIndex = Math.max(0, chatHistory.value.length - chatRenderLimit.value);
            const nextRenderLimit = Math.min(
                chatHistory.value.length,
                chatRenderLimit.value + batchSize
            );
            const nextStartIndex = Math.max(0, chatHistory.value.length - nextRenderLimit);

            for (let i = nextStartIndex; i < previousStartIndex; i++) {
                const message = chatHistory.value[i];
                if (!message || !['user', 'assistant'].includes(message.role)) continue;
                message.skipReveal = true;
                message.shouldAnimate = false;
            }

            chatRenderLimit.value = nextRenderLimit;

            await restoreChatScrollAnchor(anchor, scrollSnapshot);
            isLoadingEarlierChatMessages = false;
        };

        const handleChatScroll = () => {
            const container = chatContainer.value;
            if (!container || hiddenChatMessageCount.value <= 0) return;
            if (container.scrollTop > 160) {
                isChatTopUnlockArmed = true;
                return;
            }
            if (isChatTopUnlockArmed && container.scrollTop <= 80) {
                isChatTopUnlockArmed = false;
                loadEarlierChatMessages();
            }
        };

        // Reset limit when search query changes
        watch(characterSearchQuery, () => {
            characterDisplayLimit.value = 8;
        });

        const chatRoundStats = computed(() => ({
            floors: getPostprocessedChatMessages(chatHistory.value, { includeSystem: false }).length
        }));

        const conversationBodyLength = computed(() => (
            chatHistory.value.reduce((total, message) => {
                if (!['user', 'assistant'].includes(message?.role)) return total;
                return total + parseCot(message.content || '').main.length;
            }, 0)
        ));

        const buildClassicMemoryLookup = () => {
            const byAssistantId = new Map();
            const byTurn = new Map();
            classicMemories.value.filter(memory => memory.enabled !== false).forEach(memory => {
                (memory.sourceAssistantIds || []).forEach(id => byAssistantId.set(id, memory));
                if (memory.turn > 0 && !byTurn.has(memory.turn)) byTurn.set(memory.turn, memory);
            });
            return { byAssistantId, byTurn };
        };

        const findClassicMemoryForTurn = (turnInfo, lookup) => {
            const sourceIds = (turnInfo.assistant?._sourceIndexes || [])
                .map(index => chatHistory.value[index]?.id)
                .filter(Boolean);
            return sourceIds.map(id => lookup.byAssistantId.get(id)).find(Boolean)
                || lookup.byTurn.get(turnInfo.turn);
        };

        const summaryCompressedBodyLength = computed(() => {
            let predictedLength = conversationBodyLength.value;
            if (!memorySettings.enabled
                || memorySettings.mode !== MEMORY_MODE_CLASSIC
                || classicMemories.value.length === 0) return predictedLength;

            const messages = getPostprocessedChatMessages(chatHistory.value, { includeSystem: false });
            const candidateCount = Math.max(0, messages.length - memorySettings.summaryKeepFloors);
            if (candidateCount === 0) return predictedLength;

            const lookup = buildClassicMemoryLookup();
            const snapshot = buildConversationTurnSnapshot(messages, { alreadyPostprocessed: true });
            snapshot.turns.forEach(turnInfo => {
                const assistantIndex = turnInfo.messageIndexes[1];
                if (assistantIndex >= candidateCount) return;
                const memory = findClassicMemoryForTurn(turnInfo, lookup);
                if (!memory?.summary) return;

                const sourceMessages = (turnInfo.assistant?._sourceIndexes || [])
                    .map(index => chatHistory.value[index])
                    .filter(message => message?.role === 'assistant');
                const originalMessages = sourceMessages.length > 0 ? sourceMessages : [turnInfo.assistant];
                const originalLength = originalMessages.reduce(
                    (total, message) => total + parseCot(message.content || '').main.length,
                    0
                );
                predictedLength += parseCot(memory.summary).main.length - originalLength;
            });
            return Math.max(0, predictedLength);
        });

        const modelTags = computed(() => {
            const counts = { all: availableModels.value.length, other: 0 };
            const tags = new Set();

            availableModels.value.forEach(m => {
                const id = m.id.toLowerCase();
                let found = false;
                for (const family of popularModelFamilies) {
                    if (id.includes(family)) {
                        tags.add(family);
                        counts[family] = (counts[family] || 0) + 1;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    counts.other++;
                }
            });
            const result = [{ name: 'all', count: counts.all }];
            Array.from(tags).sort().forEach(t => result.push({ name: t, count: counts[t] }));
            if (counts.other > 0) result.push({ name: 'other', count: counts.other });
            return result;
        });

        const filteredModels = computed(() => {
            let result = availableModels.value;

            if (activeModelTag.value && activeModelTag.value !== 'all') {
                if (activeModelTag.value === 'other') {
                    result = result.filter(m => {
                        const id = m.id.toLowerCase();
                        return !popularModelFamilies.some(family => id.includes(family));
                    });
                } else {
                    result = result.filter(m => m.id.toLowerCase().includes(activeModelTag.value));
                }
            }

            const searchQuery = modelSelectionTarget.value === 'memoryEmbeddingModel' ? 'embedding' : modelSearchQuery.value;
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                result = result.filter(m => m.id.toLowerCase().includes(query));
            }

            return result.sort((a, b) => a.id.localeCompare(b.id));
        });

        const getCharacterWICount = (char) => {
            if (!char.worldInfo) return 0;
            return char.worldInfo.filter(w => !systemWorldInfoNames.includes(w.comment)).length;
        };

        const getCharacterRegexCount = (char) => {
            if (!char.regexScripts) return 0;
            return char.regexScripts.filter(r => !systemRegexNames.includes(r.name || r.scriptName)).length;
        };
