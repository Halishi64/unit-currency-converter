console.log('script.js підключено');

const rates = { USD: 1, EUR: 0.92, UAH: 41.5 };
const threshold = 10000;

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
