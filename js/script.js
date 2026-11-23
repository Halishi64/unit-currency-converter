// Обрав Vue 3, бо підключається одним скриптом через CDN без Babel і має computed для автоперерахунку
const API_URL = '/api/rates';

const STORAGE_KEY = 'converterHistory';
const MIGRATED_KEY = 'historyMigrated';
const DB_NAME = 'ConverterDB';
const DB_VERSION = 1;
const STORE_NAME = 'history';

const appState = {
    rates: [
        { id: 1, code: 'USD', rate: 1, pinned: false },
        { id: 2, code: 'EUR', rate: 0.92, pinned: false },
        { id: 3, code: 'UAH', rate: 41.5, pinned: false }
    ],
    threshold: 10000,
    rateThreshold: 10,
    metaBase: 'USD',
    metaDate: '-',
    ratesLoaded: false
};

function saveToLocalStorage(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadFromLocalStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error('Помилка читання localStorage:', error);
        return [];
    }
}

// Відкриття IndexedDB і створення сховища history
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Додати запис в IndexedDB
async function addItem(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const request = tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
    });
}

// Оновити запис в IndexedDB
async function updateItem(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Отримати всі записи з IndexedDB
async function getAllItems() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Видалити запис за id
async function deleteItem(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Одноразова міграція з localStorage в IndexedDB
async function migrateFromLocalStorage() {
    if (localStorage.getItem(MIGRATED_KEY) === 'true') {
        return;
    }

    const existing = await getAllItems();
    const saved = loadFromLocalStorage();

    if (existing.length === 0 && saved.length > 0) {
        for (const item of saved) {
            await addItem({
                from: item.from,
                to: item.to,
                amount: item.amount,
                result: item.result,
                timestamp: item.timestamp || Date.now()
            });
        }
    }

    localStorage.setItem(MIGRATED_KEY, 'true');
}

async function loadHistoryData() {
    try {
        await migrateFromLocalStorage();
        const items = await getAllItems();
        const sorted = items.sort((a, b) => b.timestamp - a.timestamp);
        saveToLocalStorage(sorted.slice(0, 10));
        return { items: sorted, error: '' };
    } catch (error) {
        console.error(error);
        const fallback = loadFromLocalStorage().sort((a, b) => b.timestamp - a.timestamp);
        return {
            items: fallback,
            error: 'Не вдалося відкрити IndexedDB (можливо, увімкнено приватний режим). Завантажено дані з localStorage.'
        };
    }
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('uk-UA');
}

async function fetchRates() {
    const response = await fetch(API_URL);

    if (!response.ok) {
        let serverMessage = `Сервер відповів кодом ${response.status}`;
        try {
            const errData = await response.json();
            if (errData && errData.error) {
                serverMessage = errData.error;
            }
        } catch (parseError) {
            console.error(parseError);
        }
        throw new Error(serverMessage);
    }

    const data = await response.json();
    appState.metaBase = data.base;
    appState.metaDate = data.date;
    appState.ratesLoaded = true;

    for (const [code, rate] of Object.entries(data.rates)) {
        const existing = appState.rates.find(item => item.code === code);
        if (existing) {
            existing.rate = rate;
        }
    }
}

// Форма конвертації
const ConverterForm = {
    props: ['rates'],
    emits: ['add-history'],
    data() {
        return {
            amount: 100,
            fromUnit: 'USD',
            toUnit: 'UAH'
        };
    },
    computed: {
        result() {
            const value = Number(this.amount);
            if (!value || value <= 0) {
                return 0;
            }

            const fromRate = this.rates.find(item => item.code === this.fromUnit);
            const toRate = this.rates.find(item => item.code === this.toUnit);
            if (!fromRate || !toRate) {
                return 0;
            }

            const amountInUSD = value / fromRate.rate;
            return Number((amountInUSD * toRate.rate).toFixed(2));
        }
    },
    methods: {
        swapUnits() {
            const temp = this.fromUnit;
            this.fromUnit = this.toUnit;
            this.toUnit = temp;
        },
        saveToHistory() {
            const value = Number(this.amount);
            if (!value || value <= 0) {
                return;
            }

            this.$emit('add-history', {
                from: this.fromUnit,
                to: this.toUnit,
                amount: value,
                result: this.result,
                timestamp: Date.now()
            });
        }
    },
    template: `
        <section class="converter-card">
            <h2>Форма конвертації</h2>
            <form @submit.prevent="saveToHistory">
                <div class="form-group">
                    <label for="amount-input">Введіть значення:</label>
                    <input type="number" id="amount-input" v-model.number="amount" min="0.01" step="0.01" required>
                </div>

                <div class="exchange-group">
                    <div class="currency-field">
                        <label for="from-currency">З валюти:</label>
                        <select id="from-currency" v-model="fromUnit">
                            <option v-for="item in rates" :key="item.id" :value="item.code">
                                {{ item.code }}
                            </option>
                        </select>
                    </div>

                    <button type="button" class="swap-btn" @click="swapUnits" aria-label="Поміняти місцями">⇅</button>

                    <div class="currency-field">
                        <label for="to-currency">У валюту:</label>
                        <select id="to-currency" v-model="toUnit">
                            <option v-for="item in rates" :key="item.id" :value="item.code">
                                {{ item.code }}
                            </option>
                        </select>
                    </div>
                </div>

                <button type="submit" class="convert-btn">Зберегти в історію</button>
            </form>

            <p class="result-box">
                Результат: <span id="result">{{ result }} {{ toUnit }}</span>
            </p>
        </section>
    `
};

// Список курсів валют
const RatesList = {
    props: ['items', 'threshold'],
    emits: ['toggle-pin'],
    template: `
        <ul id="rates-list">
            <li
                v-for="item in items"
                :key="item.id"
                :data-rate="item.rate"
                :class="{ 'big-rate': item.rate > threshold, 'pinned-rate': item.pinned }"
                @click="$emit('toggle-pin', item.id)"
            >
                {{ item.code }}: {{ item.rate }}<span v-if="item.pinned"> (обрано)</span>
            </li>
        </ul>
    `
};

// Рендер списку історії
function renderHistoryList(listElement, items, handlers) {
    listElement.innerHTML = '';

    for (const item of items) {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.dataset.result = item.result;
        if (item.result > appState.threshold) {
            li.classList.add('big-rate');
        }

        const info = document.createElement('div');
        info.className = 'history-info';

        const textSpan = document.createElement('span');
        textSpan.textContent = `${item.amount} ${item.from} = ${item.result} ${item.to}`;

        const timeSmall = document.createElement('small');
        timeSmall.className = 'history-time';
        timeSmall.textContent = formatTime(item.timestamp);

        info.append(textSpan, timeSmall);

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const detailsLink = document.createElement('a');
        detailsLink.href = `#/history/${item.id}`;
        detailsLink.setAttribute('data-link', '');
        detailsLink.className = 'item-btn item-link';
        detailsLink.textContent = 'Деталі';

        const recalcBtn = document.createElement('button');
        recalcBtn.type = 'button';
        recalcBtn.className = 'item-btn';
        recalcBtn.textContent = 'Оновити';
        recalcBtn.addEventListener('click', () => handlers.onRecalculate(item));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'item-btn item-btn-delete';
        deleteBtn.textContent = 'Видалити';
        deleteBtn.addEventListener('click', () => handlers.onDelete(item.id));

        actions.append(detailsLink, recalcBtn, deleteBtn);
        li.append(info, actions);
        listElement.append(li);
    }
}

let chartAnimationId = null;
let chartIsAnimating = false;
let chartAnimProgress = 1;

// Графік останніх результатів на Canvas
function drawChart(canvas, historyItems, progress = 1) {
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const padX = 40;
    const padY = 28;

    ctx.clearRect(0, 0, w, h);

    const points = historyItems.slice().reverse();

    if (points.length === 0) {
        ctx.fillStyle = '#52525B';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Додайте конвертації, щоб побачити графік', w / 2, h / 2);
        return;
    }

    const values = points.map(item => Number(item.result));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;
    const baseY = h - padY;

    ctx.save();
    ctx.strokeStyle = '#E4E4E7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, padY);
    ctx.lineTo(padX, baseY);
    ctx.lineTo(w - padX, baseY);
    ctx.stroke();

    const coords = points.map((item, idx) => {
        const x = points.length === 1
            ? w / 2
            : padX + (idx / (points.length - 1)) * plotW;
        const y = (points.length === 1 || range === 0)
            ? h / 2
            : baseY - ((Number(item.result) - minVal) / range) * plotH;
        return { x, y, value: item.result };
    });

    if (coords.length === 1) {
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(coords[0].x, coords[0].y, 4 * progress, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(coords[0].value), coords[0].x, coords[0].y - 10);
        ctx.restore();
        return;
    }

    const totalSegments = coords.length - 1;
    const currentPos = progress * totalSegments;
    const fullIdx = Math.floor(currentPos);

    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);

    for (let i = 1; i <= fullIdx; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
    }

    if (fullIdx < totalSegments) {
        const segT = currentPos - fullIdx;
        const curX = coords[fullIdx].x + (coords[fullIdx + 1].x - coords[fullIdx].x) * segT;
        const curY = coords[fullIdx].y + (coords[fullIdx + 1].y - coords[fullIdx].y) * segT;
        ctx.lineTo(curX, curY);
    }
    ctx.stroke();

    ctx.fillStyle = '#166534';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    coords.forEach((pt, idx) => {
        if (idx <= currentPos + 0.001) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillText(String(pt.value), pt.x, pt.y - 10);
        }
    });

    ctx.restore();
}

