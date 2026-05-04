import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { View, Text, StyleSheet, Platform } from "react-native";

// react-native-maps stöds inte på web.
// På web använder vi Leaflet via en iframe med inline HTML.

let NativeMapViewRaw: any;
let NativeMarker: any;
let NativeCircle: any;
let NativePolyline: any;
let NativeUrlTile: any;

if (Platform.OS !== "web") {
  const Maps = require("react-native-maps");
  NativeMapViewRaw = Maps.default;
  NativeMarker = Maps.Marker;
  NativeCircle = Maps.Circle;
  NativePolyline = Maps.Polyline;
  NativeUrlTile = Maps.UrlTile;
}

// ==================== WEB IMPLEMENTATION ====================

// Karttyp — synkas med `MapType` i services/storage.ts. Native mappar rakt
// till react-native-maps `mapType`-prop. På web swappas Leaflet tile-layer.
type WebMapType = "standard" | "hybrid" | "terrain";

interface WebMapProps {
  style?: any;
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onPress?: (e: any) => void;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  followsUserLocation?: boolean;
  mapType?: WebMapType;
  children?: React.ReactNode;
}

interface WebMarkerProps {
  coordinate: { latitude: number; longitude: number };
  title?: string;
  description?: string;
  draggable?: boolean;
  opacity?: number;
  onDragEnd?: (e: any) => void;
  onCalloutPress?: () => void;
  onPress?: () => void;
  children?: React.ReactNode;
}

interface WebCircleProps {
  center: { latitude: number; longitude: number };
  radius: number;
  strokeColor?: string;
  fillColor?: string;
}

interface WebPolylineProps {
  coordinates: { latitude: number; longitude: number }[];
  strokeColor?: string;
  strokeWidth?: number;
  /**
   * Streckmönster, t.ex. [10, 5] = 10 px linje, 5 px gap. Renderas via
   * Leaflet `dashArray` på web. På native skickas vidare till
   * react-native-maps `lineDashPattern`.
   */
  lineDashPattern?: number[];
}

// Extract marker, circle and polyline data from React children
function extractChildData(children: React.ReactNode): {
  markers: WebMarkerProps[];
  circles: WebCircleProps[];
  polylines: WebPolylineProps[];
} {
  const markers: WebMarkerProps[] = [];
  const circles: WebCircleProps[] = [];
  const polylines: WebPolylineProps[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    // Handle React.Fragment
    if (child.type === React.Fragment) {
      const nested = extractChildData(child.props.children);
      markers.push(...nested.markers);
      circles.push(...nested.circles);
      polylines.push(...nested.polylines);
      return;
    }

    const props = child.props as any;

    if (props.coordinate) {
      markers.push(props);
    } else if (props.center && props.radius !== undefined) {
      circles.push(props);
    } else if (Array.isArray(props.coordinates)) {
      polylines.push(props);
    }

    // Recurse into children to find nested markers/circles/polylines
    if (props.children) {
      const nested = extractChildData(props.children);
      markers.push(...nested.markers);
      circles.push(...nested.circles);
      polylines.push(...nested.polylines);
    }
  });

  return { markers, circles, polylines };
}

