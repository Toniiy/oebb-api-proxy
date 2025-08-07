const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;
const API_URL = process.env.EXTERNAL_API_URL || '';
const API_KEY = process.env.API_KEY || '';

app.get('/', (req, res) => {
  res.json({
    message: 'OEBB API Proxy is running. Use /train?query=<...> to fetch data.'
  });
});

app.get('/train', async (req, res) => {
  try {
    if (!API_URL) {
      return res.status(500).json({ error: 'EXTERNAL_API_URL environment variable is not set.' });
    }
    // Append query parameters to API_URL if provided
    const query = req.originalUrl.split('?')[1] || '';
    const url = query ? `${API_URL}?${query}` : API_URL;
    const headers = API_KEY ? { 'Authorization': API_KEY } : {};
    const response = await fetch(url, { headers });
    const data = await response.json();
    // Extract common fields if they exist
    const departure = data.departure_time || data.departureTime || data.departure || null;
    const arrival = data.arrival_time || data.arrivalTime || data.arrival || null;
    const delay = data.delay_minutes || data.delay || data.delayMinutes || null;
    const type = data.train_type || data.trainType || data.type || null;
    res.json({
      departureTime: departure,
      arrivalTime: arrival,
      delayMinutes: delay,
      trainType: type,
      raw: data
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching or parsing data from external API.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
