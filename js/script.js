// Обрав Vue 3, бо підключається одним скриптом через CDN без Babel і має computed для автоперерахунку
const API_URL = 'https://api.frankfurter.dev/v1/latest?from=USD&to=EUR';

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
                id: Date.now(),
                amount: value,
                from: this.fromUnit,
                to: this.toUnit,
                result: this.result
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
            errorMessage: ''
        };
    },
    methods: {
        togglePin(id) {
            const item = this.rates.find(r => r.id === id);
            if (item) {
                item.pinned = !item.pinned;
            }
        },
        addHistory(record) {
            this.history.push(record);
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
    }
}).mount('#app');

/*
// Старий ручний рендер із 7 лаби, замінив на компонент RatesList
function renderRates(ratesObj) {
    listContainer.innerHTML = '';
    const entries = Object.entries(ratesObj);

    for (const [currency, rate] of entries) {
        const li = document.createElement('li');
        li.textContent = `${currency}: ${rate}`;
        li.dataset.rate = rate;

        if (rate > rateThreshold) {
            li.classList.add('big-rate');
        }

        listContainer.append(li);
    }

    ratesCount.textContent = `Кількість валют у списку: ${entries.length}`;
}
*/