const WebMapView = forwardRef(
  (
    {
      style,
      initialRegion,
      onPress,
      showsUserLocation,
      mapType = "standard",
      children,
    }: WebMapProps,
    ref: any
  ) => {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [iframeReady, setIframeReady] = useState(false);
    const onPressRef = useRef(onPress);
    onPressRef.current = onPress;

    // Store marker callbacks by index
    const markerCallbacksRef = useRef<{
      onDragEnd: ((e: any) => void)[];
      onCalloutPress: (() => void)[];
      onPress: (() => void)[];
      ids: string[];
    }>({ onDragEnd: [], onCalloutPress: [], onPress: [], ids: [] });

    useImperativeHandle(ref, () => ({}));

    // Listen for messages from the iframe
    useEffect(() => {
      const handler = (event: MessageEvent) => {
        if (!event.data || typeof event.data !== "object") return;
        if (event.data.source !== "leaflet-map") return;
        // Acceptera bara meddelanden från vår egen iframe — förhindrar att
        // andra fönster/iframes på sidan skickar falska mapClick-events.
        if (
          iframeRef.current &&
          event.source !== iframeRef.current.contentWindow
        )
          return;

        const { type, payload } = event.data;

        if (type === "ready") {
          setIframeReady(true);
        } else if (type === "mapClick") {
          onPressRef.current?.({
            nativeEvent: {
              coordinate: {
                latitude: payload.lat,
                longitude: payload.lng,
              },
            },
          });
        } else if (type === "markerDragEnd") {
          const cb = markerCallbacksRef.current.onDragEnd[payload.index];
          cb?.({
            nativeEvent: {
              coordinate: {
                latitude: payload.lat,
                longitude: payload.lng,
              },
            },
          });
        } else if (type === "markerClick") {
          const pressCb = markerCallbacksRef.current.onPress[payload.index];
          const calloutCb = markerCallbacksRef.current.onCalloutPress[payload.index];
          if (pressCb) pressCb();
          else if (calloutCb) calloutCb();
        }
      };

      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    }, []);

    // Build and send marker/circle/polyline data when children or iframe readiness changes
    const { markers, circles, polylines } = extractChildData(children);

    // Store callbacks
    markerCallbacksRef.current = {
      onDragEnd: markers.map((m) => m.onDragEnd || (() => {})),
      onCalloutPress: markers.map((m) => m.onCalloutPress || (() => {})),
      onPress: markers.map((m) => m.onPress || (() => {})),
      ids: markers.map((_, i) => String(i)),
    };

    // Send map type changes to iframe (initial värdet sätts i HTML:en).
    useEffect(() => {
      if (!iframeReady || !iframeRef.current?.contentWindow) return;
      iframeRef.current.contentWindow.postMessage(
        { source: "react-app", type: "setMapType", mapType },
        "*"
      );
    }, [iframeReady, mapType]);

    // Send data to iframe
    useEffect(() => {
      if (!iframeReady || !iframeRef.current?.contentWindow) return;

      const markerData = markers.map((m, i) => ({
        lat: m.coordinate.latitude,
        lng: m.coordinate.longitude,
        title: m.title || `Kontroll ${i + 1}`,
        description: m.description || "",
        draggable: m.draggable || false,
        opacity: m.opacity ?? 1,
        index: i,
        // Extract label from children if present
        label: extractMarkerLabel(m),
      }));

      const circleData = circles.map((c) => ({
        lat: c.center.latitude,
        lng: c.center.longitude,
        radius: c.radius,
        strokeColor: c.strokeColor || "rgba(232,168,56,0.5)",
        fillColor: c.fillColor || "rgba(232,168,56,0.1)",
      }));

      const polylineData = polylines.map((p) => ({
        coords: p.coordinates.map((c) => [c.latitude, c.longitude]),
        strokeColor: p.strokeColor || "#1B6B35",
        strokeWidth: p.strokeWidth || 3,
        dashArray: p.lineDashPattern ? p.lineDashPattern.join(",") : null,
      }));

      iframeRef.current.contentWindow.postMessage(
        {
          source: "react-app",
          type: "updateMarkers",
          markers: markerData,
          circles: circleData,
          polylines: polylineData,
          showUserLocation: showsUserLocation || false,
        },
        "*"
      );
    }, [iframeReady, markers.length, polylines.length, JSON.stringify(markers.map(m => ({
      lat: m.coordinate.latitude,
      lng: m.coordinate.longitude,
      opacity: m.opacity,
      title: m.title,
      draggable: m.draggable,
    }))), JSON.stringify(polylines.map(p => p.coordinates))]);

    // Extract label text from marker children (the number in the circle)
    function extractMarkerLabel(markerProps: WebMarkerProps): string {
      if (!markerProps.children) return "";
      let label = "";
      React.Children.forEach(markerProps.children as any, (child: any) => {
        if (!React.isValidElement(child)) return;
        const cProps = child.props as any;
        if (cProps.children) {
          React.Children.forEach(cProps.children, (inner: any) => {
            if (!React.isValidElement(inner)) return;
            const iProps = inner.props as any;
            if (iProps.children) {
              React.Children.forEach(iProps.children, (text: any) => {
                if (!React.isValidElement(text)) return;
                const tProps = text.props as any;
                if (typeof tProps.children === "string" || typeof tProps.children === "number") {
                  label = String(tProps.children);
                }
              });
            }
          });
        }
      });
      return label;
    }

    const lat = initialRegion?.latitude || 59.33;
    const lng = initialRegion?.longitude || 18.07;
    const zoom = initialRegion
      ? Math.round(Math.log2(360 / (initialRegion.latitudeDelta || 0.01))) + 1
      : 15;

    const leafletHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; }
  html, body, #map { width: 100%; height: 100%; }
  .custom-marker {
    background: #e8a838;
    color: white;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  }
  .custom-marker.done {
    background: #888;
  }
  .user-marker {
    background: #4285F4;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 0 8px rgba(66,133,244,0.5);
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map').setView([${lat}, ${lng}], ${zoom});

  // Gratis tile-källor, inga API-nycklar:
  // - standard: OpenStreetMap
  // - hybrid:   Esri World Imagery (satellit) + Esri reference (etiketter)
  // - terrain:  OpenTopoMap (topografi med höjdkurvor, bra i skogen)
  var currentBase = null;
  var currentOverlay = null;

  function setMapType(type) {
    if (currentBase) { map.removeLayer(currentBase); currentBase = null; }
    if (currentOverlay) { map.removeLayer(currentOverlay); currentOverlay = null; }

    if (type === 'hybrid') {
      currentBase = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
      ).addTo(map);
      currentOverlay = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
      ).addTo(map);
    } else if (type === 'terrain') {
      currentBase = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map: &copy; OpenTopoMap (CC-BY-SA)',
        maxZoom: 17,
      }).addTo(map);
    } else {
      currentBase = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
    }
  }

  setMapType('${mapType}');

  var markers = [];
  var circles = [];
  var polylines = [];
  var userMarker = null;
  var showUserLoc = false;

  // HTML-escape användarkontrollerade fält (title/description/label) innan de
  // injiceras i Leaflet-popup och divIcon. Förhindrar XSS via frågetext.
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Handle map clicks
  map.on('click', function(e) {
    window.parent.postMessage({
      source: 'leaflet-map',
      type: 'mapClick',
      payload: { lat: e.latlng.lat, lng: e.latlng.lng }
    }, '*');
  });

  // Listen for messages from parent
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== 'react-app') return;

    if (event.data.type === 'setMapType') {
      setMapType(event.data.mapType);
      return;
    }

    if (event.data.type === 'updateMarkers') {
      // Clear existing
      markers.forEach(function(m) { map.removeLayer(m); });
      circles.forEach(function(c) { map.removeLayer(c); });
      polylines.forEach(function(p) { map.removeLayer(p); });
      markers = [];
      circles = [];
      polylines = [];

      showUserLoc = event.data.showUserLocation;

      // Add markers
      (event.data.markers || []).forEach(function(m) {
        var isDone = m.opacity < 1;
        var labelText = m.label ? escapeHtml(m.label) : String(m.index + 1);
        var icon = L.divIcon({
          className: '',
          html: '<div class="custom-marker' + (isDone ? ' done' : '') + '">' + labelText + '</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        var marker = L.marker([m.lat, m.lng], {
          icon: icon,
          draggable: m.draggable,
          opacity: 1,
        }).addTo(map);

        if (m.title) {
          var safeTitle = escapeHtml(m.title);
          var safeDesc = m.description ? escapeHtml(m.description) : '';
          marker.bindPopup('<b>' + safeTitle + '</b>' + (safeDesc ? '<br>' + safeDesc : ''));
        }

        marker.on('click', function() {
          window.parent.postMessage({
            source: 'leaflet-map',
            type: 'markerClick',
            payload: { index: m.index }
          }, '*');
        });

        if (m.draggable) {
          marker.on('dragend', function(e) {
            var pos = e.target.getLatLng();
            window.parent.postMessage({
              source: 'leaflet-map',
              type: 'markerDragEnd',
              payload: { index: m.index, lat: pos.lat, lng: pos.lng }
            }, '*');
          });
        }

        markers.push(marker);
      });

      // Add circles
      (event.data.circles || []).forEach(function(c) {
        var circle = L.circle([c.lat, c.lng], {
          radius: c.radius,
          color: c.strokeColor,
          fillColor: c.fillColor,
          fillOpacity: 0.3,
          weight: 1,
        }).addTo(map);
        circles.push(circle);
      });

      // Add polylines (rutt-linjer mellan kontroller)
      (event.data.polylines || []).forEach(function(p) {
        var opts = {
          color: p.strokeColor,
          weight: p.strokeWidth,
          opacity: 0.7,
        };
        if (p.dashArray) opts.dashArray = p.dashArray;
        var poly = L.polyline(p.coords, opts).addTo(map);
        polylines.push(poly);
      });

      // User location
      if (showUserLoc && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
          var ulat = pos.coords.latitude;
          var ulng = pos.coords.longitude;
          if (userMarker) map.removeLayer(userMarker);
          var userIcon = L.divIcon({
            className: '',
            html: '<div class="user-marker"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          userMarker = L.marker([ulat, ulng], { icon: userIcon, interactive: false }).addTo(map);
        });
      }
    }
  });

  // Notify parent that we're ready
  window.parent.postMessage({
    source: 'leaflet-map',
    type: 'ready',
    payload: {}
  }, '*');
