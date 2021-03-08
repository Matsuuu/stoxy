import { INIT_SUCCESS, PUT_SUCCESS, READ_SUCCESS, DELETE_SUCCESS } from './stoxy-events.js';

const STOXY_VERSION_NUMBER = 1;
const STOXY_DATA_STORAGE = 'StoxyStorage';
const STOXY_CACHE_SIZE = 5;

let persistKeys = [];
const cacheKeys = [];
const cache = {};

function canUseIDB() {
    return Boolean(window.indexedDB);
}

export function persistKey(...keyOrKeys) {
    persistKeys = [...persistKeys, ...keyOrKeys];
}

function shouldPersist(key) {
    return persistKeys.includes(key);
}

function doEvent(name, data) {
    if (!data) {
        window.dispatchEvent(new Event(name));
        return;
    }
    window.dispatchEvent(new CustomEvent(name, { detail: data }));
}

export function sub(key, callback) {
    window.addEventListener(PUT_SUCCESS, e => {
        if (e.detail.key === key) {
            const putEvent = e.detail;
            putEvent.action = 'Update';
            callback(e.detail);
        }
    });
    window.addEventListener(DELETE_SUCCESS, e => {
        if (e.detail.key === key) {
            const delEvent = e.detail;
            delEvent.action = 'Delete';
            callback(delEvent);
        }
    });
}

export function openStorage() {
    if (!canUseIDB()) return new Promise(resolve => resolve());
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(STOXY_DATA_STORAGE, STOXY_VERSION_NUMBER);
        request.onsuccess = event => {
            doEvent(INIT_SUCCESS);
            resolve(event.target.result);
        };
        request.onerror = event => {
            reject(event);
        };
        request.onupgradeneeded = upgrade;
    });
}

function upgrade(event) {
    const db = event.target.result;
    db.createObjectStore(STOXY_DATA_STORAGE);
}

function fetchFromCache(key) {
    const cachedObject = cache[key];
    return cachedObject != null ? cachedObject : null;
}

function updateCache(key, data) {
    if (!cacheKeys.includes(key)) {
        cacheKeys.push(key);
    }
    cache[key] = data;
    // If we have persisted keys in cache, we remove one of them to make room
    if (canUseIDB() && cacheKeys.length > STOXY_CACHE_SIZE) {
        for (let i = cacheKeys.length; i >= 0; i--) {
            const cacheKey = cacheKeys[i];
            if (persistKeys.includes(cacheKey)) {
                persistKeys.splice(i, 1);
                delete cache[cacheKey];
                break;
            }
        }
    }
}

function invalidateCache(key) {
    // If no key is provide, invalidate whole cache
    if (!key) {
        cache = {};
        cacheKeys = [];
        return;
    }
    cacheKeys.splice(cacheKeys.indexOf(key), 1);
    delete cache[key];
}

export function read(key) {
    const readPromise = new Promise((resolve, reject) => {
        const cachedObject = fetchFromCache(key);
        if ((cachedObject != null && typeof cachedObject !== "undefined") || !canUseIDB()) {
            // To prevent direct array reference. Needed for stoxy repeat to work when e.g. sorting
            if (Array.isArray(cachedObject)) {
                return resolve([...cachedObject]);
            }
            return resolve(cachedObject);
        }

        openStorage().then(db => {
            readFromStore(key, db, resolve, reject);
        });
    });
    return readPromise;
}

function readFromStore(key, db, resolve, reject) {
    const transaction = db.transaction([STOXY_DATA_STORAGE], 'readwrite');
    transaction.onerror = event => {
        reject(event);
    };

    const objectStore = transaction.objectStore(STOXY_DATA_STORAGE);

    if (!key.includes('.')) {
        const readRequest = objectStore.get(key);
        readRequest.onsuccess = event => {
            const resultData = event.target.result;
            if (resultData) {
                updateCache(key, resultData);
            }
            doEvent(READ_SUCCESS, { key, data: resultData });
            resolve(resultData);
        };
    } else {
        const keyParts = key.split(".");
        const topLevelKey = keyParts.shift();
        const readRequest = objectStore.get(topLevelKey);

        readRequest.onsuccess = event => {
            const resultData = event.target.result;

            let keyData = resultData;
            while (keyParts.length > 0) {
                const currentKey = keyParts.shift();
                if (typeof keyData === "undefined")
                    break;

                keyData = keyData[currentKey];
            }

            if (keyData) {
                updateCache(key, keyData);
            }
            doEvent(READ_SUCCESS, { key, data: keyData });
            resolve(keyData);
        };
    }
}

export function write(key, data) {
    return new Promise((resolve, reject) => {
        openStorage().then(db => {
            // If writing on top level
            if (!key.includes('.')) {
                writeToStore(key, data, db, resolve, reject);
            } else {
                // If we're only writing to a property of data
                writeToKeyInStore(key, data, db, resolve, reject);
            }
        });
    });
}

function writeToKeyInStore(key, data, db, resolve, reject) {
    const keyParts = key.split('.');
    const topLevelKey = keyParts.shift();
    read(topLevelKey).then(keyData => {
        const dataToWrite = keyData || {};
        let elementReference = dataToWrite;
        while (keyParts.length > 1) {
            const currentKey = keyParts.shift();
            if (typeof elementReference[currentKey] === 'undefined') {
                elementReference[currentKey] = {};
            }
            elementReference = elementReference[currentKey];
        }
        const finalKey = keyParts.shift();
        elementReference[finalKey] = data;

        writeToStore(topLevelKey, dataToWrite, db, resolve, reject);
    });
}

function writeToStore(key, data, db, resolve, reject) {
    if (!canUseIDB() || !shouldPersist(key)) {
        updateCache(key, data);
        doEvent(PUT_SUCCESS, { key, data });
        return resolve();
    }
    const transaction = createWriteTransaction(key, data, db, resolve, reject);
    const objectStore = transaction.objectStore(STOXY_DATA_STORAGE);
    objectStore.put(data, key);
}

function createWriteTransaction(key, data, db, resolve, reject) {
    const transaction = db.transaction([STOXY_DATA_STORAGE], 'readwrite');
    transaction.oncomplete = event => {
        invalidateCache(key);
        doEvent(PUT_SUCCESS, { key, data });
        resolve(event);
    };
    transaction.onerror = event => {
        reject(event);
    };
    return transaction;
}

export function clear(key) {
    return new Promise((resolve, reject) => {
        if (!canUseIDB()) {
            invalidateCache(key);
            doEvent(DELETE_SUCCESS, { key });
            return resolve();
        }
        openStorage().then(db => {
            const transaction = db.transaction([STOXY_DATA_STORAGE], 'readwrite');
            transaction.oncomplete = event => {
                invalidateCache(key);
                doEvent(DELETE_SUCCESS, { key });
                resolve(event);
            };
            transaction.onerror = event => {
                reject(event);
            };

            const objectStore = transaction.objectStore(STOXY_DATA_STORAGE);
            objectStore.delete(key);
        });
    });
}

export function update(key, predicate) {
    read(key).then(keyData => {
        write(key, predicate(keyData));
    });
}

export function add(key, data) {
    read(key).then(keyData => {
        if (!keyData) keyData = [];
        write(key, [...keyData, data]);
    });
}

export function remove(key, predicate) {
    read(key).then(keyData => {
        if (!keyData) return;
        write(
            key,
            keyData.filter(d => !predicate(d)),
        );
    });
}