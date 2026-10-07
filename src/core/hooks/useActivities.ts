import { useMemo } from 'react';
import type { Activity, SportFilter } from '../types';

// Canonical province extraction — handles all 3 location_country formats,
// only returns Chinese provinces (filters out foreign locations).
export function extractProvince(loc: string | null): string | null {
  if (!loc || loc === 'None') return null;
  // Format 1: Python dict string {'country':'中国','province':'河南省',...}
  if (loc.startsWith('{')) {
    try {
      const d = JSON.parse(
        loc.replace(/'/g, '"').replace(/None/g, 'null')
      ) as Record<string, string>;
      if (d.country === '中国' && d.province) return d.province;
    } catch {
      /* ignore */
    }
    return null;
  }
  // Format 2 & 3: search for full province names first
  const provincePatterns = [
    '北京市',
    '天津市',
    '上海市',
    '重庆市',
    '河北省',
    '山西省',
    '辽宁省',
    '吉林省',
    '黑龙江省',
    '江苏省',
    '浙江省',
    '安徽省',
    '福建省',
    '江西省',
    '山东省',
    '河南省',
    '湖北省',
    '湖南省',
    '广东省',
    '海南省',
    '四川省',
    '贵州省',
    '云南省',
    '陕西省',
    '甘肃省',
    '青海省',
    '内蒙古自治区',
    '广西壮族自治区',
    '西藏自治区',
    '宁夏回族自治区',
    '新疆维吾尔自治区',
    '香港特别行政区',
    '澳门特别行政区',
    '台湾省',
  ];
  for (const p of provincePatterns) {
    if (loc.includes(p)) return p;
  }
  // Fuzzy: short names → full names
  const fuzzy: [string, string][] = [
    ['上海', '上海市'],
    ['北京', '北京市'],
    ['天津', '天津市'],
    ['重庆', '重庆市'],
    ['江苏', '江苏省'],
    ['浙江', '浙江省'],
    ['广东', '广东省'],
    ['河南', '河南省'],
    ['四川', '四川省'],
    ['湖北', '湖北省'],
    ['湖南', '湖南省'],
    ['福建', '福建省'],
    ['安徽', '安徽省'],
    ['山东', '山东省'],
    ['河北', '河北省'],
    ['山西', '山西省'],
    ['云南', '云南省'],
    ['贵州', '贵州省'],
    ['陕西', '陕西省'],
    ['甘肃', '甘肃省'],
    ['辽宁', '辽宁省'],
    ['吉林', '吉林省'],
    ['黑龙江', '黑龙江省'],
    ['海南', '海南省'],
    ['内蒙古', '内蒙古自治区'],
    ['广西', '广西壮族自治区'],
    ['西藏', '西藏自治区'],
    ['新疆', '新疆维吾尔自治区'],
    ['宁夏', '宁夏回族自治区'],
    ['香港', '香港特别行政区'],
    ['澳门', '澳门特别行政区'],
    ['台湾', '台湾省'],
  ];
  for (const [key, val] of fuzzy) {
    if (loc.includes(key)) return val;
  }
  return null;
}

export function useFilteredActivities(
  activities: Activity[],
  filter: SportFilter,
  year: number | null
) {
  return useMemo(() => {
    let filtered = activities;
    if (filter !== 'all') {
      filtered = filtered.filter((a) => a.type === filter);
    }
    if (year) {
      filtered = filtered.filter((a) => {
        const d = new Date(a.start_date_local);
        return d.getFullYear() === year;
      });
    }
    return filtered;
  }, [activities, filter, year]);
}

export function parseMovingTime(
  time: string | number | undefined | null
): number {
  if (!time) return 0;

  if (typeof time === 'number') {
    return isNaN(time) ? 0 : time;
  }

  if (typeof time === 'string') {
    let str = time.trim();
    let extraDaysSeconds = 0;

    // Handle "1 day, 10:44:26" strings
    if (str.includes('day')) {
      const dayMatch = str.match(/(\d+)\s+day/);
      if (dayMatch) {
        extraDaysSeconds = parseInt(dayMatch[1], 10) * 86400;
      }
      str = str.split(',').pop()?.trim() || str;
    }

    // Handle epoch timestamps like "1970-01-02 10:44:26.134000"
    if (str.includes(' ')) {
      const parts = str.split(' ');
      const datePart = parts[0]; // e.g. "1970-01-02"
      str = parts[1]; // e.g. "10:44:26.134000"

      const dateComponents = datePart.split('-');
      if (dateComponents.length === 3) {
        const dayNum = parseInt(dateComponents[2], 10);
        if (!isNaN(dayNum) && dayNum > 1) {
          extraDaysSeconds += (dayNum - 1) * 86400;
        }
      }
    }

    // Strip milliseconds (.134000)
    if (str.includes('.')) {
      str = str.split('.')[0];
    }

    // Parse HH:MM:SS / MM:SS / SS
    const timeParts = str.split(':').map(Number);
    if (timeParts.some(isNaN)) return 0;

    let seconds = 0;
    if (timeParts.length === 3) {
      seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    } else if (timeParts.length === 2) {
      seconds = timeParts[0] * 60 + timeParts[1];
    } else if (timeParts.length === 1) {
      seconds = timeParts[0];
    }

    return seconds + extraDaysSeconds;
  }

  return 0;
}

export function formatDistance(meters: number): string {
  return Math.round(meters / 1000).toString();
}

export function formatPace(speedMs: number): string {
  if (!speedMs) return '--';
  const totalSeconds = Math.round(1000 / speedMs);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function formatDuration(timeStr: string): string {
  const secs = parseMovingTime(timeStr);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function getAvailableYears(activities: Activity[]): number[] {
  const years = new Set(
    activities.map((a) => new Date(a.start_date_local).getFullYear())
  );
  return Array.from(years).sort((a, b) => b - a);
}

type ProvinceFeature = {
  properties: { name: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

function firstRoutePoint(encoded: string): [number, number] | null {
  let index = 0;
  const values: number[] = [];
  for (let dimension = 0; dimension < 2; dimension++) {
    let result = 0;
    let shift = 0;
    let part: number;
    do {
      if (index >= encoded.length || shift > 30) return null;
      part = encoded.charCodeAt(index++) - 63;
      if (part < 0 || part > 63) return null;
      result |= (part & 31) << shift;
      shift += 5;
    } while (part >= 32);
    values.push((result & 1 ? ~(result >> 1) : result >> 1) / 1e5);
  }
  const [lat, lng] = values;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

function ringContains(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function provinceFromRoute(
  encoded: string,
  features: ProvinceFeature[]
): string | null {
  const point = firstRoutePoint(encoded);
  if (!point) return null;
  for (const feature of features) {
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates as number[][][]]
        : (feature.geometry.coordinates as number[][][][]);
    for (const rings of polygons) {
      if (
        rings.length &&
        ringContains(point, rings[0]) &&
        !rings.slice(1).some((hole) => ringContains(point, hole))
      ) {
        return feature.properties.name;
      }
    }
  }
  return null;
}

// Async data loading (fetch-based, compatible with Suspense)
import activitiesUrl from '@/static/activities.json?url';

let activityDataCache: Activity[] | null = null;
let activityDataError: unknown = null;
let activityDataPromise: Promise<Activity[]> | null = null;

const loadActivityData = () => {
  activityDataPromise ??= fetch(activitiesUrl)
    .then((response) => {
      if (!response.ok)
        throw new Error(`Failed to load activities: ${response.status}`);
      return response.json() as Promise<Activity[]>;
    })
    .then(async (data) => {
      if (
        data.some(
          (activity) =>
            !extractProvince(activity.location_country) &&
            activity.summary_polyline
        )
      ) {
        const provinces = await import('../../assets/china-provinces.json');
        const features = (provinces.default as { features: ProvinceFeature[] })
          .features;
        data = data.map((activity) => {
          if (
            extractProvince(activity.location_country) ||
            !activity.summary_polyline
          )
            return activity;
          const province = provinceFromRoute(
            activity.summary_polyline,
            features
          );
          return province
            ? { ...activity, location_country: province }
            : activity;
        });
      }
      activityDataCache = data;
      return data;
    })
    .catch((error: unknown) => {
      activityDataError = error;
      throw error;
    });
  return activityDataPromise;
};

export const getActivityData = () => {
  if (activityDataError) throw activityDataError;
  if (activityDataCache) return activityDataCache;
  throw loadActivityData();
};

// Reset the module-level cache so an ErrorBoundary can retry after a fetch failure
export function resetActivityData() {
  activityDataCache = null;
  activityDataError = null;
  activityDataPromise = null;
}
