// 80-presets.part.js：由 build-app.js 按 setup 依赖顺序组装。
// Preset Management
        const createPreset = () => {
            editingPreset.id = undefined;
            editingPreset.data = { name: 'New Preset', content: '', enabled: false, role: 'system' };
            showPresetEditor.value = true;
        };

        const editPreset = (index) => {
            editingPreset.id = index;
            editingPreset.data = normalizePreset(JSON.parse(JSON.stringify(presets.value[index])));
            showPresetEditor.value = true;
        };

        const savePreset = () => {
            const normalizedPreset = normalizePreset(editingPreset.data);
            if (editingPreset.id !== undefined) {
                presets.value[editingPreset.id] = normalizedPreset;
            } else {
                presets.value.push(normalizedPreset);
            }
            showPresetEditor.value = false;
        };

        const deletePreset = (index) => {
            confirmAction('确定要删除这个预设吗？此操作无法撤销。', () => {
                presets.value.splice(index, 1);
                showToast('预设已删除', 'success');
            });
        };
