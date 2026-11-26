// Конфігурація стилів та іконок для кожного типу загрози по всій Україні
const THREAT_CONFIG = {
  ballistic: {
    color: "#ff2a55",
    icon: "🚀",
    label: "Балістична ракета",
    dashArray: null,
    weight: 3.5
  },
  mig31k: {
    color: "#d946ef",
    icon: "✈️",
    label: "МіГ-31К / Кинджал",
    dashArray: null,
    weight: 3.5
  },
  missile: {
    color: "#ff7b00",
    icon: "🚀",
    label: "Крилата ракета",
    dashArray: null,
    weight: 3
  },
  jet_uav: {
    color: "#00e5ff",
    icon: "⚡",
    label: "Реактивний БпЛА",
    dashArray: "8, 6",
    weight: 3
  },
  uav: {
    color: "#facc15",
    icon: "🛸",
    label: "Ударний БпЛА",
    dashArray: "6, 6",
    weight: 2.5
  },
  kab: {
    color: "#fb7185",
    icon: "💣",
    label: "КАБ / Авіація",
    dashArray: "4, 6",
    weight: 3
  },
  mlrs: {
    color: "#f97316",
    icon: "💥",
    label: "РСЗВ",
    dashArray: "4, 4",
    weight: 2.5
  },
  recon: {
    color: "#38bdf8",
    icon: "👁️",
    label: "Розвід-БпЛА",
    dashArray: "3, 6",
    weight: 2
  },
  general: {
    color: "#94a3b8",
    icon: "⚠️",
    label: "Повітряна ціль",
    dashArray: "6, 6",
    weight: 2.5
  }
};

// Координати центрів усіх областей України (для підсвітки тривог по всій країні)
const UKRAINE_REGIONS_CENTERS = {
  "Вінницька область": [49.2331, 28.4682],
  "Волинська область": [50.7472, 25.3254],
  "Дніпропетровська область": [48.4647, 35.0462],
  "Донецька область": [48.0159, 37.8028],
  "Житомирська область": [50.2547, 28.6587],
  "Закарпатська область": [48.6208, 22.2879],
  "Запорізька область": [47.8388, 35.1396],
  "Івано-Франківська область": [48.9226, 24.7111],
  "Київська область": [50.4501, 30.5234],
  "м. Київ": [50.4501, 30.5234],
  "Кіровоградська область": [48.5079, 32.2623],
  "Луганська область": [48.5740, 39.3078],
  "Львівська область": [49.8397, 24.0297],
  "Миколаївська область": [46.9750, 31.9946],
  "Одеська область": [46.4825, 30.7233],
  "Полтавська область": [49.5883, 34.5514],
  "Рівненська область": [50.6199, 26.2516],
  "Сумська область": [50.9077, 34.7981],
  "Тернопільська область": [49.5535, 25.5948],
  "Харківська область": [49.9935, 36.2304],
  "Херсонська область": [46.6354, 32.6169],
  "Хмельницька область": [49.4230, 26.9871],
  "Черкаська область": [49.4444, 32.0598],
  "Чернівецька область": [48.2921, 25.9358],
  "Чернігівська область": [51.4982, 31.2893],
  "АР Крим": [45.3453, 34.4997]
};

// Ініціалізація карти з оглядом всієї України та прилеглих районів пуску
const map = L.map("map", {
  center: [48.5, 32.5],
  zoom: 6,
  minZoom: 5,
  maxZoom: 14,
  zoomControl: false
});

L.control.zoom({ position: "bottomright" }).addTo(map);

// Темна картографічна підкладка
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap &copy; CARTO",
  subdomains: "abcd",
  maxZoom: 19
}).addTo(map);

// Шари для відображення даних
const regionsLayer = L.layerGroup().addTo(map);
const trajectoriesLayer = L.layerGroup().addTo(map);
const launchPointsLayer = L.layerGroup().addTo(map);
const impactZonesLayer = L.layerGroup().addTo(map);

let animatedMarkers = [];
let animFrameId = null;

