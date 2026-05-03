const CWA_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";

const CITY_DATASETS = {
  "宜蘭縣": "001",
  "桃園市": "005",
  "新竹縣": "009",
  "苗栗縣": "013",
  "彰化縣": "017",
  "南投縣": "021",
  "雲林縣": "025",
  "嘉義縣": "029",
  "屏東縣": "033",
  "臺東縣": "037",
  "花蓮縣": "041",
  "澎湖縣": "045",
  "基隆市": "049",
  "新竹市": "053",
  "嘉義市": "057",
  "臺北市": "061",
  "高雄市": "065",
  "新北市": "069",
  "臺中市": "073",
  "臺南市": "077",
  "連江縣": "081",
  "金門縣": "085"
};

const FALLBACK_LOCATION = { city: "臺北市", district: "信義區", source: "預設地點" };

const ELEMENT_ALIASES = {
  temp: ["T", "溫度", "平均溫度"],
  wx: ["Wx", "天氣現象", "天氣"],
  max: ["MaxT", "最高溫度", "最高溫"],
  min: ["MinT", "最低溫度", "最低溫"],
  rh: ["RH", "相對濕度", "濕度"],
  wind: ["WS", "風速"],
  windDir: ["WD", "風向"],
  apparent: ["AT", "體感溫度", "體感"],
  comfort: ["CI", "舒適度指數", "舒適度"],
  pop3h: ["PoP3h", "PoP", "3小時降雨機率", "三小時降雨機率", "降雨機率"],
  pop6h: ["PoP6h", "PoP", "6小時降雨機率", "六小時降雨機率", "降雨機率"],
  pop12h: ["PoP12h", "PoP", "12小時降雨機率", "十二小時降雨機率", "降雨機率"],
  uvi: ["UVI", "紫外線指數", "紫外線"],
  weatherDescription: ["天氣預報綜合描述", "WeatherDescription"]
};

const VALUE_KEYS = {
  temp: ["Temperature", "MaxTemperature", "MinTemperature", "value", "Value"],
  wx: ["Weather", "Wx", "value", "Value"],
  max: ["MaxTemperature", "MaxT", "Temperature", "value", "Value"],
  min: ["MinTemperature", "MinT", "Temperature", "value", "Value"],
  rh: ["RelativeHumidity", "RH", "value", "Value"],
  wind: ["WindSpeed", "WS", "value", "Value"],
  windDir: ["WindDirection", "WD", "value", "Value"],
  apparent: ["ApparentTemperature", "AT", "Temperature", "value", "Value"],
  comfort: ["ComfortIndexDescription", "ComfortIndex", "CI", "value", "Value"],
  pop3h: ["ProbabilityOfPrecipitation", "PoP3h", "PoP", "value", "Value"],
  pop6h: ["ProbabilityOfPrecipitation", "PoP6h", "PoP", "value", "Value"],
  pop12h: ["ProbabilityOfPrecipitation", "PoP12h", "PoP", "value", "Value"],
  uvi: ["UVIndex", "UVI", "value", "Value"],
  weatherDescription: ["WeatherDescription", "value", "Value"]
};

function normalizeTaiwanName(value = "") {
  return String(value).replace(/台/g, "臺").replace(/\s/g, "").trim();
}

function listFromMaybe(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function datasetFor7Day(city) {
  const base = CITY_DATASETS[city] || CITY_DATASETS[FALLBACK_LOCATION.city];
  return String(Number(base) + 2).padStart(3, "0");
}

function cwaUrl(dataset, params = {}) {
  const key = process.env.CWA_API_KEY;
  if (!key) throw new Error("Missing CWA_API_KEY");
  const url = new URL(`${CWA_BASE}/${dataset}`);
  url.searchParams.set("Authorization", key);
  url.searchParams.set("format", "JSON");
  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, value);
  });
  return url.toString();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function safeJson(url) {
  try {
    const json = await fetchJson(url);
    if (json.success === false || json.success === "false") return null;
    return json;
  } catch (error) {
    console.warn("fetch failed", url, error.message);
    return null;
  }
}

