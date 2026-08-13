// 11-state-memory.part.js：由 build-app.js 按 setup 依赖顺序组装。
// --- Memory System State ---
        const MEMORY_VECTOR_BATCH_SIZE = 16;
        const MEMORY_VECTOR_SAVE_EVERY_BATCHES = 4;
        const MEMORY_VECTOR_MAX_PARAGRAPH_LENGTH = 1800;
        const MEMORY_VECTOR_MERGE_MAX_LENGTH = 400;
        const MEMORY_VECTOR_MIN_TOP_K = 10;
        const MEMORY_VECTOR_MAX_TOP_K = 20;
        const MEMORY_VECTOR_DEFAULT_TOP_K = 10;
        const MEMORY_VECTOR_MIN_SIMILARITY = 40;
        const MEMORY_VECTOR_MAX_SIMILARITY = 70;
        const MEMORY_VECTOR_DEFAULT_SIMILARITY = 50;
        const MEMORY_VECTOR_DEFAULT_DEPTH = 1;
        const CLASSIC_MEMORY_MIN_CONCURRENCY = 1;
        const CLASSIC_MEMORY_MAX_CONCURRENCY = 10;
        const CLASSIC_MEMORY_DEFAULT_CONCURRENCY = 5;
        const MEMORY_MODE_VECTOR = 'vector';
        const MEMORY_MODE_CLASSIC = 'classic';
        const VECTOR_KEEP_FLOORS_MIN = 30;
        const VECTOR_KEEP_FLOORS_MAX = 80;
        const VECTOR_KEEP_FLOORS_DEFAULT = 50;
        const SUMMARY_KEEP_FLOORS_MIN = 10;
        const SUMMARY_KEEP_FLOORS_MAX = 40;
        const SUMMARY_KEEP_FLOORS_DEFAULT = 20;
        const LIST_PAGE_SIZE = 10;
        const memories = ref([]);
        const classicMemories = ref([]);
        const classicMemoryPage = ref(1);
        const memorySettings = reactive({
            enabled: false,
            mode: MEMORY_MODE_CLASSIC,
            embeddingModel: '',
            classicModel: '',
            vectorTopK: MEMORY_VECTOR_DEFAULT_TOP_K,
            similarityThreshold: MEMORY_VECTOR_DEFAULT_SIMILARITY,
            defaultDepth: MEMORY_VECTOR_DEFAULT_DEPTH,
            vectorKeepFloors: VECTOR_KEEP_FLOORS_DEFAULT,
            summaryKeepFloors: SUMMARY_KEEP_FLOORS_DEFAULT,
            classicConcurrency: CLASSIC_MEMORY_DEFAULT_CONCURRENCY
        });
        const isBatchExtracting = ref(false);
        const batchExtractProgress = ref({ current: 0, total: 0 });
        const vectorMemorySearchQuery = ref('');
        const vectorMemorySearchResults = ref([]);
        const vectorMemorySearchError = ref('');
        const vectorMemorySearchSortMode = ref('time');
        const isVectorMemorySearching = ref(false);
        const isClassicBatchExtracting = ref(false);
        const classicBatchExtractProgress = ref({ current: 0, total: 0 });
        let _vectorMemorySearchAbort = null;
        let _isApplyingCharacterScopedData = false;
        let _memoriesLoaded = false; // 标志：防止在记忆加载前 saveData 覆盖已存数据
        let _classicMemoriesLoaded = false;
        let _initComplete = false; // 守卫标志：防止 onMounted 初始化阶段写入默认值覆盖服务端数据