function stopChartAnimation(onStateChange) {
    if (chartAnimationId !== null) {
        cancelAnimationFrame(chartAnimationId);
        chartAnimationId = null;
    }
    chartIsAnimating = false;
    if (onStateChange) {
        onStateChange(false);
    }
}

function startChartAnimation(canvas, historyItems, onStateChange) {
    stopChartAnimation(onStateChange);
    chartAnimProgress = 0;
    chartIsAnimating = true;
    if (onStateChange) {
        onStateChange(true);
    }

    const step = () => {
        chartAnimProgress += 0.02;

        if (chartAnimProgress >= 1) {
            chartAnimProgress = 1;
            drawChart(canvas, historyItems, 1);
            stopChartAnimation(onStateChange);
            return;
        }

        drawChart(canvas, historyItems, chartAnimProgress);
        chartAnimationId = requestAnimationFrame(step);
    };

    chartAnimationId = requestAnimationFrame(step);
}

let activeVueApp = null;
let renderVersion = 0;

function cleanupCurrentView() {
    stopChartAnimation();
    if (activeVueApp) {
        activeVueApp.unmount();
        activeVueApp = null;
    }
}

// Головна сторінка з формою конвертації і курсами
function renderHome(container) {
    container.innerHTML = '';

    const mountRoot = document.createElement('div');
    container.append(mountRoot);

    activeVueApp = Vue.createApp({
        components: {
            ConverterForm,
            RatesList
        },
        data() {
            return {
                rates: appState.rates,
                rateThreshold: appState.rateThreshold,
                metaBase: appState.metaBase,
                metaDate: appState.metaDate,
                loading: false,
                errorMessage: '',
                storageError: '',
                lastSavedId: null,
                lastSavedText: ''
            };
        },
        methods: {
            togglePin(id) {
                const item = this.rates.find(r => r.id === id);
                if (item) {
                    item.pinned = !item.pinned;
                }
            },
            async addHistory(record) {
                this.storageError = '';
                try {
                    const newId = await addItem({
                        from: record.from,
                        to: record.to,
                        amount: record.amount,
                        result: record.result,
                        timestamp: record.timestamp
                    });
                    const all = await getAllItems();
                    const sorted = all.sort((a, b) => b.timestamp - a.timestamp);
                    saveToLocalStorage(sorted.slice(0, 10));
                    this.lastSavedId = newId;
                    this.lastSavedText = `${record.amount} ${record.from} = ${record.result} ${record.to}`;
                } catch (error) {
                    console.error(error);
                    this.storageError = 'Не вдалося зберегти запис у IndexedDB. Збережено в localStorage.';
                    const fallbackId = Date.now();
                    const current = loadFromLocalStorage();
                    current.unshift({ id: fallbackId, ...record });
                    saveToLocalStorage(current.slice(0, 10));
                    this.lastSavedId = fallbackId;
                    this.lastSavedText = `${record.amount} ${record.from} = ${record.result} ${record.to}`;
                }
            },
            async loadRates() {
                this.errorMessage = '';
                if (this.$refs.errorEl) {
                    this.$refs.errorEl.textContent = '';
                }
                this.loading = true;

                try {
                    await fetchRates();
                    this.metaBase = appState.metaBase;
                    this.metaDate = appState.metaDate;
                } catch (error) {
                    this.errorMessage = error.message || 'Не вдалося завантажити курси валют. Спробуйте пізніше.';
                    if (this.$refs.errorEl) {
                        // Вивід тексту помилки сервера
                        this.$refs.errorEl.textContent = this.errorMessage;
                    }
                    console.error(error);
                } finally {
                    this.loading = false;
                }
            }
        },
        mounted() {
            if (!appState.ratesLoaded) {
                this.loadRates();
            }
        },
        template: `
            <section class="converter-card">
                <h2>Вибір типу конвертації</h2>
                <div class="radio-group">
                    <div class="radio-item">
                        <input type="radio" id="type-currency" name="conv-type" checked>
                        <label for="type-currency">Валюти</label>
                    </div>
                    <div class="radio-item">
                        <input type="radio" id="type-length" name="conv-type">
                        <label for="type-length">Довжина</label>
                    </div>
                    <div class="radio-item">
                        <input type="radio" id="type-weight" name="conv-type">
                        <label for="type-weight">Вага</label>
                    </div>
                </div>
            </section>

            <converter-form :rates="rates" @add-history="addHistory"></converter-form>

            <section v-if="lastSavedId || storageError" class="converter-card">
                <p v-if="storageError" class="error-text">{{ storageError }}</p>
                <div v-if="lastSavedId" class="saved-notice">
                    <span>Збережено: {{ lastSavedText }}</span>
                    <div class="history-actions">
                        <a :href="'#/history/' + lastSavedId" data-link class="item-btn item-link">Деталі операції</a>
                        <a href="#/history" data-link class="item-btn">Вся історія</a>
                    </div>
                </div>
            </section>

            <section class="converter-card">
                <h2>Курси валют</h2>
                <div class="rates-controls">
                    <p id="rates-meta">Базова валюта: {{ metaBase }}, дата: {{ metaDate }}</p>
                    <button type="button" id="refresh-btn" class="refresh-btn" :disabled="loading" @click="loadRates">
                        Оновити
                    </button>
                </div>
                <p v-if="loading" id="loading-status" class="status-text">Завантаження...</p>
                <p ref="errorEl" id="error-message" class="error-text" v-show="errorMessage"></p>

                <rates-list :items="rates" :threshold="rateThreshold" @toggle-pin="togglePin"></rates-list>

                <p id="rates-count">Кількість валют у списку: {{ rates.length }}</p>
            </section>
        `
    });

    activeVueApp.mount(mountRoot);
}