function forecastLocations(json) {
  const records = json?.records || {};
  const locations = listFromMaybe(records.locations || records.Locations);
  const grouped = locations.flatMap((group) => listFromMaybe(group.location || group.Location));
  const direct = listFromMaybe(records.location || records.Location);
  return [...grouped, ...direct];
}

function pickForecastLocation(json, district) {
  const locations = forecastLocations(json);
  const key = normalizeTaiwanName(district);
  return locations.find((loc) => normalizeTaiwanName(loc.locationName || loc.LocationName).includes(key)) || locations[0] || null;
}

function weatherElements(location) {
  return listFromMaybe(location?.weatherElement || location?.WeatherElement);
}

function element(location, aliases) {
  const names = listFromMaybe(aliases);
  const elements = weatherElements(location);
  return elements.find((item) => names.includes(item.elementName || item.ElementName))
    || elements.find((item) => names.some((name) => String(item.elementName || item.ElementName || "").includes(name)))
    || null;
}

function times(location, key) {
  return listFromMaybe(element(location, ELEMENT_ALIASES[key])?.time || element(location, ELEMENT_ALIASES[key])?.Time);
}

function valueOf(entry, fallback = "--", preferredKeys = []) {
  const values = listFromMaybe(entry?.elementValue || entry?.ElementValue);
  const first = values[0] || {};
  const candidates = [...preferredKeys, "value", "Value", "measures", "Measures"];
  let raw;
  for (const key of candidates) {
    if (first[key] !== undefined && first[key] !== null && first[key] !== "") {
      raw = first[key];
      break;
    }
  }
  if (raw === undefined) {
    const generic = Object.entries(first).find(([key, value]) => (
      value !== undefined
      && value !== null
      && value !== ""
      && !/Code$/i.test(key)
      && !/Unit$/i.test(key)
    ));
    raw = generic?.[1] ?? entry?.value ?? entry?.Value ?? fallback;
  }
  if (raw === "" || raw === undefined || raw === null || raw === "-99" || raw === "-999") return fallback;
  return String(raw);
}

function valueAt(location, key, index = 0, fallback = "--") {
  return valueOf(times(location, key)[index], fallback, VALUE_KEYS[key] || []);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanRain(value) {
  if (value === undefined || value === null || value === "" || value === "-99" || value === "-999") return "0.0";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : String(value);
}

function startTime(entry) {
  return entry?.dataTime || entry?.DataTime || entry?.startTime || entry?.StartTime || "";
}

function endTime(entry) {
  return entry?.endTime || entry?.EndTime || "";
}

function formatHour(entry) {
  const start = new Date(startTime(entry));
  const end = new Date(endTime(entry));
  if (Number.isNaN(start.getTime())) return "--";
  const h1 = String(start.getHours()).padStart(2, "0");
  if (!Number.isNaN(end.getTime())) return `${h1}-${String(end.getHours()).padStart(2, "0")}`;
  return `${h1}:00`;
}

function formatUpdated() {
  return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function formatWeekday(entry, index) {
  const date = new Date(startTime(entry));
  if (Number.isNaN(date.getTime())) return `第 ${index + 1} 天`;
  return new Intl.DateTimeFormat("zh-TW", { weekday: "short", month: "numeric", day: "numeric" }).format(date);
}

function obsStations(json) {
  return listFromMaybe(json?.records?.Station || json?.records?.station);
}

function stationTown(station) {
  return normalizeTaiwanName(station?.GeoInfo?.TownName || station?.GeoInfo?.CountyName || station?.StationName || "");
}

function findStation(json, district, city) {
  const stations = obsStations(json);
  const townKey = normalizeTaiwanName(district).replace(/區|鄉|鎮|市$/, "");
  const cityKey = normalizeTaiwanName(city);
  return stations.find((station) => stationTown(station).includes(townKey))
    || stations.find((station) => normalizeTaiwanName(station?.GeoInfo?.CountyName || "").includes(cityKey))
    || stations[0]
    || null;
}

function stationValue(station, keys, fallback = "--") {
  const node = station?.WeatherElement || station?.weatherElement || station?.RainfallElement || {};
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], node);
    if (value !== undefined && value !== null && value !== "" && value !== "-99" && value !== "-999") return String(value);
  }
  return fallback;
}