// Згортання легенди
document.getElementById("toggle-legend").addEventListener("click", () => {
  const body = document.getElementById("legend-body");
  const btn = document.getElementById("toggle-legend");
  body.classList.toggle("collapsed");
  btn.textContent = body.classList.contains("collapsed") ? "+" : "−";
});

// Обчислення дуги (кривої Безьє) для балістичних та ракетних пусків
function buildCurvedPath(points, isBallistic = false) {
  if (points.length < 2) return points;
  if (!isBallistic && points.length > 2) return points;

  const start = points[0];
  const end = points[points.length - 1];
  const midLat = (start[0] + end[0]) / 2;
  const midLon = (start[1] + end[1]) / 2;

  const dLat = end[0] - start[0];
  const dLon = end[1] - start[1];
  const dist = Math.hypot(dLat, dLon);

  // Зміщуємо контрольну точку вгору/вбік для візуалізації балістичної дуги
  const curveFactor = isBallistic ? 0.22 : 0.08;
  const ctrlLat = midLat + Math.abs(dLon) * curveFactor + dist * (isBallistic ? 0.12 : 0.03);
  const ctrlLon = midLon - dLat * (curveFactor * 0.5);

  const curve = [];
  const steps = 36;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = (1 - t) * (1 - t) * start[0] + 2 * (1 - t) * t * ctrlLat + t * t * end[0];
    const lon = (1 - t) * (1 - t) * start[1] + 2 * (1 - t) * t * ctrlLon + t * t * end[1];
    curve.push([lat, lon]);
  }
  return curve;
}

// Інтерполяція позиції по ламаній лінії для плавної анімації цілі
function interpolateAlongPath(path, progress) {
  if (!path || path.length === 0) return null;
  if (path.length === 1) return path[0];

  let totalDist = 0;
  const segDists = [];
  for (let i = 0; i < path.length - 1; i++) {
    const d = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    segDists.push(d);
    totalDist += d;
  }
  if (totalDist === 0) return path[0];

  let targetDist = progress * totalDist;
  for (let i = 0; i < segDists.length; i++) {
    if (targetDist <= segDists[i] || i === segDists.length - 1) {
      const localT = segDists[i] === 0 ? 0 : targetDist / segDists[i];
      const lat = path[i][0] + (path[i + 1][0] - path[i][0]) * localT;
      const lon = path[i][1] + (path[i + 1][1] - path[i][1]) * localT;
      return [lat, lon];
    }
    targetDist -= segDists[i];
  }
  return path[path.length - 1];
}

// Запуск циклу анімації польоту цілей по траєкторіях
function startAnimationLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  function step() {
    const now = performance.now();
    animatedMarkers.forEach((item) => {
      // Швидші цілі (балістика, МіГ-31К) рухаються швидше по траєкторії
      const cycleMs = item.speedKmh > 3000 ? 3200 : item.speedKmh > 700 ? 5500 : 8500;
      const progress = ((now + item.phaseOffset) % cycleMs) / cycleMs;
      const pos = interpolateAlongPath(item.path, progress);
      if (pos) {
        item.marker.setLatLng(pos);
      }
    });
    animFrameId = requestAnimationFrame(step);
  }
  animFrameId = requestAnimationFrame(step);
}

// Рендер областей з активною тривогою
function renderRegions(regionsData) {
  regionsLayer.clearLayers();
  let activeCount = 0;

  if (!regionsData) return 0;

  Object.entries(regionsData).forEach(([regionName, info]) => {
    const isAlert = typeof info === "boolean" ? info : Boolean(info && (info.alert || info.active || info.status === "alert"));
    if (!isAlert) return;

    activeCount++;
    const coords = (info && info.coords) || UKRAINE_REGIONS_CENTERS[regionName];
    if (!coords) return;

    L.circle(coords, {
      radius: 42000,
      color: "#ef4444",
      weight: 1,
      fillColor: "#ef4444",
      fillOpacity: 0.14
    })
      .bindTooltip(`🚨 <b>${regionName}</b><br>Повітряна тривога`, { className: "radar-tooltip" })
      .addTo(regionsLayer);
  });

  return activeCount;
}