// Сторінка історії та графіка
async function renderHistory(container, params, currentVersion) {
    container.innerHTML = '';

    const { items, error } = await loadHistoryData();
    if (currentVersion !== renderVersion) {
        return;
    }

    let latestItems = items.slice(0, 10);

    container.innerHTML = `
        <section class="converter-card">
            <div class="chart-header">
                <h2>Графік історії конвертацій</h2>
                <button type="button" id="chart-toggle-btn" class="item-btn">Анімувати</button>
            </div>
            <canvas id="history-chart" width="580" height="200"></canvas>
            <p class="chart-hint">Останні значення результатів з історії (зліва направо за часом)</p>
        </section>

        <section class="converter-card">
            <div class="chart-header">
                <h2>Історія конвертацій (останні 10)</h2>
                <a href="#/" data-link class="item-btn item-link">Нова конвертація</a>
            </div>
            <p id="storage-error" class="error-text" hidden></p>
            <p id="history-empty" class="empty-text" hidden>Історія поки порожня</p>
            <ul id="history-list"></ul>
        </section>
    `;

    const canvas = container.querySelector('#history-chart');
    const toggleBtn = container.querySelector('#chart-toggle-btn');
    const errorEl = container.querySelector('#storage-error');
    const emptyEl = container.querySelector('#history-empty');
    const listEl = container.querySelector('#history-list');

    const updateToggleLabel = isRunning => {
        toggleBtn.textContent = isRunning ? 'Стоп' : 'Анімувати';
    };

    const syncHistoryUI = (currentItems, errorMsg) => {
        latestItems = currentItems.slice(0, 10);

        if (errorMsg) {
            errorEl.textContent = errorMsg;
            errorEl.hidden = false;
        } else {
            errorEl.hidden = true;
        }

        if (latestItems.length === 0) {
            emptyEl.hidden = false;
            listEl.innerHTML = '';
        } else {
            emptyEl.hidden = true;
            renderHistoryList(listEl, latestItems, {
                onRecalculate: async item => {
                    const fromRate = appState.rates.find(r => r.code === item.from);
                    const toRate = appState.rates.find(r => r.code === item.to);
                    if (!fromRate || !toRate) {
                        return;
                    }

                    const newResult = Number(((item.amount / fromRate.rate) * toRate.rate).toFixed(2));
                    try {
                        await updateItem({
                            id: item.id,
                            from: item.from,
                            to: item.to,
                            amount: item.amount,
                            result: newResult,
                            timestamp: Date.now()
                        });
                        const refreshed = await loadHistoryData();
                        syncHistoryUI(refreshed.items, refreshed.error);
                    } catch (err) {
                        console.error(err);
                        syncHistoryUI(latestItems, 'Не вдалося оновити запис у локальній базі даних.');
                    }
                },
                onDelete: async id => {
                    try {
                        await deleteItem(id);
                        const refreshed = await loadHistoryData();
                        syncHistoryUI(refreshed.items, refreshed.error);
                    } catch (err) {
                        console.error(err);
                        syncHistoryUI(latestItems, 'Не вдалося видалити запис із локальної бази даних.');
                    }
                }
            });
        }

        startChartAnimation(canvas, latestItems, updateToggleLabel);
    };

    toggleBtn.addEventListener('click', () => {
        if (chartIsAnimating) {
            stopChartAnimation(updateToggleLabel);
        } else {
            startChartAnimation(canvas, latestItems, updateToggleLabel);
        }
    });

    syncHistoryUI(items, error);
}

