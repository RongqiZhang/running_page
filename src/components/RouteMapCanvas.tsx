import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { hasRoute, routeForActivity } from '../core/routeFallback';
import { useLocale } from '../hooks/useLocale';
import './RouteMap.css';

export interface RouteMapProps {
  activities: Activity[];
  allActivities?: Activity[];
  selectedActivity?: Activity | null;
  dark?: boolean;
  onClearSelection?: () => void;
}

const routeCache = new WeakMap<
  Activity,
  {
    type: 'Feature';
    properties: { type: string };
    geometry: { type: 'LineString'; coordinates: number[][] };
  }[]
>();

export function RouteMapCanvas({
  activities,
  allActivities = activities,
  selectedActivity,
  dark,
  onClearSelection,
}: RouteMapProps) {
  const { locale } = useLocale();
  const zh = locale === 'zh';
  const panelRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef(false);
  const cameraRef = useRef<maplibregl.CameraOptions | null>(null);
  const fittedRef = useRef<unknown>(null);
  const [provider, setProvider] = useState<'carto' | 'osm' | 'routes'>('carto');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [retry, setRetry] = useState(0);
  const style = useMemo<maplibregl.StyleSpecification>(() => {
    const background: maplibregl.BackgroundLayerSpecification = {
      id: 'background',
      type: 'background',
      paint: { 'background-color': dark === false ? '#f1f5f9' : '#202020' },
    };
    if (provider === 'routes') {
      return { version: 8, sources: {}, layers: [background] };
    }
    return {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles:
            provider === 'carto'
              ? ['a', 'b', 'c', 'd'].map(
                  (host) =>
                    `https://${host}.basemaps.cartocdn.com/${dark === false ? 'light_all' : 'dark_all'}/{z}/{x}/{y}.png`
                )
              : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution:
            (provider === 'carto'
              ? '<a href="https://carto.com/attributions">&copy; CARTO</a> · '
              : '') +
            '<a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap contributors</a>',
        },
      },
      layers: [
        background,
        { id: 'basemap', type: 'raster', source: 'basemap' },
      ],
    };
  }, [provider, dark]);

  const displayActivity = useMemo(
    () =>
      selectedActivity
        ? routeForActivity(selectedActivity, allActivities)
        : null,
    [selectedActivity, allActivities]
  );
  const fallbackActivity =
    selectedActivity && !hasRoute(selectedActivity) ? displayActivity : null;

  const routes = useMemo(() => {
    const items = selectedActivity
      ? displayActivity
        ? [displayActivity]
        : []
      : activities;
    return items.flatMap((activity) => {
      const cached = routeCache.get(activity);
      if (cached) return cached;
      if (!activity.summary_polyline) return [];
      try {
        const coordinates = polyline
          .decode(activity.summary_polyline)
          .map(([lat, lng]) => [lng, lat])
          .filter(
            ([lng, lat]) =>
              Number.isFinite(lng) &&
              Number.isFinite(lat) &&
              Math.abs(lng) <= 180 &&
              Math.abs(lat) <= 90
          );
        if (coordinates.length < 2) return [];
        const features = [
          {
            type: 'Feature' as const,
            properties: { type: activity.type },
            geometry: { type: 'LineString' as const, coordinates },
          },
        ];
        routeCache.set(activity, features);
        return features;
      } catch {
        return [];
      }
    });
  }, [activities, selectedActivity, displayActivity]);

  const routeBounds = useMemo(() => {
    const bounds = new maplibregl.LngLatBounds();
    for (const route of routes) {
      for (const coord of route.geometry.coordinates)
        bounds.extend(coord as [number, number]);
    }
    return bounds;
  }, [routes]);

  const fitRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || routeBounds.isEmpty()) return;
    map.fitBounds(routeBounds, {
      padding: { top: 35, bottom: 35, left: 35, right: 65 },
      maxZoom: selectedActivity ? 16 : 13,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 500,
    });
  }, [routeBounds, selectedActivity]);

  const drawRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    const data = { type: 'FeatureCollection' as const, features: routes };
    const source = map.getSource('routes') as
      maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource('routes', { type: 'geojson', data });
      map.addLayer({
        id: 'routes',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'type'],
            'Run',
            '#f97316',
            'Ride',
            '#3b82f6',
            '#4dd2ff',
          ],
        },
      });
    }
    map.setPaintProperty('routes', 'line-width', selectedActivity ? 3.5 : 2);
    map.setPaintProperty('routes', 'line-opacity', selectedActivity ? 1 : 0.7);
    if (fittedRef.current !== routes) {
      fittedRef.current = routes;
      fitRoutes();
    }
  }, [routes, selectedActivity, fitRoutes]);

  const drawRoutesRef = useRef(drawRoutes);
  useEffect(() => {
    drawRoutesRef.current = drawRoutes;
    drawRoutes();
  }, [drawRoutes]);

  useEffect(() => {
    if (!containerRef.current || !panelRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { version: 8, sources: {}, layers: [] },
      center: [121.4, 31.2],
      zoom: 10,
      ...cameraRef.current,
      locale: zh
        ? {
            'Map.Title': '跑步路线地图',
            'NavigationControl.ZoomIn': '放大',
            'NavigationControl.ZoomOut': '缩小',
            'NavigationControl.ResetBearing': '恢复朝北',
            'FullscreenControl.Enter': '全屏查看',
            'FullscreenControl.Exit': '退出全屏',
            'AttributionControl.ToggleAttribution': '地图来源',
          }
        : {},
    });
    mapRef.current = map;
    fittedRef.current = null;
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(
      new maplibregl.FullscreenControl({ container: panelRef.current }),
      'top-right'
    );
    map.addControl(
      new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 90 }),
      'bottom-left'
    );
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      cameraRef.current = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [zh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let settled = false;
    let switching = false;
    const nextBasemap = () => {
      if (switching) return;
      switching = true;
      setStatus('loading');
      setProvider(provider === 'carto' ? 'osm' : 'routes');
    };
    const onError = (event: maplibregl.ErrorEvent) => {
      if (
        ('sourceId' in event && event.sourceId === 'routes') ||
        provider === 'routes'
      ) {
        setStatus('error');
        return;
      }
      nextBasemap();
    };
    const onIdle = () => {
      if (!switching) {
        settled = true;
        setStatus('ready');
      }
    };
    const onStyleLoad = () => {
      styleReadyRef.current = true;
      drawRoutesRef.current();
      if (provider === 'routes') {
        settled = true;
        setStatus('ready');
      }
    };
    const onLoading = () => setStatus('loading');
    map.on('styledataloading', onLoading);
    map.on('error', onError);
    map.on('idle', onIdle);
    map.on('style.load', onStyleLoad);
    styleReadyRef.current = false;
    fittedRef.current = null;
    map.setStyle(style, {
      diff: false,
    });
    const timer = window.setTimeout(() => {
      if (!settled && provider !== 'routes') nextBasemap();
    }, 15000);
    return () => {
      window.clearTimeout(timer);
      map.off('styledataloading', onLoading);
      map.off('error', onError);
      map.off('idle', onIdle);
      map.off('style.load', onStyleLoad);
    };
  }, [style, provider, retry, zh]);

  useEffect(() => {
    let wasFullscreen = document.fullscreenElement === panelRef.current;
    let frame = 0;
    const onFullscreen = () => {
      const isFullscreen = document.fullscreenElement === panelRef.current;
      if (isFullscreen || wasFullscreen) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          mapRef.current?.resize();
          fitRoutes();
        });
      }
      wasFullscreen = isFullscreen;
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [fitRoutes]);

  return (
    <section
      ref={panelRef}
      className="route-map"
      aria-label={zh ? '路线地图' : 'Route map'}
    >
      <div className="route-map-header">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {zh ? '路线地图' : 'Route map'}
          </h2>
          <p
            className="truncate text-xs text-[var(--color-muted)]"
            title={selectedActivity?.name}
          >
            {selectedActivity
              ? `${selectedActivity.name} · ${(selectedActivity.distance / 1000).toFixed(1)} km`
              : `${routes.length.toLocaleString()} ${zh ? '条轨迹' : 'routes'}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {selectedActivity && onClearSelection && (
            <button className="route-map-action" onClick={onClearSelection}>
              {zh ? '返回总览' : 'Overview'}
            </button>
          )}
          <button
            className="route-map-action"
            disabled={!routes.length}
            onClick={fitRoutes}
            title={zh ? '将所有当前轨迹完整放入视野' : 'Fit all current routes'}
          >
            {zh ? '定位轨迹' : 'Fit routes'}
          </button>
        </div>
      </div>
      {fallbackActivity && (
        <p
          role="status"
          className="px-4 pb-2 text-xs text-[var(--color-muted)]"
        >
          {zh
            ? `此活动没有可用的 GPS 轨迹，现显示之前最近一次有轨迹的活动：${fallbackActivity.name}（${fallbackActivity.start_date_local}）。`
            : `This activity has no usable GPS route. Showing the most recent earlier mapped activity: ${fallbackActivity.name} (${fallbackActivity.start_date_local}).`}
        </p>
      )}
      <div className="route-map-body">
        <div ref={containerRef} className="h-full w-full" />
        {!routes.length && (
          <div className="route-map-empty" role="status">
            {zh
              ? selectedActivity
                ? '这次活动没有 GPS 轨迹'
                : '当前筛选没有 GPS 轨迹'
              : 'No GPS route available'}
          </div>
        )}
      </div>
      <div className="route-map-footer">
        <span role="status" aria-live="polite">
          {status === 'error'
            ? zh
              ? '路线绘制失败，请重试'
              : 'Route rendering failed. Please retry.'
            : provider === 'routes'
              ? zh
                ? '底图暂不可用，仅显示 GPS 路线'
                : 'Basemap unavailable · GPS routes only'
              : status === 'loading'
                ? zh
                  ? '正在加载地图…'
                  : 'Loading map…'
                : `Basemap · ${provider === 'carto' ? 'CARTO' : 'OpenStreetMap'}`}
        </span>
        {(status === 'error' || provider === 'routes') && (
          <button
            className="route-map-action"
            onClick={() => {
              setProvider('carto');
              setRetry((value) => value + 1);
            }}
          >
            {zh ? '重试底图' : 'Retry basemap'}
          </button>
        )}
      </div>
    </section>
  );
}
