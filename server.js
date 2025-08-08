const express = require('express');

const cors = require('cors');
const createClient = require('hafas-client');
const oebb = require('hafas-client/p/oebb');

const app = express();
app.use(cors());

const client = createClient(oebb, 'oebb-api-proxy');

const CACHE_DURATION = parseInt(process.env.CACHE_DURATION, 10) || 5 * 60 * 1000; // default 5 minutes
const cache = {};

const getJourneys = async (from, to) => {
  const key = `${from}_${to}`;
  const now = Date.now();
  if (cache[key] && now - cache[key].timestamp < CACHE_DURATION) {
    return cache[key].data;
  }
  const result = await client.journeys(from, to, {
    results: 5,
    duration: 240, // minutes (4 hours)
    departure: new Date()
  });
  cache[key] = { data: result.journeys, timestamp: now };
  return result.journeys;
};

const transformJourney = (journey) => {
  const firstLeg = journey.legs[0];
  const lastLeg = journey.legs[journey.legs.length - 1];

  const plannedDeparture = new Date(firstLeg.plannedDeparture || firstLeg.departure);
  const actualDeparture = new Date(firstLeg.departure || firstLeg.plannedDeparture);
  const plannedArrival = new Date(lastLeg.plannedArrival || lastLeg.arrival);
  const actualArrival = new Date(lastLeg.arrival || lastLeg.plannedArrival);

  const delayMinutes = Math.round((actualDeparture - plannedDeparture) / 60000) || 0;
  let status = 'on-time';
  if (delayMinutes > 0 && delayMinutes <= 5) {
    status = 'slightly delayed';
  } else if (delayMinutes > 5) {
    status = 'delayed';
  }

  const line = firstLeg.line || {};
  const trainNumber = line.name || line.fahrtNr || null;
  const trainType = line.product || line.productName || null;
  const platform = firstLeg.platform || (firstLeg.origin && firstLeg.origin.platform) || null;

  return {
    departureTime: actualDeparture.toISOString(),
    arrivalTime: actualArrival.toISOString(),
    delayMinutes,
    trainNumber,
    trainType,
    platform,
    status
  };
};

const handleRoute = async (res, from, to) => {
  try {
    const journeys = await getJourneys(from, to);
    const upcoming = journeys.filter((j) => {
      const dep = new Date(j.legs[0].departure || j.legs[0].plannedDeparture);
      return (dep.getTime() - Date.now()) / (1000 * 60) <= 240;
    }).slice(0, 3);
    const data = upcoming.map(transformJourney);
    res.json({ route: `${from} -> ${to}`, results: data });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch data' });
  }
};

app.get('/trains/stpoelten-linz', (req, res) => {
  handleRoute(res, 'Sankt P\u00f6lten Hbf', 'Linz/Donau Hbf');
});

app.get('/trains/linz-stpoelten', (req, res) => {
  handleRoute(res, 'Linz/Donau Hbf', 'Sankt P\u00f6lten Hbf');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server is running on port ' + PORT);
});