// Сторінка деталей однієї операції
async function renderHistoryDetail(container, params, currentVersion) {
    container.innerHTML = '';

    const targetId = Number(params.id);
    const { items, error } = await loadHistoryData();
    if (currentVersion !== renderVersion) {
        return;
    }

    const record = items.find(item => Number(item.id) === targetId);

    if (!record) {
        const card = document.createElement('section');
        card.className = 'converter-card';

        const title = document.createElement('h2');
        title.textContent = 'Операцію не знайдено';

        const msg = document.createElement('p');
        msg.className = 'not-found-text';
        msg.textContent = `Запис із ID "${params.id}" відсутній в історії.`;

        const actions = document.createElement('div');
        actions.className = 'detail-actions';
        actions.innerHTML = `
            <a href="#/history" data-link class="item-btn item-link">До списку історії</a>
            <a href="#/" data-link class="item-btn">На головну</a>
        `;

        card.append(title, msg, actions);
        container.append(card);
        return;
    }

    const card = document.createElement('section');
    card.className = 'converter-card';

    const title = document.createElement('h2');
    title.textContent = `Деталі операції #${record.id}`;
    card.append(title);

    if (error) {
        const errP = document.createElement('p');
        errP.className = 'error-text';
        errP.textContent = error;
        card.append(errP);
    }

    const list = document.createElement('div');
    list.className = 'detail-list';

    const rows = [
        { label: 'ID', value: String(record.id) },
        { label: 'З валюти', value: record.from },
        { label: 'У валюту', value: record.to },
        { label: 'Сума', value: `${record.amount} ${record.from}` },
        { label: 'Результат', value: `${record.result} ${record.to}`, accent: true },
        { label: 'Дата і час', value: formatTime(record.timestamp) }
    ];

    for (const row of rows) {
        const rowEl = document.createElement('div');
        rowEl.className = 'detail-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'detail-label';
        labelEl.textContent = row.label;

        const valueEl = document.createElement('span');
        valueEl.className = row.accent ? 'detail-value detail-value-accent' : 'detail-value';
        valueEl.textContent = row.value;

        rowEl.append(labelEl, valueEl);
        list.append(rowEl);
    }

    const actions = document.createElement('div');
    actions.className = 'detail-actions';

    const backLink = document.createElement('a');
    backLink.href = '#/history';
    backLink.setAttribute('data-link', '');
    backLink.className = 'item-btn item-link';
    backLink.textContent = 'Назад до історії';

    const homeLink = document.createElement('a');
    homeLink.href = '#/';
    homeLink.setAttribute('data-link', '');
    homeLink.className = 'item-btn';
    homeLink.textContent = 'На головну';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'item-btn item-btn-delete';
    deleteBtn.textContent = 'Видалити запис';
    deleteBtn.addEventListener('click', async () => {
        try {
            await deleteItem(record.id);
        } catch (err) {
            console.error(err);
        }
        navigate('/history');
    });

    actions.append(backLink, homeLink, deleteBtn);
    card.append(list, actions);
    container.append(card);
}

