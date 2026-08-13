// 44-chat-generation.part.js：由 build-app.js 按 setup 依赖顺序组装。
// Refactored generation logic
        let _wasCancelled = false;
        const generateResponse = async (startTime = null, options = {}) => {
            const reuseGeneratingState = options.reuseGeneratingState === true;
            if (isGenerating.value && !reuseGeneratingState) return;
            const activeToolDepth = Number(options.activeToolDepth) || 0;
            const continueAssistantMessageId = options.continueAssistantMessageId || null;
            const continuationToolCallId = options.continuationToolCallId || null;
            const currentReferenceImages = Array.isArray(options.currentReferenceImages)
                ? options.currentReferenceImages.filter(image => image?.dataUrl)
                : [];
            const currentUserMessageId = options.currentUserMessageId || null;
            const requestModel = settings.model;

            if (!currentCharacter.value) {
                showToast('请先选择一个角色', 'error');
                return;
            }

            const continuationTargetMessage = continueAssistantMessageId
                ? chatHistory.value.find(msg => msg && msg.role === 'assistant' && msg.id === continueAssistantMessageId) || null
                : null;
            if (!continuationTargetMessage && activeToolDepth === 0) {
                resetActiveToolResultContext();
            }

            isGenerating.value = true;
            // 工具续写时内容会回填到旧气泡里，这里先占住“已在接收”的状态，
            // 避免底部全局 typing 占位气泡冒出来。
            isReceiving.value = !!continuationTargetMessage;
            isThinking.value = false;
            activeToolContinuationMessageId.value = continuationTargetMessage?.id || null;
            activeToolContinuationToolCallId.value = continuationTargetMessage ? continuationToolCallId : null;
            activeToolContinuationHasResponse.value = false;
            abortController.value = new AbortController();
            let generationStartTime = startTime || Date.now();

            // Start Timer
            const startTimer = () => {
                if (waitTimer) clearInterval(waitTimer);
                currentWaitTime.value = '0.0';
                waitTimer = setInterval(() => {
                    const now = Date.now();
                    currentWaitTime.value = ((now - generationStartTime) / 1000).toFixed(1);
                }, 100);
            };
            startTimer(); // Start timer immediately upon request initiation


            // --- Advanced World Info Processing ---

            const evaluatedProbability = new Map(); // Store rolled probabilities to prevent re-rolls

            const toNonNegativeNumber = (value, fallback = 0) => {
                const number = Number(value);
                return Number.isFinite(number) ? Math.max(0, number) : fallback;
            };

            const createWorldInfoRegex = (pattern) => {
                let source = String(pattern || '');
                let flags = 'i';
                if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
                    const lastSlash = source.lastIndexOf('/');
                    const potentialFlags = source.slice(lastSlash + 1);
                    if (/^[dgimsuvy]*$/.test(potentialFlags)) {
                        source = source.slice(1, lastSlash);
                        flags = potentialFlags;
                    }
                }
                flags = flags.replace(/g/g, '');
                if (!flags.includes('i')) flags += 'i';
                if (/\\[pP]\{/.test(source) && !flags.includes('u')) flags += 'u';
                return new RegExp(source, flags);
            };

            const worldInfoKeyMatchesText = (entry, key, text) => {
                const rawKey = String(key || '').trim();
                const rawText = String(text || '');
                if (!rawKey || !rawText) return false;

                if (entry.useRegex) {
                    try {
                        return createWorldInfoRegex(rawKey).test(rawText);
                    } catch (e) {
                        console.warn(`Invalid world info regex: ${rawKey}`);
                        return false;
                    }
                }

                return rawText.toLowerCase().includes(rawKey.toLowerCase());
            };

            const passesWorldInfoProbability = (entry) => {
                const probability = Math.min(100, toNonNegativeNumber(entry.probability, 100));
                if (entry.useProbability !== false && probability < 100) {
                    if (!evaluatedProbability.has(entry)) {
                        evaluatedProbability.set(entry, probability > 0 && (Math.random() * 100) < probability);
                    }
                    return !!evaluatedProbability.get(entry);
                }
                return true;
            };

            // Helper function to check a single entry against a text block
            const checkEntryTrigger = (entry, text) => {
                // Probability Check (do this early, rolled once per entry per generation)
                if (!passesWorldInfoProbability(entry)) return { triggered: false };

                let primaryMatches = 0;
                let matchedKeys = [];

                const checkKeys = (keys) => {
                    let matchCount = 0;
                    if (!keys || keys.length === 0 || keys.every(k => !k)) return 0;

                    keys.forEach(key => {
                        const rawKey = String(key || '').trim();
                        if (!rawKey) return;
                        if (worldInfoKeyMatchesText(entry, rawKey, text)) {
                            matchCount++;
                            if (!matchedKeys.includes(rawKey)) matchedKeys.push(rawKey);
                        }
                    });
                    return matchCount;
                };

                primaryMatches = checkKeys(entry.keys);
                if (primaryMatches === 0) return { triggered: false };

                return { triggered: true, score: primaryMatches, matchedKeys };
            };

            // 精简模式关闭预设管理，但角色卡自带的 character_book 仍按原生规则参与触发。
            let triggeredEntries = new Map(); // Use Map to store entries and their scores
            const activeWorldInfoSource = SIMPLE_CHAT_AI_MODE
                ? (currentCharacter.value?.worldInfo || [])
                : worldInfo.value;
            const activeWorldInfo = activeWorldInfoSource.filter(e => e.enabled !== false);
            const postprocessedChatHistory = getPostprocessedChatMessages(chatHistory.value, { includeSystem: false });

            // 1. Initial Scan (Chat History)
            activeWorldInfo.forEach(entry => {
                if (entry.constant) {
                    triggeredEntries.set(entry, { score: Infinity, matchedKeys: ['常驻 (Constant)'] }); // Constants get highest score
                    return;
                }

                const rawScanDepth = toNonNegativeNumber(entry.scanDepth ?? worldInfoSettings.scanDepth, 0);
                const maxScanDepth = toNonNegativeNumber(worldInfoSettings.maxDepth, 0);
                const entryScanDepth = maxScanDepth > 0 ? Math.min(rawScanDepth, maxScanDepth) : rawScanDepth;
                if (entryScanDepth === 0 || !entry.keys || entry.keys.length === 0) return;

                const scanText = postprocessedChatHistory.slice(-entryScanDepth).map(m => m.content).join('\n');

                if (entry.keys && entry.keys.length > 0) {
                    const result = checkEntryTrigger(entry, scanText);
                    if (result.triggered) {
                        triggeredEntries.set(entry, { score: result.score, matchedKeys: result.matchedKeys });
                    }
                }
            });
            let finalEntries = Array.from(triggeredEntries.keys());

            // Sort by constant, then order
            finalEntries.sort((a, b) => {
                if (a.constant && !b.constant) return -1;
                if (!a.constant && b.constant) return 1;
                // Sort descending by order for budget priority (higher order = more important/inserted later = kept if budget tight?)
                // Docs: "Then entries with higher order numbers." implying they are prioritized after constants.
                return (b.order || 0) - (a.order || 0);
            });

            const budgetedEntries = finalEntries;

            // --- Output Trigger Log ---
            console.groupCollapsed('📚 World Info Trigger Log');
            if (budgetedEntries.length === 0) {
                console.log('No World Info entries triggered for this request.');
            } else {
                budgetedEntries.forEach(entry => {
                    const data = triggeredEntries.get(entry);
                    const keysStr = data && data.matchedKeys ? data.matchedKeys.join(', ') : 'Unknown';
                    console.log(`[${entry.comment || 'Unnamed'}] (Pos: ${entry.position || 'at_depth'}, Order: ${entry.order || 0})`);
                    console.log(`  ↪ Matched Keys: ${keysStr}`);
                    console.log(`  ↪ Content Preview: ${(entry.content || '').substring(0, 50).replace(/\n/g, ' ')}...`);
                });
            }
            console.groupEnd();

            // 5. Group by Position
            const wiGroups = {
                system_top: [], global_note: [], before_char: [], after_char: [],
                user_top: [], assistant_top: [], at_depth: []
            };

            budgetedEntries.forEach(entry => {
                const pos = entry.position || 'at_depth';
                if (wiGroups.hasOwnProperty(pos)) {
                    wiGroups[pos].push(entry);
                } else {
                    wiGroups.at_depth.push(entry);
                }
            });

            // Fix: Sort entries within each group by Order (Ascending)
            Object.keys(wiGroups).forEach(key => {
                wiGroups[key].sort((a, b) => (a.order || 0) - (b.order || 0));
            });

            // Construct Prompt Parts
            const enabledPresets = SIMPLE_CHAT_AI_MODE
                ? []
                : presets.value
                    .map(normalizePreset)
                    .filter(p => p.enabled && p.content.trim());
            const systemPresets = enabledPresets.filter(p => p.role === 'system');
            const messagePresets = enabledPresets.filter(p => p.role === 'user' || p.role === 'assistant');
            const systemPresetPrompt = systemPresets
                .filter(p => p.name === '破限')
                .map(p => p.content)
                .join('\n\n');
            const otherPresets = systemPresets.filter(p => p.name !== '破限');

            // 无论是否为精简界面，都使用当前选中的角色卡生成角色上下文。
            const charPrompt = getCurrentCharacterPrompt();
            const mesExample = replaceCharacterCardMacros(currentCharacter.value?.mes_example || '');

            let userPrompt = SIMPLE_CHAT_AI_MODE ? '' : buildUserInfoPrompt();

            // Helper to join content with comments
            const joinContent = (entries) => entries
                .map(e => `[${e.comment || 'Entry'}]\n${replaceCharacterCardMacros(e.content)}`)
                .join('\n\n');
            const getWorldInfoDisplayName = (entry) => entry.comment || entry.name || '未命名条目';

            // Build System Prompt
            let systemPromptParts = [];
            let characterPreludePrompt = '';

            if (SIMPLE_CHAT_AI_MODE) {
                // 精简模式只关闭预设和高级界面，角色卡本身仍作为原生系统提示词生效。
                if (wiGroups.system_top.length > 0) systemPromptParts.push(joinContent(wiGroups.system_top));
                if (wiGroups.global_note.length > 0) systemPromptParts.push(joinContent(wiGroups.global_note));
                if (wiGroups.before_char.length > 0) systemPromptParts.push(joinContent(wiGroups.before_char));
                if (charPrompt) systemPromptParts.push(charPrompt);
                if (wiGroups.after_char.length > 0) systemPromptParts.push(joinContent(wiGroups.after_char));
            } else {
                // 1. Presets (只有设定环境的破限预设保留在 system 中)
                if (systemPresetPrompt) systemPromptParts.push(systemPresetPrompt);

                // 2. System Top WI
                if (wiGroups.system_top.length > 0) systemPromptParts.push(joinContent(wiGroups.system_top));

                // 3. Global Notes
                if (wiGroups.global_note.length > 0) systemPromptParts.push(joinContent(wiGroups.global_note));

                // 4. Other Presets (辅助约束 - 提前于角色设定)
                if (otherPresets.length > 0) {
                    systemPromptParts.push(`[System Presets]\n${otherPresets.map(p => p.content).join('\n\n---\n\n')}`);
                }

                systemPromptParts.push(`[Style Priority]\n开场白和历史消息只用于理解剧情事实、人物关系和场景状态，不作为文风模板；不要继承或模仿开场白、前文回复的句式、语气密度、段落节奏或排版习惯。最终回复的文风必须优先遵守上方系统预设中的规定文风。`);

                // 5. Character pre-dialogue context (user side)
                const characterPreludeParts = [];
                if (wiGroups.before_char.length > 0) {
                    characterPreludeParts.push(joinContent(wiGroups.before_char));
                }
                let charDefinitionParts = [`[Character]`, charPrompt];
                if (mesExample && mesExample.trim()) {
                    charDefinitionParts.push(mesExample);
                }
                characterPreludeParts.push(charDefinitionParts.join('\n\n'));
                if (wiGroups.after_char.length > 0) {
                    characterPreludeParts.push(joinContent(wiGroups.after_char));
                }
                characterPreludePrompt = characterPreludeParts.join('\n\n');

                // 6. User Info (Moved to end)
                systemPromptParts.push(userPrompt);

                const activeToolPrompt = buildActiveToolSystemPrompt();
                if (activeToolPrompt) systemPromptParts.push(activeToolPrompt);

                const uiTemplateContextPrompt = buildUiTemplateContextSystemPrompt();
                if (uiTemplateContextPrompt) systemPromptParts.push(uiTemplateContextPrompt);
            }

            if (SIMPLE_CHAT_AI_MODE && mesExample.trim()) {
                characterPreludePrompt = `[Character Examples]\n${mesExample}`;
            }

            // 历史后指令在所有历史和角色书注入完成后追加，保持角色卡字段的原生语义。
            const postHistoryInstructions = replaceCharacterCardMacros(currentCharacter.value?.post_history_instructions || '');

            const systemPrompt = systemPromptParts.join('\n\n');
            const systemWorldInfo = [
                ...wiGroups.system_top,
                ...wiGroups.global_note
            ];

            // Base Messages
            let messages = [
                {
                    role: 'system',
                    content: systemPrompt,
                    _worldInfoEntries: systemWorldInfo
                }
            ];

            let safeTargetLimit = 1;
            messagePresets.forEach(preset => {
                messages.push({
                    role: preset.role,
                    content: preset.content
                });
            });
            safeTargetLimit += messagePresets.length;

            if (characterPreludePrompt) {
                messages.push({
                    role: 'user',
                    content: characterPreludePrompt,
                    _worldInfoEntries: [
                        ...wiGroups.before_char,
                        ...wiGroups.after_char
                    ]
                });
                safeTargetLimit += 1;
            }

            // 确保开场白存在 (Double check for First Message)
            // 如果聊天记录为空，或者第一条不是开场白，且角色有开场白，则手动添加
            // 注意：通常 chatHistory 会包含开场白，这里是为了响应用户反馈的强制保险
            const hasFirstMesInHistory = chatHistory.value.length > 0 &&
                chatHistory.value[0].role === 'assistant' &&
                chatHistory.value[0].content === currentCharacter.value.first_mes;

            // 如果当前历史记录的第一条是“总结”消息，则认为开场白已被总结包含，不再强制补录开场白
            if (!hasFirstMesInHistory && currentCharacter.value.first_mes) {
                messages.push({
                    role: 'assistant',
                    name: currentCharacter.value.name,
                    content: currentCharacter.value.first_mes
                });
            }

            // 记忆压缩：向量模式移除已覆盖的旧轮次；总结模式只替换旧轮次的 AI 消息。
            let chatHistoryForContext = postprocessedChatHistory.map((message, index) => ({
                ...message,
                _contextFloor: index + 1
            }));

            if (!SIMPLE_CHAT_AI_MODE
                && memorySettings.enabled
                && memorySettings.mode === MEMORY_MODE_VECTOR
                && memories.value.length > 0) {
                const totalFloors = chatHistoryForContext.length;
                const keepCount = memorySettings.vectorKeepFloors;

                if (totalFloors > keepCount) {
                    const candidateCount = totalFloors - keepCount;

                    const memoryTurnSet = new Set(
                        memories.value
                            .filter(isEnabledVectorMemory)
                            .map(memory => memory.turn || 0)
                            .filter(turn => turn > 0)
                    );
                    const emptyLog = memorySettings.emptyTurns?.[
                        getMemoryEmptyTurnsKey(getActiveConversationMemoryScopeId())
                    ] || [];
                    const emptyTurnSet = new Set(emptyLog);

                    const removableIndices = new Set();
                    const contextSnapshot = buildConversationTurnSnapshot(chatHistoryForContext, { alreadyPostprocessed: true });

                    contextSnapshot.turns.forEach(turnInfo => {
                        if (!turnInfo.messageIndexes.every(messageIndex => messageIndex < candidateCount)) return;
                        const hasMemory = memoryTurnSet.has(turnInfo.turn);
                        const isEmpty = emptyTurnSet.has(turnInfo.turn);

                        if (hasMemory || isEmpty) {
                            turnInfo.messageIndexes.forEach(messageIndex => removableIndices.add(messageIndex));
                        }
                    });

                    if (removableIndices.size > 0) {
                        const newChatHistoryForContext = [];

                        for (let idx = 0; idx < chatHistoryForContext.length; idx++) {
                            if (!removableIndices.has(idx)) {
                                newChatHistoryForContext.push(chatHistoryForContext[idx]);
                            }
                        }
                        chatHistoryForContext = newChatHistoryForContext;
                    }
                }
            } else if (!SIMPLE_CHAT_AI_MODE
                && memorySettings.enabled
                && memorySettings.mode === MEMORY_MODE_CLASSIC
                && classicMemories.value.length > 0) {
                const candidateCount = Math.max(0, chatHistoryForContext.length - memorySettings.summaryKeepFloors);
                if (candidateCount > 0) {
                    const lookup = buildClassicMemoryLookup();
                    const contextSnapshot = buildConversationTurnSnapshot(chatHistoryForContext, { alreadyPostprocessed: true });
                    contextSnapshot.turns.forEach(turnInfo => {
                        const assistantIndex = turnInfo.messageIndexes[1];
                        if (assistantIndex >= candidateCount) return;
                        const memory = findClassicMemoryForTurn(turnInfo, lookup);
                        if (!memory?.summary) return;
                        chatHistoryForContext[assistantIndex] = {
                            ...chatHistoryForContext[assistantIndex],
                            content: memory.summary,
                            _sourceIndexes: []
                        };
                    });
                }
            }

            // 添加聊天记录
            messages = messages.concat(chatHistoryForContext
                .map((m, index) => {
                    const sourceIndexes = Array.isArray(m._sourceIndexes) ? m._sourceIndexes : [];
                    const sourceMessages = sourceIndexes.length > 0
                        ? sourceIndexes.map(sourceIndex => chatHistory.value[sourceIndex]).filter(source => source && source.role === m.role)
                        : [m];
                    const cleanSourceContent = (source) => {
                        // Remove CoT content from history messages before sending to AI.
                        const parsedData = parseCot(source.content || '');
                        let content = stripUiTemplateUpdateBlock(stripDisabledImageGenContext(stripUiTemplateContextInjection(parsedData.main)));
                        const cleanSys = stripDisabledImageGenContext(parsedData.sys || '');
                        if (cleanSys && source.role === 'user') {
                            content += '\n\n[系统指令: ' + cleanSys + ']';
                        }
                        return [content.trim(), getMessageImageSummary(source)].filter(Boolean).join('\n\n');
                    };
            let cleanContent = sourceMessages
                .map(cleanSourceContent)
                .filter(Boolean)
                .join('\n\n');

                    return {
                        role: m.role === 'user' ? 'user' : 'assistant',
                        name: m.name || (m.role === 'user' ? user.name : currentCharacter.value.name),
                        content: cleanContent,
                        _sourceIndexes: sourceIndexes,
                        _contextFloor: m._contextFloor
                    };
                })
                .filter(m => String(m.content || '').trim())
            );

            let selectedVectorMemories = [];
            if (!SIMPLE_CHAT_AI_MODE
                && memorySettings.enabled
                && memorySettings.mode === MEMORY_MODE_VECTOR
                && memories.value.length > 0
                && !shouldSuppressStandardVectorMemoryRecall()) {
                selectedVectorMemories = await selectVectorMemoriesForContext(abortController.value.signal, {
                    excludedTurns: getRetainedRecentMemoryTurns(postprocessedChatHistory)
                });
            }

            // Handle @D (At Depth) and other message-level injections
            const processMessageInjections = (msgArray) => {
                let finalMessages = [...msgArray];
                const insertUserMessageAtDepth = (content, depth = 1, extra = {}) => {
                    const normalizedContent = String(content || '').trim();
                    if (!normalizedContent) return;

                    const reversedMessages = [...finalMessages].reverse();
                    let countdown = Number.isFinite(Number(depth)) ? Number(depth) : 1;
                    let targetIndex = -1;
                    for (let i = 0; i < reversedMessages.length; i++) {
                        if (reversedMessages[i].role === 'user' || reversedMessages[i].role === 'assistant') {
                            countdown--;
                        }
                        if (countdown < 0) {
                            targetIndex = reversedMessages.length - 1 - i;
                            break;
                        }
                    }
                    if (targetIndex < safeTargetLimit) targetIndex = safeTargetLimit;

                    finalMessages.splice(targetIndex, 0, {
                        role: 'user',
                        content: normalizedContent,
                        ...extra
                    });
                };

                // At Depth
                if (wiGroups.at_depth.length > 0) {
                    wiGroups.at_depth.sort((a, b) => (a.order || 0) - (b.order || 0));
                    const reversedHistory = [...finalMessages].reverse();

                    wiGroups.at_depth.forEach(entry => {
                        const depth = entry.depth !== undefined ? entry.depth : 4;
                        const content = `[${entry.comment || 'Entry'}]\n${entry.content}`;

                        // Find the correct insertion point from the end of the array
                        let countdown = depth;
                        let targetIndex = -1;
                        for (let i = 0; i < reversedHistory.length; i++) {
                            // We only count user/assistant pairs as "turns" for depth
                            if (reversedHistory[i].role === 'user' || reversedHistory[i].role === 'assistant') {
                                countdown--;
                            }
                            if (countdown < 0) {
                                targetIndex = reversedHistory.length - 1 - i;
                                break;
                            }
                        }
                        // 如果 depth 超出历史记录长度，或计算出的 targetIndex 会破坏破限多轮对话的顺序，则进行保护
                        if (targetIndex < safeTargetLimit) targetIndex = safeTargetLimit;

                        finalMessages.splice(targetIndex, 0, {
                            role: 'user',
                            content,
                            _worldInfoEntries: [entry]
                        });
                    });
                }

                // Memory Injection (at_depth style, grouped by turn)
                if (memorySettings.enabled
                    && memorySettings.mode === MEMORY_MODE_VECTOR
                    && selectedVectorMemories.length > 0) {
                    const enabledMemories = mergeRepeatedTurnVectorMemories(selectedVectorMemories);

                    if (enabledMemories.length > 0) {
                        const formatMemoryLine = (m) => {
                            const turnValue = escapeXmlAttribute(m.turn || '?');
                            const scoreValue = escapeXmlAttribute(Number.isFinite(m.vectorScore)
                                ? `${(m.vectorScore * 100).toFixed(1)}%`
                                : 'unknown');
                            const fragmentText = indentXmlText(m.paragraph || m.summary || '', 4);
                            const fragmentTag = `<memory_fragment turn="${turnValue}" similarity="${scoreValue}">`;
                            return [
                                `  ${fragmentTag}`,
                                fragmentText,
                                `  </memory_fragment>`
                            ].join('\n');
                        };

                        const formattedContent = enabledMemories.map(formatMemoryLine).join('\n\n');
                        const fullContent = [
                            ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG,
                            '  <description>',
                            '    以下内容是从往期对话记录中按当前输入检索出的相关记忆分片，并非全部历史。',
                            '    请尽力理解这些分片之间的前因后果、人物关系和情绪延续，理清它们与当前对话的关联。',
                            '    这些分片已按原对话时间顺序排列；它们不一定是今天或刚才发生的内容，请不要误当作当前现场，只把它们作为过往经历和关系背景参考。',
                            '  </description>',
                            formattedContent,
                            ROLE_MEMORY_VECTOR_RECALL_CLOSE_TAG
                        ].join('\n');

                        const memoryDepth = Number(memorySettings.defaultDepth) || MEMORY_VECTOR_DEFAULT_DEPTH;

                        const reversedForMemory = [...finalMessages].reverse();
                        let countdown = memoryDepth;
                        let targetIndex = -1;
                        for (let i = 0; i < reversedForMemory.length; i++) {
                            if (reversedForMemory[i].role === 'user' || reversedForMemory[i].role === 'assistant') {
                                countdown--;
                            }
                            if (countdown < 0) {
                                targetIndex = reversedForMemory.length - 1 - i;
                                break;
                            }
                        }
                        if (targetIndex < safeTargetLimit) targetIndex = safeTargetLimit;

                        finalMessages.splice(targetIndex, 0, {
                            role: 'user',
                            content: fullContent
                        });
                    }
                }

                const mainModelUiTemplatePrompt = buildMainModelUiTemplateUpdatePrompt();
                if (mainModelUiTemplatePrompt) {
                    insertUserMessageAtDepth(mainModelUiTemplatePrompt, 1);
                }

                // User Top
                if (wiGroups.user_top.length > 0) {
                    const content = joinContent(wiGroups.user_top);
                    const lastUserMessage = finalMessages.slice().reverse().find(m => m.role === 'user');
                    if (lastUserMessage) {
                        lastUserMessage.content = `${content}\n\n${lastUserMessage.content}`;
                        lastUserMessage._worldInfoEntries = [
                            ...(lastUserMessage._worldInfoEntries || []),
                            ...wiGroups.user_top
                        ];
                    }
                }

                // Assistant Top
                if (wiGroups.assistant_top.length > 0) {
                    const content = joinContent(wiGroups.assistant_top);
                    // This should be injected into the *next* assistant message,
                    // so we add it as a system message right before the end.
                    finalMessages.push({
                        role: 'system',
                        content: `[Instructions for next message]\n${content}`,
                        _worldInfoEntries: wiGroups.assistant_top
                    });
                }

                return finalMessages;
            };

            // 角色书的所有插入位置在精简模式下仍然有效，但预设和高级工具注入继续关闭。
            messages = processMessageInjections(messages);
            if (!SIMPLE_CHAT_AI_MODE) {
                messages = appendActiveToolReminderToLatestUserMessage(messages);
                const activeToolContextPayload = pendingActiveToolContext.value || (activeToolDepth > 0 ? buildActiveToolResultPayload() : '');
                if (activeToolContextPayload) {
                    messages.push({
                        role: 'user',
                        content: activeToolContextPayload
                    });
                    pendingActiveToolContext.value = '';
                }
            } else {
                pendingActiveToolContext.value = '';
            }
            if (postHistoryInstructions.trim()) {
                messages.push({
                    role: 'system',
                    content: postHistoryInstructions
                });
            }
            messages = postprocessContextMessages(messages).map((message, index, array) => ({
                ...message,
                content: processRegex(message.content || '', {
                    isPrompt: true,
                    role: message.role,
                    depth: array.length - 1 - index
                })
            }));

            // Escape HTML helper
            const escapeHtml = (unsafe) => {
                if (!unsafe) return '';
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            };

            // Pre-calculate trigger keyword floors (only within actual scan depth range)
            const floorInfo = new Map();
            const scanDepthForDisplay = toNonNegativeNumber(worldInfoSettings.scanDepth, 2);
            const maxScanDepthForDisplay = toNonNegativeNumber(worldInfoSettings.maxDepth, 0);

            triggeredEntries.forEach((data, entry) => {
                if (!data.matchedKeys) return;
                const rawEntryScanDepth = toNonNegativeNumber(entry.scanDepth ?? scanDepthForDisplay, 0);
                const entryScanDepth = maxScanDepthForDisplay > 0 ? Math.min(rawEntryScanDepth, maxScanDepthForDisplay) : rawEntryScanDepth;
                const entryStart = Math.max(0, postprocessedChatHistory.length - entryScanDepth);

                data.matchedKeys.forEach(k => {
                    if (k === '常驻 (Constant)') return;

                    for (let i = entryStart; i < postprocessedChatHistory.length; i++) {
                        const text = postprocessedChatHistory[i].content;
                        if (worldInfoKeyMatchesText(entry, k, text)) {
                            if (!floorInfo.has(k)) floorInfo.set(k, new Set());
                            floorInfo.get(k).add(i + 1);
                        }
                    }
                });
            });

            const getWorldInfoTriggerText = (entry) => {
                const entryData = triggeredEntries.get(entry);
                if (!entryData || !entryData.matchedKeys) return '关联触发';

                return entryData.matchedKeys.map(k => {
                    if (k === '常驻 (Constant)') return '常驻';
                    const floors = floorInfo.get(k);
                    if (floors && floors.size > 0) {
                        return `${k} (${Array.from(floors).map(f => 'F' + f).join(', ')})`;
                    }
                    return k;
                }).join(', ');
            };

            // Compute message-level World Info injections for Context Viewer
            let globalInjectedWIs = budgetedEntries.map(entry => ({
                name: getWorldInfoDisplayName(entry),
                triggers: getWorldInfoTriggerText(entry)
            }));
            lastContextMessages.value = messages.map(m => {
                let injectedWIsMap = new Map();

                (Array.isArray(m._worldInfoEntries) ? m._worldInfoEntries : []).forEach(entry => {
                    if (!entry) return;
                    injectedWIsMap.set(getWorldInfoDisplayName(entry), getWorldInfoTriggerText(entry));
                });

                const isMemoryMessage = m.role !== 'system' && isRoleMemoryContextContent(m.content);

                // Detect Memory injections in this message
                if (isMemoryMessage) {
                    const memoryContent = String(m.content || '');
                    const memoryFragmentTagCount = (memoryContent.match(/<memory_fragment\b/gi) || []).length;
                    const standardMemoryFragmentCloseCount = (memoryContent.match(/<\/memory_fragment>/gi) || []).length;
                    const legacyVectorMemoryTags = memoryContent
                        .split('\n')
                        .filter(l => /^<第\s*.+?次对话_相似度\s+.+>$/.test(l.trim()));
                    const vectorMemoryFragmentCount = memoryFragmentTagCount > 0
                        ? Math.max(1, standardMemoryFragmentCloseCount > 0 ? memoryFragmentTagCount : Math.ceil(memoryFragmentTagCount / 2))
                        : legacyVectorMemoryTags.length;
                    const isVectorMemoryMessage = isVectorMemoryRecallContent(memoryContent);
                    const memoryDisplayName = isVectorMemoryMessage ? '角色记忆（向量召回）' : '角色记忆';
                    const memoryTriggerText = isVectorMemoryMessage
                        ? `已注入 ${vectorMemoryFragmentCount} 个向量分片`
                        : '已注入';
                    injectedWIsMap.set(memoryDisplayName, memoryTriggerText);
                    if (!globalInjectedWIs.some(i => i.name === memoryDisplayName)) {
                        globalInjectedWIs.push({ name: memoryDisplayName, triggers: memoryTriggerText });
                    }
                }

                let renderedContent = escapeHtml(m.content);
                // Sort keys by length descending to match longer phrases first
                const sortedKeys = Array.from(floorInfo.keys()).sort((a, b) => b.length - a.length);
                sortedKeys.forEach(k => {
                    if (k.length < 1) return;
                    const escapedK = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    // Avoid replacing inside html tags like <mark class="...">
                    const safeRegex = new RegExp(`(${escapedK})(?![^<]*>)`, 'gi');
                    renderedContent = renderedContent.replace(safeRegex, '<mark class="bg-yellow-200/80 text-yellow-900 border-b border-yellow-400 font-bold px-0.5 mx-px rounded shadow-sm">$1</mark>');
                });

                // Highlight memory content with purple
                if (isMemoryMessage) {
                    renderedContent = renderedContent.replace(
                        /&lt;\/?(?:role_memory_vector_recall|memory_fragment)\b[\s\S]*?&gt;/g,
                        '<mark class="bg-purple-200/80 text-purple-900 border-b border-purple-400 font-bold px-1 rounded shadow-sm">$&</mark>'
                    );
                    renderedContent = renderedContent.replace(
                        /\[角色记忆[^\]]*\]/g,
                        '<mark class="bg-purple-200/80 text-purple-900 border-b border-purple-400 font-bold px-1 rounded shadow-sm">$&</mark>'
                    );
                    renderedContent = renderedContent.replace(
                        /\[——[^—]*——\]/g,
                        '<mark class="bg-purple-100/80 text-purple-700 font-semibold px-0.5 rounded">$&</mark>'
                    );
                    renderedContent = renderedContent.replace(
                        /\[向量召回[^\]]*\]/g,
                        '<mark class="bg-teal-100/90 text-teal-800 border-b border-teal-300 font-semibold px-0.5 rounded">$&</mark>'
                    );
                }

                return {
                    role: m.role,
                    name: m.name,
                    content: m.content,
                    renderedContent: renderedContent,
                    floor: Number.isFinite(m._contextFloor) ? m._contextFloor : null,
                    isMemory: isMemoryMessage,
                    wiTriggers: Array.from(injectedWIsMap.entries()).map(([name, triggers]) => ({
                        name,
                        triggers
                    }))
                };
            });
            // Store overall triggered entries based on actual injection order in the prompt
            lastTriggeredWorldInfos.value = globalInjectedWIs;

            const apiMessages = messages.map(({ role, name, content, _sourceIndexes }) => ({
                role,
                name,
                content,
                _sourceIndexes
            }));

            // --- 优化后的控制台日志 ---
            printAIRequestLogs(apiMessages.map(({ role, name, content }) => ({ role, name, content })), requestModel);
            // ---------------------------

            if (currentReferenceImages.length > 0) {
                const currentUserIndex = currentUserMessageId
                    ? chatHistory.value.findIndex(message => message?.id === currentUserMessageId)
                    : chatHistory.value.length - 1;
                const currentUserMessage = [...apiMessages].reverse().find(message => (
                    message.role === 'user'
                    && Array.isArray(message._sourceIndexes)
                    && message._sourceIndexes.includes(currentUserIndex)
                )) || [...apiMessages].reverse().find(message => message.role === 'user');
                if (currentUserMessage) {
                    currentUserMessage.content = [
                        { type: 'text', text: String(currentUserMessage.content || '') },
                        ...currentReferenceImages.map(image => ({
                            type: 'image_url',
                            image_url: { url: image.dataUrl }
                        }))
                    ];
                }
            }
            apiMessages.forEach(message => delete message._sourceIndexes);

            let generatedAssistantMessageId = null;
            let assistantMessage = null;
            let continuingAssistantMessage = continuationTargetMessage;
            let continuationToolCall = null;
            let continuationContentStarted = false;
            let continuationReasoningStarted = false;
            let rawAssistantContentForLog = '';
            let nativeReasoningForLog = '';
            let responseUsage = null;

            if (continuingAssistantMessage && continuationToolCallId && Array.isArray(continuingAssistantMessage.toolCalls)) {
                continuationToolCall = continuingAssistantMessage.toolCalls.find(call => call && call.id === continuationToolCallId) || null;
                if (continuationToolCall && typeof continuationToolCall.reasoning !== 'string') continuationToolCall.reasoning = '';
            }

            const prepareAssistantMessageForAppend = (message) => {
                if (!message) return null;
                if (!message.id) message.id = generateUUID();
                if (typeof message.content !== 'string') message.content = '';
                if (typeof message.reasoning !== 'string') message.reasoning = '';
                if (message.isCotOpen === undefined) message.isCotOpen = false;
                if (message.isReasoningOpen === undefined) message.isReasoningOpen = true;
                if (message.isReasoningUserToggled === undefined) message.isReasoningUserToggled = false;
                if (message.isReasoningAutoCollapsed === undefined) message.isReasoningAutoCollapsed = false;
                message.shouldAnimate = !continuingAssistantMessage;
                return message;
            };

            const appendAssistantText = (message, field, text) => {
                if (!message || !text) return;
                const isContinuation = continuingAssistantMessage && message.id === continuingAssistantMessage.id;
                const startedKey = field === 'reasoning' ? 'continuationReasoningStarted' : 'continuationContentStarted';
                const hasStarted = field === 'reasoning' ? continuationReasoningStarted : continuationContentStarted;

                if (field === 'content' && message._activeToolCaptureActive) {
                    message._activeToolPendingText = `${message._activeToolPendingText || ''}${text}`;
                    promoteActiveToolCallsFromAssistant(message);
                    if (isContinuation) {
                        if (!hasStarted) continuationContentStarted = true;
                        activeToolContinuationHasResponse.value = true;
                    }
                    return;
                }

                const existing = String(message[field] || '');

                if (isContinuation && !hasStarted && existing.trim()) {
                    message[field] = existing.replace(/\s+$/, '') + '\n\n' + text;
                } else {
                    message[field] = existing + text;
                }

                if (isContinuation && !hasStarted) {
                    if (startedKey === 'continuationReasoningStarted') continuationReasoningStarted = true;
                    else continuationContentStarted = true;
                }
                if (field === 'content') {
                    promoteActiveToolCallsFromAssistant(message);
                }
                if (isContinuation) activeToolContinuationHasResponse.value = true;
            };

            const appendAssistantReasoning = (message, text) => {
                if (!message || !text) return;
                if (continuationToolCall && continuingAssistantMessage && message.id === continuingAssistantMessage.id) {
                    appendAssistantText(message, 'reasoning', text);
                    return;
                }
                appendAssistantText(message, 'reasoning', text);
            };

            const createAssistantMessage = (content = '', reasoning = '') => reactive({
                role: 'assistant',
                name: currentCharacter.value.name,
                content: content || '',
                reasoning: reasoning || '',
                id: generateUUID(),
                shouldAnimate: true,
                isCotOpen: false,
                isReasoningOpen: true,
                isReasoningUserToggled: false,
                isReasoningAutoCollapsed: false
            });

            const ensureAssistantMessage = (content = '', reasoning = '') => {
                if (assistantMessage) return assistantMessage;
                if (continuingAssistantMessage) {
                    assistantMessage = prepareAssistantMessageForAppend(continuingAssistantMessage);
                    if (reasoning) appendAssistantReasoning(assistantMessage, reasoning);
                    if (content) appendAssistantText(assistantMessage, 'content', content);
                    isReceiving.value = true;
                    return assistantMessage;
                }

                assistantMessage = createAssistantMessage(content, reasoning);
                promoteActiveToolCallsFromAssistant(assistantMessage);
                chatHistory.value.push(assistantMessage);
                isReceiving.value = true;
                return assistantMessage;
            };

            try {
                        const url = getApiEndpoint('chat/completions');
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${settings.apiKey}`
                            },
                            body: JSON.stringify({
                                model: requestModel,
                                messages: apiMessages,
                                temperature: settings.temperature,
                                stream: settings.stream,
                                ...(settings.stream ? { stream_options: { include_usage: true } } : {})
                            }),
                            signal: abortController.value.signal
                        });

                        if (!response.ok) {
                            let errorDetail = '';
                            try {
                                const errorText = await response.text();
                                try {
                                    const errorJson = JSON.parse(errorText);
                                    const apiError = extractApiErrorMessage(errorJson, response.status);
                                    if (apiError) throwApiError(apiError);
                                    errorDetail = errorJson;
                                } catch (e) {
                                    if (e.isApiError) throw e;
                                    // Not JSON, use text directly
                                    if (errorText) errorDetail = errorText;
                                }
                            } catch (e) {
                                if (e.isApiError) throw e;
                                // Cannot read body
                            }
                            throw new Error(formatApiErrorMessage(response.status, errorDetail));
                        }

                        // Check Content-Type to determine if we should stream
                        const contentType = response.headers.get('content-type');
                        const isStream = settings.stream && contentType && contentType.includes('text/event-stream');

                        if (isStream) {
                            const reader = response.body.getReader();
                            const decoder = new TextDecoder();
                            let buffer = '';
                            let pendingNativeReasoning = '';
                            let nativeReasoningFlushRaf = null;
                            const applyPendingNativeReasoning = () => {
                                if (!assistantMessage || !pendingNativeReasoning) return;
                                appendAssistantReasoning(assistantMessage, pendingNativeReasoning);
                                pendingNativeReasoning = '';
                            };
                            const scheduleNativeReasoningFlush = () => {
                                if (!assistantMessage || !pendingNativeReasoning || nativeReasoningFlushRaf) return;
                                nativeReasoningFlushRaf = requestAnimationFrame(() => {
                                    nativeReasoningFlushRaf = null;
                                    applyPendingNativeReasoning();
                                });
                            };
                            const flushNativeReasoning = () => {
                                if (!assistantMessage || !pendingNativeReasoning) return;
                                if (nativeReasoningFlushRaf) {
                                    cancelAnimationFrame(nativeReasoningFlushRaf);
                                    nativeReasoningFlushRaf = null;
                                }
                                applyPendingNativeReasoning();
                            };

                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;

                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split('\n');
                                buffer = lines.pop();

                                for (const line of lines) {
                                    const trimmedLine = line.trim();
                                    if (!trimmedLine) continue;

                                    if (trimmedLine.startsWith('data: ')) {
                                        const dataStr = trimmedLine.slice(6);
                                        if (dataStr === '[DONE]') continue;

                                        try {
                                            const data = JSON.parse(dataStr);
                                            const apiError = extractApiErrorMessage(data, response.status);
                                            if (apiError) throwApiError(apiError);
                                            responseUsage = getApiUsagePayload(data) || responseUsage;

                                            const choice = data.choices?.[0];
                                            if (!choice) continue;

                                            const delta = choice.delta || choice.message || {};
                                            const rawContent = delta.content || '';
                                            if (rawContent) rawAssistantContentForLog += rawContent;
                                            const content = (!assistantMessage && !String(rawContent).trim()) ? '' : rawContent;
                                            const reasoning = extractNativeReasoning(delta) || extractNativeReasoning(choice);
                                            if (reasoning) nativeReasoningForLog += reasoning;

                                            if (content || reasoning) {
                                                let seededContent = false;
                                                let seededReasoning = false;
                                                if (!assistantMessage) {
                                                    if (reasoning) {
                                                        isThinking.value = true;
                                                    }
                                                    assistantMessage = ensureAssistantMessage(content, reasoning);
                                                    seededContent = !!content;
                                                    seededReasoning = !!reasoning;
                                                    if (seededContent && !reasoning) {
                                                        isThinking.value = false;
                                                        collapseNativeReasoning(assistantMessage);
                                                    }
                                                    await nextTick();
                                                }

                                                if (reasoning && !seededReasoning) {
                                                    pendingNativeReasoning += reasoning;
                                                    isThinking.value = true;
                                                    scheduleNativeReasoningFlush();
                                                }

                                                if (content && !seededContent) {
                                                    flushNativeReasoning();
                                                    appendAssistantText(assistantMessage, 'content', content);
                                                    isThinking.value = false;
                                                    collapseNativeReasoning(assistantMessage);
                                                }

                                            }
                                        } catch (e) {
                                            if (e.isApiError) throw e;
                                            if (/error/i.test(dataStr)) throw new Error(formatApiErrorMessage(response.status, dataStr));
                                            console.warn('Error parsing stream chunk:', e);
                                        }
                                    }
                                }
                            }
                            flushNativeReasoning();
                        } else {
                            // Non-streaming response handling
                            // Compatibility Fix: Some APIs force return SSE format even if stream=false
                            // We read as text first to handle both valid JSON and "forced stream" text
                            const rawText = await response.text();
                            let content = '';

                            try {
                                // 1. Try parsing as standard JSON
                                const data = JSON.parse(rawText);
                                const apiError = extractApiErrorMessage(data, response.status);
                                if (apiError) throwApiError(apiError);
                                responseUsage = getApiUsagePayload(data) || responseUsage;

                                const msg = data.choices?.[0]?.message || {};
                                content = msg.content || '';
                                const reasoning = extractNativeReasoning(msg) || extractNativeReasoning(data.choices?.[0]);
                                if (content) rawAssistantContentForLog += content;
                                if (reasoning) nativeReasoningForLog += reasoning;

                                if (reasoning && !content) {
                                    isThinking.value = true;
                                } else {
                                    isThinking.value = false;
                                }

                                if (content || reasoning) {
                                    assistantMessage = ensureAssistantMessage(content, reasoning);
                                    if (!continuingAssistantMessage) {
                                        assistantMessage.isReasoningOpen = !(reasoning && content);
                                        assistantMessage.isReasoningAutoCollapsed = !!(reasoning && content);
                                    } else if (reasoning && content) {
                                        collapseNativeReasoning(assistantMessage);
                                    }
                                }
                            } catch (e) {
                                if (e.isApiError) throw e;
                                // 2. If JSON fails, try parsing as SSE text (data: {...})
                                // This handles cases where API returns stream format even if stream=false
                                console.log('Non-standard JSON response detected, attempting manual SSE parsing...');
                                const lines = rawText.split('\n');
                                let finalReasoning = '';
                                for (const line of lines) {
                                    const trimmedLine = line.trim();
                                    if (trimmedLine.startsWith('data:')) {
                                        const dataStr = trimmedLine.replace(/^data:\s*/, '');
                                        if (dataStr === '[DONE]') continue;
                                        try {
                                            const chunk = JSON.parse(dataStr);
                                            const apiError = extractApiErrorMessage(chunk, response.status);
                                            if (apiError) throwApiError(apiError);
                                            responseUsage = getApiUsagePayload(chunk) || responseUsage;

                                            const choice = chunk.choices?.[0];
                                            if (!choice) continue;

                                            const delta = choice.delta || choice.message || {};
                                            const chunkContent = delta.content || '';
                                            const chunkReasoning = extractNativeReasoning(delta) || extractNativeReasoning(choice);

                                            if (chunkContent) {
                                                content += chunkContent;
                                                rawAssistantContentForLog += chunkContent;
                                            }
                                            if (chunkReasoning) {
                                                finalReasoning += chunkReasoning;
                                                nativeReasoningForLog += chunkReasoning;
                                            }
                                        } catch (err) {
                                            if (err.isApiError) throw err;
                                            if (/error/i.test(dataStr)) throw new Error(formatApiErrorMessage(response.status, dataStr));
                                            // Ignore invalid chunks
                                        }
                                    }
                                }

                                if (content || finalReasoning) {
                                    assistantMessage = ensureAssistantMessage(content, finalReasoning);
                                    if (!continuingAssistantMessage) {
                                        assistantMessage.isReasoningOpen = !(finalReasoning && content);
                                        assistantMessage.isReasoningAutoCollapsed = !!(finalReasoning && content);
                                    } else if (finalReasoning && content) {
                                        collapseNativeReasoning(assistantMessage);
                                    }

                                }
                            }
                        }

                        recordApiUsage(responseUsage, {
                            type: activeToolDepth > 0 ? 'tool_continuation' : 'chat',
                            model: requestModel,
                            detail: activeToolDepth > 0 ? `第 ${activeToolDepth} 次续写` : ''
                        });

                        if (assistantMessage) {
                            generatedAssistantMessageId = assistantMessage.id;
                            console.groupCollapsed('📬 AI 响应接收完毕');
                            console.log('AI返回的完整内容:', formatAIResponseForConsole(
                                rawAssistantContentForLog || assistantMessage.content,
                                nativeReasoningForLog || assistantMessage.reasoning
                            ));
                            console.groupEnd();

                            if (settings.uiTemplateEnabled && settings.uiTemplateMainModelAnalysis) {
                                applyMainModelUiTemplateUpdates(assistantMessage, requestModel);
                            }

                            // Record generation time
                            const duration = Date.now() - generationStartTime;
                            recentGenerationTimes.value.push({
                                id: assistantMessage.id,
                                duration: duration
                            });
                            if (recentGenerationTimes.value.length > 5) {
                                recentGenerationTimes.value.shift();
                            }

                            // -----------------------------
                        }

            } catch (error) {
                if (error.name === 'AbortError') {
                    _wasCancelled = true;
                    showToast('生成已中止', 'info');
                    const wasReceiving = isReceiving.value;
                    isGenerating.value = false;
                    isRemoteGenerating.value = false;
                    isThinking.value = false;
                    const lastMessage = chatHistory.value[chatHistory.value.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant' && wasReceiving) {
                        const hasContent = !!(lastMessage.content || '').trim();
                        const hasReasoning = !!(lastMessage.reasoning || '').trim();
                        if (hasContent || hasReasoning) {
                            if (hasContent) {
                                lastMessage.content += '\n\n*-- 生成已中止 --*';
                            } else {
                                lastMessage.content = '*-- 生成已中止 --*';
                            }
                            lastMessage.shouldAnimate = false;
                            collapseNativeReasoning(lastMessage);
                        } else {
                            chatHistory.value.pop();
                            chatHistory.value.push({ role: 'system', name: currentCharacter.value.name, content: '生成已中止', skipReveal: true });
                        }
                    } else {
                        chatHistory.value.push({ role: 'system', name: currentCharacter.value.name, content: '生成已中止', skipReveal: true });
                    }
                } else if (continuingAssistantMessage) {
                    const errorMessage = error.message || '生成失败';
                    appendAssistantResponseError(continuingAssistantMessage, errorMessage);
                    activeToolContinuationHasResponse.value = true;
                } else {
                    chatHistory.value.push({ role: 'system', name: currentCharacter.value.name, content: error.message });
                }
            } finally {
                if (continuationToolCall && continuationToolCall.status === 'continuing') {
                    continuationToolCall.status = 'done';
                }
                collapseActiveNativeReasoning();
                await saveChatHistoryNow();
                isGenerating.value = false;
                isReceiving.value = false;
                isThinking.value = false;
                if (!continueAssistantMessageId || activeToolContinuationMessageId.value === continueAssistantMessageId) {
                    activeToolContinuationMessageId.value = null;
                    activeToolContinuationToolCallId.value = null;
                    activeToolContinuationHasResponse.value = false;
                }
                abortController.value = null;
                const wasCancelled = _wasCancelled;
                _wasCancelled = false;
                if (waitTimer) {
                    clearInterval(waitTimer);
                    waitTimer = null;
                }

                const needsPostGenerationTurns = !wasCancelled
                    && ((settings.uiTemplateEnabled && generatedAssistantMessageId)
                        || memorySettings.enabled);
                const activeToolContinued = !wasCancelled && assistantMessage
                    ? await handleActiveToolCallFromAssistant(assistantMessage, activeToolDepth)
                    : false;
                if (!activeToolContinued) {
                    resetActiveToolResultContext();
                }
                const hasCompletedTurns = !activeToolContinued && needsPostGenerationTurns && buildConversationTurnSnapshot().turns.length > 0;

                if (hasCompletedTurns && settings.uiTemplateEnabled && generatedAssistantMessageId && !settings.uiTemplateMainModelAnalysis) {
                    nextTick(() => {
                        updateUiTemplatesFromChat({ manual: false, targetMessageId: generatedAssistantMessageId });
                    });
                }

                // 记忆提取：在对话正常完成后异步提取记忆（用户取消时不触发）
                if (hasCompletedTurns && memorySettings.enabled) {
                    nextTick(() => {
                        extractMemoryFromChat();
                    });
                }
            }
        };
