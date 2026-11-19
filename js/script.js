console.log('script.js підключено');

const API_URL = 'https://api.frankfurter.dev/v1/latest?from=USD&to=EUR';

const placeholder = document.querySelector('#rates-list li');
if (placeholder) {
    placeholder.remove();
}

const rates = { USD: 1, EUR: 0.92, UAH: 41.5 };
const threshold = 10000;
const rateThreshold = 10;
const history = [];

const listContainer = document.querySelector('#rates-list');
const ratesCount = document.querySelector('#rates-count');
const ratesMeta = document.querySelector('#rates-meta');
const refreshBtn = document.querySelector('#refresh-btn');
const loadingStatus = document.querySelector('#loading-status');
const errorMessage = document.querySelector('#error-message');
const form = document.querySelector('#converter-form');
const amountInput = document.querySelector('#amount-input');
const fromSelect = document.querySelector('#from-currency');
const toSelect = document.querySelector('#to-currency');
const resultSpan = document.querySelector('#result');
const historyList = document.querySelector('#history-list');

// Функція генерує список курсів валют на сторінці та оновлює лічильник кількості валют
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

// Завантаження курсів валют із Frankfurter API (https://api.frankfurter.dev/)
async function loadRates() {
    errorMessage.hidden = true;
    loadingStatus.hidden = false;
    refreshBtn.disabled = true;

    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            if (response.status === 422 || response.status === 404) {
                throw new Error(`Непідтримуваний код валюти (код ${response.status})`);
            }
            throw new Error(`Сервер відповів кодом ${response.status}`);
        }

        const data = await response.json();
        console.log(data);

        Object.assign(rates, data.rates);
        ratesMeta.textContent = `Базова валюта: ${data.base}, дата: ${data.date}`;
        renderRates(data.rates);
    } catch (error) {
        if (error.message.includes('Непідтримуваний код валюти')) {
            errorMessage.textContent = 'Перевірте код валюти';
        } else {
            errorMessage.textContent = 'Не вдалося завантажити курси валют. Спробуйте пізніше.';
        }
        errorMessage.hidden = false;
        console.error(error);
    } finally {
        loadingStatus.hidden = true;
        refreshBtn.disabled = false;
    }
}

loadRates();

// Повторне завантаження курсів по кнопці «Оновити»
refreshBtn.addEventListener('click', loadRates);

// Функція перебирає всі ключі об'єкта курсів через for...of та виводить курси і підсумкову інформацію
function showAllRates(ratesObj) {
    const keys = Object.keys(ratesObj);
    let sum = 0;

    console.log('--- Поточні курси валют ---');
    for (const currency of keys) {
        const rate = ratesObj[currency];
        sum += rate;
        console.log(`${currency}: ${rate}`);
    }

    const average = sum / keys.length;
    console.log(`Усього валют: ${keys.length}, середнє значення курсу: ${average.toFixed(2)}`);
}

// Стрілкова функція обчислює результат конвертації за сумою та курсом
const convert = (amount, rate) => amount * rate;

// Функція перевіряє, чи перевищує результат конвертації заданий поріг («велика сума»)
function checkAmountSize(result, currency, limit) {
    if (result > limit) {
        console.log(`Результат ${result.toFixed(2)} ${currency} — велика сума (перевищує поріг ${limit})`);
    } else {
        console.log(`Результат ${result.toFixed(2)} ${currency} — звичайна сума (не перевищує поріг ${limit})`);
    }
}

showAllRates(rates);

console.log('--- Перевірка конвертації ---');

const amount1 = 300;
const resultUAH = convert(amount1, rates.UAH);
console.log(`${amount1} USD = ${resultUAH} UAH`);
checkAmountSize(resultUAH, 'UAH', threshold);

const amount2 = 50;
const resultEUR = convert(amount2, rates.EUR);
console.log(`${amount2} USD = ${resultEUR} EUR`);
checkAmountSize(resultEUR, 'EUR', threshold);

// Функція виводить список історії конвертацій на сторінку
function renderHistory(items) {
    historyList.innerHTML = '';

    for (const item of items) {
        const li = document.createElement('li');
        li.textContent = `${item.amount} ${item.from} = ${item.result} ${item.to}`;
        li.dataset.result = item.result;

        if (item.result > threshold) {
            li.classList.add('big-rate');
        }

        historyList.append(li);
    }
}

// Функція перераховує та оновлює результат при зміні валюти
function updateInstantResult() {
    const amount = Number(amountInput.value);
    const from = fromSelect.value.toUpperCase();
    const to = toSelect.value.toUpperCase();

    if (amountInput.value === '' || amount <= 0) {
        resultSpan.textContent = '0';
        return;
    }

    const amountInUSD = amount / rates[from];
    const converted = Number(convert(amountInUSD, rates[to]).toFixed(2));
    resultSpan.textContent = `${converted} ${to}`;
}

// Обробник відправки форми: обчислює результат і додає запис в історію
form.addEventListener('submit', event => {
    event.preventDefault();

    const amount = Number(amountInput.value);
    const from = fromSelect.value.toUpperCase();
    const to = toSelect.value.toUpperCase();

    const amountInUSD = amount / rates[from];
    const result = Number(convert(amountInUSD, rates[to]).toFixed(2));
    resultSpan.textContent = `${result} ${to}`;

    const newConversion = { amount, from, to, result };
    history.push(newConversion);
    renderHistory(history);

    form.reset();
});

// Перевірка введеної суми на додатне значення
amountInput.addEventListener('input', () => {
    if (amountInput.value !== '' && Number(amountInput.value) <= 0) {
        amountInput.setCustomValidity('Сума має бути додатною');
    } else {
        amountInput.setCustomValidity('');
    }
});

// Миттєвий перерахунок при зміні валюти у списку
fromSelect.addEventListener('change', updateInstantResult);
toSelect.addEventListener('change', updateInstantResult);