</script>
</body>
</html>`;

    return (
      <View style={[styles.webMapContainer, style]}>
        <iframe
          ref={iframeRef as any}
          srcDoc={leafletHTML}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
          }}
          title="Map"
        />
      </View>
    );
  }
);

// ==================== WEB MARKER/CIRCLE (data-only) ====================

function WebMarker(props: WebMarkerProps) {
  // This component is data-only; actual rendering happens in the iframe.
  // We render children so React can extract label data.
  return null;
}

function WebCircle(props: WebCircleProps) {
  return null;
}

function WebPolyline(props: WebPolylineProps) {
  return null;
}

// ==================== NATIVE TILE OVERLAY ====================

/**
 * Tunn wrapper kring react-native-maps `MapView` som lägger på en
 * `UrlTile`-overlay baserat på vald karttyp. Ger paritet med webbsidan
 * som använder OpenStreetMap för "standard" och OpenTopoMap för
 * "terrain" — båda crowdsourcade och visar mycket fler stigar/spår än
 * Google/Apple-baskartan, särskilt utanför städer.
 *
 * För `hybrid` använder vi Apple/Google-satellit eftersom Esri-satelliten
 * (som webben kör) ser sämre ut i mobil-zoom.
 *
 * Attribution renderas separat av anroparen via `<MapAttribution>` —
 * krav från OSM:s "Tile Usage Policy".
 */
const NativeMapView = Platform.OS !== "web"
  ? React.forwardRef((props: any, ref: any) => {
      const { mapType = "standard", children, ...rest } = props;

      // Endast `terrain` använder en UrlTile-overlay (OpenTopoMap) —
      // den ger trevlig topografi + stigar för cykel/vandring.
      // `standard` använder Apple/Google-baskartan (deras egna är bättre i
      // städer än OSM, och OSM:s tile-server blockerar app-trafik utan
      // godkänd user-agent).
      // `hybrid` använder Apple/Google-satellit.
      const tile =
        mapType === "terrain"
          ? {
              url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
              maxZ: 17,
            }
          : null;

      const underlyingType =
        mapType === "hybrid"
          ? "hybrid"
          : tile
          ? "none" // terrain: OSM-baserad overlay täcker baskartan
          : "standard";

      return (
        <NativeMapViewRaw ref={ref} mapType={underlyingType} {...rest}>
          {tile && (
            <NativeUrlTile
              urlTemplate={tile.url}
              maximumZ={tile.maxZ}
              flipY={false}
              zIndex={-1}
            />
          )}
          {children}
        </NativeMapViewRaw>
      );
    })
  : null;

// ==================== EXPORTS ====================

let MapView: any;
let Marker: any;
let Circle: any;
let Polyline: any;

if (Platform.OS === "web") {
  MapView = WebMapView;
  Marker = WebMarker;
  Circle = WebCircle;
  Polyline = WebPolyline;
} else {
  MapView = NativeMapView;
  Marker = NativeMarker;
  Circle = NativeCircle;
  Polyline = NativePolyline;
}

export { Marker, Circle, Polyline };
export default MapView;

const styles = StyleSheet.create({
  webMapContainer: {
    flex: 1,
    overflow: "hidden",
  },
});