// Сторінка 404
function renderNotFound(container, path) {
    container.innerHTML = '';

    const card = document.createElement('section');
    card.className = 'converter-card';

    const title = document.createElement('h2');
    title.textContent = '404 — Сторінку не знайдено';

    const text = document.createElement('p');
    text.className = 'not-found-text';
    text.textContent = `Маршрут "${path}" не знайдено.`;

    const homeLink = document.createElement('a');
    homeLink.href = '#/';
    homeLink.setAttribute('data-link', '');
    homeLink.className = 'convert-btn link-btn';
    homeLink.textContent = 'Повернутися на головну';

    card.append(title, text, homeLink);
    container.append(card);
}

// Маршрути застосунку: головна форма, список історії та деталі запису за id
const routes = [
    { path: '/', view: renderHome },
    { path: '/history', view: renderHistory },
    { path: '/history/:id', view: renderHistoryDetail }
];

// Пошук маршруту і витягування параметрів
function matchRoute(path) {
    const pathParts = path.split('/').filter(Boolean);

    for (const route of routes) {
        const routeParts = route.path.split('/').filter(Boolean);
        if (routeParts.length !== pathParts.length) {
            continue;
        }

        const params = {};
        const isMatch = routeParts.every((part, i) => {
            if (part.startsWith(':')) {
                params[part.slice(1)] = pathParts[i];
                return true;
            }
            return part === pathParts[i];
        });

        if (isMatch) {
            return { view: route.view, params };
        }
    }

    return null;
}

