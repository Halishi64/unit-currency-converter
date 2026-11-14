console.log('script.js підключено');

const placeholder = document.querySelector('#rates-list li');
if (placeholder) {
    placeholder.remove();
}

const rates = { USD: 1, EUR: 0.92, UAH: 41.5 };
const threshold = 10000;
const rateThreshold = 10;

const listContainer = document.querySelector('#rates-list');
const ratesCount = document.querySelector('#rates-count');

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

renderRates(rates);

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
