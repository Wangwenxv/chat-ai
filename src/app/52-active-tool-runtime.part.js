// 52-active-tool-runtime.part.js：由 build-app.js 按 setup 依赖顺序组装。
const findActiveToolCallsInText = (text) => {
            const originalContent = String(text || '');
            if (!originalContent) return [];
            const mainContent = stripCodeBlocksForToolDetection(parseCot(originalContent).main);
            const tools = getEnabledActiveTools();
            const calls = [];
            const seen = new Set();

            for (const tool of tools) {
                const labels = getActiveToolCallLabels(tool);
                const callForms = [
                    { label: labels.add, mode: 'add' },
                    { label: labels.cover, mode: 'cover' }
                ];
                for (const form of callForms) {
                    const escapedName = escapeRegexText(form.label);
                    const regex = new RegExp(`<\\s*${escapedName}\\s*:\\s*([\\s\\S]{1,30000}?)\\s*>`, 'gi');
                    let match;
                    while ((match = regex.exec(mainContent)) !== null) {
                        const query = String(match[1] || '').trim();
                        if (!query) continue;

                        const meta = buildActiveToolCallMeta(originalContent, mainContent, match[0], match.index);
                        const raw = meta.raw;
                        const index = meta.index;
                        const key = `${index}:${match.index}:${form.label}:${raw}`;
                        if (seen.has(key)) continue;
                        seen.add(key);

                        calls.push({
                            tool,
                            mode: form.mode,
                            callLabel: form.label,
                            query,
                            raw,
                            toolRaw: meta.toolRaw,
                            reason: meta.reason,
                            index,
                            mainIndex: meta.mainIndex
                        });
                    }
                }
            }

            return calls.sort((a, b) => {
                const indexDiff = (a.index ?? 0) - (b.index ?? 0);
                if (indexDiff !== 0) return indexDiff;
                return (a.mainIndex ?? 0) - (b.mainIndex ?? 0);
            });
        };

        const getActiveToolDetectionText = (message) => [
            String(message?.content || ''),
            String(message?._activeToolPendingText || '')
        ].filter(Boolean).join('\n');

        const findActiveToolCallsInAssistantMessage = (message) => findActiveToolCallsInText(getActiveToolDetectionText(message));

        const findPendingActiveToolCallInText = (text) => {
            const originalContent = String(text || '');
            if (!originalContent) return null;
            const mainContent = stripCodeBlocksForToolDetection(parseCot(originalContent).main);
            const tools = getEnabledActiveTools();
            const candidates = [];

            for (const tool of tools) {
                const labels = getActiveToolCallLabels(tool);
                [
                    { label: labels.add, mode: 'add' },
                    { label: labels.cover, mode: 'cover' }
                ].forEach(form => {
                    const escapedName = escapeRegexText(form.label);
                    const regex = new RegExp(`<\\s*${escapedName}\\s*:\\s*([\\s\\S]*)$`, 'i');
                    const match = mainContent.match(regex);
                    if (!match) return;

                    const meta = buildActiveToolCallMeta(originalContent, mainContent, match[0], mainContent.length - match[0].length);
                    const raw = meta.raw;
                    candidates.push({
                        tool,
                        mode: form.mode,
                        callLabel: form.label,
                        query: String(match[1] || '').trim(),
                        raw,
                        toolRaw: meta.toolRaw,
                        reason: meta.reason,
                        index: meta.index,
                        mainIndex: meta.mainIndex,
                        pending: true
                    });
                });
            }

            return candidates.sort((a, b) => {
                const indexDiff = (a.index ?? 0) - (b.index ?? 0);
                if (indexDiff !== 0) return indexDiff;
                return (a.mainIndex ?? 0) - (b.mainIndex ?? 0);
            })[0] || null;
        };

        const getPendingToolCallQueryPreview = (toolCall) => {
            const query = String(toolCall?.query || '').trim();
            if (!query) return '正在接收工具参数...';
            return trimMemoryText(query, 160);
        };

        const createActiveToolUi = (toolCall, initialStatus = 'queued') => ({
            id: generateUUID(),
            toolId: toolCall.tool?.id || '',
            toolType: toolCall.tool?.type || ACTIVE_TOOL_VECTOR_TYPE,
            toolResultCount: toolCall.tool?.resultCount || ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
            name: toolCall.tool?.name || '向量记忆主动检索',
            callName: toolCall.callLabel || toolCall.tool?.callName || 'tool_memory_add',
            baseCallName: toolCall.tool?.callName || 'tool_memory',
            mode: toolCall.mode || 'add',
            query: toolCall.query || '',
            raw: toolCall.raw,
            reason: cleanActiveToolCallReason(toolCall.reason),
            status: initialStatus,
            isOpen: false,
            reasoning: '',
            isReasoningOpen: false,
            resultCount: 0,
            resultText: '',
            error: ''
        });

        const getActiveToolUiGroupKey = (toolCall) => {
            const baseCallName = normalizeActiveToolBaseCallName(
                toolCall?.baseCallName
                || toolCall?.callName
                || ''
            );
            if (toolCall?.toolType === ACTIVE_TOOL_KEYWORD_TYPE || baseCallName === 'tool_grep') {
                return ACTIVE_TOOL_KEYWORD_TYPE;
            }
            if (toolCall?.toolType === ACTIVE_TOOL_WEB_TYPE || baseCallName === 'tool_web') {
                return ACTIVE_TOOL_WEB_TYPE;
            }
            if (toolCall?.toolType === ACTIVE_TOOL_VECTOR_TYPE || baseCallName === 'tool_memory') {
                return ACTIVE_TOOL_VECTOR_TYPE;
            }
            return baseCallName || toolCall?.toolId || ACTIVE_TOOL_VECTOR_TYPE;
        };

        const getToolCallDisplayName = (toolCall) => {
            const groupKey = getActiveToolUiGroupKey(toolCall);
            if (groupKey === ACTIVE_TOOL_KEYWORD_TYPE) return '关键词检索';
            if (groupKey === ACTIVE_TOOL_WEB_TYPE) return 'Tavily 联网搜索';
            if (groupKey === ACTIVE_TOOL_VECTOR_TYPE) return '向量记忆主动检索';
            return toolCall?.name || '向量记忆主动检索';
        };

        const getToolCallModeText = (toolCall) => {
            const groupKey = getActiveToolUiGroupKey(toolCall);
            const mode = toolCall?.mode === 'cover' ? 'cover' : 'add';
            const query = String(toolCall?.query || '');

            if (groupKey === ACTIVE_TOOL_WEB_TYPE) {
                const hasUrl = extractWebUrlsFromToolQuery(query).length > 0;
                if (hasUrl) return mode === 'cover' ? '覆盖网页读取' : '读取网页';
                return mode === 'cover' ? '覆盖联网搜索' : '联网搜索';
            }

            if (groupKey === ACTIVE_TOOL_KEYWORD_TYPE) {
                return mode === 'cover' ? '覆盖关键词检索' : '关键词检索';
            }

            return mode === 'cover' ? '覆盖向量检索' : '向量检索';
        };

        const TOOL_CALL_RUNNING_STATUSES = ['running', 'receiving', 'queued'];
        const getToolCallEffectiveStatus = (toolCall) => (
            toolCall?.status === 'continuing' ? 'done' : (toolCall?.status || 'queued')
        );

        const getCurrentThinkingToolCall = (message) => {
            const toolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
            const runningToolCall = toolCalls.find(toolCall => TOOL_CALL_RUNNING_STATUSES.includes(getToolCallEffectiveStatus(toolCall)));
            if (runningToolCall) return runningToolCall;
            if (
                activeToolContinuationMessageId.value === message?.id
                && !activeToolContinuationHasResponse.value
                && (isGenerating.value || isRemoteGenerating.value || activeToolContinuationPending.value)
            ) {
                return toolCalls.find(toolCall => toolCall?.id === activeToolContinuationToolCallId.value) || null;
            }
            return null;
        };

        function getActiveToolInlineProcessText() {
            for (let index = chatHistory.value.length - 1; index >= 0; index -= 1) {
                const message = chatHistory.value[index];
                const toolCall = getCurrentThinkingToolCall(message);
                if (toolCall) return getToolCallDisplayName(toolCall);
            }
            return '';
        }

        const getToolCallReasoningParts = (toolCalls) => (Array.isArray(toolCalls) ? toolCalls : [])
            .map(item => String(item?.reasoning || '').trim())
            .filter(Boolean)
            .filter((text, index, items) => items.indexOf(text) === index);

        const getAssistantReasoningText = (message) => {
            const parts = [];
            const seen = new Set();
            const appendPart = (value) => {
                const text = String(value || '').trim();
                if (!text || seen.has(text)) return;
                seen.add(text);
                parts.push(text);
            };

            appendPart(message?.reasoning);
            getToolCallReasoningParts(message?.toolCalls).forEach(appendPart);
            return parts.join('\n\n');
        };

        const hasThinkingOrTools = (message) => {
            if (!message) return false;
            return !!(
                getAssistantReasoningText(message)
                || (Array.isArray(message.toolCalls) && message.toolCalls.length > 0)
                || (parseCot(message.content || '').cot)
            );
        };

        const isMessageThinkingOrRunning = (message) => {
            const isLast = chatHistory.value && chatHistory.value[chatHistory.value.length - 1] === message;
            if (isLast && isThinking.value) return true;
            if (getCurrentThinkingToolCall(message)) return true;
            const cotInfo = parseCot(message.content || '');
            if (isLast && (isGenerating.value || isRemoteGenerating.value) && cotInfo.cot && !cotInfo.isFinished) {
                return true;
            }
            return false;
        };

        const isThinkingSummaryOpen = (message) => {
            if (message?.isSummaryOpen !== undefined) return message.isSummaryOpen !== false;
            return isMessageThinkingOrRunning(message);
        };

        const toggleThinkingSummary = (message) => {
            if (!message) return;
            message.isSummaryOpen = !isThinkingSummaryOpen(message);
            saveChatHistoryNow();
        };

        const markThinkingSummaryDetailOpened = (message, event) => {
            if (!message || !event?.target?.open) return;
            message.hasOpenedSummaryDetail = true;
            if (message.isSummaryOpen === undefined && isMessageThinkingOrRunning(message)) {
                message.isSummaryOpen = true;
            }
            saveChatHistoryNow();
        };

        const getToolCallStepText = (toolCall) => {
            const modeText = getToolCallModeText(toolCall);
            return `${modeText}: ${toolCall.query}`;
        };

        const getTimelineCharCount = (text) => Array.from(String(text || '')).length;

        const getTimelineSteps = (message) => {
            const steps = [];
            const isLastMessage = chatHistory.value && chatHistory.value[chatHistory.value.length - 1] === message;
            const isGeneratingMessage = isLastMessage && (isGenerating.value || isRemoteGenerating.value);
            const cotInfo = parseCot(message.content || '');

            // 1. 初始原生思考
            const reasoningText = String(getAssistantReasoningText(message) || '').trim();
            if (reasoningText) {
                steps.push({
                    id: 'init-reasoning',
                    type: 'thinking',
                    text: reasoningText,
                    title: '原生思考',
                    charCount: getTimelineCharCount(reasoningText),
                    isLive: isLastMessage && isThinking.value
                });
            }

            // 2. 工具调用列表
            if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
                message.toolCalls.forEach((toolCall, idx) => {
                    const status = getToolCallEffectiveStatus(toolCall);
                    const reason = cleanActiveToolCallReason(toolCall?.reason);
                    if (reason) {
                        steps.push({
                            id: `tool-reason-${toolCall.id || idx}`,
                            type: 'thinking',
                            text: reason,
                            title: reason,
                            isReason: true
                        });
                    }
                    steps.push({
                        id: `tool-call-${toolCall.id || idx}`,
                        type: 'tool',
                        toolCall: toolCall,
                        title: getToolCallDisplayName(toolCall),
                        text: getToolCallStepText(toolCall),
                        status
                    });
                });
            }

            // 3. 分析过程 (CoT)
            const cotText = String(cotInfo.cot || '').trim();
            if (cotText) {
                steps.push({
                    id: 'cot-reasoning',
                    type: 'thinking',
                    text: cotText,
                    title: '分析过程',
                    charCount: getTimelineCharCount(cotText),
                    isLive: isGeneratingMessage && !cotInfo.isFinished
                });
            }

            return steps;
        };

        const stripActiveToolCallsFromAssistant = (message, toolCalls) => {
            if (!message || !Array.isArray(toolCalls) || toolCalls.length === 0) return;
            const originalContent = String(message.content || '');
            const firstToolCallIndex = toolCalls
                .map(toolCall => Number.isFinite(toolCall.index) ? toolCall.index : originalContent.indexOf(toolCall.raw))
                .filter(index => index >= 0)
                .sort((a, b) => a - b)[0];
            const nextContent = (Number.isFinite(firstToolCallIndex)
                ? originalContent.slice(0, firstToolCallIndex)
                : toolCalls.reduce((content, toolCall) => content.replace(toolCall.raw, ''), originalContent))
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            message.content = nextContent;
            message.skipReveal = true;
        };

        const appendActiveToolCallsToAssistant = (message, toolCalls) => {
            if (!message || !Array.isArray(toolCalls) || toolCalls.length === 0) return [];
            if (!Array.isArray(message.toolCalls)) message.toolCalls = [];

            const toolUis = [];
            toolCalls.forEach((toolCall, index) => {
                const pendingUiId = message._activeToolPendingUiId;
                const pendingIndex = index === 0 && pendingUiId
                    ? message.toolCalls.findIndex(item => item?.id === pendingUiId && item.status === 'receiving')
                    : -1;
                const nextUi = createActiveToolUi(toolCall);
                if (pendingIndex >= 0) {
                    const previousUi = message.toolCalls[pendingIndex];
                    nextUi.id = previousUi.id;
                    nextUi.isOpen = previousUi.isOpen;
                    nextUi.reason = nextUi.reason || previousUi.reason || '';
                    nextUi.reasoning = previousUi.reasoning || nextUi.reasoning;
                    nextUi.isReasoningOpen = previousUi.isReasoningOpen;
                    message.toolCalls.splice(pendingIndex, 1, nextUi);
                    delete message._activeToolPendingUiId;
                } else {
                    message.toolCalls.push(nextUi);
                }
                toolUis.push(nextUi);
            });
            message.skipReveal = true;
            return toolUis;
        };

        const upsertPendingActiveToolCallToAssistant = (message, toolCall) => {
            if (!message || !toolCall) return null;
            if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
            let toolUi = message._activeToolPendingUiId
                ? message.toolCalls.find(item => item?.id === message._activeToolPendingUiId && item.status === 'receiving')
                : null;
            if (!toolUi) {
                toolUi = createActiveToolUi(toolCall, 'receiving');
                message.toolCalls.push(toolUi);
                message._activeToolPendingUiId = toolUi.id;
            }
            toolUi.toolId = toolCall.tool?.id || toolUi.toolId || '';
            toolUi.toolType = toolCall.tool?.type || toolUi.toolType || ACTIVE_TOOL_VECTOR_TYPE;
            toolUi.name = toolCall.tool?.name || toolUi.name || '工具';
            toolUi.callName = toolCall.callLabel || toolUi.callName || 'tool_memory_add';
            toolUi.baseCallName = toolCall.tool?.callName || toolUi.baseCallName || 'tool_memory';
            toolUi.mode = toolCall.mode || toolUi.mode || 'add';
            toolUi.query = getPendingToolCallQueryPreview(toolCall);
            toolUi.reason = cleanActiveToolCallReason(toolCall.reason || toolUi.reason || '');
            toolUi.raw = toolCall.raw || toolUi.raw || '';
            toolUi.status = 'receiving';
            message.skipReveal = true;
            return toolUi;
        };

        const attachActiveToolCallsToAssistant = (message, toolCalls, options = {}) => {
            const toolUis = appendActiveToolCallsToAssistant(message, toolCalls, options);
            if (toolUis.length === 0) return [];
            stripActiveToolCallsFromAssistant(message, toolCalls);
            return toolUis;
        };

        const removeActiveToolCallRawsFromText = (text, toolCalls) => {
            let nextText = String(text || '');
            [...toolCalls]
                .sort((a, b) => (b.index ?? b.mainIndex ?? 0) - (a.index ?? a.mainIndex ?? 0))
                .forEach(toolCall => {
                    const index = Number.isFinite(toolCall.index) ? toolCall.index : nextText.indexOf(toolCall.raw);
                    if (index < 0) return;
                    nextText = `${nextText.slice(0, index)}${nextText.slice(index + String(toolCall.raw || '').length)}`;
                });
            return nextText;
        };

        const promoteActiveToolCallsFromAssistant = (message, options = {}) => {
            if (!message || typeof message.content !== 'string') return [];
            const scanText = message._activeToolCaptureActive
                ? String(message._activeToolPendingText || '')
                : String(message.content || '');
            const detectedCalls = findActiveToolCallsInText(scanText);
            if (detectedCalls.length === 0) {
                const pendingCall = findPendingActiveToolCallInText(scanText);
                if (!pendingCall) return [];

                let toolBuffer = scanText;
                if (!message._activeToolCaptureActive) {
                    const firstIndex = Math.max(0, pendingCall.index ?? pendingCall.mainIndex ?? scanText.indexOf(pendingCall.raw));
                    message.content = scanText.slice(0, firstIndex)
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();
                    toolBuffer = scanText.slice(firstIndex);
                    message._activeToolCaptureActive = true;
                }
                upsertPendingActiveToolCallToAssistant(message, {
                    ...pendingCall,
                    raw: toolBuffer,
                    query: String(pendingCall.toolRaw || toolBuffer || '').replace(new RegExp(`^\\s*<\\s*${escapeRegexText(pendingCall.callLabel)}\\s*:\\s*`, 'i'), '')
                });
                message._activeToolPendingText = toolBuffer;
                message.skipReveal = true;
                activeToolHandoffPending.value = true;
                return [];
            }

            let toolBuffer = scanText;
            let callsForUi = detectedCalls;
            if (!message._activeToolCaptureActive) {
                const firstIndex = Math.max(0, detectedCalls[0].index ?? detectedCalls[0].mainIndex ?? scanText.indexOf(detectedCalls[0].raw));
                message.content = scanText.slice(0, firstIndex)
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                message.skipReveal = true;
                toolBuffer = scanText.slice(firstIndex);
                callsForUi = findActiveToolCallsInText(toolBuffer);
                message._activeToolCaptureActive = true;
            }

            const toolUis = appendActiveToolCallsToAssistant(message, callsForUi, options);
            if (toolUis.length > 0) {
                activeToolHandoffPending.value = true;
            }
            message._activeToolPendingText = removeActiveToolCallRawsFromText(toolBuffer, callsForUi);
            return toolUis;
        };

        const cleanupActiveToolCaptureState = (message) => {
            if (!message) return;
            delete message._activeToolCaptureActive;
            delete message._activeToolPendingText;
            delete message._activeToolPendingUiId;
        };

        const resolveActiveToolForUi = (toolUi) => {
            const baseCallName = normalizeActiveToolBaseCallName(
                toolUi?.baseCallName
                || toolUi?.callName
                || 'tool_memory'
            );
            const enabledMatch = getEnabledActiveTools().find(tool => (
                tool.id === toolUi?.toolId
                || normalizeActiveToolBaseCallName(tool.callName) === baseCallName
            ));
            if (enabledMatch) return enabledMatch;
            return getDefaultActiveToolDefinitions().find(tool => (
                tool.id === toolUi?.toolId
                || normalizeActiveToolBaseCallName(tool.callName) === baseCallName
            )) || createDefaultActiveTool();
        };

        const buildActiveToolCallFromUi = (toolUi) => {
            const tool = resolveActiveToolForUi(toolUi);
            return {
                tool,
                mode: toolUi?.mode || 'add',
                callLabel: toolUi?.callName || getActiveToolCallLabels(tool).add,
                query: String(toolUi?.query || '').trim(),
                raw: toolUi?.raw || '',
                reason: cleanActiveToolCallReason(toolUi?.reason)
            };
        };

        const handleActiveToolCallFromAssistant = async (assistantMessage, activeToolDepth = 0) => {
            promoteActiveToolCallsFromAssistant(assistantMessage);
            let toolUis = Array.isArray(assistantMessage?.toolCalls)
                ? assistantMessage.toolCalls.filter(toolCall => ['queued', 'running'].includes(toolCall?.status))
                : [];
            let toolCalls = toolUis.map(buildActiveToolCallFromUi).filter(toolCall => toolCall.query);

            if (toolCalls.length === 0) {
                toolCalls = findActiveToolCallsInAssistantMessage(assistantMessage);
            }
            if (toolCalls.length === 0) {
                const receivingToolUis = Array.isArray(assistantMessage?.toolCalls)
                    ? assistantMessage.toolCalls.filter(toolCall => toolCall?.status === 'receiving')
                    : [];
                if (receivingToolUis.length > 0) {
                    receivingToolUis.forEach(toolUi => {
                        toolUi.status = 'error';
                        toolUi.error = '工具调用没有完整输出，请重试。';
                        toolUi.resultText = toolUi.error;
                    });
                    await saveChatHistoryNow();
                }
                cleanupActiveToolCaptureState(assistantMessage);
                activeToolHandoffPending.value = false;
                return false;
            }

            if (activeToolDepth >= ACTIVE_TOOL_MAX_AUTO_CONTINUE) {
                if (toolUis.length === 0) {
                    stripActiveToolCallsFromAssistant(assistantMessage, toolCalls);
                } else {
                    toolUis.forEach(toolUi => {
                        toolUi.status = 'error';
                    });
                }
                cleanupActiveToolCaptureState(assistantMessage);
                activeToolHandoffPending.value = false;
                await saveChatHistoryNow();
                return false;
            }

            if (toolUis.length === 0) {
                toolUis = attachActiveToolCallsToAssistant(assistantMessage, toolCalls);
            }
            if (toolUis.length === 0) {
                cleanupActiveToolCaptureState(assistantMessage);
                activeToolHandoffPending.value = false;
                return false;
            }
            await saveChatHistoryNow();

            const toolAbort = new AbortController();
            activeToolQueueRunning.value = true;
            activeToolHandoffPending.value = false;
            activeToolQueueAbortController = toolAbort;
            let continuationToolUi = null;
            let hasToolResult = false;

            const applyActiveToolSuccessRecord = (record) => {
                if (!record?.ok) return;
                updateActiveToolResultContext(record.resultContext, record.toolCall.mode);
                continuationToolUi = record.toolUi;
                hasToolResult = true;
            };

            const runActiveToolCallSafely = async (toolCall, toolUi, options = {}) => {
                try {
                    if (toolAbort.signal.aborted) throw createAbortReason('Generation cancelled by user');
                    if (options.markRunning !== false) {
                        toolUi.status = 'running';
                        await saveChatHistoryNow();
                    }

                    if (isVectorActiveTool(toolCall.tool) && !memorySettings.enabled) {
                        throw new Error('记忆系统未开启，无法执行向量检索。');
                    }

                    const results = isKeywordActiveTool(toolCall.tool)
                        ? searchDialogueByKeywordForTool(toolCall.query, toolCall.tool.resultCount, {
                            excludeMessageId: assistantMessage.id
                        })
                        : isWebActiveTool(toolCall.tool)
                        ? await searchWebByTavilyForTool(
                            toolCall.query,
                            toolCall.tool,
                            toolAbort.signal
                        )
                        : await searchVectorMemoriesForTool(
                            toolCall.query,
                            toolCall.tool.resultCount,
                            toolAbort.signal
                        );
                    if (toolAbort.signal.aborted) throw createAbortReason('Generation cancelled by user');

                    const resultContext = normalizeActiveToolResultContext(
                        formatActiveToolResultContext(toolCall.tool, toolCall.query, results, toolCall.mode),
                        toolCall.tool,
                        toolCall.query,
                        toolCall.mode
                    );
                    toolUi.status = 'done';
                    toolUi.resultCount = Array.isArray(results) ? results.length : 0;
                    toolUi.resultText = resultContext;
                    await saveChatHistoryNow();
                    return {
                        ok: true,
                        toolCall,
                        toolUi,
                        resultContext
                    };
                } catch (err) {
                    if (err.name === 'AbortError') {
                        return { aborted: true, toolCall, toolUi };
                    }
                    const resultContext = formatActiveToolErrorContext(toolCall.tool, toolCall.query, err, toolCall.mode);
                    toolUi.status = 'error';
                    toolUi.error = err.message || '工具检索失败';
                    toolUi.resultCount = 0;
                    toolUi.resultText = resultContext;
                    await saveChatHistoryNow();
                    return { ok: true, toolCall, toolUi, resultContext, error: err };
                }
            };

            const flushWebToolBatch = async (webBatch) => {
                if (!webBatch.length) return;
                webBatch.forEach(({ toolUi }) => {
                    toolUi.status = 'running';
                });
                await saveChatHistoryNow();

                const records = await Promise.all(webBatch.map(({ toolCall, toolUi }) => (
                    runActiveToolCallSafely(toolCall, toolUi, { markRunning: false })
                )));
                if (records.some(record => record?.aborted)) {
                    throw createAbortReason('Generation cancelled by user');
                }
                records.forEach(applyActiveToolSuccessRecord);
                webBatch.length = 0;
            };

            try {
                const webBatch = [];
                for (let index = 0; index < toolCalls.length; index += 1) {
                    const toolCall = toolCalls[index];
                    const toolUi = toolUis[index];
                    if (isWebActiveTool(toolCall.tool)) {
                        webBatch.push({ toolCall, toolUi });
                        continue;
                    }

                    await flushWebToolBatch(webBatch);
                    const record = await runActiveToolCallSafely(toolCall, toolUi);
                    if (record?.aborted) {
                        markActiveToolInlineWorkCancelled();
                        await saveChatHistoryNow();
                        return false;
                    }
                    applyActiveToolSuccessRecord(record);
                }
                await flushWebToolBatch(webBatch);

                if (!hasToolResult || !continuationToolUi) return false;
                if (toolAbort.signal.aborted) {
                    markActiveToolInlineWorkCancelled();
                    await saveChatHistoryNow();
                    return false;
                }

                if (continuationToolUi.status !== 'error') {
                    continuationToolUi.status = 'continuing';
                }
                cleanupActiveToolCaptureState(assistantMessage);
                activeToolQueueRunning.value = false;
                activeToolContinuationPending.value = true;
                await saveChatHistoryNow();
                await generateResponse(Date.now(), {
                    activeToolDepth: activeToolDepth + 1,
                    continueAssistantMessageId: assistantMessage.id,
                    continuationToolCallId: continuationToolUi.id
                });
                if (continuationToolUi.status === 'continuing') {
                    continuationToolUi.status = 'done';
                }
                await saveChatHistoryNow();
                return true;
            } catch (err) {
                if (err.name === 'AbortError') {
                    markActiveToolInlineWorkCancelled();
                    await saveChatHistoryNow();
                    return false;
                }
                if (assistantMessage) {
                    const errorMessage = err.message || '生成失败';
                    appendAssistantResponseError(assistantMessage, errorMessage);
                    activeToolContinuationHasResponse.value = true;
                    await saveChatHistoryNow();
                }
                return false;
            } finally {
                if (activeToolQueueAbortController === toolAbort) {
                    activeToolQueueAbortController = null;
                }
                activeToolHandoffPending.value = false;
                activeToolQueueRunning.value = false;
                activeToolContinuationPending.value = false;
                cleanupActiveToolCaptureState(assistantMessage);
                await saveChatHistoryNow();
            }
        };
