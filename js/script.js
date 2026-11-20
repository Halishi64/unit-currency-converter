// Обрав Vue 3, бо підключається одним скриптом через CDN без Babel і має computed для автоперерахунку
const API_URL = 'https://api.frankfurter.dev/v1/latest?from=USD&to=EUR';

// Ключі localStorage і налаштування IndexedDB (модель запису: id, from, to, amount, result, timestamp)
const STORAGE_KEY = 'converterHistory';
const MIGRATED_KEY = 'historyMigrated';
const DB_NAME = 'ConverterDB';
const DB_VERSION = 1;
const STORE_NAME = 'history';

// Збереження історії в localStorage
function saveToLocalStorage(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Завантаження історії з localStorage з перевіркою JSON
function loadFromLocalStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error('Пошкоджені дані в localStorage:', error);
        return [];
    }
}

// Відкриття бази IndexedDB та створення сховища history з autoIncrement
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

// Додавання нового запису в IndexedDB
async function addItem(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const request = tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
    });
}

// Оновлення наявного запису в IndexedDB через put
async function updateItem(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Отримання всіх записів історії з IndexedDB
async function getAllItems() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Видалення запису з IndexedDB за id
async function deleteItem(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Одноразова міграція даних із localStorage в IndexedDB
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

Vue.createApp({
    components: {
        ConverterForm,
        RatesList
    },
    data() {
        return {
            rates: [
                { id: 1, code: 'USD', rate: 1, pinned: false },
                { id: 2, code: 'EUR', rate: 0.92, pinned: false },
                { id: 3, code: 'UAH', rate: 41.5, pinned: false }
            ],
            history: [],
            threshold: 10000,
            rateThreshold: 10,
            metaBase: 'USD',
            metaDate: '-',
            loading: false,
            errorMessage: '',
            storageError: '',
            animationId: null,
            animProgress: 1,
            isAnimating: false
        };
    },
    methods: {
        formatTime(timestamp) {
            return new Date(timestamp).toLocaleString('uk-UA');
        },
        togglePin(id) {
            const item = this.rates.find(r => r.id === id);
            if (item) {
                item.pinned = !item.pinned;
            }
        },
        // Малювання міні-графіка останніх результатів конвертації на Canvas
        drawChart(progress = 1) {
            const canvas = this.$refs.historyChart;
            if (!canvas) {
                return;
            }

            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            const padX = 36;
            const padY = 28;

            ctx.clearRect(0, 0, w, h);

            // Беремо записи з history у хронологічному порядку (від старіших до новіших)
            const points = this.history.slice().reverse();

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
            const range = maxVal - minVal || 1;
            const plotW = w - padX * 2;
            const plotH = h - padY * 2;
            const baseY = h - padY;

            // Сітка та базова вісь
            ctx.save();
            ctx.strokeStyle = '#E4E4E7';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padX, padY);
            ctx.lineTo(padX, baseY);
            ctx.lineTo(w - padX, baseY);
            ctx.stroke();

            // Координати точок з урахуванням поточного прогресу анімації
            const coords = points.map((item, idx) => {
                const x = points.length === 1
                    ? w / 2
                    : padX + (idx / (points.length - 1)) * plotW;
                const norm = (Number(item.result) - minVal) / range;
                const targetY = points.length === 1
                    ? h / 2
                    : baseY - norm * plotH;
                const y = baseY - (baseY - targetY) * progress;
                return { x, y, value: item.result, to: item.to };
            });

            // Лінія графіка
            ctx.strokeStyle = '#166534';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            coords.forEach((pt, idx) => {
                if (idx === 0) {
                    ctx.moveTo(pt.x, pt.y);
                } else {
                    ctx.lineTo(pt.x, pt.y);
                }
            });
            ctx.stroke();

            // Точки та підписи значень
            ctx.fillStyle = '#166534';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'center';
            coords.forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillText(String(pt.value), pt.x, pt.y - 10);
            });

            ctx.restore();
        },
        // Запуск циклу анімації через requestAnimationFrame
        startChartAnimation() {
            this.stopChartAnimation();
            this.animProgress = 0;
            this.isAnimating = true;

            const step = () => {
                this.animProgress += 0.04;

                if (this.animProgress >= 1) {
                    this.animProgress = 1;
                    this.drawChart(1);
                    this.stopChartAnimation();
                    return;
                }

                this.drawChart(this.animProgress);
                this.animationId = requestAnimationFrame(step);
            };

            this.animationId = requestAnimationFrame(step);
        },
        // Зупинка анімації через cancelAnimationFrame
        stopChartAnimation() {
            if (this.animationId !== null) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            this.isAnimating = false;
        },
        toggleChartAnimation() {
            if (this.isAnimating) {
                this.stopChartAnimation();
            } else {
                this.startChartAnimation();
            }
        },
        // Отримуємо записи з IndexedDB, сортуємо за timestamp і беремо останні 10
        async refreshHistory() {
            const items = await getAllItems();
            this.history = items
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10);
            saveToLocalStorage(this.history);
            this.startChartAnimation();
        },
        async addHistory(record) {
            try {
                this.storageError = '';
                await addItem({
                    from: record.from,
                    to: record.to,
                    amount: record.amount,
                    result: record.result,
                    timestamp: record.timestamp
                });
                await this.refreshHistory();
            } catch (error) {
                this.storageError = 'Не вдалося зберегти запис у IndexedDB. Збережено в localStorage.';
                console.error(error);
                this.history.unshift({ id: Date.now(), ...record });
                this.history = this.history.slice(0, 10);
                saveToLocalStorage(this.history);
                this.startChartAnimation();
            }
        },
        async recalculateItem(item) {
            const fromRate = this.rates.find(r => r.code === item.from);
            const toRate = this.rates.find(r => r.code === item.to);
            if (!fromRate || !toRate) {
                return;
            }

            const newResult = Number(((item.amount / fromRate.rate) * toRate.rate).toFixed(2));
            const updated = {
                id: item.id,
                from: item.from,
                to: item.to,
                amount: item.amount,
                result: newResult,
                timestamp: Date.now()
            };

            try {
                this.storageError = '';
                await updateItem(updated);
                await this.refreshHistory();
            } catch (error) {
                this.storageError = 'Не вдалося оновити запис у локальній базі даних.';
                console.error(error);
            }
        },
        async removeHistoryItem(id) {
            try {
                this.storageError = '';
                await deleteItem(id);
                await this.refreshHistory();
            } catch (error) {
                this.storageError = 'Не вдалося видалити запис із локальної бази даних.';
                console.error(error);
            }
        },
        async initStorage() {
            try {
                this.storageError = '';
                await migrateFromLocalStorage();
                await this.refreshHistory();
            } catch (error) {
                this.storageError = 'Не вдалося відкрити IndexedDB (можливо, увімкнено приватний режим). Завантажено дані з localStorage.';
                console.error(error);
                this.history = loadFromLocalStorage()
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 10);
                this.startChartAnimation();
            }
        },
        async loadRates() {
            this.errorMessage = '';
            this.loading = true;

            try {
                const response = await fetch(API_URL);

                if (!response.ok) {
                    if (response.status === 422 || response.status === 404) {
                        throw new Error(`Непідтримуваний код валюти (код ${response.status})`);
                    }
                    throw new Error(`Сервер відповів кодом ${response.status}`);
                }

                const data = await response.json();
                this.metaBase = data.base;
                this.metaDate = data.date;

                for (const [code, rate] of Object.entries(data.rates)) {
                    const existing = this.rates.find(item => item.code === code);
                    if (existing) {
                        existing.rate = rate;
                    }
                }
            } catch (error) {
                if (error.message.includes('Непідтримуваний код валюти')) {
                    this.errorMessage = 'Перевірте код валюти';
                } else {
                    this.errorMessage = 'Не вдалося завантажити курси валют. Спробуйте пізніше.';
                }
                console.error(error);
            } finally {
                this.loading = false;
            }
        }
    },
    mounted() {
        this.loadRates();
        this.initStorage();
    },
    beforeUnmount() {
        this.stopChartAnimation();
    }
}).mount('#app');
