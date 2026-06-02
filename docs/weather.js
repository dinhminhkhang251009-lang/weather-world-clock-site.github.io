const locationForm = document.querySelector('#location-form');
const locationInput = document.querySelector('#location-input');
const statusPanel = document.querySelector('#status-panel');
const weatherContent = document.querySelector('#weather-content');
const timeContent = document.querySelector('#time-content');
const forecastContent = document.querySelector('#forecast-content');
const presetButtons = document.querySelectorAll('.presets button');
const cityButtons = document.querySelectorAll('.city-grid button');
const mapCaption = document.querySelector('#map-caption');
let currentTimezone = null;
let timeTimer = null;
let map = null;
let marker = null;

const weatherCodes = {
  0: 'Trời quang',
  1: 'Ít mây',
  2: 'Có mây',
  3: 'Mây che phủ',
  45: 'Sương mù',
  48: 'Sương muối',
  51: 'Mưa phùn nhẹ',
  53: 'Mưa phùn vừa',
  55: 'Mưa phùn dày',
  56: 'Mưa phùn lạnh',
  57: 'Mưa phùn băng',
  61: 'Mưa nhẹ',
  63: 'Mưa vừa',
  65: 'Mưa to',
  66: 'Mưa băng nhẹ',
  67: 'Mưa băng nặng',
  71: 'Tuyết nhẹ',
  73: 'Tuyết vừa',
  75: 'Tuyết to',
  77: 'Mưa tuyết',
  80: 'Mưa rào nhẹ',
  81: 'Mưa rào vừa',
  82: 'Mưa rào to',
  85: 'Mưa tuyết nhẹ',
  86: 'Mưa tuyết nặng',
  95: 'Dông giật',
  96: 'Dông giật có mưa đá nhẹ',
  99: 'Dông giật có mưa đá nặng'
};

function setStatus(message, isError = false) {
  statusPanel.textContent = message;
  statusPanel.style.color = isError ? '#ffb3b3' : 'var(--muted)';
}

function formatTemperature(value) {
  return `${value.toFixed(1)}°C`;
}

function formatTimeZone(timezone) {
  return timezone.replace('_', ' ');
}

function initMap() {
  if (map) return;
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(map);
}

function showMap(latitude, longitude, locationName) {
  initMap();
  const position = [latitude, longitude];

  if (!marker) {
    marker = L.marker(position).addTo(map);
  } else {
    marker.setLatLng(position);
  }

  map.setView(position, 8, { animate: true });
  mapCaption.textContent = `${locationName} — Lat ${latitude.toFixed(3)}, Lon ${longitude.toFixed(3)}`;

  setTimeout(() => {
    map.invalidateSize();
  }, 300);
}

function createForecastHtml(days) {
  return days.map(day => {
    const description = weatherCodes[day.code] || 'Không xác định';
    const precip = day.precipitation >= 0 ? `${day.precipitation.toFixed(1)} mm` : '0 mm';
    return `
      <div class="forecast-item">
        <strong>${day.label}</strong>
        <p>${description}</p>
        <p>Max: <strong>${formatTemperature(day.temperatureMax)}</strong></p>
        <p>Min: <strong>${formatTemperature(day.temperatureMin)}</strong></p>
        <p>Trời mưa: <strong>${precip}</strong></p>
      </div>
    `;
  }).join('');
}

function showForecast(daily) {
  if (!daily || !daily.time) {
    forecastContent.innerHTML = '<p>Không có dữ liệu dự báo.</p>';
    return;
  }

  const days = daily.time.map((date, index) => {
    const dateObj = new Date(date);
    const label = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(dateObj);
    return {
      label,
      temperatureMax: daily.temperature_2m_max[index],
      temperatureMin: daily.temperature_2m_min[index],
      precipitation: daily.precipitation_sum[index],
      code: daily.weathercode[index]
    };
  });

  forecastContent.innerHTML = createForecastHtml(days);
}