// Рендер точок пуску (старт балістики, ракет, БпЛА, МіГ-31К)
function renderLaunchPoints(launchPoints) {
  launchPointsLayer.clearLayers();
  if (!Array.isArray(launchPoints)) return;

  launchPoints.forEach((lp) => {
    if (!lp.coords || lp.coords.length < 2) return;
    const cfg = THREAT_CONFIG[lp.threat_type] || THREAT_CONFIG.ballistic;

    const iconHtml = `
      <div class="launch-marker-badge" style="border-color: ${cfg.color}; box-shadow: 0 0 12px ${cfg.color};">
        <span>${cfg.icon}</span>
        <span>ПУСК: ${lp.name}</span>
      </div>
    `;

    const marker = L.marker(lp.coords, {
      icon: L.divIcon({
        className: "",
        html: iconHtml,
        iconSize: [180, 26],
        iconAnchor: [90, 13]
      })
    });

    const targetNote = lp.target_name ? `<br>Напрямок: <b>${lp.target_name}</b>` : "";
    const inferredNote = lp.inferred ? "<br><i>(орієнтовний район пуску за типом цілі)</i>" : "";

    marker
      .bindTooltip(
        `<b>Точка пуску: ${lp.name}</b><br>Загроза: <span style="color:${cfg.color}">${cfg.label}</span>${targetNote}${inferredNote}`,
        { className: "radar-tooltip" }
      )
      .addTo(launchPointsLayer);
  });
}

// Рендер траєкторій польоту від точок пуску та між населеними пунктами
function renderTrajectories(trajectories) {
  trajectoriesLayer.clearLayers();
  animatedMarkers = [];

  if (!Array.isArray(trajectories)) return;

  trajectories.forEach((traj, idx) => {
    if (!traj.waypoints || traj.waypoints.length < 2) return;

    const cfg = THREAT_CONFIG[traj.threat_type] || THREAT_CONFIG.general;
    const isBallisticOrMig = traj.threat_type === "ballistic" || traj.threat_type === "mig31k" || traj.threat_type === "missile";
    const renderPath = buildCurvedPath(traj.waypoints, isBallisticOrMig);

    // Основна лінія траєкторії
    const polyline = L.polyline(renderPath, {
      color: cfg.color,
      weight: cfg.weight,
      opacity: 0.9,
      dashArray: cfg.dashArray
    }).addTo(trajectoriesLayer);

    // Світіння під лінією траєкторії
    L.polyline(renderPath, {
      color: cfg.color,
      weight: cfg.weight + 5,
      opacity: 0.18
    }).addTo(trajectoriesLayer);

    // Проміжні та кінцева точки маршруту
    traj.waypoints.forEach((wp, wpIdx) => {
      const wpName = (traj.waypoint_names && traj.waypoint_names[wpIdx]) || "";
      const isLast = wpIdx === traj.waypoints.length - 1;
      const isFirstWithOrigin = wpIdx === 0 && traj.origin;

      if (!isFirstWithOrigin) {
        L.circleMarker(wp, {
          radius: isLast ? 6 : 4,
          color: cfg.color,
          fillColor: isLast ? cfg.color : "#0f172a",
          fillOpacity: 1,
          weight: 2
        })
          .bindTooltip(
            `${isLast ? "🎯 Ціль / курс:" : "📍 Проліт:"} <b>${wpName}</b><br>Тип: ${cfg.label}`,
            { className: "radar-tooltip" }
          )
          .addTo(trajectoriesLayer);
      }
    });

    // Анімована іконка загрози, що летить по траєкторії
    const movingMarker = L.marker(renderPath[0], {
      icon: L.divIcon({
        className: "threat-marker-wrap",
        html: `<div class="threat-icon-badge" style="color:${cfg.color}">${cfg.icon}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).addTo(trajectoriesLayer);

    const routeStr = (traj.waypoint_names || []).join(" ➔ ");
    movingMarker.bindTooltip(
      `<b style="color:${cfg.color}">${cfg.label}</b><br>Маршрут: <b>${routeStr}</b><br>Швидкість: ~${traj.speed_kmh || 300} км/год`,
      { className: "radar-tooltip" }
    );

    polyline.bindTooltip(
      `<b style="color:${cfg.color}">${cfg.label}</b><br>${routeStr}`,
      { className: "radar-tooltip" }
    );

    animatedMarkers.push({
      marker: movingMarker,
      path: renderPath,
      speedKmh: traj.speed_kmh || 300,
      phaseOffset: idx * 750
    });
  });

  startAnimationLoop();
}

// Рендер пульсуючих зон над містами (напр. "Реактивний БпЛА над Кропивницьким")
function renderImpactZones(impactZones) {
  impactZonesLayer.clearLayers();
  if (!Array.isArray(impactZones)) return;

  impactZones.forEach((zone) => {
    if (!zone.coords || zone.coords.length < 2) return;
    const cfg = THREAT_CONFIG[zone.threat_type] || THREAT_CONFIG.uav;

    L.marker(zone.coords, {
      icon: L.divIcon({
        className: "",
        html: `<div class="overhead-pulse-ring" style="border-color:${cfg.color};"></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      })
    })
      .bindTooltip(
        `🚨 <b>${zone.name}</b><br><span style="color:${cfg.color}">${cfg.label} безпосередньо над містом!</span>`,
        { className: "radar-tooltip" }
      )
      .addTo(impactZonesLayer);
  });
}

