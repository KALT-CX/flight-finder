import fs from 'node:fs/promises';

const API_KEY = process.env.AVIATION_EDGE_API_KEY;
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || 30);
const DEPARTURE_AIRPORT = process.env.DEPARTURE_AIRPORT || 'HKG';
const AIRLINE_IATA = process.env.AIRLINE_IATA || 'CX';
const OUTPUT_FILE = process.env.OUTPUT_FILE || 'flights.json';
const BASE_URL = process.env.AVIATION_EDGE_BASE_URL || 'https://aviation-edge.com/v2/public/flightsFuture';

if (!API_KEY) {
  throw new Error('Missing AVIATION_EDGE_API_KEY. Add it as a GitHub Actions secret.');
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function extractTime(value) {
  if (!value) return '';
  const text = String(value);

  // Supports ISO strings such as 2026-07-01T08:15:00.000 and plain HH:mm values.
  const timeMatch = text.match(/(?:T|\s)?(\d{2}:\d{2})(?::\d{2})?/);
  return timeMatch ? timeMatch[1] : '';
}

function minutesFromTime(value) {
  const [hours = 0, minutes = 0] = String(value || '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function timeBand(time) {
  const mins = minutesFromTime(time);
  if (mins >= 360 && mins < 720) return 'Morning';
  if (mins >= 720 && mins < 1080) return 'Afternoon';
  if (mins >= 1080 && mins < 1320) return 'Evening';
  return 'Night';
}

function getNested(object, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], object);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function cleanCityName(value, airportCode) {
  const text = String(value || '').trim();
  if (!text) return airportCode || '';
  return text.replace(/\s*\([A-Z0-9]{3}\)\s*$/, '');
}

async function loadExistingMetadata() {
  try {
    const content = await fs.readFile(OUTPUT_FILE, 'utf8');
    const existingFlights = JSON.parse(content);
    const airportMap = new Map();

    for (const flight of existingFlights) {
      if (!flight.arrival_airport) continue;
      airportMap.set(flight.arrival_airport, {
        country: flight.country || '',
        arrival_city: flight.arrival_city || flight.arrival_airport,
        arrival_airport: flight.arrival_airport
      });
    }

    return airportMap;
  } catch (error) {
    console.warn(`No existing ${OUTPUT_FILE} metadata found. New destinations will use airport code as city/country fallback.`);
    return new Map();
  }
}

async function fetchFutureSchedule(date) {
  const url = new URL(BASE_URL);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('type', 'departure');
  url.searchParams.set('iataCode', DEPARTURE_AIRPORT);
  url.searchParams.set('date', date);
  url.searchParams.set('airline_iata', AIRLINE_IATA);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed for ${date}: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  if (json.error) throw new Error(`API error for ${date}: ${JSON.stringify(json.error)}`);

  return [];
}

function normalizeFlight(rawFlight, airportMap) {
  const flightNumber = String(getNested(rawFlight, [
    'flight.iataNumber',
    'flight.iata',
    'flight.iataCode',
    'flight.number',
    'flight_iata',
    'flightIata',
    'flightNumber'
  ])).replace(/\s+/g, '').toUpperCase();

  if (!flightNumber || !flightNumber.startsWith(AIRLINE_IATA)) return null;

  const arrivalAirport = String(getNested(rawFlight, [
    'arrival.iataCode',
    'arrival.iata',
    'arrival.airportIata',
    'arrival_iata',
    'arr_iataCode',
    'arrIataCode'
  ])).toUpperCase();

  if (!arrivalAirport) return null;

  const departureTimeRaw = getNested(rawFlight, [
    'departure.scheduledTime',
    'departure.scheduled',
    'departure.estimatedTime',
    'departure.time',
    'departure_time'
  ]);

  const arrivalTimeRaw = getNested(rawFlight, [
    'arrival.scheduledTime',
    'arrival.scheduled',
    'arrival.estimatedTime',
    'arrival.time',
    'arrival_time'
  ]);

  const departureTime = extractTime(departureTimeRaw);
  const arrivalTime = extractTime(arrivalTimeRaw);

  if (!departureTime || !arrivalTime) return null;

  const metadata = airportMap.get(arrivalAirport) || {};
  const arrivalCityRaw = getNested(rawFlight, [
    'arrival.airport',
    'arrival.airportName',
    'arrival.city',
    'arrival.cityName'
  ]);

  const departureMinutes = minutesFromTime(departureTime);
  const arrivalMinutesRaw = minutesFromTime(arrivalTime);
  const arrivalNextDay = arrivalMinutesRaw < departureMinutes;
  const arrivalMinutes = arrivalMinutesRaw + (arrivalNextDay ? 1440 : 0);

  return {
    country: metadata.country || arrivalAirport,
    arrival_city: metadata.arrival_city || `${cleanCityName(arrivalCityRaw, arrivalAirport)} (${arrivalAirport})`,
    arrival_airport: arrivalAirport,
    flight_number: flightNumber,
    departure_time: departureTime,
    arrival_time: arrivalTime,
    duration: formatDuration(arrivalMinutes - departureMinutes),
    departure_band: timeBand(departureTime),
    arrival_next_day: arrivalNextDay
  };
}

function distinctFlights(flights) {
  const map = new Map();

  for (const flight of flights) {
    const key = [
      flight.flight_number,
      flight.arrival_airport,
      flight.departure_time,
      flight.arrival_time
    ].join('|');

    if (!map.has(key)) map.set(key, flight);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.departure_time.localeCompare(b.departure_time) ||
    a.arrival_airport.localeCompare(b.arrival_airport) ||
    a.flight_number.localeCompare(b.flight_number)
  );
}

async function main() {
  const airportMap = await loadExistingMetadata();
  const today = new Date();
  const allFlights = [];

  for (let i = 0; i < DAYS_AHEAD; i += 1) {
    const date = formatDate(addDays(today, i));
    console.log(`Fetching ${AIRLINE_IATA} departures from ${DEPARTURE_AIRPORT} on ${date}...`);

    try {
      const rawFlights = await fetchFutureSchedule(date);
      for (const rawFlight of rawFlights) {
        const normalized = normalizeFlight(rawFlight, airportMap);
        if (normalized) allFlights.push(normalized);
      }
    } catch (error) {
      console.error(error.message);
      // Continue next date to avoid one bad date blocking the whole update.
    }
  }

  const output = distinctFlights(allFlights);

  if (!output.length) {
    throw new Error('No flights generated. Existing flights.json was not overwritten. Check API key, plan, endpoint, or response format.');
  }

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Saved ${output.length} distinct flights to ${OUTPUT_FILE}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
