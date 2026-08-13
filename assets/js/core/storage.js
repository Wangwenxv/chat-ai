(function initializeChatAIStorage(global) {
    'use strict';

    // 创建带旧库迁移能力的 IndexedDB 服务，业务层无需接触连接和事务细节。
    const createStorage = (options) => {
        const {
            dbName,
            legacyDbName,
            storagePrefix,
            legacyStoragePrefix,
            dbVersion = 1,
            storeName = 'store'
        } = options;
        let mainDb = null;
        let legacyDb = null;
        let initializationPromise = null;

        // 打开指定数据库，并在首次使用时创建统一键值存储。
        const openDatabase = (name) => new Promise((resolve, reject) => {
            const request = indexedDB.open(name, dbVersion);
            request.onerror = (event) => reject(event.target.error || new Error(`无法打开数据库 ${name}`));
            request.onsuccess = (event) => resolve(event.target.result);
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(storeName)) {
                    database.createObjectStore(storeName);
                }
            };
        });

        // 初始化主库，并仅在旧库确实存在或浏览器无法枚举时连接旧库。
        const initialize = async () => {
            if (mainDb) return mainDb;
            if (initializationPromise) return initializationPromise;
            initializationPromise = (async () => {
                mainDb = await openDatabase(dbName);
                try {
                    const databases = typeof indexedDB.databases === 'function'
                        ? await indexedDB.databases()
                        : null;
                    const shouldOpenLegacy = !databases || databases.some(item => item?.name === legacyDbName);
                    if (shouldOpenLegacy) legacyDb = await openDatabase(legacyDbName);
                } catch (error) {
                    console.warn('Legacy DB check failed:', error);
                }
                return mainDb;
            })();
            try {
                return await initializationPromise;
            } finally {
                initializationPromise = null;
            }
        };

        // 识别浏览器在关闭连接期间产生的短暂错误，供读写操作自动重连。
        const isDatabaseClosingError = (error) => {
            const message = String(error?.message || error || '');
            return /connection is closing|database is closing|close pending/i.test(message);
        };

        // 丢弃旧连接并重开主库，避免一次关闭事件永久中断后续保存。
        const reopenMainDatabase = async () => {
            try {
                mainDb?.close();
            } catch (_) {
                // 关闭中的连接无需重复处理，直接建立新连接。
            }
            mainDb = await openDatabase(dbName);
            return mainDb;
        };

        // 递归移除 Vue Proxy、函数和不可持久化值，生成 IndexedDB 可克隆数据。
        const unwrapForStorage = (value, seen = new WeakMap()) => {
            if (value === null || typeof value !== 'object') return value;
            const raw = typeof global.Vue?.toRaw === 'function' ? global.Vue.toRaw(value) : value;
            if (raw === null || typeof raw !== 'object') return raw;
            if (seen.has(raw)) return seen.get(raw);
            if (raw instanceof Date) return raw.toISOString();
            if (ArrayBuffer.isView(raw)) return Array.from(raw);
            if (raw instanceof ArrayBuffer) return Array.from(new Uint8Array(raw));

            if (Array.isArray(raw)) {
                const array = [];
                seen.set(raw, array);
                raw.forEach((item, index) => {
                    const clonedItem = unwrapForStorage(item, seen);
                    array[index] = clonedItem === undefined ? null : clonedItem;
                });
                return array;
            }

            const object = {};
            seen.set(raw, object);
            Object.keys(raw).forEach((key) => {
                const item = raw[key];
                if (typeof item === 'function' || typeof item === 'undefined') return;
                object[key] = unwrapForStorage(item, seen);
            });
            return object;
        };

        // 优先使用浏览器结构化克隆，失败时回退为 JSON 克隆。
        const cloneForStorage = (value) => {
            const plainValue = unwrapForStorage(value);
            if (typeof structuredClone === 'function') {
                try {
                    return structuredClone(plainValue);
                } catch (_) {
                    // 某些宿主对象不支持结构化克隆，继续使用兼容路径。
                }
            }
            return JSON.parse(JSON.stringify(plainValue));
        };

        // 统一生成当前库和旧库的普通 key、角色或会话作用域 key。
        const storageKey = (name) => `${storagePrefix}${name}`;
        const legacyStorageKey = (name) => `${legacyStoragePrefix}${name}`;
        const scopedStorageKey = (name, id) => `${storageKey(name)}_${id}`;
        const legacyScopedStorageKey = (name, id) => `${legacyStorageKey(name)}_${id}`;

        // 在指定数据库执行单次写入，调用方可声明数据已经完成克隆。
        const setInDatabase = (targetDb, key, value, setOptions = {}) => new Promise((resolve, reject) => {
            if (!targetDb) {
                reject(new Error('DB not initialized'));
                return;
            }
            const transaction = targetDb.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(setOptions.clone === false ? value : cloneForStorage(value), key);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });

        // 写入主库；遇到连接关闭错误时自动重连并重试一次。
        const setByKey = async (key, value, setOptions = {}) => {
            await initialize();
            try {
                return await setInDatabase(mainDb, key, value, setOptions);
            } catch (error) {
                if (!isDatabaseClosingError(error)) throw error;
                await reopenMainDatabase();
                return setInDatabase(mainDb, key, value, setOptions);
            }
        };

        // 从指定数据库读取一个键；数据库不存在时按未找到处理。
        const getFromDatabase = (targetDb, key) => new Promise((resolve, reject) => {
            if (!targetDb) {
                resolve(undefined);
                return;
            }
            const transaction = targetDb.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });

        // 读取主库，并处理连接关闭期间的一次自动重连。
        const getByKey = async (key) => {
            await initialize();
            try {
                return await getFromDatabase(mainDb, key);
            } catch (error) {
                if (!isDatabaseClosingError(error)) throw error;
                await reopenMainDatabase();
                return getFromDatabase(mainDb, key);
            }
        };

        // 主库没有数据时读取旧库，并立即迁移到当前 key。
        const getWithLegacy = async (key, oldKey = null) => {
            const value = await getByKey(key);
            if (value !== undefined) return value;
            if (!oldKey || !legacyDb) return undefined;
            const legacyValue = await getFromDatabase(legacyDb, oldKey);
            if (legacyValue !== undefined) await setByKey(key, legacyValue);
            return legacyValue;
        };

        // 从指定数据库删除一个键；缺失的旧库按删除成功处理。
        const deleteFromDatabase = (targetDb, key) => new Promise((resolve, reject) => {
            if (!targetDb) {
                resolve();
                return;
            }
            const transaction = targetDb.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });

        // 删除当前 key 及其旧库对应 key，供会话清理逻辑统一调用。
        const deleteWithLegacy = async (key, oldKey = null) => {
            await initialize();
            await deleteFromDatabase(mainDb, key);
            if (oldKey && legacyDb) await deleteFromDatabase(legacyDb, oldKey);
        };

        // 暴露领域化的普通存储和作用域存储 API，屏蔽底层 key 规则。
        return {
            init: initialize,
            cloneForStorage,
            isDatabaseClosingError,
            setStoredValue: (name, value, setOptions = {}) => setByKey(storageKey(name), value, setOptions),
            getStoredValue: (name) => getWithLegacy(storageKey(name), legacyStorageKey(name)),
            setScopedStoredValue: (name, id, value, setOptions = {}) => setByKey(scopedStorageKey(name, id), value, setOptions),
            getScopedStoredValue: (name, id) => getWithLegacy(scopedStorageKey(name, id), legacyScopedStorageKey(name, id)),
            deleteScopedStoredValue: (name, id) => deleteWithLegacy(scopedStorageKey(name, id), legacyScopedStorageKey(name, id))
        };
    };

    global.ChatAIStorage = { createStorage };
})(window);
