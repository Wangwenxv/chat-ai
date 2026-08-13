// 41-markdown.part.js：由 build-app.js 按 setup 依赖顺序组装。
// Markdown Rendering
        /* extracted parseCot */

        const renderMarkdownCache = new Map();
        const cacheRenderedMarkdown = (key, value) => {
            renderMarkdownCache.set(key, value);
            if (renderMarkdownCache.size > 2000) {
                renderMarkdownCache.delete(renderMarkdownCache.keys().next().value);
            }
            return value;
        };
        const htmlFrameDetectionCache = new Map();
        watch(() => [settings.disableImages, regexScripts.value], () => {
            renderMarkdownCache.clear();
            htmlFrameDetectionCache.clear();
        }, { deep: true });

        const contentUsesHtmlFrame = (text, role = 'assistant', skipRegex = false) => {
            if (!text) return false;
            const cacheKey = `${role}_${skipRegex}_${text}`;
            if (htmlFrameDetectionCache.has(cacheKey)) return htmlFrameDetectionCache.get(cacheKey);

            let processed = text;
            processed = skipRegex ? processed : processRegex(processed, { isDisplay: true, role: role });
            const trimmed = processed.trim();
            let usesFrame = false;

            const codeFencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
            let codeMatch;
            while ((codeMatch = codeFencePattern.exec(trimmed)) !== null) {
                const lang = codeMatch[1] || '';
                const blockContent = codeMatch[2] || '';
                if (/\b(html|xml)\b/i.test(lang) || /^\s*<(!doctype|html|head|body|div|span|style|script|table|img)/i.test(blockContent)) {
                    usesFrame = true;
                    break;
                }
            }

            if (!usesFrame && !trimmed.includes('```')) {
                usesFrame = /(<!doctype html>|<html\b[^>]*>)/i.test(trimmed);
            }

            htmlFrameDetectionCache.set(cacheKey, usesFrame);
            if (htmlFrameDetectionCache.size > 2000) htmlFrameDetectionCache.delete(htmlFrameDetectionCache.keys().next().value);
            return usesFrame;
        };

        const messageUsesHtmlFrame = (msg) => {
            if (!msg || !msg.content) return false;
            if (msg.isTriggered) return msg.showRaw && contentUsesHtmlFrame(msg.content, msg.role);
            const parsed = parseCot(msg.content);
            return contentUsesHtmlFrame(parsed.main || msg.content, msg.role);
        };

        const messageHasUiTemplateBlocks = (msg) => {
            const blocks = msg?.uiTemplateBlocks;
            if (!blocks) return false;
            return (Array.isArray(blocks.top) && blocks.top.length > 0)
                || (Array.isArray(blocks.bottom) && blocks.bottom.length > 0);
        };

        const messageHasPendingUiTemplate = (msg) => (
            !!msg
            && uiTemplateUpdateStatus.state === 'running'
            && uiTemplateUpdateStatus.targetMessageId === msg.id
            && activeUiTemplates.value.length > 0
        );

        const messageUsesWideLayout = (msg) => {
            if (!msg) return false;
            return !!(
                msg.reasoning
                || parseCot(msg.content || '').cot
                || (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0)
                || msg.isEditing_Message
                || (Array.isArray(msg.attachments) && msg.attachments.length > 0)
                || (Array.isArray(msg.generatedImages) && msg.generatedImages.length > 0)
                || !!msg.imageGeneration
                || messageUsesHtmlFrame(msg)
                || messageHasUiTemplateBlocks(msg)
                || messageHasPendingUiTemplate(msg)
            );
        };

        const extractNativeReasoning = cardUtils.extractNativeReasoning;

        const formatAIResponseForConsole = (content = '', reasoning = '') => {
            const reasoningText = String(reasoning || '').trim();
            const contentText = String(content || '');
            if (!reasoningText) return contentText;
            return `<thinking>\n${reasoningText}\n</thinking>${contentText ? `\n\n${contentText}` : ''}`;
        };

        const activeNativeReasoning = computed(() => {
            const lastMessage = chatHistory.value[chatHistory.value.length - 1];
            return !!(lastMessage && lastMessage.role === 'assistant' && typeof lastMessage.reasoning === 'string' && lastMessage.reasoning.trim());
        });

        const collapseNativeReasoning = (message) => {
            if (message && message.role === 'assistant' && typeof message.reasoning === 'string' && message.reasoning.trim()) {
                if (message.isReasoningUserToggled || message.isReasoningAutoCollapsed) return;
                message.isReasoningOpen = false;
                message.isReasoningAutoCollapsed = true;
            }
        };

        const appendAssistantResponseError = (message, errorMessage) => {
            if (!message) return;
            const safeErrorMessage = escapeXmlText(errorMessage || '生成失败');
            message.content = [
                String(message.content || '').trimEnd(),
                `<div class="response-error-text">-- ${safeErrorMessage} --</div>`
            ].filter(Boolean).join('\n\n');
            message.shouldAnimate = false;
            collapseNativeReasoning(message);
        };

        const collapseActiveNativeReasoning = () => {
            collapseNativeReasoning(chatHistory.value[chatHistory.value.length - 1]);
        };

        const renderMarkdown = (text, role = 'assistant', skipRegex = false) => {
            if (!text) return '';
            const cacheKey = `${role}_${skipRegex}_${text}`;
            if (renderMarkdownCache.has(cacheKey)) return renderMarkdownCache.get(cacheKey);

            let processed = text;

            // Apply regex for display (real-time)
            processed = skipRegex ? processed : processRegex(processed, { isDisplay: true, role: role });
            const createIframe = (rawHtml) => createExecutableHtmlIframe(rawHtml, 'border-t border-gray-200 shadow-sm');

            // Configure DOMPurify
            const cleanConfig = {
                ADD_TAGS: ['details', 'summary', 'iframe', 'svg', 'path', 'g', 'circle', 'rect', 'defs', 'linearGradient', 'stop', 'style', 'div', 'span', 'script', 'button', 'input'],
                ADD_ATTR: ['style', 'open', 'srcdoc', 'sandbox', 'frameborder', 'allow', 'allowfullscreen', 'class', 'id', 'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'stroke-linecap', 'stroke-linejoin', 'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color', 'stop-opacity', 'width', 'height', 'onclick', 'type', 'value', 'checked', 'data-slash'],
                FORBID_ATTR: ['onmouseover', 'onload'], // Removed onclick to allow interactive UI
                FORCE_BODY: true
            };

            const trimmed = processed.trim();

            // Improved HTML Document Detection
            // Look for standard HTML document markers anywhere in the text, not just at the start
            // This handles cases where there might be some text before the HTML code
            const htmlDocPattern = /(<!doctype html>|<html\b[^>]*>)/i;
            const htmlMatch = trimmed.match(htmlDocPattern);
            const containsHtmlDoc = !!htmlMatch;

            // If it looks like a full HTML document, extract and render it in an iframe
            // We check !trimmed.includes('```') to avoid rendering code blocks that the user intended to display as code
            if (containsHtmlDoc && !trimmed.includes('```')) {
                const startIndex = htmlMatch.index;

                // Find end index to preserve text AFTER the HTML
                const closeTag = '</html>';
                const closeIndex = trimmed.toLowerCase().lastIndexOf(closeTag);

                let htmlContent, preText, postText;

                if (closeIndex !== -1 && closeIndex > startIndex) {
                    const endIndex = closeIndex + closeTag.length;
                    htmlContent = trimmed.substring(startIndex, endIndex);
                    preText = trimmed.substring(0, startIndex);
                    postText = trimmed.substring(endIndex);
                } else {
                    // Fallback: Take everything from start match to end
                    htmlContent = trimmed.substring(startIndex);
                    preText = trimmed.substring(0, startIndex);
                    postText = '';
                }

                let resultHtml = '';

                // 1. Render Pre-text (Markdown)
                if (preText.trim()) {
                    resultHtml += DOMPurify.sanitize(marked.parse(preText), cleanConfig);
                }

                // 2. Render Iframe (HTML Card)
                const container = document.createElement('div');
                container.className = 'html-card-container';
                // Remove bottom margin to align with bubble bottom
                container.style.margin = '0';
                container.style.paddingBottom = '0';
                // Adjust negative margin to pull it down slightly if needed, or just 0
                container.style.marginBottom = '-1px'; // Slight pull to cover border if any
                container.appendChild(createIframe(htmlContent));
                resultHtml += container.outerHTML;

                // 3. Render Post-text (Markdown)
                if (postText.trim()) {
                    resultHtml += DOMPurify.sanitize(marked.parse(postText), cleanConfig);
                }

                return cacheRenderedMarkdown(cacheKey, resultHtml);
            }

            const lowerTrimmed = trimmed.toLowerCase();

            // Smart detection: If content starts with block-level HTML and contains no Markdown Code Blocks,
            // assume it is raw HTML and skip marked parsing to prevent breaking layout/styles.
            const startsWithBlockHtml = /^\s*<(div|table|section|article|aside|header|footer|style|script)/i.test(trimmed);
            if (startsWithBlockHtml && !trimmed.includes('```')) {
                // Directly sanitize and return, skipping Markdown parsing
                const result = DOMPurify.sanitize(processed, cleanConfig);
                return cacheRenderedMarkdown(cacheKey, result);
            }

            // For mixed content (Text + HTML widgets like HUDs/Status Bars),
            // we strip structural tags to prevent browser parsing issues and allow inline rendering
            if (lowerTrimmed.includes('<html') || lowerTrimmed.includes('<!doctype')) {
                processed = processed.replace(/<!DOCTYPE html>/gi, '')
                    .replace(/<\/?html[^>]*>/gi, '')
                    .replace(/<\/?head[^>]*>/gi, '')
                    .replace(/<\/?body[^>]*>/gi, '');
            }

            let html = DOMPurify.sanitize(marked.parse(processed), cleanConfig);

            // Auto-render HTML code blocks AND escaped HTML texts
            try {
                // Execute Scripts manually because setting innerHTML doesn't run scripts
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Handle scripts
                const scripts = doc.querySelectorAll('script');
                if (scripts.length > 0) {
                    setTimeout(() => {
                        scripts.forEach(oldScript => {
                            // Find the script in the actual DOM after render
                            // Note: This is tricky because we're returning HTML string, not mounting DOM yet.
                            // Vue v-html will mount it. But v-html doesn't run scripts.
                            // Strategy: We rely on the fact that inline rendering with <script> is dangerous/complex in Vue.
                            // But since the user wants inline script execution for UI, we might need a workaround.
                            // The createIframe approach already handles scripts because srcdoc runs them.
                            // But for inline content (like the user's div), scripts won't run via v-html.
                            // We will try to convert complex UI blocks containing scripts into IFRAMES automatically.
                        });
                    }, 0);
                }

                let modified = false;

                // 1. Convert code blocks that look like HTML to iframes
                const codeBlocks = doc.querySelectorAll('pre code');
                if (codeBlocks.length > 0) {
                    codeBlocks.forEach(block => {
                        const rawHtml = block.textContent;
                        // Check if it's HTML: has language class OR looks like HTML
                        const isHtmlClass = block.classList.contains('language-html') || block.classList.contains('language-xml');
                        const looksLikeHtml = /^\s*<(!doctype|html|head|body|div|span|style|script|table|img)/i.test(rawHtml);

                        if (isHtmlClass || looksLikeHtml) {
                            const iframe = createIframe(rawHtml);
                            const preTag = block.parentElement;
                            if (preTag && preTag.parentNode) {
                                preTag.parentNode.replaceChild(iframe, preTag);
                                modified = true;
                            }
                        }
                    });
                }

                // 2. Recover escaped HTML that was rendered as text (e.g. due to missing newlines in Markdown)
                const paragraphs = doc.querySelectorAll('p');
                if (paragraphs.length > 0) {
                    paragraphs.forEach(p => {
                        if (/^\s*</.test(p.innerHTML)) {
                            const rawHtml = p.textContent;
                            if (/^\s*<(!doctype|html|head|body|div|span|style|script|table|img)/i.test(rawHtml)) {
                                const iframe = createIframe(rawHtml);
                                if (p.parentNode) {
                                    p.parentNode.replaceChild(iframe, p);
                                    modified = true;
                                }
                            }
                        }
                    });
                }

                // 3. Detect inline scripts in divs and wrap them in iframes if they are complex UI components
                // This fixes the issue where scripts inside replaced regex content (inline HTML) don't execute
                const complexDivs = doc.querySelectorAll('div[style*="position"], div[style*="background"], div[class*="panel"]');
                complexDivs.forEach(div => {
                    if (div.querySelector('script')) {
                        // This div contains a script, wrap the whole thing in an iframe to ensure execution
                        const rawHtml = div.outerHTML;
                        const iframe = createIframe(rawHtml);
                        if (div.parentNode) {
                            div.parentNode.replaceChild(iframe, div);
                            modified = true;
                        }
                    }
                });

                if (modified) {
                    const result = doc.body.innerHTML;
                    return cacheRenderedMarkdown(cacheKey, result);
                }
            } catch (e) {
                console.error('Error rendering HTML preview:', e);
            }

            return cacheRenderedMarkdown(cacheKey, html);
        };