function findAqi(records, city, district) {
  const rows = listFromMaybe(records?.records);
  const cityKey = normalizeTaiwanName(city);
  const districtKey = normalizeTaiwanName(district).replace(/區|鄉|鎮|市$/, "");
  return rows.find((row) => normalizeTaiwanName(row.county).includes(cityKey) && normalizeTaiwanName(row.sitename).includes(districtKey))
    || rows.find((row) => normalizeTaiwanName(row.county).includes(cityKey))
    || null;
}

function uviLocations(json) {
  return listFromMaybe(json?.records?.weatherElement?.location || json?.records?.location || json?.records?.Location);
}

function findUvi(json, city) {
  const rows = uviLocations(json);
  const cityKey = normalizeTaiwanName(city);
  return rows.find((row) => normalizeTaiwanName(row.County || row.county || row.CountyName).includes(cityKey)) || rows[0] || null;
}

function buildHourly(loc3d, currentRain) {
  const tempTimes = times(loc3d, "temp");
  const wxTimes = times(loc3d, "wx");
  const popTimes = times(loc3d, "pop3h").length ? times(loc3d, "pop3h") : (times(loc3d, "pop6h").length ? times(loc3d, "pop6h") : times(loc3d, "pop12h"));
  const rhTimes = times(loc3d, "rh");
  const atTimes = times(loc3d, "apparent");
  const windTimes = times(loc3d, "wind");
  const length = Math.max(tempTimes.length, wxTimes.length, popTimes.length, rhTimes.length, atTimes.length, windTimes.length);

  return Array.from({ length: Math.min(length, 12) }, (_, index) => {
    const anchor = tempTimes[index] || wxTimes[index] || popTimes[index] || {};
    const popEntry = popTimes[index] || popTimes[Math.floor(index / 2)] || popTimes[0];
    return {
      time: formatHour(anchor),
      temp: valueOf(tempTimes[index], "--", VALUE_KEYS.temp),
      wx: valueOf(wxTimes[index] || wxTimes[Math.floor(index / 2)] || wxTimes[0], "--", VALUE_KEYS.wx),
      pop: valueOf(popEntry, "--", VALUE_KEYS.pop3h),
      rain: index === 0 ? currentRain : "--",
      rh: valueOf(rhTimes[index] || rhTimes[Math.floor(index / 2)], "--", VALUE_KEYS.rh),
      apparent: valueOf(atTimes[index] || atTimes[Math.floor(index / 2)], "--", VALUE_KEYS.apparent),
      wind: valueOf(windTimes[index] || windTimes[Math.floor(index / 2)], "--", VALUE_KEYS.wind)
    };
  }).filter((item) => item.time !== "--" || item.temp !== "--" || item.wx !== "--");
}

function buildDaily(loc7d) {
  const wx = times(loc7d, "wx");
  const max = times(loc7d, "max");
  const min = times(loc7d, "min");
  const pop = times(loc7d, "pop12h").length ? times(loc7d, "pop12h") : times(loc7d, "pop6h");
  return Array.from({ length: 7 }, (_, index) => {
    const i = index * 2;
    const anchor = wx[i] || max[i] || min[i] || pop[i] || {};
    return {
      day: formatWeekday(anchor, index),
      wx: valueOf(wx[i] || wx[index], "--", VALUE_KEYS.wx),
      max: valueOf(max[i] || max[index], "--", VALUE_KEYS.max),
      min: valueOf(min[i] || min[index], "--", VALUE_KEYS.min),
      pop: valueOf(pop[i] || pop[index], "--", VALUE_KEYS.pop12h)
    };
  }).filter((item) => item.wx !== "--" || item.max !== "--" || item.min !== "--");
}

function cityForecastFallback(json, city) {
  const cityKey = normalizeTaiwanName(city);
  const locations = forecastLocations(json);
  const loc = locations.find((item) => normalizeTaiwanName(item.locationName || item.LocationName).includes(cityKey)) || locations[0] || null;
  if (!loc) return null;
  return {
    wx: valueAt(loc, "wx", 0),
    pop: valueAt(loc, "pop12h", 0),
    min: valueAt(loc, "min", 0),
    max: valueAt(loc, "max", 0)
  };
}