function getCurrentPath() {
    const raw = location.hash.slice(1);
    if (!raw) {
        return '/';
    }
    return raw.startsWith('/') ? raw : '/' + raw;
}

function updateActiveNav(path) {
    const navLinks = document.querySelectorAll('.nav-link[data-link]');
    navLinks.forEach(link => {
        const target = link.getAttribute('href').replace(/^#/, '');
        const isActive = target === '/'
            ? path === '/'
            : path === target || path.startsWith(target + '/');
        link.classList.toggle('active', isActive);
    });
}

function navigate(rawHref) {
    const cleanPath = rawHref.startsWith('#') ? rawHref.slice(1) : rawHref;
    const normalized = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
    const targetHash = '#' + normalized;

    if (location.hash === targetHash) {
        renderRoute();
    } else {
        location.hash = targetHash;
    }
}

async function renderRoute() {
    const appContainer = document.querySelector('#app');
    if (!appContainer) {
        return;
    }

    const currentVersion = ++renderVersion;
    const path = getCurrentPath();

    cleanupCurrentView();
    updateActiveNav(path);

    const matched = matchRoute(path);
    if (!matched) {
        renderNotFound(appContainer, path);
        return;
    }

    await matched.view(appContainer, matched.params, currentVersion);
}

document.addEventListener('click', event => {
    const link = event.target.closest('a[data-link]');
    if (!link) {
        return;
    }

    event.preventDefault();
    navigate(link.getAttribute('href'));
});

window.addEventListener('hashchange', renderRoute);
window.addEventListener('DOMContentLoaded', renderRoute);
