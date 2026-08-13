// 51-memory-recall.part.js：由 build-app.js 按 setup 依赖顺序组装。
const getVectorMemoryTopK = () => Math.max(
            MEMORY_VECTOR_MIN_TOP_K,
            Math.min(MEMORY_VECTOR_MAX_TOP_K, Number(memorySettings.vectorTopK) || MEMORY_VECTOR_DEFAULT_TOP_K)
        );

        const passesMemorySimilarityThreshold = (score) => {
            const threshold = Number(memorySettings.similarityThreshold) || MEMORY_VECTOR_DEFAULT_SIMILARITY;
            return score >= threshold / 100;
        };

        const getRecentUserMemoryQueries = (limit = 3) => {
            return getPostprocessedChatMessages(chatHistory.value, { includeSystem: false })
                .filter(message => message.role === 'user')
                .map(message => trimMemoryText(getCleanMemoryMessageText(message), 800))
                .filter(Boolean)
                .slice(-Math.max(1, limit));
        };

        const getLatestUserMemoryQuery = () => {
            const queries = getRecentUserMemoryQueries(1);
            return queries[0] || '';
        };

        const buildVectorMemoryQueryText = () => {
            const recentUserQueries = getRecentUserMemoryQueries(1);
            if (recentUserQueries.length === 0) return '';

            const latestUserQuery = recentUserQueries[recentUserQueries.length - 1];
            const previousUserQueries = recentUserQueries.slice(0, -1);

            return [
                `当前问题：用户：${latestUserQuery}`,
                ...[...previousUserQueries].reverse().map((query, index) => {
                    const distance = index + 1;
                    const label = distance === 1 ? '上一轮用户输入' : `前${distance}轮用户输入`;
                    return `${label}：用户：${query}`;
                })
            ].filter(Boolean).join('\n\n');
        };

        const buildFullTurnMemoryText = (turnInfo) => {
            const messagesArray = Array.isArray(turnInfo?.messages) ? turnInfo.messages : [];
            return buildMemoryChunkText(messagesArray, Number.MAX_SAFE_INTEGER);
        };

        const buildMergedVectorMemoryFallbackText = (items) => {
            const orderedItems = sortVectorMemoriesByTime(items);
            let userBlock = '';
            const roleBlocks = [];

            orderedItems.forEach(memory => {
                const text = getVectorMemoryText(memory);
                if (!text) return;

                const roleMarker = '\n角色卡：';
                const roleIndex = text.indexOf(roleMarker);
                if (roleIndex >= 0) {
                    if (!userBlock) userBlock = text.slice(0, roleIndex).trim();
                    const roleText = text.slice(roleIndex + roleMarker.length).trim();
                    if (roleText) roleBlocks.push(roleText);
                    return;
                }

                if (!roleBlocks.includes(text)) roleBlocks.push(text);
            });

            const roleBlock = roleBlocks.filter(Boolean).join('\n\n').trim();
            return [
                userBlock,
                roleBlock ? `角色卡：${roleBlock}` : ''
            ].filter(Boolean).join('\n\n').trim();
        };

        const mergeRepeatedTurnVectorMemories = (items) => {
            const orderedItems = sortVectorMemoriesByTime(items);
            const memoriesByTurn = new Map();

            orderedItems.forEach(memory => {
                const turn = Number(memory?.turn) || 0;
                if (turn <= 0) return;
                if (!memoriesByTurn.has(turn)) memoriesByTurn.set(turn, []);
                memoriesByTurn.get(turn).push(memory);
            });

            const repeatedTurns = new Set(
                [...memoriesByTurn.entries()]
                    .filter(([, turnMemories]) => turnMemories.length >= 2)
                    .map(([turn]) => turn)
            );
            if (repeatedTurns.size === 0) return orderedItems;

            const snapshot = buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false });
            const turnsByNumber = new Map((snapshot.turns || []).map(turnInfo => [Number(turnInfo.turn) || 0, turnInfo]));
            const mergedTurns = new Set();
            const result = [];

            orderedItems.forEach(memory => {
                const turn = Number(memory?.turn) || 0;
                if (!repeatedTurns.has(turn)) {
                    result.push(memory);
                    return;
                }

                if (mergedTurns.has(turn)) return;
                mergedTurns.add(turn);

                const turnMemories = memoriesByTurn.get(turn) || [memory];
                const fullTurnText = buildFullTurnMemoryText(turnsByNumber.get(turn))
                    || buildMergedVectorMemoryFallbackText(turnMemories);
                if (!fullTurnText) return;

                const bestMemory = [...turnMemories].sort((a, b) => (b.vectorScore || 0) - (a.vectorScore || 0))[0] || memory;
                const sequenceValues = turnMemories
                    .map(item => Number(item.sequence) || 0)
                    .filter(sequence => sequence > 0);
                result.push({
                    ...bestMemory,
                    paragraph: fullTurnText,
                    summary: fullTurnText,
                    sourceText: fullTurnText,
                    sequence: sequenceValues.length ? Math.min(...sequenceValues) : bestMemory.sequence,
                    vectorMergedTurn: true
                });
            });

            return result;
        };

        const getRetainedRecentMemoryTurns = (messages) => {
            if (!Array.isArray(messages) || messages.length === 0) return new Set();
            const keepFloors = memorySettings.vectorKeepFloors;

            const retainedStartIndex = Math.max(0, messages.length - keepFloors);
            const snapshot = buildConversationTurnSnapshot(messages, { alreadyPostprocessed: true });
            const retainedTurns = new Set();

            snapshot.turns.forEach(turnInfo => {
                const turn = Number(turnInfo.turn) || 0;
                if (turn <= 0) return;
                const messageIndexes = Array.isArray(turnInfo.messageIndexes) ? turnInfo.messageIndexes : [];
                if (messageIndexes.some(messageIndex => messageIndex >= retainedStartIndex)) {
                    retainedTurns.add(turn);
                }
            });

            return retainedTurns;
        };

        const getCurrentRetainedVectorMemoryTurns = () => getRetainedRecentMemoryTurns(
            getPostprocessedChatMessages(chatHistory.value, { includeSystem: false })
        );

        const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

        const scoreVectorMemories = async (vectorMemories, queryVector, queryTerms, signal) => {
            const scoredMemories = [];
            for (let i = 0; i < vectorMemories.length; i++) {
                if (signal?.aborted) return [];
                const memory = vectorMemories[i];
                const rawScore = cosineSimilarity(queryVector, memory.embedding);
                if (Number.isFinite(rawScore) && rawScore > -1 && passesMemorySimilarityThreshold(rawScore)) {
                    const lexical = getVectorLexicalMatch(memory, queryTerms);
                    scoredMemories.push({
                        memory,
                        vectorRawScore: rawScore,
                        vectorLexicalHits: lexical.hits,
                        vectorLexicalTerms: lexical.matched,
                        vectorScore: rawScore + lexical.boost
                    });
                }
                if (i > 0 && i % 512 === 0) await yieldToBrowser();
            }
            return scoredMemories.sort((a, b) => {
                const scoreDiff = b.vectorScore - a.vectorScore;
                if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
                return (b.memory.turn || 0) - (a.memory.turn || 0);
            });
        };

        const toScoredVectorMemory = (scored) => ({
            ...scored.memory,
            vectorRawScore: scored.vectorRawScore,
            vectorLexicalHits: scored.vectorLexicalHits,
            vectorLexicalTerms: scored.vectorLexicalTerms,
            vectorScore: scored.vectorScore
        });

        const selectVectorMemoriesForContext = async (signal, options = {}) => {
            const excludedTurns = options.excludedTurns instanceof Set
                ? options.excludedTurns
                : new Set(Array.isArray(options.excludedTurns) ? options.excludedTurns : []);
            const vectorMemories = memories.value
                .filter(isEnabledVectorMemory)
                .filter(memory => {
                    const turn = Number(memory.turn) || 0;
                    return turn <= 0 || !excludedTurns.has(turn);
                });

            if (vectorMemories.length === 0) return [];

            const topK = getVectorMemoryTopK();
            const queryText = buildVectorMemoryQueryText();
            const queryTerms = extractVectorQueryTerms(getLatestUserMemoryQuery());
            if (!queryText) return [];

            try {
                const [queryVector] = await requestMemoryEmbeddings([queryText], signal);
                if (signal?.aborted || !isEmbeddingLike(queryVector)) return [];
                const scoredMemories = await scoreVectorMemories(vectorMemories, queryVector, queryTerms, signal);

                const selected = [];
                const seen = new Set();
                for (const scored of scoredMemories) {
                    const fingerprint = getVectorMemoryFingerprint(scored.memory);
                    if (!fingerprint || seen.has(fingerprint)) continue;
                    seen.add(fingerprint);
                    selected.push(toScoredVectorMemory(scored));
                    if (selected.length >= topK) break;
                }
                return selected;
            } catch (err) {
                if (err.name === 'AbortError') return [];
                return [];
            }
        };

        const searchVectorMemories = async () => {
            const query = trimMemoryText(stripVectorMemoryCode(vectorMemorySearchQuery.value), 800);
            vectorMemorySearchError.value = '';
            vectorMemorySearchResults.value = [];

            if (!query) {
                vectorMemorySearchError.value = '先输入一句想查的内容';
                return;
            }

            const excludedTurns = getCurrentRetainedVectorMemoryTurns();
            const vectorMemories = memories.value
                .filter(m => m.vectorMemory === true && m.enabled !== false)
                .filter(m => isEmbeddingLike(m.embedding) && m.embedding.length > 0)
                .filter(memory => {
                    const turn = Number(memory.turn) || 0;
                    return turn <= 0 || !excludedTurns.has(turn);
                });
            if (vectorMemories.length === 0) {
                vectorMemorySearchError.value = '还没有可检索的向量分片';
                return;
            }

            if (_vectorMemorySearchAbort) {
                _vectorMemorySearchAbort.abort();
            }
            const searchAbort = new AbortController();
            _vectorMemorySearchAbort = searchAbort;
            isVectorMemorySearching.value = true;

            try {
                const [queryVector] = await requestMemoryEmbeddings([`用户：${query}`], searchAbort.signal);
                const scoredMemories = [];
                for (let i = 0; i < vectorMemories.length; i++) {
                    if (searchAbort.signal.aborted) {
                        const abortErr = new Error('Aborted');
                        abortErr.name = 'AbortError';
                        throw abortErr;
                    }
                    const memory = vectorMemories[i];
                    const vectorSearchScore = cosineSimilarity(queryVector, memory.embedding);
                    if (Number.isFinite(vectorSearchScore) && vectorSearchScore > -1 && passesMemorySimilarityThreshold(vectorSearchScore)) {
                        scoredMemories.push({ memory, vectorSearchScore });
                    }
                    if (i > 0 && i % 512 === 0) await yieldToBrowser();
                }
                vectorMemorySearchResults.value = scoredMemories
                    .sort((a, b) => {
                        const scoreDiff = b.vectorSearchScore - a.vectorSearchScore;
                        if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
                        return (b.memory.turn || 0) - (a.memory.turn || 0);
                    })
                    .slice(0, 20)
                    .map(item => ({
                        ...item.memory,
                        vectorSearchScore: item.vectorSearchScore
                    }))
                    .sort((a, b) => {
                        const turnDiff = (a.turn || 0) - (b.turn || 0);
                        if (turnDiff !== 0) return turnDiff;
                        return (a.sequence || 0) - (b.sequence || 0);
                    });

                if (vectorMemorySearchResults.value.length === 0) {
                    vectorMemorySearchError.value = '没有找到可展示的向量分片';
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    vectorMemorySearchError.value = err.message || '向量检索失败';
                }
            } finally {
                if (_vectorMemorySearchAbort === searchAbort) {
                    _vectorMemorySearchAbort = null;
                    isVectorMemorySearching.value = false;
                }
            }
        };

        const clearVectorMemorySearch = () => {
            if (_vectorMemorySearchAbort) {
                _vectorMemorySearchAbort.abort();
                _vectorMemorySearchAbort = null;
            }
            vectorMemorySearchQuery.value = '';
            vectorMemorySearchResults.value = [];
            vectorMemorySearchError.value = '';
            isVectorMemorySearching.value = false;
        };

        const searchVectorMemoriesForTool = async (query, limit, signal) => {
            const cleanQuery = trimMemoryText(stripVectorMemoryCode(query), 800);
            if (!cleanQuery) return [];

            const excludedTurns = getCurrentRetainedVectorMemoryTurns();
            const vectorMemories = memories.value
                .filter(isEnabledVectorMemory)
                .filter(memory => isEmbeddingLike(memory.embedding) && memory.embedding.length > 0)
                .filter(memory => {
                    const turn = Number(memory.turn) || 0;
                    return turn <= 0 || !excludedTurns.has(turn);
                });
            if (vectorMemories.length === 0) return [];

            const [queryVector] = await requestMemoryEmbeddings([`工具检索：${cleanQuery}`], signal);
            const queryTerms = extractVectorQueryTerms(cleanQuery);
            return (await scoreVectorMemories(vectorMemories, queryVector, queryTerms, signal))
                .slice(0, Math.max(ACTIVE_TOOL_MIN_RESULT_COUNT, Math.min(ACTIVE_TOOL_MAX_RESULT_COUNT, Number(limit) || ACTIVE_TOOL_DEFAULT_RESULT_COUNT)))
                .map(toScoredVectorMemory);
        };

        const extractKeywordToolTerms = (query) => {
            const cleanQuery = trimMemoryText(stripVectorMemoryCode(query), 300);
            if (!cleanQuery) return [];
            const parts = cleanQuery
                .split(/[\s,，、;；|｜/\\]+/u)
                .map(term => term.trim())
                .filter(Boolean);
            return Array.from(new Set([cleanQuery, ...parts]))
                .filter(term => term.length > 0)
                .slice(0, 12);
        };

        const getKeywordToolMessageText = (message) => {
            if (!message || typeof message.content !== 'string') return '';
            const parsedData = parseCot(message.content || '');
            const cleanMain = stripUiTemplateContextInjection(parsedData.main || '');
            return trimMemoryText(stripVectorMemoryCode(stripDisabledImageGenContext(cleanMain)), 5000);
        };

        const buildKeywordToolSnippet = (text, matchedTerms) => {
            const source = String(text || '').trim();
            if (source.length <= 1400) return source;
            const lowerSource = source.toLowerCase();
            const firstIndex = matchedTerms
                .map(term => lowerSource.indexOf(String(term || '').toLowerCase()))
                .filter(index => index >= 0)
                .sort((a, b) => a - b)[0] ?? 0;
            const start = Math.max(0, firstIndex - 420);
            const end = Math.min(source.length, firstIndex + 900);
            return `${start > 0 ? '...' : ''}${source.slice(start, end).trim()}${end < source.length ? '...' : ''}`;
        };

        const searchDialogueByKeywordForTool = (query, limit, options = {}) => {
            const terms = extractKeywordToolTerms(query);
            if (terms.length === 0) return [];
            const lowerTerms = terms.map(term => term.toLowerCase());
            const messages = getPostprocessedChatMessages(chatHistory.value, { includeSystem: false });
            const snapshot = buildConversationTurnSnapshot(messages, { alreadyPostprocessed: true });
            const turnByMessageIndex = new Map();
            (snapshot.turns || []).forEach(turnInfo => {
                (turnInfo.messageIndexes || []).forEach(messageIndex => {
                    turnByMessageIndex.set(messageIndex, turnInfo.turn);
                });
            });

            const scored = [];
            messages.forEach((message, index) => {
                if (!message || message.role === 'system') return;
                if (options.excludeMessageId && message.id === options.excludeMessageId) return;
                const text = getKeywordToolMessageText(message);
                if (!text || isRoleMemoryContextContent(text) || text.includes('<active_tool_results>')) return;

                const lowerText = text.toLowerCase();
                const matchedTerms = terms.filter((term, termIndex) => lowerText.includes(lowerTerms[termIndex]));
                if (matchedTerms.length === 0) return;

                const fullQueryMatched = lowerText.includes(lowerTerms[0]);
                const roleLabel = message.role === 'user' ? '用户' : '角色卡';
                const speaker = message.name || (message.role === 'user' ? user.name : currentCharacter.value?.name) || roleLabel;
                scored.push({
                    turn: turnByMessageIndex.get(index) || getConversationTurnAtIndexFromSnapshot(snapshot, index) || '?',
                    role: message.role,
                    speaker,
                    matchedTerms,
                    score: (fullQueryMatched ? 100 : 0) + matchedTerms.length,
                    messageIndex: index,
                    dialogueText: `${roleLabel}：${buildKeywordToolSnippet(text, matchedTerms)}`
                });
            });

            return scored
                .sort((a, b) => {
                    const scoreDiff = b.score - a.score;
                    if (scoreDiff !== 0) return scoreDiff;
                    return b.messageIndex - a.messageIndex;
                })
                .slice(0, Math.max(ACTIVE_TOOL_MIN_RESULT_COUNT, Math.min(ACTIVE_TOOL_MAX_RESULT_COUNT, Number(limit) || ACTIVE_TOOL_DEFAULT_RESULT_COUNT)))
                .sort((a, b) => a.messageIndex - b.messageIndex);
        };

        const getTavilyErrorDetailText = (detail) => {
            if (detail === null || detail === undefined) return '';
            if (typeof detail === 'string') return detail.trim();
            if (typeof detail === 'number' || typeof detail === 'boolean') return String(detail);
            if (Array.isArray(detail)) {
                return detail
                    .map(item => getTavilyErrorDetailText(item))
                    .filter(Boolean)
                    .join('；');
            }
            if (typeof detail === 'object') {
                const directKeys = ['msg', 'message', 'error_message', 'error', 'detail', 'reason', 'description'];
                for (const key of directKeys) {
                    const text = getTavilyErrorDetailText(detail[key]);
                    if (text) return text;
                }
                return stringifyErrorDetail(detail).trim();
            }
            return String(detail).trim();
        };

        const buildTavilyErrorMessage = (response, data) => {
            const detail = data?.detail ?? data?.message ?? data?.error ?? data?.error_message;
            const message = getTavilyErrorDetailText(detail);
            if (response.status === 401) return 'Tavily API Key 无效，请检查工具设置里的 API Key。';
            if (response.status === 429) return 'Tavily 请求太频繁或额度不足，请稍后再试。';
            if (response.status === 432 || response.status === 433) return message || 'Tavily 账户额度或权限不足。';
            return message || `Tavily 搜索失败：HTTP ${response.status}`;
        };

        const requestTavily = async (endpoint, apiKey, body, signal) => {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal
            });
            const data = await response.json().catch(() => ({}));
            return { response, data };
        };

        const normalizeTavilyExtractUrl = (value) => {
            let text = String(value || '').trim().replace(/[，。；、）)\].,;]+$/g, '');
            if (!text) return '';
            if (/^www\./i.test(text)) text = `https://${text}`;
            try {
                const url = new URL(text);
                if (!['http:', 'https:'].includes(url.protocol)) return '';
                return url.href;
            } catch (err) {
                return '';
            }
        };

        const extractWebUrlsFromToolQuery = (query) => {
            const matches = String(query || '').match(/https?:\/\/[^\s<>"'，。；、）)\]]+|www\.[^\s<>"'，。；、）)\]]+/gi) || [];
            const urls = matches
                .map(normalizeTavilyExtractUrl)
                .filter(Boolean);
            return [...new Set(urls)].slice(0, ACTIVE_TOOL_TAVILY_EXTRACT_MAX_URLS);
        };

        const getWebTitleFromUrl = (url) => {
            try {
                return new URL(url).hostname || url;
            } catch (err) {
                return url || '网页';
            }
        };

        const extractWebPagesByTavilyForTool = async (urls, tool, signal) => {
            const apiKey = String(tool?.tavilyApiKey || '').trim();
            if (!apiKey) {
                throw new Error('请先在工具设置里填写 Tavily API Key。');
            }

            const body = {
                urls: urls.length === 1 ? urls[0] : urls,
                extract_depth: ACTIVE_TOOL_TAVILY_SEARCH_DEPTH,
                format: 'markdown',
                include_favicon: true,
                timeout: 30
            };

            const { response, data } = await requestTavily(ACTIVE_TOOL_TAVILY_EXTRACT_ENDPOINT, apiKey, body, signal);
            if (!response.ok) {
                throw new Error(buildTavilyErrorMessage(response, data).replace('搜索失败', '网页读取失败'));
            }

            const results = (Array.isArray(data.results) ? data.results : [])
                .map((item, index) => {
                    const url = String(item?.url || urls[index] || '').trim();
                    return {
                        index: index + 1,
                        title: String(item?.title || getWebTitleFromUrl(url)).trim(),
                        url,
                        content: trimMemoryText(item?.raw_content || item?.content || '', 6000),
                        favicon: item?.favicon || '',
                        sourceType: 'extract'
                    };
                })
                .filter(item => item.url || item.content);
            results.tavilyMode = 'extract';
            results.tavilyResponseTime = data.response_time || '';
            results.tavilyFailedResults = Array.isArray(data.failed_results)
                ? data.failed_results.map(item => ({
                    url: String(item?.url || '').trim(),
                    error: getTavilyErrorDetailText(item?.error ?? item?.message ?? item?.detail)
                }))
                : [];
            return results;
        };

        const searchWebByTavilyForTool = async (query, tool, signal) => {
            const cleanQuery = trimMemoryText(query, 800);
            if (!cleanQuery) return [];
            const extractUrls = extractWebUrlsFromToolQuery(cleanQuery);
            if (extractUrls.length > 0) {
                return extractWebPagesByTavilyForTool(extractUrls, tool, signal);
            }

            const apiKey = String(tool?.tavilyApiKey || '').trim();
            if (!apiKey) {
                throw new Error('请先在工具设置里填写 Tavily API Key。');
            }

            const maxResults = Math.max(ACTIVE_TOOL_MIN_RESULT_COUNT, Math.min(ACTIVE_TOOL_MAX_RESULT_COUNT, Number(tool?.resultCount) || ACTIVE_TOOL_DEFAULT_RESULT_COUNT));
            const body = {
                query: cleanQuery,
                search_depth: ACTIVE_TOOL_TAVILY_SEARCH_DEPTH,
                max_results: maxResults,
                topic: 'general',
                include_favicon: true
            };

            const { response, data } = await requestTavily(ACTIVE_TOOL_TAVILY_ENDPOINT, apiKey, body, signal);
            if (!response.ok) {
                throw new Error(buildTavilyErrorMessage(response, data));
            }

            const results = (Array.isArray(data.results) ? data.results : [])
                .slice(0, maxResults)
                .map((item, index) => ({
                    index: index + 1,
                    title: String(item?.title || '未命名网页').trim(),
                    url: String(item?.url || '').trim(),
                    content: trimMemoryText(item?.content || '', 1800),
                    score: Number(item?.score),
                    publishedDate: item?.published_date || item?.publishedDate || '',
                    favicon: item?.favicon || '',
                    sourceType: 'search'
                }));
            results.tavilyMode = 'search';
            results.tavilyResponseTime = data.response_time || '';
            return results;
        };

        const resetActiveToolResultContext = () => {
            activeToolResultContexts.value = [];
            pendingActiveToolContext.value = '';
        };

        const buildActiveToolResultPayload = () => {
            const blocks = activeToolResultContexts.value.filter(Boolean);
            if (blocks.length === 0) return '';
            return [
                '<active_tool_results>',
                '  <description>以下是本轮正文工具调用返回的记录，可能包含有效结果、空结果或错误。本段内容由系统插入最后一条用户消息结尾。追加调用会保留并追加旧记录，覆盖调用会替换旧记录；只有包含实际片段、网页等证据的记录才算检索成功。请把有效证据作为参考继续回答，不要复述工具调用标签。</description>',
                blocks.join('\n\n'),
                '</active_tool_results>'
            ].join('\n');
        };

        const updateActiveToolResultContext = (resultContext, mode = 'add') => {
            if (!resultContext) {
                pendingActiveToolContext.value = buildActiveToolResultPayload();
                return;
            }
            if (mode === 'cover') {
                activeToolResultContexts.value = [resultContext];
            } else {
                activeToolResultContexts.value = [...activeToolResultContexts.value, resultContext];
            }
            pendingActiveToolContext.value = buildActiveToolResultPayload();
        };

        const formatActiveToolNoticeContext = (tool, query, mode = 'add', status = 'empty', message = '') => {
            const title = escapeXmlAttribute(tool?.name || '工具');
            const modeValue = mode === 'cover' ? 'cover' : 'add';
            const labels = getActiveToolCallLabels(tool || createDefaultActiveTool());
            const callName = escapeXmlAttribute(modeValue === 'cover' ? labels.cover : labels.add);
            const cleanQuery = trimMemoryText(query, 800);
            const statusValue = escapeXmlAttribute(status || 'notice');
            const messageText = escapeXmlText(message || '工具没有返回可用内容。');
            const bodyTag = status === 'error' ? 'error' : 'description';
            return [
                `<active_tool_result name="${title}" call="${callName}" mode="${modeValue}" query="${escapeXmlAttribute(cleanQuery)}" status="${statusValue}">`,
                `  <${bodyTag}>`,
                indentXmlText(messageText, 4),
                `  </${bodyTag}>`,
                '</active_tool_result>'
            ].join('\n');
        };

        const normalizeActiveToolResultContext = (resultContext, tool, query, mode = 'add') => {
            const text = String(resultContext || '').trim();
            const hasResultBody = /<(?:description|error|memory_fragment|dialogue_fragment|web_source|web_page|failed_page)\b/i.test(text);
            if (!text || text === '</active_tool_result>' || !text.includes('<active_tool_result') || !hasResultBody) {
                return formatActiveToolNoticeContext(
                    tool,
                    query,
                    mode,
                    'empty',
                    '工具调用已经完成，但没有返回可用内容。请先判断当前上下文是否足够；如果仍不够，请换更具体的检索内容继续调用工具。'
                );
            }
            return text;
        };

        const formatActiveToolErrorContext = (tool, query, err, mode = 'add') => {
            const message = err?.message || String(err || '') || '工具调用失败';
            return formatActiveToolNoticeContext(
                tool,
                query,
                mode,
                'error',
                `工具调用出错：${message}\n这不是用户要求的最终答案。请不要停止生成；先基于当前上下文和已有工具结果继续回答。若信息仍不足，可以换更具体的检索内容再次调用工具。`
            );
        };

        const formatWebResultItems = (items, tagName, getExtraAttributes = () => []) => items.map(item => {
            const attributes = [
                `index="${escapeXmlAttribute(item.index || '')}"`,
                `title="${escapeXmlAttribute(item.title || '')}"`,
                `url="${escapeXmlAttribute(item.url || '')}"`,
                ...getExtraAttributes(item)
            ];
            const contentText = indentXmlText(item.content || '', 4);
            return [
                `  <${tagName} ${attributes.join(' ')}>`,
                contentText ? `    <content>\n${contentText}\n    </content>` : '',
                `  </${tagName}>`
            ].filter(Boolean).join('\n');
        }).join('\n\n');

        const formatActiveToolResultContext = (tool, query, results, mode = 'add') => {
            const title = escapeXmlAttribute(tool.name || '工具');
            const modeValue = mode === 'cover' ? 'cover' : 'add';
            const labels = getActiveToolCallLabels(tool);
            const callName = escapeXmlAttribute(modeValue === 'cover' ? labels.cover : labels.add);
            const cleanQuery = trimMemoryText(query, 800);
            const modeDescription = modeValue === 'cover'
                ? '本次调用模式为覆盖：系统会用本次结果替换本轮此前已检索的工具结果。'
                : '本次调用模式为追加：系统会把本次结果追加到本轮此前已检索的工具结果后。';
            if (isWebActiveTool(tool)) {
                const responseTime = results?.tavilyResponseTime
                    ? ` response_time="${escapeXmlAttribute(results.tavilyResponseTime)}"`
                    : '';
                const webMode = results?.tavilyMode === 'extract' ? 'extract' : 'search';

                if (!Array.isArray(results) || results.length === 0) {
                    const emptyDescription = webMode === 'extract'
                        ? `本次网页读取没有检索成功，没有抽取到可用正文，也没有提供可作为答案依据的新证据。${modeDescription}本段内容已插入最后一条用户消息结尾。请先判断当前搜索摘要和上下文是否已经足够；如果仍不够，请换另一个更可靠的来源链接或重新搜索，不要编造网页正文没有支持的信息。`
                        : `本次联网搜索没有检索成功，没有找到可用网页结果，也没有提供可作为答案依据的新证据。${modeDescription}本段内容已插入最后一条用户消息结尾。请先判断当前上下文是否已经足够；如果仍不够，请换更具体的作品名、角色名、站点名、别名或语言关键词再次调用，不要编造搜索结果没有支持的信息。`;
                    return [
                        `<active_tool_result name="${title}" call="${callName}" mode="${modeValue}" query="${escapeXmlAttribute(cleanQuery)}" status="empty" web_mode="${webMode}"${responseTime}>`,
                        `  <description>${emptyDescription}</description>`,
                        '</active_tool_result>'
                    ].join('\n');
                }

                if (webMode === 'extract') {
                    const formattedPages = formatWebResultItems(results, 'web_page');

                    const failedPages = (Array.isArray(results.tavilyFailedResults) ? results.tavilyFailedResults : [])
                        .filter(item => item.url || item.error)
                        .map(item => `  <failed_page url="${escapeXmlAttribute(item.url || '')}" error="${escapeXmlAttribute(item.error || '网页读取失败')}"></failed_page>`)
                        .join('\n');

                    return [
                        `<active_tool_result name="${title}" call="${callName}" mode="${modeValue}" query="${escapeXmlAttribute(cleanQuery)}" web_mode="extract"${responseTime}>`,
                        `  <description>以下是系统进入网页链接后通过 Tavily Extract 读取到的网页正文。${modeDescription}本段内容由系统插入最后一条用户消息结尾。请优先依据网页正文继续回答；不要把正文没有支持的内容说成事实。如果正文仍不足以确认，请回到搜索结果选择另一个可靠来源链接，或换更具体的关键词继续搜索。</description>`,
                        formattedPages,
                        failedPages,
                        '</active_tool_result>'
                    ].filter(Boolean).join('\n');
                }

                const formattedResults = formatWebResultItems(results, 'web_source', item => [
                    Number.isFinite(item.score) ? `score="${escapeXmlAttribute(item.score.toFixed(4))}"` : '',
                    item.publishedDate ? `published_date="${escapeXmlAttribute(item.publishedDate)}"` : ''
                ].filter(Boolean));

                return [
                    `<active_tool_result name="${title}" call="${callName}" mode="${modeValue}" query="${escapeXmlAttribute(cleanQuery)}" web_mode="search"${responseTime}>`,
                    `  <description>以下是系统通过 Tavily 联网搜索得到的网页资料。${modeDescription}本段内容由系统插入最后一条用户消息结尾。请优先依据这些标题、链接和摘要继续回答；不要把搜索结果没有支持的内容说成事实。如果摘要仍不足以明确回答，请从结果中选择一个或多个最相关的真实 URL，追加调用 <${callName}:该URL> 进入网页读取正文，或换更具体的关键词继续搜索。可以多行调用多个 URL，系统会按顺序追加结果。</description>`,
                    formattedResults,
                    '</active_tool_result>'
                ].filter(Boolean).join('\n');
            }
            if (isKeywordActiveTool(tool)) {
                if (!Array.isArray(results) || results.length === 0) {
                    return [
                        `<active_tool_result name="${title}" call="${callName}" mode="${modeValue}" query="${escapeXmlAttribute(cleanQuery)}" status="empty">`,
                        `  <description>本次关键词检索没有检索成功，没有找到包含该关键词的对话片段，也没有提供可作为答案依据的新证据。${modeDescription}本段内容已插入最后一条用户消息结尾。请换更贴近原文的关键词再次调用，不要编造未出现过的对话内容。</description>`,
                        '</active_tool_result>'
                    ].join('\n');
                }

                const formattedResults = results.map(item => {
                    const turnValue = escapeXmlAttribute(item.turn || '?');
                    const roleValue = escapeXmlAttribute(item.role || 'unknown');
                    const speakerValue = escapeXmlAttribute(item.speaker || '');
                    const matchedValue = escapeXmlAttribute((item.matchedTerms || []).join(', '));
                    const fragmentText = indentXmlText(item.dialogueText || '', 4);
                    return [
                        `  <dialogue_fragment turn="${turnValue}" role="${roleValue}" speaker="${speakerValue}" matched="${matchedValue}">`,
                        fragmentText,
                        '  </dialogue_fragment>'
                    ].join('\n');
                }).join('\n\n');

                return [
                    `<active_tool_result name="${title}" call="${callName}" mode="${modeValue}" query="${escapeXmlAttribute(cleanQuery)}">`,
                    `  <description>以下是系统根据关键词从当前对话历史中精确抓取到的原文片段。${modeDescription}本段内容由系统插入最后一条用户消息结尾。请优先依据这些原文片段继续回答，不要把没有出现过的内容说成事实；如果仍不足以明确回答，请换更贴近原文的关键词继续调用工具。</description>`,
                    formattedResults,
                    '</active_tool_result>'
                ].join('\n');
            }
            if (!Array.isArray(results) || results.length === 0) {
                return [
                    `<active_tool_result name="${title}" call="${callName}" mode="${modeValue}" query="${escapeXmlAttribute(cleanQuery)}" status="empty">`,
                    `  <description>本次向量记忆没有检索成功，没有找到可用记忆片段，也没有提供可作为答案依据的新证据。${modeDescription}本段内容已插入最后一条用户消息结尾。请先判断当前上下文是否已经明确且足够；如果仍不够明确完整，请换更具体的检索内容再次调用，不要重复完全相同的查询。</description>`,
                    '</active_tool_result>'
                ].join('\n');
            }

            const formattedResults = sortVectorMemoriesByTime(results).map(memory => {
                const turnValue = escapeXmlAttribute(memory.turn || '?');
                const scoreValue = escapeXmlAttribute(Number.isFinite(memory.vectorScore)
                    ? `${(memory.vectorScore * 100).toFixed(1)}%`
                    : 'unknown');
                const fragmentText = indentXmlText(memory.paragraph || memory.summary || memory.sourceText || '', 4);
                return [
                    `  <memory_fragment turn="${turnValue}" similarity="${scoreValue}">`,
                    fragmentText,
                    '  </memory_fragment>'
                ].join('\n');
            }).join('\n\n');

            return [
                `<active_tool_result name="${title}" call="${callName}" mode="${modeValue}" query="${escapeXmlAttribute(cleanQuery)}">`,
                `  <description>以下是系统根据上一条正文工具调用检索到的向量记忆。${modeDescription}本段内容由系统插入最后一条用户消息结尾。请用这些结果继续回答用户，不要复述工具调用标签，也不要把这些内容当作当前现场；如果结果仍不足以明确回答，或仍有疑点，请换更具体的检索内容继续调用工具。</description>`,
                formattedResults,
                '</active_tool_result>'
            ].join('\n');
        };

        const stripCodeBlocksForToolDetection = (text) => String(text || '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/~~~[\s\S]*?~~~/g, '');

        const escapeRegexText = (value) => String(value || '').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

        const cleanActiveToolCallReason = (value) => String(value || '')
            .replace(/<\/\s*reason\s*>?\s*$/i, '')
            .trim();

        const getActiveToolCallReasonMeta = (content, callIndex) => {
            const beforeCall = String(content || '').slice(0, Math.max(0, callIndex));
            const match = beforeCall.match(/<\s*reason\s*[:：]\s*([\s\S]*?)(?:>\s*|<\/\s*reason\s*>?\s*)$/i)
                || beforeCall.match(/<\s*reason\s*>\s*([\s\S]*?)<\/\s*reason\s*>\s*$/i);
            const reason = cleanActiveToolCallReason(match?.[1]);
            if (!match || !reason) return { reason: '', rawPrefix: '', mainIndex: callIndex };
            return {
                reason,
                rawPrefix: match[0],
                mainIndex: callIndex - match[0].length
            };
        };

        const buildActiveToolCallMeta = (originalContent, mainContent, toolRaw, callIndex) => {
            const reasonMeta = getActiveToolCallReasonMeta(mainContent, callIndex);
            const raw = `${reasonMeta.rawPrefix}${toolRaw}`;
            const originalIndex = originalContent.indexOf(raw, Math.max(0, reasonMeta.mainIndex));
            const toolIndex = originalContent.indexOf(toolRaw, callIndex);
            return {
                reason: reasonMeta.reason,
                raw: originalIndex >= 0 ? raw : toolRaw,
                toolRaw,
                index: originalIndex >= 0 ? originalIndex : (toolIndex >= 0 ? toolIndex : callIndex),
                mainIndex: reasonMeta.mainIndex
            };
        };
