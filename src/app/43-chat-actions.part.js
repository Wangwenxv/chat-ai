// 43-chat-actions.part.js：由 build-app.js 按 setup 依赖顺序组装。
// Chat Logic
        const markActiveToolInlineWorkCancelled = () => {
            let changed = false;
            chatHistory.value.forEach(msg => {
                if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.toolCalls)) return;
                msg.toolCalls.forEach(toolCall => {
                    if (!toolCall || !['receiving', 'queued', 'running', 'continuing'].includes(toolCall.status)) return;
                    toolCall.status = 'error';
                    toolCall.error = '生成已中止';
                    toolCall.resultText = toolCall.resultText || toolCall.error;
                    changed = true;
                });
            });
            if (changed) {
                activeToolContinuationMessageId.value = null;
                activeToolContinuationToolCallId.value = null;
                activeToolContinuationHasResponse.value = false;
                activeToolHandoffPending.value = false;
                activeToolContinuationPending.value = false;
                saveChatHistoryNow();
            }
            return changed;
        };

        const stopGeneration = () => {
            abortUiTemplateUpdate();
            if (abortController.value) {
                abortSafely(abortController.value, 'Generation cancelled by user');
            }
            if (activeToolQueueAbortController) {
                abortSafely(activeToolQueueAbortController, 'Generation cancelled by user');
            }
            if (hasActiveToolInlineWork.value) {
                markActiveToolInlineWorkCancelled();
            }
        };

        const waitForConversationIdle = async (timeoutMs = 3000) => {
            const startedAt = Date.now();
            while (isConversationBusy.value && Date.now() - startedAt < timeoutMs) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return !isConversationBusy.value;
        };

        const fileToDataUrl = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
            reader.readAsDataURL(file);
        });

        const addReferenceImageFiles = async (files) => {
            const imageFiles = Array.from(files || []).filter(file => String(file?.type || '').startsWith('image/'));
            if (!imageFiles.length) return;
            const remaining = MAX_PENDING_REFERENCE_IMAGES - pendingReferenceImages.value.length;
            if (remaining <= 0) {
                showToast(`每次最多添加 ${MAX_PENDING_REFERENCE_IMAGES} 张参考图片`, 'warning');
                return;
            }

            const accepted = imageFiles.slice(0, remaining);
            for (const file of accepted) {
                if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
                    showToast(`${file.name || '图片'} 超过 10MB，已跳过`, 'warning');
                    continue;
                }
                try {
                    const dataUrl = await fileToDataUrl(file);
                    pendingReferenceImages.value.push({
                        id: generateUUID(),
                        name: file.name || `粘贴图片-${pendingReferenceImages.value.length + 1}`,
                        mime: file.type || 'image/png',
                        bytes: file.size || 0,
                        dataUrl
                    });
                } catch (error) {
                    showToast(error.message || '图片读取失败', 'error');
                }
            }
            if (imageFiles.length > accepted.length) {
                showToast(`每次最多添加 ${MAX_PENDING_REFERENCE_IMAGES} 张参考图片`, 'warning');
            }
        };

        const handleReferenceImageSelection = async (event) => {
            await addReferenceImageFiles(event?.target?.files);
            if (event?.target) event.target.value = '';
        };

        const handleChatPaste = (event) => {
            const files = Array.from(event?.clipboardData?.items || [])
                .filter(item => item.kind === 'file' && String(item.type || '').startsWith('image/'))
                .map(item => item.getAsFile())
                .filter(Boolean);
            if (files.length) addReferenceImageFiles(files);
        };

        const removePendingReferenceImage = (imageId) => {
            pendingReferenceImages.value = pendingReferenceImages.value.filter(image => image.id !== imageId);
        };

        const setGenerationMode = (mode) => {
            generationMode.value = mode === 'image' ? 'image' : 'chat';
            showChatModelSelector.value = false;
        };

        const sendMessage = async () => {
            if ((!userInput.value.trim() && pendingReferenceImages.value.length === 0) || isConversationBusy.value) return;

            const referenceImages = pendingReferenceImages.value.map(image => ({ ...image }));
            const content = userInput.value.trim() || (generationMode.value === 'image'
                ? '请根据参考图片生成一张图片'
                : '请分析这张图片');
            const startTime = Date.now(); // Record click time
            userInput.value = '';
            pendingReferenceImages.value = [];

            let finalContent = content;
            if (sysInstruction.value.trim()) {
                finalContent += '\n\n[系统指令: ' + sysInstruction.value.trim() + ']';
                sysInstruction.value = ''; // Auto clear after sending
            }

            // Add user message locally with NAME
            const userMessage = {
                role: 'user',
                name: user.name,
                content: finalContent,
                attachments: referenceImages,
                requestMode: generationMode.value,
                shouldAnimate: true,
                skipReveal: true,
                isSelf: true,
                avatar: user.avatar,
                id: generateUUID()
            };
            chatHistory.value.push(userMessage);
            await nextTick();

            if (generationMode.value === 'image') {
                await generateImageResponse(startTime, userMessage);
            } else {
                await generateResponse(startTime, {
                    currentReferenceImages: referenceImages,
                    currentUserMessageId: userMessage.id
                });
            }
        };

        const scrollChatToBottom = async () => {
            await nextTick();
            const container = chatContainer.value;
            if (!container) return;
            container.scrollTop = chatHistory.value.length > 1 ? container.scrollHeight : 0;
        };

        const clearChat = () => {
            confirmAction('确定要清空聊天记录吗？记忆也将一并清空，此操作无法撤销。', () => {
                abortUiTemplateUpdate();
                abortVectorBatchExtraction();
                abortClassicBatchExtraction();
                resetChatRenderWindow();
                chatHistory.value = [];
                if (currentCharacter.value && currentCharacter.value.first_mes) {
                    chatHistory.value.push({
                        role: 'assistant',
                        name: currentCharacter.value.name,
                        content: replaceCharacterCardMacros(currentCharacter.value.first_mes, currentCharacter.value)
                    });
                }
                memories.value = [];
                classicMemories.value = [];
                resetUiTemplateRuntimeState();
                saveData();
                showToast('聊天记录、记忆和变量记录已清空', 'success');
            });
        };

        const getNativeFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
        const requestNativeFullscreen = (element) => {
            if (element.requestFullscreen) return element.requestFullscreen();
            if (element.webkitRequestFullscreen) return element.webkitRequestFullscreen();
            return Promise.reject(new Error('Fullscreen is not supported'));
        };
        const exitNativeFullscreen = () => {
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            return Promise.resolve();
        };

        const toggleChatFullscreen = async () => {
            try {
                if (getNativeFullscreenElement()) {
                    isChatFullscreen.value = false;
                    await exitNativeFullscreen();
                    return;
                }
                const fullscreenTarget = document.documentElement || document.body;
                if (!fullscreenTarget || (!fullscreenTarget.requestFullscreen && !fullscreenTarget.webkitRequestFullscreen)) {
                    showToast('当前浏览器不支持全屏', 'warning');
                    return;
                }
                closeMobileMenu();
                isChatFullscreen.value = true;
                await requestNativeFullscreen(fullscreenTarget);
            } catch (err) {
                isChatFullscreen.value = !!getNativeFullscreenElement();
                console.error('Toggle fullscreen failed:', err);
                showToast('全屏失败', 'error');
            }
        };

        const syncChatFullscreenState = () => {
            isChatFullscreen.value = !!getNativeFullscreenElement();
        };

        const copyMessage = (content) => {
            navigator.clipboard.writeText(content).then(() => {
                showToast('已复制到剪贴板', 'success');
            }).catch(err => {
                console.error('Copy failed:', err);
                showToast('复制失败', 'error');
            });
        };

        const editMessage = (index) => {
            const msg = chatHistory.value[index];
            if (msg) {
                const messageEl = chatContainer.value?.querySelector(`[data-chat-index="${index}"] .message-content-wrapper`);
                const messageHeight = messageEl?.getBoundingClientRect?.().height || 0;
                msg.isEditing_Message = true;
                const cotMatch = msg.content.match(/<(think|cot)>[\s\S]*?(?:<\/\s*\1\s*>|<\s*\1\s*>|$)/i);
                msg.originalCot = cotMatch ? cotMatch[0] : '';
                msg.originalSys = parseCot(msg.content).sys;
                msg.editMessageContent = parseCot(msg.content).main;
                msg.editMessageHeight = Math.min(0.7 * window.innerHeight, Math.max(88, Math.round(messageHeight || 160)));
            }
        };

        const saveEditMessage = (index) => {
            const msg = chatHistory.value[index];
            if (msg) {
                let finalContent = msg.editMessageContent;
                if (msg.originalSys) {
                    finalContent = finalContent + '\n\n[系统指令:\n' + msg.originalSys + ']';
                }
                if (msg.originalCot) {
                    finalContent = msg.originalCot + '\n\n' + finalContent;
                }
                msg.content = finalContent;
                msg.isEditing_Message = false;
                delete msg.editMessageContent;
                delete msg.editMessageHeight;
                delete msg.originalCot;
                delete msg.originalSys;
                saveData();
                showToast('消息已保存', 'success');
            }
        };

        const cancelEditMessage = (index) => {
            const msg = chatHistory.value[index];
            if (msg) {
                msg.isEditing_Message = false;
                delete msg.editMessageContent;
                delete msg.editMessageHeight;
                delete msg.originalCot;
                delete msg.originalSys;
            }
        };

        const markUiTemplateStatus = (state, message, remaining = 0, targetMessageId = null) => {
            uiTemplateUpdateStatus.state = state;
            uiTemplateUpdateStatus.message = message;
            uiTemplateUpdateStatus.time = Date.now();
            uiTemplateUpdateStatus.remaining = remaining;
            uiTemplateUpdateStatus.targetMessageId = targetMessageId;
        };

        const failUiTemplateAnalysis = (message, targetMessageId = null) => {
            markUiTemplateStatus('error', message, 0, targetMessageId);
            showToast(message, 'error');
        };

        const startUiTemplateUpdateRun = () => {
            if (uiTemplateUpdateAbortController) {
                uiTemplateUpdateAbortController.abort();
            }
            uiTemplateUpdateAbortController = new AbortController();
            const seq = ++uiTemplateUpdateSeq;
            return { seq, signal: uiTemplateUpdateAbortController.signal };
        };

        const isUiTemplateUpdateRunCurrent = (seq, targetMessageId) => (
            seq === uiTemplateUpdateSeq
            && uiTemplateUpdateAbortController
            && !uiTemplateUpdateAbortController.signal.aborted
            && (!targetMessageId || chatHistory.value.some(msg => msg && msg.id === targetMessageId))
        );

        const abortUiTemplateUpdate = (targetMessageId = null) => {
            if (targetMessageId && uiTemplateUpdateStatus.targetMessageId && uiTemplateUpdateStatus.targetMessageId !== targetMessageId) return;
            if (uiTemplateUpdateAbortController) {
                uiTemplateUpdateAbortController.abort();
                uiTemplateUpdateAbortController = null;
            }
            uiTemplateUpdateSeq++;
            if (!targetMessageId || uiTemplateUpdateStatus.targetMessageId === targetMessageId) {
                markUiTemplateStatus('idle', '待命');
            }
        };

        const updateUiTemplatesFromChat = async ({ manual = false, targetMessageId = null } = {}) => {
            if (!settings.uiTemplateEnabled) {
                markUiTemplateStatus('skipped', '未开启');
                return false;
            }
            if (!currentCharacter.value) {
                markUiTemplateStatus('skipped', '未选择角色卡');
                return false;
            }
            const templates = activeUiTemplates.value;
            if (!templates.length) {
                markUiTemplateStatus('skipped', '无启用模板');
                return false;
            }
            if (buildConversationTurnSnapshot().turns.length < 1) {
                markUiTemplateStatus('skipped', '对话不足');
                return false;
            }

            const targetMessage = targetMessageId
                ? chatHistory.value.find(msg => msg && msg.role === 'assistant' && msg.id === targetMessageId)
                : getLastAssistantMessage();
            if (!targetMessage) {
                markUiTemplateStatus('skipped', '无AI回复');
                return false;
            }
            if (!targetMessage.id) targetMessage.id = generateUUID();
            const lockedTargetMessageId = targetMessage.id;
            const targetMessageIndex = chatHistory.value.findIndex(msg => msg === targetMessage || msg.id === lockedTargetMessageId);
            const contextMessages = targetMessageIndex >= 0 ? chatHistory.value.slice(0, targetMessageIndex + 1) : chatHistory.value;

            const uiTemplateAnalysisDepth = Number(settings.uiTemplateAnalysisDepth);
            const normalizedUiTemplateAnalysisDepth = Number.isFinite(uiTemplateAnalysisDepth)
                ? Math.max(4, Math.min(10, uiTemplateAnalysisDepth))
                : 4;
            const sourceMessages = getPostprocessedChatMessages(contextMessages, { includeSystem: false })
                .map(m => ({
                    role: m.role,
                    name: m.role === 'user' ? user.name : (m.name || currentCharacter.value.name),
                    content: parseCot(m.content || '').main
                }));
            const recentMessages = sourceMessages.slice(-normalizedUiTemplateAnalysisDepth);

            const fallbackModel = (settings.uiTemplateModel || '').trim();
            if (!fallbackModel) {
                markUiTemplateStatus('skipped', '未选模型');
                return false;
            }
            const url = getApiEndpoint('chat/completions');

            try {
                const updateRun = startUiTemplateUpdateRun();
                const isCurrentRun = () => isUiTemplateUpdateRunCurrent(updateRun.seq, lockedTargetMessageId);
                markUiTemplateStatus('running', '分析中', templates.length, lockedTargetMessageId);
                const turn = getAssistantTurnAtIndex(targetMessageIndex);
                let hasChanges = false;
                let changedFieldCount = 0;
                let changedTemplateCount = 0;
                let failedTemplateCount = 0;
                const failedTemplateIds = new Set();
                const pendingTemplateUpdates = [];

                const normalizeUiTemplateUpdates = (parsed) => {
                    if (Array.isArray(parsed)) {
                        return [{ variables: parsed, reason: '' }];
                    }
                    if (!parsed || typeof parsed !== 'object') return [];
                    const parsedKeys = Object.keys(parsed);
                    const looksLikeLegacyUpdates = Array.isArray(parsed.updates)
                        && (
                            parsed.updates.length === 0 && parsedKeys.every(key => ['updates', 'reason'].includes(key))
                            || parsed.updates.some(update => update && typeof update === 'object' && Object.prototype.hasOwnProperty.call(update, 'variables'))
                        );
                    if (looksLikeLegacyUpdates) {
                        return parsed.updates
                            .map(update => {
                                if (!update || typeof update !== 'object') return null;
                                if (Object.prototype.hasOwnProperty.call(update, 'variables')) return update;
                                return { variables: update, reason: '' };
                            })
                            .filter(Boolean);
                    }
                    const looksLikeLegacyVariables = Object.prototype.hasOwnProperty.call(parsed, 'variables')
                        && parsedKeys.every(key => ['id', 'variables', 'reason'].includes(key));
                    if (looksLikeLegacyVariables) {
                        return [{ variables: parsed.variables, reason: String(parsed.reason || '').trim() }];
                    }
                    return [{ variables: parsed, reason: '' }];
                };

                const applyTemplateUpdates = (template, updates, model) => {
                    updates.forEach(update => {
                        const result = applyUiTemplateUpdateListToTemplate(template, [update], { model, turn, matchName: false });
                        if (result.changed) {
                            changedTemplateCount += 1;
                            changedFieldCount += result.fieldCount;
                            hasChanges = true;
                        }
                    });
                };

                await Promise.all(templates.map(async (template) => {
                    const model = fallbackModel;
                    try {
                        const currentVariableJson = JSON.stringify(template.variableState || {}, null, 2);
                        const variableSchemaText = stringifyUiSchema(template.variableSchema).trim();
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${settings.apiKey}`
                            },
                            body: JSON.stringify({
                                model,
                                temperature: 1,
                                stream: false,
                                messages: [
                                    {
                                        role: 'system',
                                        content: [
                                            '你是chat-ai的UI变量更新器。当前请求只分析一个UI模板。',
                                            '只根据用户消息里提供的最近对话，更新下方模板已定义的变量。',
                                            '严格返回JSON，不要解释，不要输出Markdown。',
                                            '返回格式固定为 {"variables":{"变量路径":"新值"},"reason":"简短原因"}，例如 {"variables":{"a_line_1":"新台词","a_line_3":"新台词"},"reason":"对话内容更新了角色台词"}。',
                                            '变量值可以是文字、数字、对象或JSON数组；装备栏、背包、日志这类列表可直接返回完整数组字段，例如 {"equipment":[{"slot":"武器","name":"短剑"}]}。',
                                            '如果模板根变量本身就是数组，可以直接返回JSON数组；如果只改数组里的一个小项，也可以返回 {"equipment.0.name":"短剑"} 这种路径对象。',
                                            '没有变化则返回 {"variables":{},"reason":"无变化"}。不要返回模板id，不要套updates数组，不要修改HTML。',
                                            '',
                                            '用户信息如下（用于判断称呼、人称和用户相关变量；不要在JSON外复述）：',
                                            buildUserInfoPrompt(),
                                            '',
                                            '当前变量JSON如下：',
                                            currentVariableJson,
                                            variableSchemaText ? [
                                                '',
                                                '变量说明如下（给AI参考，必须按这里理解字段含义和生成规则）：',
                                                variableSchemaText
                                            ].join('\n') : ''
                                        ].join('\n')
                                    },
                                    {
                                        role: 'user',
                                        content: JSON.stringify({
                                            recentMessages
                                        }, null, 2)
                                    }
                                ]
                            }),
                            signal: updateRun.signal
                        });
                        if (!isCurrentRun()) return;
                        if (!response.ok) throw new Error(`API Error: ${response.status}`);
                        const data = await response.json();
                        if (!isCurrentRun()) return;
                        let content = data.choices?.[0]?.message?.content || '';
                        console.log(`[UI模板变量分析] ${template.name || template.id} 原始返回:`, content);
                        const parsed = parseUiTemplateUpdateJson(content);
                        const updates = normalizeUiTemplateUpdates(parsed);
                        recordApiUsage(getApiUsagePayload(data), {
                            type: 'ui_template',
                            model,
                            detail: template.name || ''
                        });
                        pendingTemplateUpdates.push({ template, updates, model });
                    } catch (e) {
                        if (updateRun.signal.aborted || !isCurrentRun()) return;
                        failedTemplateCount++;
                        failedTemplateIds.add(template.id);
                        console.warn(`[UI模板] ${template.name || template.id} 未成功:`, e.message);
                    } finally {
                        if (isCurrentRun()) {
                            uiTemplateUpdateStatus.remaining = Math.max(0, uiTemplateUpdateStatus.remaining - 1);
                        }
                    }
                }));

                if (!isCurrentRun()) {
                    if (uiTemplateUpdateSeq === updateRun.seq) {
                        uiTemplateUpdateAbortController = null;
                        markUiTemplateStatus('idle', '待命');
                    }
                    return false;
                }
                pendingTemplateUpdates.forEach(({ template, updates, model }) => {
                    applyTemplateUpdates(template, updates, model);
                });

                const inserted = attachUiTemplateBlocksToLastAssistant({ excludeTemplateIds: failedTemplateIds, targetMessageId: lockedTargetMessageId });

                if (hasChanges) {
                    saveGlobalUiTemplateRuntimeForCharacter();
                    saveData({ saveMemories: false });
                    await saveChatHistoryNow();
                } else if (inserted) {
                    await saveChatHistoryNow();
                }
                if (failedTemplateCount) {
                    failUiTemplateAnalysis(`${failedTemplateCount} 个失败`, lockedTargetMessageId);
                } else if (hasChanges) {
                    markUiTemplateStatus('success', `更新 ${changedFieldCount} 项`, 0, lockedTargetMessageId);
                } else {
                    markUiTemplateStatus('skipped', '无变化', 0, lockedTargetMessageId);
                }
                if (uiTemplateUpdateSeq === updateRun.seq) {
                    uiTemplateUpdateAbortController = null;
                }
                return failedTemplateCount < templates.length;
            } catch (e) {
                if (e?.name === 'AbortError') {
                    return false;
                }
                uiTemplateUpdateAbortController = null;
                console.warn('[UI模板] 未成功:', e.message);
                const failedCount = templates.length || 1;
                const message = `${failedCount} 个失败`;
                failUiTemplateAnalysis(message, lockedTargetMessageId);
                return false;
            }
        };



        const filterMemoriesAsync = async (keepMemory) => {
            const source = Array.isArray(memories.value) ? memories.value : [];
            const kept = [];
            let removed = 0;

            for (let i = 0; i < source.length; i++) {
                if (keepMemory(source[i], i)) {
                    kept.push(source[i]);
                } else {
                    removed++;
                }
                if (i > 0 && i % 512 === 0) await yieldToUi();
            }

            memories.value = kept;
            return removed;
        };

        const filterClassicMemoriesAsync = async (keepMemory) => {
            const source = Array.isArray(classicMemories.value) ? classicMemories.value : [];
            const kept = [];
            let removed = 0;
            for (let i = 0; i < source.length; i++) {
                if (keepMemory(source[i], i)) kept.push(source[i]);
                else removed++;
                if (i > 0 && i % 512 === 0) await yieldToUi();
            }
            classicMemories.value = kept;
            return removed;
        };

        const removeMemoriesForConversationTurn = async (snapshot, turn) => {
            if (!Number.isFinite(turn) || turn <= 0) return 0;
            const turnInfo = snapshot?.turns?.find(item => item.turn === turn);
            const assistantIds = new Set(getClassicTurnSourceIds(turnInfo, 'assistant'));
            const vectorRemoved = await filterMemoriesAsync(memory => Number(memory.turn) !== turn);
            const classicRemoved = await filterClassicMemoriesAsync(memory => {
                const memoryIds = memory.sourceAssistantIds || [];
                const matchesSource = memoryIds.some(id => assistantIds.has(id));
                return !matchesSource && Number(memory.turn) !== turn;
            });
            return vectorRemoved + classicRemoved;
        };

        const removeClassicMemoriesFromTurn = async (snapshot, firstRemovedTurn) => {
            const liveTurnsByAssistantId = new Map();
            (snapshot?.turns || []).forEach(turnInfo => {
                getClassicTurnSourceIds(turnInfo, 'assistant').forEach(id => {
                    liveTurnsByAssistantId.set(id, turnInfo.turn);
                });
            });
            return filterClassicMemoriesAsync(memory => {
                const liveTurn = (memory.sourceAssistantIds || [])
                    .map(id => liveTurnsByAssistantId.get(id))
                    .find(Number.isFinite);
                return (liveTurn || Number(memory.turn) || 0) < firstRemovedTurn;
            });
        };

        const deleteMessage = (index) => {
            confirmAction('确定要删除这条消息吗？该楼层的关联记忆也将一并删除。', async () => {
                const msg = chatHistory.value[index];
                abortUiTemplateUpdate();
                abortVectorBatchExtraction();
                abortClassicBatchExtraction();
                const snapshot = buildConversationTurnSnapshot();
                const affectedTurn = snapshot.turns.find(turnInfo =>
                    (turnInfo.sourceIndexes || []).includes(index)
                )?.turn || null;
                // Remove timing record if exists
                if (msg && msg.id) {
                    recentGenerationTimes.value = recentGenerationTimes.value.filter(t => (t.id || t) !== msg.id);
                }
                const uiCleanup = pruneUiTemplateChangesFromTurn(affectedTurn);
                // 只删除与该轮对话关联的两类记忆，而非全部清空。
                const removed = ['user', 'assistant'].includes(msg?.role)
                    ? await removeMemoriesForConversationTurn(snapshot, affectedTurn)
                    : 0;
                chatHistory.value.splice(index, 1);
                await saveConversationMutationNow({ saveTemplateRuntime: uiCleanup.logs > 0 || uiCleanup.blocks > 0 });
                const extras = [];
                if (removed > 0) extras.push(`${removed} 个关联分片`);
                if (uiCleanup.logs > 0 || uiCleanup.blocks > 0) extras.push('变量模板');
                showToast(extras.length ? `消息已删除，清除了 ${extras.join('、')}` : '消息已删除', 'success');
            });
        };

        const regenerateMessage = async (index) => {
            if (isGenerating.value) return;

            const startTime = Date.now(); // Record click time
            const startRegenerationStatus = () => {
                isGenerating.value = true;
                isReceiving.value = false;
                isThinking.value = false;
                currentWaitTime.value = '0.0';
            };

            const msg = chatHistory.value[index];
            const sourceUserMessage = (() => {
                for (let messageIndex = index; messageIndex >= 0; messageIndex -= 1) {
                    const message = chatHistory.value[messageIndex];
                    if (message?.role === 'user') return message;
                }
                return null;
            })();
            const explicitRequestMode = msg?.requestMode || sourceUserMessage?.requestMode;
            const requestMode = explicitRequestMode === 'image'
                || !!msg?.imageGeneration
                || (Array.isArray(msg?.generatedImages) && msg.generatedImages.length > 0)
                || (msg?.role === 'user' && index === chatHistory.value.length - 1
                    && !explicitRequestMode && generationMode.value === 'image')
                ? 'image'
                : 'chat';
            const regenerateFromSourceMessage = async () => {
                if (!sourceUserMessage) {
                    showToast('未找到需要重新生成的用户消息', 'error');
                    return;
                }
                if (requestMode === 'image') {
                    await generateImageResponse(startTime, sourceUserMessage);
                    return;
                }
                startRegenerationStatus();
                await generateResponse(startTime, {
                    reuseGeneratingState: true,
                    currentReferenceImages: Array.isArray(sourceUserMessage.attachments)
                        ? sourceUserMessage.attachments
                        : [],
                    currentUserMessageId: sourceUserMessage.id || null
                });
            };

            if (msg.role === 'user') {
                // 如果是用户消息，直接基于当前上下文生成（重试/继续）
                abortUiTemplateUpdate();
                abortVectorBatchExtraction();
                abortClassicBatchExtraction();
                // 只删除最新一轮的记忆，保留之前的
                const snapshot = buildConversationTurnSnapshot();
                const currentTurn = snapshot.turns.length;
                await filterMemoriesAsync(m => (m.turn || 0) < currentTurn);
                await removeClassicMemoriesFromTurn(snapshot, currentTurn);
                await Promise.all([saveMemoriesNow(), saveClassicMemoriesNow()]);
                await regenerateFromSourceMessage();
            } else {
                // 如果是 AI 消息，删除它（及之后）然后重新生成
                confirmAction('确定要重新生成这条消息吗？该楼层的记忆将被清除。', async () => {
                    abortUiTemplateUpdate();
                    abortVectorBatchExtraction();
                    abortClassicBatchExtraction();
                    // 计算被删除区间的 assistant 轮次，只删除 >= 该轮次的记忆
                    const snapshot = buildConversationTurnSnapshot();
                    const turnAtIndex = getConversationTurnAtIndexFromSnapshot(snapshot, index);
                    const uiTurnAtIndex = turnAtIndex;
                    await filterMemoriesAsync(m => (m.turn || 0) < turnAtIndex);
                    await removeClassicMemoriesFromTurn(snapshot, turnAtIndex);
                    const uiCleanup = pruneUiTemplateChangesFromTurn(uiTurnAtIndex);
                    // Remove timing record for the message being regenerated
                    if (msg && msg.id) {
                        recentGenerationTimes.value = recentGenerationTimes.value.filter(t => (t.id || t) !== msg.id);
                    }
                    chatHistory.value = chatHistory.value.slice(0, index);
                    await saveConversationMutationNow({ saveTemplateRuntime: uiCleanup.logs > 0 || uiCleanup.blocks > 0 });
                    await regenerateFromSourceMessage();
                });
            }
        };

        const printAIRequestLogs = (messages, modelName) => {
            console.group('%c🚀 AI 请求详情', 'color: #10b981; font-weight: bold; font-size: 14px;');
            console.log(`%c🤖 模型: %c${modelName}`, 'font-weight: bold;', 'color: #3b82f6;');

            console.log(`%c📦 发送消息列表 (${messages.length} 条):`, 'font-weight: bold;');

            // 单独展示系统提示词
            const sysMsg = messages.find(m => m.role === 'system');
            if (sysMsg) {
                console.groupCollapsed('%c🛠️ 查看系统提示词 (System Prompt)', 'color: #ef4444; font-weight: bold;');
                console.log(sysMsg.content);
                console.groupEnd();
            }

            console.groupCollapsed('%c📝 查看完整消息列表', 'color: #f59e0b; font-weight: bold;');
            console.table(messages.map(m => ({
                'Role': m.role,
                'Name': m.name || (m.role === 'system' ? 'System' : 'Unknown'),
                'Content': m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content
            })));
            // 打印完整内容以供复制
            console.log('完整消息对象:', messages);
            console.groupEnd();

            console.log('%c✅ 请求已发送，等待响应...', 'color: #10b981;');
            console.groupEnd();
        };

        const getEnabledActiveTools = () => normalizeActiveTools()
            .filter(tool => tool.enabled !== false && tool.callName)
            .filter(tool => memorySettings.mode === MEMORY_MODE_VECTOR || !isVectorActiveTool(tool));

        const isVectorActiveTool = (tool) => tool?.type === ACTIVE_TOOL_VECTOR_TYPE
            || normalizeActiveToolBaseCallName(tool?.callName) === 'tool_memory';

        const isKeywordActiveTool = (tool) => tool?.type === ACTIVE_TOOL_KEYWORD_TYPE
            || normalizeActiveToolBaseCallName(tool?.callName) === 'tool_grep';

        const isWebActiveTool = (tool) => tool?.type === ACTIVE_TOOL_WEB_TYPE
            || normalizeActiveToolBaseCallName(tool?.callName) === 'tool_web'
            || ['tool_web', 'tool_web_add', 'tool_web_cover'].includes(tool?.id)
            || /tavily|联网搜索/i.test(String(tool?.name || ''));

        const getActiveToolDisplayDescription = (tool) => tool?.displayDescription || '暂无说明';

        const shouldSuppressStandardVectorMemoryRecall = () => false;

        const appendActiveToolReminderToLatestUserMessage = (msgArray) => {
            if (getEnabledActiveTools().length === 0) return msgArray;
            const reminder = getActiveToolLatestUserReminder();
            const latestUserMessage = [...msgArray].reverse().find(message => {
                const content = String(message?.content || '');
                return message?.role === 'user'
                    && content.trim()
                    && !isRoleMemoryContextContent(content)
                    && !content.includes('<active_tool_results>');
            });
            if (!latestUserMessage) return msgArray;

            const currentContent = String(latestUserMessage.content || '').trimEnd();
            if (!currentContent.includes(reminder)) {
                latestUserMessage.content = currentContent
                    ? `${currentContent}\n${reminder}`
                    : reminder;
            }
            return msgArray;
        };

        const getActiveToolCallLabels = (tool) => {
            const baseCallName = normalizeActiveToolBaseCallName(tool?.callName || 'tool_memory');
            return {
                add: `${baseCallName}_add`,
                cover: `${baseCallName}_cover`
            };
        };

        const buildActiveToolSystemPrompt = () => {
            const tools = getEnabledActiveTools();
            if (tools.length === 0) return '';
            const activeToolReminder = getActiveToolLatestUserReminder();
            const activeToolAggressivenessLabel = getActiveToolAggressivenessLabel();
            const commonRules = [
                '调用格式：每次工具调用必须连续输出两行：第一行只写 <reason:简短调用理由>（不要写 </reason>），下一行输出工具标签；多个工具分别重复这两行。',
                '输出限制：每行只写一个工具标签，单次最多 5 个；工具阶段禁止写正文、COT；说明调用理由必须使用 <reason:...>，禁止用普通正文说明理由。',
                '模式选择：首次调用或需要保留旧结果时用该工具的 call_add；旧结果偏题、重复、噪声大、需要换方向或清理上下文时用 call_cover。',
                '查询规则：一个标签只查一个信息点，内容要具体；结果不足时换更具体的查询继续查，不要编造。',
                '结果使用：工具结果会插入后续上下文；继续回答时依据有效证据，不复述工具标签。'
            ];
            const formatToolOpenTag = ({ name, addCallName, coverCallName, callPlaceholder, returnLabel }) => [
                '<tool',
                `  name="${escapeXmlAttribute(name)}"`,
                `  call_add="<${addCallName}:${escapeXmlAttribute(callPlaceholder)}>"`,
                `  call_cover="<${coverCallName}:${escapeXmlAttribute(callPlaceholder)}>"`,
                `  returns="${escapeXmlAttribute(returnLabel)}"`,
                '>'
            ].join('\n');

            const toolLines = tools.map(tool => {
                const count = Number(tool.resultCount) || ACTIVE_TOOL_DEFAULT_RESULT_COUNT;
                const labels = getActiveToolCallLabels(tool);
                const addCallName = escapeXmlAttribute(labels.add);
                const coverCallName = escapeXmlAttribute(labels.cover);
                const keywordTool = isKeywordActiveTool(tool);
                const webTool = isWebActiveTool(tool);
                const callPlaceholder = webTool ? '联网搜索内容或网页链接' : (keywordTool ? '关键词' : '检索内容');
                const returnLabel = webTool ? `${count}条联网搜索结果，或网页正文` : (keywordTool ? `${count}条对话片段` : `${count}条向量记忆`);
                const descriptionFallback = webTool
                    ? '通过 Tavily 联网搜索外部网页资料，返回带来源链接的搜索结果；当调用内容是网页链接时，读取该网页正文。'
                    : keywordTool
                    ? '按关键词精确匹配当前对话历史，抓取包含关键词的原文片段。'
                    : '按调用内容检索长期向量记忆。';
                const toolRules = webTool ? [
                    `用途：查外部网页、最新信息、冷门资料或本地资料无法确认的内容。`,
                    `搜索：<${addCallName}:具体搜索词> 返回标题、链接和摘要；读取网页：<${addCallName}:https://...> 返回正文。不要编造链接，也不要自动读取全部链接。`
                ] : keywordTool ? [
                    `用途：精确查当前对话历史里的原文、名称、台词、物品、地点、设定词或前文细节。`,
                    `关键词尽量使用原文可能出现的词；同一信息点的同义词或别名可以放在同一次查询。`
                ] : [
                    `用途：检索长期记忆、旧剧情、历史设定、关系、人物状态、物品来历或用户暗指内容。`,
                    `检索词优先包含人物、事件、物品、地点、时间线和关键状态。`
                ];
                return [
                    formatToolOpenTag({ name: tool.name, addCallName, coverCallName, callPlaceholder, returnLabel }),
                    `说明：${tool.description || descriptionFallback}`,
                    ...toolRules,
                    `</tool>`
                ].join('\n');
            }).join('\n\n');
            return [
                '<active_tools>',
                '以下工具由正文标签触发，不是 function call。',
                `当前策略：${activeToolAggressivenessLabel}。${activeToolReminder}`,
                '<rules>',
                ...commonRules,
                '</rules>',
                toolLines,
                '</active_tools>'
            ].filter(Boolean).join('\n');
        };
