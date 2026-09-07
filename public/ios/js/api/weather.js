/* ============ 天气引擎：Open-Meteo 免费API（内置，无需Key） ============ */

import { Settings, DB } from '../core/db.js';
import { Bus } from '../core/utils.js';

export const DEFAULT_CITY = { city: '北京市', lat: 39.9042, lon: 116.4074 };

export const WeatherEngine = {
  data: null,
  city: null,
  updatedAt: 0,
  _fetching: null,

  async getCity() {
    if (this.city) return this.city;
    this.city = await Settings.load('weatherCity', DEFAULT_CITY);
    return this.city;
  },

  async setCity(city) {
    this.city = city;
    await Settings.set('weatherCity', city);
    await this.addCity(city); // 同步收入城市列表
    this.data = null;
    this.fetch(true);
  },

  /* ---------- 城市列表管理（城市管理界面） ---------- */
  _sameCity(a, b) {
    return a.city === b.city && Math.abs((a.lat || 0) - (b.lat || 0)) < 0.01;
  },
  async getCities() {
    let list = await Settings.load('weatherCities', null);
    if (!Array.isArray(list) || !list.length) {
      list = [await this.getCity()];
      /* 立即固化：避免“列表仅存在于 fallback”导致切换城市后历史城市静默丢失 */
      await this.saveCities(list);
    }
    return list.filter(c => c && c.city);
  },
  async saveCities(list) {
    await Settings.set('weatherCities', list);
  },
  async addCity(city) {
    const list = await this.getCities();
    if (!list.some(x => this._sameCity(x, city))) {
      list.push(city);
      await this.saveCities(list);
    }
    return list;
  },
  async removeCity(city) {
    const list = (await this.getCities()).filter(x => !this._sameCity(x, city));
    await this.saveCities(list);
    return list;
  },

  /* 单城市实时天气（城市管理卡片用，30 分钟缓存；失败返回 null 卡片降级） */
  _currentCache: {},
  async fetchCurrent(city) {
    const key = city.city + '@' + (city.lat || 0);
    const c = this._currentCache[key];
    if (c && Date.now() - c.at < 30 * 60 * 1000) return c.data;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
        `&current=temperature_2m,weather_code,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`;
      const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const data = {
        temp: j.current?.temperature_2m,
        code: j.current?.weather_code,
        isDay: j.current?.is_day === 1,
        max: j.daily?.temperature_2m_max?.[0],
        min: j.daily?.temperature_2m_min?.[0],
      };
      this._currentCache[key] = { data, at: Date.now() };
      return data;
    } catch (e) {
      return null;
    }
  },

  unit() { return Settings.get('weatherUnit', 'c'); },

  /** 获取天气（带缓存，30分钟） */
  async fetch(force = false) {
    if (this._fetching) return this._fetching;
    if (!force && this.data && Date.now() - this.updatedAt < 30 * 60 * 1000) return this.data;
    this._fetching = (async () => {
      try {
        const city = await this.getCity();
        const u = this.unit();
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
          `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover` +
          `&hourly=temperature_2m,weather_code,visibility` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset` +
          `&timezone=auto&forecast_days=7&wind_speed_unit=ms`;
        const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined });
        if (!res.ok) throw new Error('天气服务返回 ' + res.status);
        const json = await res.json();
        const data = this._normalize(json);
        this.data = data;
        this.updatedAt = Date.now();
        await Settings.setQuiet('weatherCache', { data, city, updatedAt: this.updatedAt });
        Bus.emit('weather:updated', data);
        return data;
      } catch (e) {
        // 失败时回退缓存
        const cache = await Settings.load('weatherCache', null);
        if (cache && cache.data) {
          this.data = cache.data;
          Bus.emit('weather:updated', this.data);
          return this.data;
        }
        throw e;
      } finally {
        this._fetching = null;
      }
    })();
    return this._fetching;
  },

  _normalize(j) {
    const hourly = [];
    const now = new Date();
    const times = j.hourly?.time || [];
    let startIdx = times.findIndex(t => new Date(t) >= new Date(now - new Date().getTimezoneOffset() * 60000));
    if (startIdx < 0) startIdx = 0;
    for (let i = startIdx; i < Math.min(startIdx + 24, times.length); i++) {
      hourly.push({
        time: times[i],
        temp: j.hourly.temperature_2m[i],
        code: j.hourly.weather_code[i],
        vis: (j.hourly.visibility?.[i] ?? 0) / 1000,
      });
    }
    const daily = (j.daily?.time || []).map((t, i) => ({
      date: t,
      code: j.daily.weather_code[i],
      max: j.daily.temperature_2m_max[i],
      min: j.daily.temperature_2m_min[i],
      uv: j.daily.uv_index_max?.[i],
      sunrise: j.daily.sunrise?.[i],
      sunset: j.daily.sunset?.[i],
    }));
    return {
      current: {
        temp: j.current?.temperature_2m,
        feels: j.current?.apparent_temperature,
        humidity: j.current?.relative_humidity_2m,
        code: j.current?.weather_code,
        isDay: j.current?.is_day === 1,
        wind: j.current?.wind_speed_10m,
        windDir: j.current?.wind_direction_10m,
        pressure: j.current?.surface_pressure,
        cloud: j.current?.cloud_cover,
      },
      hourly, daily,
    };
  },

  toDisplay(c) { return this.unit() === 'c' ? Math.round(c) : Math.round(c * 9 / 5 + 32); },
  unitLabel() { return this.unit() === 'c' ? '°' : '°F'; },

  /** 城市搜索（Open-Meteo 地理编码） */
  async searchCity(q) {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=12&language=zh&format=json`);
    const json = await res.json();
    return (json.results || []).map(r => ({
      city: r.name,
      admin: r.admin1 || '',
      country: r.country || '',
      lat: r.latitude, lon: r.longitude,
    }));
  },

  /** 定位 + 反查城市名 */
  async locate() {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('设备不支持定位'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 600000 });
    });
    const { latitude, longitude } = pos.coords;
    let name = '当前位置';
    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`);
      const j = await res.json();
      name = j.city || j.locality || j.principalSubdivision || name;
    } catch (e) { /* 保持默认名 */ }
    return { city: name, lat: latitude, lon: longitude };
  },
};