// Оновлення стрічки активних траєкторій внизу екрана
function renderFeed(trajectories) {
  const list = document.getElementById("feed-list");
  if (!Array.isArray(trajectories) || trajectories.length === 0) {
    list.innerHTML = `<div class="feed-empty">Активних повітряних цілей не зафіксовано</div>`;
    return;
  }

  list.innerHTML = "";
  trajectories
    .slice()
    .reverse()
    .forEach((traj) => {
      const cfg = THREAT_CONFIG[traj.threat_type] || THREAT_CONFIG.general;
      const routeText = (traj.waypoint_names || []).join(" ➔ ");

      const item = document.createElement("div");
      item.className = "feed-item";
      item.style.borderLeftColor = cfg.color;
      item.innerHTML = `
        <div class="feed-item-top">
          <span style="color:${cfg.color}">${cfg.icon} ${cfg.label}</span>
          <span style="color:#94a3b8; font-weight:400;">~${traj.speed_kmh || 300} км/год</span>
        </div>
        <div class="feed-item-route">${routeText}</div>
      `;

      item.addEventListener("click", () => {
        if (traj.waypoints && traj.waypoints.length > 0) {
          const bounds = L.latLngBounds(traj.waypoints);
          map.fitBounds(bounds, { padding: [70, 70], maxZoom: 9 });
        }
      });

      list.appendChild(item);
    });
}

// Завантаження даних з API бота
async function fetchRadarState() {
  const endpoints = ["/api/status", "/api/alerts", "/api/radar"];
  let data = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        data = await res.json();
        break;
      }
    } catch (_) {
      // Перехід до наступного ендпоінту
    }
  }

  const dot = document.getElementById("connection-dot");
  const statusText = document.getElementById("connection-status");

  if (!data) {
    dot.className = "status-dot offline";
    statusText.textContent = "Офлайн — немає зв'язку з сервером";
    return;
  }

  const isOnline = data.online !== false;
  dot.className = isOnline ? "status-dot online" : "status-dot offline";
  statusText.textContent = isOnline ? "Онлайн • Моніторинг по всій Україні" : "Офлайн";

  const activeRegions = renderRegions(data.regions || data.alerts || {});
  const trajectories = data.trajectories || [];
  const launchPoints = data.launch_points || [];
  const impactZones = data.impact_zones || [];

  renderLaunchPoints(launchPoints);
  renderTrajectories(trajectories);
  renderImpactZones(impactZones);
  renderFeed(trajectories);

  document.getElementById("active-regions-count").textContent = activeRegions;
  document.getElementById("active-targets-count").textContent = trajectories.length;
  document.getElementById("launch-points-count").textContent = launchPoints.length;

  const now = new Date();
  document.getElementById("last-update-time").textContent = now.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

// Перший запит та автоматичне оновлення кожні 5 секунд
fetchRadarState();
setInterval(fetchRadarState, 5000);
