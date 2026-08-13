// 12-state-tools.part.js：由 build-app.js 按 setup 依赖顺序组装。
// --- Active Tool System State ---
        const ACTIVE_TOOL_VECTOR_TYPE = 'vector_memory';
        const ACTIVE_TOOL_KEYWORD_TYPE = 'keyword_dialogue';
        const ACTIVE_TOOL_WEB_TYPE = 'web_search';
        const ACTIVE_TOOL_MIN_RESULT_COUNT = 5;
        const ACTIVE_TOOL_DEFAULT_RESULT_COUNT = 5;
        const ACTIVE_TOOL_MAX_RESULT_COUNT = 10;
        const ACTIVE_TOOL_RESULT_COUNT_VERSION = 4;
        const ACTIVE_TOOL_MAX_AUTO_CONTINUE = 4;
        const ACTIVE_TOOL_AGGRESSIVENESS_FORCE = 'force';
        const ACTIVE_TOOL_AGGRESSIVENESS_ACTIVE = 'active';
        const ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE = 'adaptive';
        const ACTIVE_TOOL_AGGRESSIVENESS_VERSION = 2;
        const ACTIVE_TOOL_AGGRESSIVENESS_OPTIONS = Object.freeze([
            { value: ACTIVE_TOOL_AGGRESSIVENESS_FORCE, label: '强制' },
            { value: ACTIVE_TOOL_AGGRESSIVENESS_ACTIVE, label: '积极' },
            { value: ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE, label: '自适应' }
        ]);
        const ACTIVE_TOOL_REMINDERS = Object.freeze({
            [ACTIVE_TOOL_AGGRESSIVENESS_FORCE]: '正式回复前必须先调用至少 1 个最相关工具；没有 <active_tool_results> 前不要直接输出正文。',
            [ACTIVE_TOOL_AGGRESSIVENESS_ACTIVE]: '积极补全不确定信息；人设、剧情、记忆、事实、前文细节或用户暗指内容不明确时先调用工具，上下文完全足够时可直接回复。',
            [ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE]: '上下文足够时直接回复；信息不完整、可能遗忘，或工具结果明显能提升准确性时再调用工具。'
        });
        const normalizeActiveToolAggressiveness = (value) => (
            ACTIVE_TOOL_AGGRESSIVENESS_OPTIONS.some(option => option.value === value)
                ? value
                : ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE
        );
        const getActiveToolAggressiveness = () => {
            const normalized = normalizeActiveToolAggressiveness(settings.activeToolAggressiveness);
            if (settings.activeToolAggressiveness !== normalized) {
                settings.activeToolAggressiveness = normalized;
            }
            return normalized;
        };
        const getActiveToolAggressivenessLabel = () => (
            ACTIVE_TOOL_AGGRESSIVENESS_OPTIONS.find(option => option.value === getActiveToolAggressiveness())?.label || '自适应'
        );
        const getActiveToolLatestUserReminder = () => ACTIVE_TOOL_REMINDERS[getActiveToolAggressiveness()];
        const normalizeActiveToolAggressivenessSettings = () => {
            const aggressivenessVersion = Number(settings.activeToolAggressivenessVersion) || 1;
            settings.activeToolAggressiveness = normalizeActiveToolAggressiveness(settings.activeToolAggressiveness);
            if (aggressivenessVersion < ACTIVE_TOOL_AGGRESSIVENESS_VERSION
                && settings.activeToolAggressiveness === ACTIVE_TOOL_AGGRESSIVENESS_ACTIVE) {
                settings.activeToolAggressiveness = ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE;
            }
            settings.activeToolAggressivenessVersion = ACTIVE_TOOL_AGGRESSIVENESS_VERSION;
        };
        const ACTIVE_TOOL_DEFAULT_DESCRIPTION = '当需要长期记忆、旧剧情、历史设定、过往关系、人物状态、物品来历或用户暗指内容时，单独输出 <tool_memory_add:检索内容> 或 <tool_memory_cover:检索内容>。每行一个标签，单次回复最多 5 个工具标签，不写说明或 COT；多个独立信息点拆开查，优先最关键的信息点，检索词要具体，优先人物、事件、物品、地点和时间线。没有当前上下文或检索结果支持的设定、关系、状态和事件不要编造。本轮第一次检索一律用 add；看到工具结果后，若是补充不同证据且旧结果有用就 add；若旧结果偏题、太宽、重复、方向错误、噪声过多，或更具体检索能替代旧结果，应优先用 cover 清理上下文冗余，把注意力集中在更准确的记忆上。结果足够就继续正文，不够就换更具体的问题继续查。';
        const ACTIVE_TOOL_DEFAULT_DISPLAY_DESCRIPTION = '让角色在上下文信息不够明确时，主动检索向量记忆，适合找旧剧情、历史设定、人物关系、物品来历和用户暗指过的内容。';
        const ACTIVE_TOOL_GREP_DEFAULT_DESCRIPTION = '当需要精准抓取当前对话历史里的原文内容时，单独输出 <tool_grep_add:关键词> 或 <tool_grep_cover:关键词>。关键词要尽量写原文可能出现的词，适合找台词、名称、物品、地点、设定词、前文原句或具体细节。多个独立信息点必须拆开，每行一个标签，单次回复最多 5 个工具标签，不写说明或 COT。本轮第一次关键词检索一律用 add；看到结果后，若旧结果有用且需要保留就 add；若旧关键词结果偏题、太宽、重复、噪声过多，或更准确关键词能替代旧结果，应优先用 cover 清理冗余原文片段，避免旧结果分散注意力。';
        const ACTIVE_TOOL_GREP_DEFAULT_DISPLAY_DESCRIPTION = '按关键词精准抓取当前对话历史里的原文片段，适合找台词、名称、物品、地点和具体前文。';
        const ACTIVE_TOOL_WEB_DEFAULT_DESCRIPTION = '当本地上下文、角色记忆、关键词检索都不足以确认作品设定、同人资料、冷门角色、现实最新信息或网页资料时，单独输出 <tool_web_add:联网搜索内容或网页链接> 或 <tool_web_cover:联网搜索内容或网页链接>。先用具体关键词搜索，再按需读取真实 URL；查询优先包含作品名、角色名、设定名、站点、语言关键词或别名。多个独立信息点必须拆开，单次回复最多 5 个工具标签。本轮第一次联网搜索或首次读取 URL 一律用 add；看到结果后，若旧结果有用且需要保留就 add；若搜索结果偏题、太宽、重复、来源噪声多，或新搜索/网页读取能替代旧结果，应优先用 cover 清理上下文冗余，避免无关网页摘要干扰判断。';
        const ACTIVE_TOOL_WEB_DEFAULT_DISPLAY_DESCRIPTION = '通过 Tavily 联网搜索补充外部资料，也能进入链接读取网页详情，适合同人设定、作品百科、冷门角色和最新信息。';
        const ACTIVE_TOOL_TAVILY_ENDPOINT = 'https://api.tavily.com/search';
        const ACTIVE_TOOL_TAVILY_EXTRACT_ENDPOINT = 'https://api.tavily.com/extract';
        const ACTIVE_TOOL_TAVILY_SEARCH_DEPTH = 'advanced';
        const ACTIVE_TOOL_TAVILY_EXTRACT_MAX_URLS = ACTIVE_TOOL_DEFAULT_RESULT_COUNT;
        const createDefaultActiveTool = () => ({
            id: 'tool_memory',
            name: '向量记忆主动检索',
            enabled: false,
            type: ACTIVE_TOOL_VECTOR_TYPE,
            callName: 'tool_memory',
            resultCount: ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
            resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
            description: ACTIVE_TOOL_DEFAULT_DESCRIPTION,
            displayDescription: ACTIVE_TOOL_DEFAULT_DISPLAY_DESCRIPTION
        });
        const createDefaultGrepTool = () => ({
            id: 'tool_grep',
            name: '关键词检索',
            enabled: false,
            type: ACTIVE_TOOL_KEYWORD_TYPE,
            callName: 'tool_grep',
            resultCount: ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
            resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
            description: ACTIVE_TOOL_GREP_DEFAULT_DESCRIPTION,
            displayDescription: ACTIVE_TOOL_GREP_DEFAULT_DISPLAY_DESCRIPTION
        });
        const createDefaultWebTool = () => ({
            id: 'tool_web',
            name: 'Tavily 联网搜索',
            enabled: false,
            type: ACTIVE_TOOL_WEB_TYPE,
            callName: 'tool_web',
            resultCount: ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
            resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
            description: ACTIVE_TOOL_WEB_DEFAULT_DESCRIPTION,
            displayDescription: ACTIVE_TOOL_WEB_DEFAULT_DISPLAY_DESCRIPTION,
            tavilyApiKey: ''
        });
        const getDefaultActiveToolDefinitions = () => [
            createDefaultActiveTool(),
            createDefaultGrepTool(),
            createDefaultWebTool(),
        ];
        const activeTools = ref(getDefaultActiveToolDefinitions());

        const normalizeKeepFloors = (value, min, max, fallback) => {
            const floors = Number(value);
            if (!Number.isFinite(floors)) return fallback;
            return Math.max(min, Math.min(max, Math.round(floors / 2) * 2));
        };

        const normalizeClassicMemoryConcurrency = (value) => {
            const concurrency = Number(value);
            if (!Number.isFinite(concurrency)) return CLASSIC_MEMORY_DEFAULT_CONCURRENCY;
            return Math.max(CLASSIC_MEMORY_MIN_CONCURRENCY, Math.min(CLASSIC_MEMORY_MAX_CONCURRENCY, Math.round(concurrency)));
        };

        const normalizeMemorySettings = () => {
            if (!memorySettings.classicModel && memorySettings.model) {
                memorySettings.classicModel = String(memorySettings.model).trim();
            }
            ['model', 'autoExtract', 'keepFloors', `re${'rankEnabled'}`, `re${'rankModel'}`].forEach(key => {
                delete memorySettings[key];
            });
            memorySettings.mode = memorySettings.mode === MEMORY_MODE_CLASSIC
                ? MEMORY_MODE_CLASSIC
                : memorySettings.mode === MEMORY_MODE_VECTOR
                    ? MEMORY_MODE_VECTOR
                    : MEMORY_MODE_CLASSIC;
            memorySettings.classicModel = String(memorySettings.classicModel || '').trim();
            memorySettings.vectorKeepFloors = normalizeKeepFloors(
                memorySettings.vectorKeepFloors,
                VECTOR_KEEP_FLOORS_MIN,
                VECTOR_KEEP_FLOORS_MAX,
                VECTOR_KEEP_FLOORS_DEFAULT
            );
            memorySettings.summaryKeepFloors = normalizeKeepFloors(
                memorySettings.summaryKeepFloors,
                SUMMARY_KEEP_FLOORS_MIN,
                SUMMARY_KEEP_FLOORS_MAX,
                SUMMARY_KEEP_FLOORS_DEFAULT
            );
            memorySettings.classicConcurrency = normalizeClassicMemoryConcurrency(memorySettings.classicConcurrency);
            const vectorTopK = Number(memorySettings.vectorTopK);
            memorySettings.vectorTopK = Number.isFinite(vectorTopK)
                ? Math.max(MEMORY_VECTOR_MIN_TOP_K, Math.min(MEMORY_VECTOR_MAX_TOP_K, vectorTopK))
                : MEMORY_VECTOR_DEFAULT_TOP_K;
            const similarityThreshold = Number(memorySettings.similarityThreshold);
            memorySettings.similarityThreshold = Number.isFinite(similarityThreshold)
                ? Math.max(MEMORY_VECTOR_MIN_SIMILARITY, Math.min(MEMORY_VECTOR_MAX_SIMILARITY, Math.round(similarityThreshold)))
                : MEMORY_VECTOR_DEFAULT_SIMILARITY;
            memorySettings.defaultDepth = MEMORY_VECTOR_DEFAULT_DEPTH;
        };

        const normalizeActiveToolCallName = (value) => {
            const raw = String(value || '').trim();
            const matched = raw.match(/^<\s*([^:\s>]+)\s*:/);
            const source = matched ? matched[1] : raw;
            return source
                .replace(/[<>：:]/g, '')
                .replace(/\s+/g, '_')
                .trim() || 'tool_memory';
        };

        const normalizeActiveToolBaseCallName = (value) => normalizeActiveToolCallName(value)
            .replace(/_(?:add|cover)$/i, '');

        const getActiveToolResultCountMin = () => ACTIVE_TOOL_MIN_RESULT_COUNT;

        const getActiveToolResultCountMax = () => ACTIVE_TOOL_MAX_RESULT_COUNT;

        const normalizeActiveTool = (tool = {}) => {
            const resultCount = Number(tool.resultCount);
            const rawCallName = normalizeActiveToolBaseCallName(tool.callName || tool.callPattern || 'tool_memory');
            const removedWorldToolNames = [
                'tool_world',
                'tool_world_add',
                'tool_world_cover',
                'tool_world_list',
                'tool_world_read',
                'tool_world_edit'
            ];
            const isRemovedWorldTool = removedWorldToolNames.includes(rawCallName)
                || ['world_info', 'world_info_list', 'world_info_read', 'world_info_edit'].includes(tool.type)
                || removedWorldToolNames.includes(tool.id);
            if (isRemovedWorldTool) {
                return null;
            }
            const isLegacyWebTool = rawCallName === 'tool_web'
                || ['web_search', 'tavily', 'tavily_search'].includes(tool.type)
                || ['tool_web', 'tool_web_add', 'tool_web_cover'].includes(tool.id)
                || /tavily|联网搜索/i.test(String(tool.name || ''));
            const callName = isLegacyWebTool ? 'tool_web' : rawCallName;
            const defaultTool = getDefaultActiveToolDefinitions()
                .find(item => item.id === (isLegacyWebTool ? 'tool_web' : tool.id) || item.callName === callName);
            const fallback = defaultTool || createDefaultActiveTool();
            const normalizedCallName = defaultTool ? defaultTool.callName : callName;
            const resultCountVersion = Number(tool.resultCountVersion) || 1;
            const isDefaultTool = !!defaultTool;
            const normalizedType = isDefaultTool ? fallback.type : (tool.type || fallback.type || ACTIVE_TOOL_VECTOR_TYPE);
            const description = isDefaultTool
                ? fallback.description
                : String(tool.description || fallback.description).trim();
            const countMin = getActiveToolResultCountMin({ type: normalizedType });
            const countMax = getActiveToolResultCountMax({ type: normalizedType });
            let normalizedResultCount = Number.isFinite(resultCount)
                ? Math.max(countMin, Math.min(countMax, Math.round(resultCount)))
                : (fallback.resultCount || ACTIVE_TOOL_DEFAULT_RESULT_COUNT);
            if (resultCountVersion < ACTIVE_TOOL_RESULT_COUNT_VERSION
                && isDefaultTool
                && normalizedCallName === fallback.callName
                && normalizedType !== ACTIVE_TOOL_WEB_TYPE
                && (!Number.isFinite(resultCount) || Math.round(resultCount) <= ACTIVE_TOOL_MIN_RESULT_COUNT || Math.round(resultCount) === 10)) {
                normalizedResultCount = ACTIVE_TOOL_DEFAULT_RESULT_COUNT;
            }
            const normalized = {
                id: isDefaultTool ? fallback.id : (tool.id || generateUUID()),
                name: isDefaultTool ? fallback.name : (String(tool.name || fallback.name).trim() || fallback.name),
                enabled: tool.enabled !== false,
                type: normalizedType,
                callName: normalizedCallName,
                resultCount: normalizedResultCount,
                resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
                description: description || fallback.description,
                displayDescription: isDefaultTool
                    ? fallback.displayDescription
                    : (String(tool.displayDescription || fallback.displayDescription).trim() || fallback.displayDescription)
            };
            if (normalizedType === ACTIVE_TOOL_WEB_TYPE) {
                normalized.tavilyApiKey = String(tool.tavilyApiKey || tool.apiKey || fallback.tavilyApiKey || '').trim();
            }
            return normalized;
        };

        const normalizeActiveTools = (items = activeTools.value) => {
            const normalized = [];
            (Array.isArray(items) ? items : [])
                .map(normalizeActiveTool)
                .filter(tool => tool && tool.callName)
                .forEach(tool => {
                    const duplicateIndex = normalized.findIndex(item => item.id === tool.id || item.callName === tool.callName);
                    if (duplicateIndex >= 0) {
                        normalized[duplicateIndex] = {
                            ...normalized[duplicateIndex],
                            enabled: normalized[duplicateIndex].enabled || tool.enabled
                        };
                        return;
                    }
                    normalized.push(tool);
                });
            getDefaultActiveToolDefinitions().forEach(defaultTool => {
                const hasDefaultTool = normalized.some(tool => tool.id === defaultTool.id || tool.callName === defaultTool.callName);
                if (!hasDefaultTool) normalized.push(defaultTool);
            });
            if (JSON.stringify(activeTools.value) !== JSON.stringify(normalized)) {
                activeTools.value = normalized;
            }
            return normalized;
        };

        const getMemoryEmptyTurnsKey = (uuid) => {
            const safeUuid = uuid || 'global';
            return `${safeUuid}:vector`;
        };

        const hasVectorEmbedding = (memory) => (
            (isEmbeddingLike(memory?.embedding) && memory.embedding.length > 0)
            || (typeof memory?.embeddingQ === 'string' && memory.embeddingQ.length > 0)
        );

        const isVectorMemory = (memory) => {
            return memory?.vectorMemory === true
                && memory.chunkMode === 'paragraph'
                && hasVectorEmbedding(memory);
        };

        const isEnabledVectorMemory = (memory) => {
            return isVectorMemory(memory) && memory.enabled !== false;
        };

        const markRuntimeRaw = (value) => {
            if (!value || typeof value !== 'object') return value;
            return typeof Vue?.markRaw === 'function' ? Vue.markRaw(value) : value;
        };

        const bytesToBase64 = (bytes) => {
            const source = bytes instanceof Uint8Array
                ? bytes
                : new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < source.length; i += chunkSize) {
                binary += String.fromCharCode(...source.subarray(i, i + chunkSize));
            }
            return btoa(binary);
        };

        const base64ToInt8Array = (base64) => {
            const binary = atob(String(base64 || ''));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return new Int8Array(bytes.buffer);
        };

        const quantizeEmbeddingForStorage = (embedding) => {
            if (!isEmbeddingLike(embedding) || embedding.length === 0) return null;
            let maxAbs = 0;
            for (let i = 0; i < embedding.length; i++) {
                const value = Math.abs(Number(embedding[i]) || 0);
                if (value > maxAbs) maxAbs = value;
            }
            if (maxAbs <= 0) return null;

            const quantized = new Int8Array(embedding.length);
            for (let i = 0; i < embedding.length; i++) {
                const scaled = Math.round(((Number(embedding[i]) || 0) / maxAbs) * 127);
                quantized[i] = Math.max(-127, Math.min(127, scaled));
            }

            return {
                embeddingQ: bytesToBase64(new Uint8Array(quantized.buffer)),
                embeddingScale: maxAbs / 127,
                embeddingDims: embedding.length,
                embeddingEncoding: 'int8:maxabs:v1'
            };
        };

        const prepareMemoryForRuntime = (memory) => {
            if (!memory || typeof memory !== 'object') return memory;
            if (Object.prototype.hasOwnProperty.call(memory, 'depth')) {
                delete memory.depth;
            }
            if (typeof memory.embeddingQ === 'string' && memory.embeddingQ.length > 0) {
                try {
                    memory.embedding = markRuntimeRaw(base64ToInt8Array(memory.embeddingQ));
                } catch (e) {
                    memory.embedding = [];
                }
            } else if (isEmbeddingLike(memory.embedding)) {
                const packed = quantizeEmbeddingForStorage(memory.embedding);
                if (packed) {
                    Object.assign(memory, packed);
                    memory.embedding = markRuntimeRaw(base64ToInt8Array(packed.embeddingQ));
                }
            }
            if (isEmbeddingLike(memory.embedding)) {
                memory.embedding = markRuntimeRaw(memory.embedding);
            }
            return markRuntimeRaw(memory);
        };

        const prepareMemoriesForRuntime = (items) => {
            return Array.isArray(items)
                ? items.filter(isVectorMemory).map(prepareMemoryForRuntime)
                : [];
        };

        const prepareClassicMemoriesForRuntime = (items) => {
            if (!Array.isArray(items)) return [];
            return items
                .filter(memory => memory?.classicMemory === true && String(memory.summary || '').trim())
                .map(memory => markRuntimeRaw({
                    ...memory,
                    turn: Math.max(1, Number(memory.turn) || 1),
                    summary: String(memory.summary || '').trim(),
                    sourceUserIds: Array.isArray(memory.sourceUserIds) ? memory.sourceUserIds.filter(Boolean) : [],
                    sourceAssistantIds: Array.isArray(memory.sourceAssistantIds) ? memory.sourceAssistantIds.filter(Boolean) : []
                }));
        };

        const compactMemoryForStorage = (memory) => {
            if (!memory || typeof memory !== 'object') return memory;
            const {
                embedding,
                vectorRawScore,
                vectorScore,
                vectorLexicalHits,
                vectorLexicalTerms,
                vectorSearchScore,
                depth,
                ...cleanMemory
            } = unwrapForStorage(memory);

            if (typeof cleanMemory.embeddingQ === 'string' && cleanMemory.embeddingQ.length > 0) {
                return cleanMemory;
            }

            const packed = quantizeEmbeddingForStorage(embedding);
            return packed ? { ...cleanMemory, ...packed } : cleanMemory;
        };

        const yieldMemoryStorageWork = () => new Promise(resolve => setTimeout(resolve, 0));

        const compactMemoriesForStorageAsync = async (items) => {
            if (!Array.isArray(items)) return [];
            const result = [];
            for (let i = 0; i < items.length; i++) {
                result.push(compactMemoryForStorage(items[i]));
                if (i > 0 && i % 256 === 0) await yieldMemoryStorageWork();
            }
            return result;
        };

        const estimatedGenerationTime = computed(() => {
            if (recentGenerationTimes.value.length === 0) return null;
            const total = recentGenerationTimes.value.reduce((sum, item) => {
                // Compatibility: handle both number and object
                const duration = typeof item === 'number' ? item : item.duration;
                return sum + duration;
            }, 0);
            return (total / recentGenerationTimes.value.length / 1000).toFixed(1);
        });

        const showWorldInfoSettings = ref(false);
        const showMemorySettings = ref(false);
        const settingsHelpTopic = ref('');
        const showActiveToolSettings = ref(false);
        const showUiTemplateSettings = ref(false);
        const worldInfoSettings = reactive({
            scanDepth: 2,
            maxDepth: 0,
        });
