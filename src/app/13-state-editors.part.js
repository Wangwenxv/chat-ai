// 13-state-editors.part.js：由 build-app.js 按 setup 依赖顺序组装。
// Editing States
        const editingCharacter = reactive({ id: undefined, data: {} });
        const editorTab = ref('basic'); // 'basic', 'description', 'personality', 'first_mes'
        const isBatchDeleteMode = ref(false);
        const selectedCharacterIndices = ref(new Set());
        const editingPreset = reactive({ id: undefined, data: {} });
        const editingUiTemplate = reactive({ id: undefined, data: {}, tab: 'history' });
        const editingRegex = reactive({ id: undefined, data: {} });
        const editingWorldInfo = reactive({ id: undefined, data: {} });
        const worldInfoKeysText = ref('');
        const editingActiveTool = reactive({ id: undefined, data: {} });

        const sysInstruction = ref('');
        const showInstructionPanel = ref(false);
        const currentHoverWorldInfo = ref(null);
        const showContextViewerModal = ref(false);
        const lastContextMessages = ref([]);
        const lastTriggeredWorldInfos = ref([]);
        const lastContextTotalLength = computed(() => lastContextMessages.value.reduce(
            (total, message) => total + String(message?.content || '').length,
            0
        ));
        const tokenUsageHistory = ref([]);
        const tokenUsagePage = ref(1);
        const tokenUsageFilter = ref('all');
        const tokenUsageTimeFilter = ref('all');
        const showTokenUsageTimeFilter = ref(false);
        const tokenUsageTimeFilterOptions = [
            { value: 'all', label: '全部' },
            { value: '24h', label: '24小时' },
            { value: '7d', label: '7天' },
            { value: '30d', label: '30天' }
        ];
        const tokenUsageTimeFilterLabel = computed(() => (
            tokenUsageTimeFilterOptions.find(option => option.value === tokenUsageTimeFilter.value)?.label || '全部'
        ));

        // Export Modal State
        const showExportModal = ref(false);
        const exportType = ref(null); // 'presets', 'regex', 'worldinfo', 'uitemplates'
        const exportItems = ref([]);
        const selectedExportIndices = ref(new Set());

        // Character Export Modal State
        const showCharacterExportModal = ref(false);
        const characterToExportIndex = ref(null);

        const openCharacterExportModal = (index) => {
            characterToExportIndex.value = index;
            showCharacterExportModal.value = true;
        };

        const confirmCharacterExport = (type) => {
            showCharacterExportModal.value = false;
            if (characterToExportIndex.value !== null) {
                if (type === 'json') {
                    exportCharacterJson(characterToExportIndex.value);
                } else if (type === 'chat') {
                    exportCharacterChat(characterToExportIndex.value);
                } else {
                    exportCharacterPng(characterToExportIndex.value);
                }
                characterToExportIndex.value = null;
            }
        };
