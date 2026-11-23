const express = require('express');
const path = require('path');
const ratesData = require('./rates.json');

const app = express();
const PORT = 3000;

// Роздача статичних файлів клієнтської частини
app.use(express.static(path.join(__dirname, '..')));

// Повернення локальних курсів або обчислення суми за query-параметрами
app.get('/api/rates', (req, res) => {
    const { from, to, amount } = req.query;

    if (!from && !to) {
        return res.json(ratesData);
    }

    if (!from || !to) {
        return res.status(400).json({ error: 'Вкажіть обидва параметри: from і to' });
    }

    const fromCode = String(from).toUpperCase();
    const toCode = String(to).toUpperCase();
    const fromRate = ratesData.rates[fromCode];
    const toRate = ratesData.rates[toCode];

    if (fromRate === undefined || toRate === undefined) {
        return res.status(404).json({ error: 'Невідомий код валюти' });
    }

    const numAmount = amount !== undefined ? Number(amount) : 1;
    if (!numAmount || numAmount <= 0) {
        return res.status(400).json({ error: 'Сума має бути додатнім числом' });
    }

    const result = Number(((numAmount / fromRate) * toRate).toFixed(2));
    res.json({
        from: fromCode,
        to: toCode,
        amount: numAmount,
        result
    });
});

// Обробка неіснуючих API-маршрутів
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ендпоінт не знайдено' });
});

app.listen(PORT, () => {
    console.log(`Сервер запущено на http://localhost:${PORT}`);
});