async function loadWeather({ city, district, source }) {
  const safeCity = CITY_DATASETS[city] ? city : FALLBACK_LOCATION.city;
  const safeDistrict = district || FALLBACK_LOCATION.district;
  const baseId = CITY_DATASETS[safeCity];
  const id7 = datasetFor7Day(safeCity);
  const moenvKey = process.env.MOENV_API_KEY;

  const [forecast3d, forecast7d, city36h, obs, rainObs, uviObs, aqi] = await Promise.all([
    safeJson(cwaUrl(`F-D0047-${baseId}`, { locationName: safeDistrict })),
    safeJson(cwaUrl(`F-D0047-${id7}`, { locationName: safeDistrict })),
    safeJson(cwaUrl("F-C0032-001", { locationName: safeCity })),
    safeJson(cwaUrl("O-A0001-001")),
    safeJson(cwaUrl("O-A0002-001")),
    safeJson(cwaUrl("O-A0005-001")),
    moenvKey
      ? safeJson(`https://data.moenv.gov.tw/api/v2/aqx_p_432?language=zh&api_key=${moenvKey}&limit=1000&format=JSON`)
      : Promise.resolve(null)
  ]);

  const loc3d = pickForecastLocation(forecast3d, safeDistrict);
  const loc7d = pickForecastLocation(forecast7d, safeDistrict);
  const station = findStation(obs, safeDistrict, safeCity);
  const rainStation = findStation(rainObs, safeDistrict, safeCity);
  const aqiRow = findAqi(aqi, safeCity, safeDistrict);
  const uviRow = findUvi(uviObs, safeCity);
  const cityFallback = cityForecastFallback(city36h, safeCity);

  const currentRain = cleanRain(stationValue(rainStation, ["Now.Precipitation", "Past1hr.Precipitation", "Precipitation"], "0"));
  const current = {
    city: safeCity,
    district: safeDistrict,
    temp: stationValue(station, ["AirTemperature", "Temperature"], valueAt(loc3d, "temp")),
    wx: valueAt(loc3d, "wx", 0, cityFallback?.wx || "未提供"),
    max: valueAt(loc7d, "max", 0, valueAt(loc3d, "max", 0, cityFallback?.max || "--")),
    min: valueAt(loc7d, "min", 0, valueAt(loc3d, "min", 0, cityFallback?.min || "--")),
    rh: stationValue(station, ["RelativeHumidity"], valueAt(loc3d, "rh")),
    wind: stationValue(station, ["WindSpeed"], valueAt(loc3d, "wind")),
    windDir: stationValue(station, ["WindDirection"], valueAt(loc3d, "windDir")),
    visibility: stationValue(station, ["VisibilityDescription", "Visibility"], "未提供"),
    apparent: valueAt(loc3d, "apparent", 0, stationValue(station, ["AirTemperature"], "--")),
    comfort: valueAt(loc3d, "comfort", 0, "--"),
    rain: currentRain,
    pop: valueAt(loc3d, "pop3h", 0, valueAt(loc3d, "pop6h", 0, valueAt(loc3d, "pop12h", 0, cityFallback?.pop || "--"))),
    uvi: uviRow?.UVIndex || uviRow?.uvi || valueAt(loc7d, "uvi"),
    aqi: aqiRow?.aqi || "--",
    aqiStatus: aqiRow?.status || "未提供",
    pm25: aqiRow?.["pm2.5"] || "--"
  };

  const hourly = buildHourly(loc3d, current.rain);
  const daily = buildDaily(loc7d);
  const missing = [
    !loc3d && "鄉鎮預報",
    !cityFallback && "36小時縣市預報",
    !station && "即時觀測",
    !rainStation && "雨量站",
    !aqiRow && "AQI",
    !uviRow && "UVI"
  ].filter(Boolean);

  return {
    place: { city: safeCity, district: safeDistrict, source: source || "手動輸入" },
    current,
    hourly,
    daily,
    missing,
    updatedAt: formatUpdated()
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const city = normalizeTaiwanName(req.query.city || FALLBACK_LOCATION.city);
    const district = normalizeTaiwanName(req.query.district || FALLBACK_LOCATION.district);
    const source = String(req.query.source || "手動輸入");
    const data = await loadWeather({ city, district, source });
    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Weather API failed" });
  }
};
