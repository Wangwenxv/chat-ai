// 40-ui-actions.part.js：由 build-app.js 按 setup 依赖顺序组装。
// --- Methods ---

        // Toast Notification
        const showToast = (message, type = 'info', duration = 2000) => {
            const id = `${Date.now()}-${toastIdSeed++}`;
            toasts.value.push({ id, message, type });
            setTimeout(() => {
                toasts.value = toasts.value.filter(t => t.id !== id);
            }, duration);
        };

        // Confirmation Dialog
        const yieldToUi = () => new Promise(resolve => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            } else {
                setTimeout(resolve, 0);
            }
        });

        const confirmAction = (message, callback) => {
            confirmMessage.value = message;
            confirmCallback.value = callback;
            showConfirmModal.value = true;
        };

        const runConfirmCallback = async (callback) => {
            try {
                await yieldToUi();
                await callback();
            } catch (error) {
                console.error('Confirm action failed:', error);
                showToast(error?.message || '操作失败', 'error');
            }
        };

        const handleConfirm = () => {
            const callback = confirmCallback.value;
            showConfirmModal.value = false;
            confirmCallback.value = null;
            if (callback) runConfirmCallback(callback);
        };

        const handleCancel = () => {
            showConfirmModal.value = false;
            confirmCallback.value = null;
        };

        // Regex Processing
        // 辅助函数：当自动生图关闭时，只从发送给模型的上下文里移除可生图替换的内容
        const stripDisabledImageGenContext = (text) => {
            if (!text) return text;
            if (isAutoImageGenEnabled.value) return text; // 生图开启时保留
            return String(text)
                .replace(/<image\b[^>]*>[\s\S]*?<\/image>/gi, '')
                .replace(/image###([\s\S]*?)###/gi, '')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        };
        const processRegex = (text, options = {}) => {
            if (!text) return '';
            if (SIMPLE_CHAT_AI_MODE) return text;
            // options: { isDisplay, isPrompt, role, depth }
            const { isDisplay = false, isPrompt = false, role = null, depth = 0 } = options;
            if (role === 'system') return text;

            let result = text;
            const orderedScripts = [...regexScripts.value].sort((a, b) => {
                const aIsImageGen = (a.name || a.scriptName) === 'NAI画图正则';
                const bIsImageGen = (b.name || b.scriptName) === 'NAI画图正则';
                return aIsImageGen === bIsImageGen ? 0 : (aIsImageGen ? 1 : -1);
            });

            orderedScripts.forEach(script => {
                // 明确检查 enabled 字段：只有显式设置为 false 才跳过
                if (script.enabled === false) return;

                // Placement Check (1=User, 2=AI)
                // 如果 placement 未定义，默认为全部生效 (兼容旧数据)
                const placement = script.placement || [1, 2];
                if (role === 'user' && !placement.includes(1)) return;
                if (role === 'assistant' && !placement.includes(2)) return;

                // Mode Check
                const userOnly = script.markdownOnly || (!script.markdownOnly && !script.promptOnly);
                if (isDisplay && script.promptOnly) return; // 显示模式下，跳过仅AI可见的正则
                if (isPrompt && userOnly) return; // 发送给AI前，跳过仅用户可见的正则；两项都没勾也按仅用户可见处理

                // Depth Check
                if (script.minDepth !== null && script.minDepth !== undefined && depth < script.minDepth) return;
                if (script.maxDepth !== null && script.maxDepth !== undefined && depth > script.maxDepth) return;

                try {
                    // 兼容外部正则字段：findRegex/regex, replaceString/replacement
                    let regexPattern = script.regex || script.findRegex;
                    let flags = script.flags || script.regexFlags || 'g';
                    const replacement = script.hasOwnProperty('replacement')
                        ? script.replacement
                        : (script.replaceString || '');

                    if (!regexPattern) return;

                    // 解析 /pattern/flags 格式
                    if (regexPattern.startsWith('/') && regexPattern.lastIndexOf('/') > 0) {
                        const lastSlash = regexPattern.lastIndexOf('/');
                        const potentialFlags = regexPattern.substring(lastSlash + 1);
                        // 简单的 flags 验证
                        if (/^[gimsuy]*$/.test(potentialFlags)) {
                            flags = potentialFlags;
                            regexPattern = regexPattern.substring(1, lastSlash);
                        }
                    }

                    ({ pattern: regexPattern, flags } = cardUtils.normalizeRegexModifiers(regexPattern, flags));

                    const re = new RegExp(regexPattern, flags);

                    // --- Protection Logic Start ---
                    // 只有当正则不包含 < 或 > 且不包含 markdown 代码块标记 (```) 时，才启用 HTML/代码块保护
                    // 如果正则本身就在匹配代码块（如用户提供的 ```json ...```），则不应进行保护
                    // 增强保护：防止普通正则（通常带g）破坏 iframe 渲染内容（HTML文档、Script/Style块）
                    // 特例：'Auto Replace {{user}}' 允许全局替换，包括 iframe 内部
                    if (!/[<>]/.test(regexPattern) && !regexPattern.includes('```') && script.name !== 'Auto Replace {{user}}') {
                        // 匹配 完整的 HTML 文档, Script/Style 块, Markdown 代码块, 行内代码, HTML 标签, 或 <cot> 块
                        // Updated to support <think> and erroneous <cot>...<cot> closing
                        result = cardUtils.transformUnprotectedText(
                            result,
                            part => part.replace(re, replacement)
                        );
                    } else {
                        // 如果正则明确包含 <, > 或 ```，说明用户意图直接操作 HTML 或 Markdown 代码块，因此跳过保护直接替换
                        result = result.replace(re, replacement);
                    }
                    // --- Protection Logic End ---

                } catch (e) {
                    console.error(`Regex error in script "${script.name || 'Unnamed'}":`, e.message);
                }
            });
            return result;
        };
