'use strict';

const TRAJECTORY_STYLES = Object.freeze({
  drone:     { color: '#ffad54', dashArray: '6 7',  durationMs: 14000, icon: '🛵', label: 'БпЛА' },
  molniya:   { color: '#ffb020', dashArray: '4 6',  durationMs: 10000, icon: '⚡', label: 'БпЛА «Молнія»' },
  missile:   { color: '#ff656e', dashArray: null,   durationMs: 9000,  icon: '🚀', label: 'Ракета' },
  banderol:  { color: '#ff5a36', dashArray: '8 5',  durationMs: 9500,  icon: '📦', label: 'Бандероль' },
  ballistic: { color: '#ce9dff', dashArray: '2 6',  durationMs: 7000,  icon: '⚠️', label: 'Балістика' },
  jet_uav:   { color: '#59d7ee', dashArray: '10 5', durationMs: 11000, icon: '✈️', label: 'Реактивна ціль' },
  kab:       { color: '#ff9638', dashArray: '5 5',  durationMs: 10000, icon: '💣', label: 'КАБ' },
  general:   { color: '#ff4545', dashArray: '6 6',  durationMs: 12000, icon: '🚨', label: 'Повітряна ціль' }
});

function interpolateAlongPath(latLngs, t) {
  if (!Array.isArray(latLngs) || latLngs.length === 0) return null;
  if (latLngs.length === 1) return L.latLng(latLngs[0][0], latLngs[0][1]);

  const clamped = Math.max(0, Math.min(1, t));
  const segments = [];
  let total = 0;

  for (let i = 0; i < latLngs.length - 1; i++) {
    const a = L.latLng(latLngs[i][0], latLngs[i][1]);
    const b = L.latLng(latLngs[i + 1][0], latLngs[i + 1][1]);
    const len = a.distanceTo(b);
    segments.push({ a, b, len });
    total += len;
  }

  if (total === 0) return L.latLng(latLngs[0][0], latLngs[0][1]);

  let target = clamped * total;
  for (const seg of segments) {
    if (target <= seg.len || seg === segments[segments.length - 1]) {
      const ratio = seg.len > 0 ? target / seg.len : 0;
      return L.latLng(
        seg.a.lat + (seg.b.lat - seg.a.lat) * ratio,
        seg.a.lng + (seg.b.lng - seg.a.lng) * ratio
      );
    }
    target -= seg.len;
  }
  return L.latLng(latLngs[latLngs.length - 1][0], latLngs[latLngs.length - 1][1]);
}

class TelegramTrajectoryLayer {
  constructor(map, options = {}) {
    this.map = map;
    this.pauseBtn = options.pauseButton || null;
    this.resetBtn = options.resetButton || null;
    this.legendEl = options.legendElement || null;
    this.entries = [];
    this.paused = false;
    this.reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this.epochMs = performance.now();
    this.rafId = null;

    if (this.map) {
      this.map.createPane('trajectoryPane');
      this.map.getPane('trajectoryPane').style.zIndex = '450';
      this.group = L.layerGroup().addTo(this.map);
    }

    if (this.pauseBtn) {
      this.pauseBtn.addEventListener('click', () => this.setPaused(!this.paused));
    }
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => this.reset());
    }

    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', e => {
      this.reducedMotion = e.matches;
      this._syncControls();
      this._syncLoop();
    });
    document.addEventListener('visibilitychange', () => this._syncLoop());
    this._syncControls();
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this._syncControls();
    this._syncLoop();
  }

  reset() {
    this.epochMs = performance.now();
    this._step(this.epochMs);
  }

  _syncControls() {
    const active = this.entries.length > 0;
    if (this.pauseBtn) {
      this.pauseBtn.hidden = !active;
      this.pauseBtn.disabled = !active || this.reducedMotion;
      this.pauseBtn.textContent = this.paused ? '▶ Відтворити' : 'Ⅱ Пауза';
      this.pauseBtn.setAttribute('aria-pressed', String(this.paused));
    }
    if (this.resetBtn) {
      this.resetBtn.hidden = !active;
      this.resetBtn.disabled = !active || this.reducedMotion;
    }
    if (this.legendEl) {
      this.legendEl.hidden = !active;
    }
  }

  setTrajectories(rawList) {
    if (!this.group) return;
    this.group.clearLayers();
    this.entries = [];

    const valid = Array.isArray(rawList) ? rawList.filter(item =>
      item && Array.isArray(item.points) && item.points.length >= 2 &&
      item.points.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    ) : [];

    for (const item of valid) {
      const style = TRAJECTORY_STYLES[item.threat_type] || TRAJECTORY_STYLES.general;
      const startPt = item.points[0];
      const endPt = item.points[item.points.length - 1];
      const durationMs = Number.isFinite(item.duration_ms) && item.duration_ms > 1000
        ? item.duration_ms
        : style.durationMs;

      const line = L.polyline(item.points, {
        pane: 'trajectoryPane',
        color: style.color,
        weight: 2.8,
        opacity: 0.92,
        dashArray: style.dashArray,
        lineCap: 'round'
      }).addTo(this.group);

      const origin = L.circleMarker(startPt, {
        pane: 'trajectoryPane',
        radius: 7,
        color: style.color,
        fillColor: '#0d1823',
        fillOpacity: 0.95,
        weight: 2.5
      }).addTo(this.group);

      const targetDot = L.circleMarker(endPt, {
        pane: 'trajectoryPane',
        radius: 4,
        color: style.color,
        fillColor: style.color,
        fillOpacity: 0.85,
        weight: 1.5
      }).addTo(this.group);

      const tipText = `${style.icon} ${style.label}${item.label ? ' · ' + item.label : ''}`;
      const bindTip = layer => {
        const tip = document.createElement('span');
        tip.textContent = tipText;
        layer.bindTooltip(tip, { sticky: true });
      };
      bindTip(line);
      bindTip(origin);
      bindTip(targetDot);

      const movingMarker = L.marker(startPt, {
        pane: 'trajectoryPane',
        interactive: false,
        icon: L.divIcon({
          className: 'tg-trajectory-marker',
          html: `<span class="tg-trajectory-badge" style="--traj-color:${style.color}">${style.icon}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).addTo(this.group);

      this.entries.push({ points: item.points, durationMs, marker: movingMarker });
    }

    this._syncControls();
    this._step(performance.now());
    this._syncLoop();
  }

  _step(now) {
    if (this.reducedMotion) {
      for (const e of this.entries) {
        e.marker.setLatLng(e.points[e.points.length - 1]);
      }
      return;
    }
    const elapsed = Math.max(0, now - this.epochMs);
    for (const e of this.entries) {
      const t = (elapsed % e.durationMs) / e.durationMs;
      const pos = interpolateAlongPath(e.points, t);
      if (pos) e.marker.setLatLng(pos);
    }
  }

  _syncLoop() {
    const shouldRun = Boolean(this.map) && this.entries.length > 0 && !this.paused && !this.reducedMotion && !document.hidden;
    if (shouldRun && !this.rafId) {
      const tick = now => {
        this.rafId = null;
        this._step(now);
        if (!this.paused && !this.reducedMotion && !document.hidden && this.entries.length > 0) {
          this.rafId = requestAnimationFrame(tick);
        }
      };
      this.rafId = requestAnimationFrame(tick);
    } else if (!shouldRun && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
