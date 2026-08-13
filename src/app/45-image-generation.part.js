// 45-image-generation.part.js：由 build-app.js 按 setup 依赖顺序组装。
const getImageApiEndpoint = () => {
            const baseUrl = String(settings.imageApiUrl || DEFAULT_IMAGE_API_URL).trim().replace(/\/+$/, '');
            if (/\/responses$/i.test(baseUrl)) return baseUrl;
            return /\/v1$/i.test(baseUrl) ? `${baseUrl}/responses` : `${baseUrl}/v1/responses`;
        };

        const getTextOnlyImageContext = (currentMessage) => {
            // 图片理解上下文同样使用当前角色卡，避免回退到固定 chat-ai 身份。
            const systemParts = [getCurrentCharacterPrompt()];
            const historyLines = chatHistory.value
                .filter(message => message && message !== currentMessage && ['user', 'assistant'].includes(message.role))
                .map(message => {
                    const role = message.role === 'user' ? '用户' : '助手';
                    const text = [String(message.content || '').trim(), getMessageImageSummary(message)]
                        .filter(Boolean)
                        .join('\n');
                    return text ? `${role}：${text}` : '';
                })
                .filter(Boolean);
            const historyText = historyLines.join('\n\n');
            const recentHistory = historyText.length > 120000 ? historyText.slice(-120000) : historyText;
            return [
                '系统与角色设定：',
                systemParts.filter(Boolean).join('\n\n'),
                recentHistory ? `文字对话上下文：\n${recentHistory}` : ''
            ].filter(Boolean).join('\n\n');
        };

        const normalizeGeneratedImageData = (value, outputFormat) => {
            if (typeof value !== 'string') return '';
            const trimmed = value.trim();
            if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return trimmed;
            if (trimmed.length < 64 || !/^[A-Za-z0-9+/\r\n=]+$/.test(trimmed)) return '';
            const compact = trimmed.replace(/\s/g, '');
            let header = '';
            try {
                header = atob(compact.slice(0, 32));
            } catch (_) {
                return '';
            }
            const bytes = Array.from(header, char => char.charCodeAt(0));
            const matches = (...expected) => expected.every((byte, index) => bytes[index] === byte);
            let mime = '';
            if (matches(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) mime = 'image/png';
            else if (matches(0xff, 0xd8, 0xff)) mime = 'image/jpeg';
            else if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) mime = 'image/gif';
            else if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') mime = 'image/webp';
            if (!mime) return '';
            return `data:${mime};base64,${compact}`;
        };

        const collectGeneratedImages = (payload, outputFormat, results = []) => {
            const imageKeys = new Set([
                'b64_json', 'base64', 'data', 'image', 'image_base64', 'image_b64',
                'partial_image', 'partial_image_b64', 'result'
            ]);
            if (Array.isArray(payload)) {
                payload.forEach(item => collectGeneratedImages(item, outputFormat, results));
                return results;
            }
            if (!payload || typeof payload !== 'object') return results;
            Object.entries(payload).forEach(([key, value]) => {
                if (imageKeys.has(key)) {
                    const dataUrl = normalizeGeneratedImageData(value, outputFormat);
                    if (dataUrl) results.push(dataUrl);
                }
                if (value && typeof value === 'object') {
                    collectGeneratedImages(value, outputFormat, results);
                }
            });
            return results;
        };

        const explainImageGenerationError = (value) => {
            const message = String(value || '未知错误');
            if (!/model_not_found|no available channel|无可用渠道/i.test(message)) return message;
            return `${message}\n当前生图 API 分组没有该模型的可用渠道。这是服务端渠道配置或状态问题，不是对话模型或对话 API Key 被复用。`;
        };

        const generateImageResponse = async (startTime, userMessage) => {
            const apiKey = String(settings.imageApiKey || '').trim();
            if (!apiKey) {
                showToast('请先在设置中填写生图 API Key', 'warning');
                showApiSettingsModal.value = true;
                return;
            }
            const prompt = String(userMessage?.content || '').trim();
            const selectedSize = String(settings.imageOutputSize || '1024x1024');
            const sizeSuffix = `要求大小${selectedSize.replace(/x/gi, '×')}`;
            const context = getTextOnlyImageContext(userMessage);
            const inputText = [
                'Use the image_generation tool to generate exactly one image. Do not output a long text explanation; generate the image.',
                context,
                `当前生图提示词：\n${prompt}`,
                sizeSuffix
            ].filter(Boolean).join('\n\n');
            const referenceImages = Array.isArray(userMessage?.attachments) ? userMessage.attachments : [];
            const outputFormat = String(settings.imageOutputFormat || 'png');
            const body = {
                model: String(settings.imageChatModel || DEFAULT_IMAGE_CHAT_MODEL).trim(),
                input: [{
                    role: 'user',
                    content: [
                        { type: 'input_text', text: inputText },
                        ...referenceImages.filter(image => image?.dataUrl).map(image => ({
                            type: 'input_image',
                            image_url: image.dataUrl
                        }))
                    ]
                }],
                tools: [{
                    type: 'image_generation',
                    model: String(settings.imageModel || DEFAULT_IMAGE_MODEL).trim(),
                    output_format: outputFormat,
                    quality: 'high',
                    partial_images: 2,
                    size: selectedSize
                }],
                instructions: 'Always call image_generation when the user asks for an image.',
                tool_choice: { type: 'image_generation' },
                stream: true,
                store: false,
                reasoning: {
                    effort: String(settings.imageReasoningEffort || 'high'),
                    summary: 'auto'
                },
                text: { verbosity: 'medium' },
                include: ['reasoning.encrypted_content']
            };

            isGenerating.value = true;
            isReceiving.value = true;
            isThinking.value = true;
            abortController.value = new AbortController();
            const generationStartTime = startTime || Date.now();
            if (waitTimer) clearInterval(waitTimer);
            currentWaitTime.value = '0.0';
            waitTimer = setInterval(() => {
                currentWaitTime.value = ((Date.now() - generationStartTime) / 1000).toFixed(1);
            }, 100);

            const extension = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
            const imageGenerationMessage = reactive({
                role: 'assistant',
                name: currentCharacter.value?.name || '生图 AI',
                content: '',
                requestMode: 'image',
                generatedImages: [],
                imageGeneration: {
                    status: 'connecting',
                    eventCount: 0,
                    previewCount: 0,
                    previewDataUrl: '',
                    lastEventType: '',
                    label: '正在连接生图服务',
                    aspectRatio: selectedSize.replace(/x/gi, ' / '),
                    startedAt: Date.now()
                },
                id: generateUUID(),
                shouldAnimate: false,
                skipReveal: true
            });
            chatHistory.value.push(imageGenerationMessage);
            await scrollChatToBottom();

            let finalImageDataUrl = '';
            let latestUsage = null;
            const registerImageEvent = (payload) => {
                const progress = imageGenerationMessage.imageGeneration;
                const eventType = String(payload?.type || 'event');
                progress.eventCount += 1;
                progress.lastEventType = eventType;
                progress.status = 'generating';

                const images = collectGeneratedImages(payload, outputFormat);
                if (images.length > 0) {
                    finalImageDataUrl = images[images.length - 1];
                    progress.previewDataUrl = finalImageDataUrl;
                    progress.previewCount += images.length;
                    progress.label = /partial|preview/i.test(eventType)
                        ? `已收到第 ${progress.previewCount} 次预览`
                        : '正在整理最终图片';
                    return;
                }

                if (/queue|queued/i.test(eventType)) progress.label = '已进入生成队列';
                else if (/reason|thinking/i.test(eventType)) progress.label = '正在分析画面';
                else if (/complete|done/i.test(eventType)) progress.label = '正在等待最终图片';
                else progress.label = '生图处理中';
            };
            try {
                const response = await fetch(getImageApiEndpoint(), {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream'
                    },
                    body: JSON.stringify(body),
                    signal: abortController.value.signal
                });
                if (!response.ok) {
                    const detail = await response.text();
                    throw new Error(formatApiErrorMessage(response.status, detail));
                }
                imageGenerationMessage.imageGeneration.status = 'generating';
                imageGenerationMessage.imageGeneration.label = '服务已连接，等待预览';

                const contentType = String(response.headers.get('content-type') || '');
                if (contentType.includes('text/event-stream') && response.body) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    const processLine = (line) => {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) return;
                        const dataText = trimmed.slice(5).trim();
                        if (!dataText || dataText === '[DONE]') return;
                        try {
                            const payload = JSON.parse(dataText);
                            const apiError = extractApiErrorMessage(payload, response.status);
                            if (apiError) throwApiError(apiError);
                            latestUsage = getApiUsagePayload(payload) || payload?.response?.usage || latestUsage;
                            registerImageEvent(payload);
                        } catch (error) {
                            if (error.isApiError) throw error;
                            console.warn('生图流事件解析失败:', error);
                        }
                    };
                    while (true) {
                        const { done, value } = await reader.read();
                        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
                        const lines = buffer.split(/\r?\n/);
                        buffer = lines.pop() || '';
                        lines.forEach(processLine);
                        if (done) break;
                    }
                    if (buffer.trim()) processLine(buffer);
                } else {
                    const payload = await response.json();
                    latestUsage = getApiUsagePayload(payload) || payload?.response?.usage || null;
                    registerImageEvent(payload);
                }

                if (!finalImageDataUrl) {
                    throw new Error('生图接口未返回图片数据');
                }
                imageGenerationMessage.content = `已生成图片：${prompt}`;
                imageGenerationMessage.generatedImages = [{
                        id: generateUUID(),
                        name: `generated-${Date.now()}.${extension}`,
                        mime: outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`,
                        dataUrl: finalImageDataUrl,
                        prompt,
                        createdAt: Date.now()
                    }];
                imageGenerationMessage.imageGeneration.status = 'completed';
                imageGenerationMessage.imageGeneration.label = '生成完成';
                imageGenerationMessage.imageGeneration.previewDataUrl = finalImageDataUrl;
                imageGenerationMessage.imageGeneration.completedAt = Date.now();
                recordApiUsage(latestUsage, {
                    type: 'image',
                    model: String(settings.imageModel || DEFAULT_IMAGE_MODEL),
                    detail: selectedSize
                });
                await scrollChatToBottom();
            } catch (error) {
                if (error.name === 'AbortError') {
                    imageGenerationMessage.content = '生图已中止';
                    imageGenerationMessage.imageGeneration.status = 'cancelled';
                    imageGenerationMessage.imageGeneration.label = '生成已中止';
                    showToast('生图已中止', 'info');
                } else {
                    console.error('Image generation failed:', error);
                    const errorMessage = explainImageGenerationError(error.message);
                    imageGenerationMessage.content = `生图失败：${errorMessage}`;
                    imageGenerationMessage.imageGeneration.status = 'error';
                    imageGenerationMessage.imageGeneration.label = '生成失败';
                    showToast(errorMessage, 'error', 7000);
                }
            } finally {
                if (waitTimer) {
                    clearInterval(waitTimer);
                    waitTimer = null;
                }
                await saveChatHistoryNow();
                isGenerating.value = false;
                isReceiving.value = false;
                isThinking.value = false;
                abortController.value = null;
            }
        };