function updateTime() {
  if (!currentTimezone) return;

  const now = new Date();
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: currentTimezone,
    hour12: false
  };

  const formatted = new Intl.DateTimeFormat('vi-VN', options).format(now);

  timeContent.innerHTML = `
    <div class="value-block">
      <span>${formatted}</span>
    </div>
    <p>Múi giờ: <strong>${formatTimeZone(currentTimezone)}</strong></p>
  `;
}

async function fetchLocation(query) {
  const [cityPart, countryPart] = query.split(',').map(item => item.trim()).filter(Boolean);
  const city = cityPart || '';
  const country = countryPart || '';
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=20`; 
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Không thể kết nối dịch vụ định vị.');
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('Không tìm thấy thành phố phù hợp.');
  }

  if (country) {
    const match = data.results.find(item => {
      const countryName = (item.country || '').toLowerCase();
      const admin = (item.admin1 || '').toLowerCase();
      return countryName.includes(country.toLowerCase()) || admin.includes(country.toLowerCase());
    });
    if (match) return match;
  }

  return data.results[0];
}

async function fetchWeather(latitude, longitude, timezone) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=${encodeURIComponent(timezone)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Không thể tải dữ liệu thời tiết.');
  }
  return response.json();
}

function showWeather(location, weather) {
  const name = location.name || 'Không rõ';
  const country = location.country || '';
  const time = weather.current_weather.time || '';
  const code = weather.current_weather.weathercode;
  const temp = weather.current_weather.temperature;
  const wind = weather.current_weather.windspeed;
  const direction = weather.current_weather.winddirection;
  const description = weatherCodes[code] || 'Không xác định';

  weatherContent.innerHTML = `
    <div class="value-block">
      <span>${formatTemperature(temp)}</span>
    </div>
    <div class="card-row"><strong>${description}</strong></div>
    <p>Thành phố: <strong>${name}, ${country}</strong></p>
    <p>Thời gian bản tin: <strong>${new Date(time).toLocaleString('vi-VN')}</strong></p>
    <p>Gió: <strong>${wind} km/h</strong> hướng <strong>${direction}°</strong></p>
  `;

  if (weather.daily) {
    showForecast(weather.daily);
  } else {
    forecastContent.innerHTML = '<p>Không có dữ liệu dự báo.</p>';
  }
}

async function showLocation(query) {
  setStatus('Đang tìm vị trí…');
  try {
    const location = await fetchLocation(query);
    setStatus(`Đang lấy dữ liệu thời tiết cho ${location.name}, ${location.country}`);
    const weather = await fetchWeather(location.latitude, location.longitude, location.timezone || 'auto');
    currentTimezone = weather.timezone || location.timezone || 'UTC';
    showWeather(location, weather);
    showMap(location.latitude, location.longitude, `${location.name}, ${location.country}`);

    if (timeTimer) clearInterval(timeTimer);
    updateTime();
    timeTimer = setInterval(updateTime, 1000);
    setStatus(`Hiển thị thời tiết, giờ và bản đồ cho ${location.name}, ${location.country}`);
  } catch (error) {
    setStatus(error.message, true);
    weatherContent.innerHTML = '<p>Không thể tải dữ liệu. Vui lòng thử lại.</p>';
    timeContent.innerHTML = '<p>Giờ chưa cập nhật.</p>';
    forecastContent.innerHTML = '<p>Dự báo chưa cập nhật.</p>';
    mapCaption.textContent = 'Chọn thành phố để hiển thị vị trí.';
    if (timeTimer) clearInterval(timeTimer);
  }
}

locationForm.addEventListener('submit', event => {
  event.preventDefault();
  const query = locationInput.value.trim();
  if (!query) return;
  showLocation(query);
});

presetButtons.forEach(button => {
  button.addEventListener('click', () => {
    const city = button.dataset.city;
    const country = button.dataset.country;
    locationInput.value = `${city}, ${country}`;
    showLocation(`${city}, ${country}`);
  });
});

cityButtons.forEach(button => {
  button.addEventListener('click', () => {
    const city = button.dataset.city;
    const country = button.dataset.country;
    locationInput.value = `${city}, ${country}`;
    showLocation(`${city}, ${country}`);
  });
});

setStatus('Sẵn sàng tìm kiếm thành phố.');
