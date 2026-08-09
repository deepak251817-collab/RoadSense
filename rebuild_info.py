"""
Rebuild App.jsx from scratch based on conversation history and partial code from restore_app.py
This is a comprehensive STARS Route Finder application with:
- Mapbox integration
- Route finding with traffic and weather
- Pothole reporting with EXIF/OCR
- Admin moderation
- Premium UI design
"""

# Due to the massive size of the App.jsx file (2700+ lines), I'll create it in a Python script
# that builds it section by section

app_jsx_content = """import React, { useEffect, useMemo, useRef, useState } from "react";
import lowIcon from "./assets/potholes/low.svg";
import moderateIcon from "./assets/potholes/moderate.svg";
import highIcon from "./assets/potholes/high.svg";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, CloudSun, Gauge, Info, Upload, ShieldCheck, Bell, LocateFixed, Camera } from "lucide-react";
import exifr from "exifr";
import {
\tLineChart,
\tLine,
\tXAxis,
\tYAxis,
\tTooltip,
\tResponsiveContainer,
\tCartesianGrid,
} from "recharts";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Report pothole section will be rendered later in JSX (standalone card)

export default function App() {
\tconst mapContainerRef = useRef(null);
\tconst [mapError, setMapError] = useState(null);
\tconst tokenPresent = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);

\t// Source/Destination state
\tconst [sourceQuery, setSourceQuery] = useState("");
\tconst [destQuery, setDestQuery] = useState("");
\tconst [sourceSuggestions, setSourceSuggestions] = useState([]);
\tconst [destSuggestions, setDestSuggestions] = useState([]);
\t// Autocomplete lock: after selecting a suggestion or programmatic fill, keep hidden until user types again
\tconst [sourceLocked, setSourceLocked] = useState(false);
\tconst [destLocked, setDestLocked] = useState(false);
\tconst [sourceCoord, setSourceCoord] = useState(null); // [lng, lat]
\tconst [destCoord, setDestCoord] = useState(null); // [lng, lat]
\tconst [userCoord, setUserCoord] = useState(null);
\tconst [routes, setRoutes] = useState([]); // directions alternatives
\tconst [selectedRouteId, setSelectedRouteId] = useState(null);
\tconst [openDetailsId, setOpenDetailsId] = useState(null);
\tconst [openWeatherId, setOpenWeatherId] = useState(null);
\tconst [openTrafficId, setOpenTrafficId] = useState(null);
\t// Waypoints and map picking
\tconst [stops, setStops] = useState([]); // [[lng, lat], ...]
\tconst [pickingMode, setPickingMode] = useState(null); // 'source' | 'destination' | 'stop' | null
\t// Stop search mini-UI state
\tconst [stopSearchOpen, setStopSearchOpen] = useState(false);
\tconst [stopSearchQuery, setStopSearchQuery] = useState("");
\tconst [stopSearchSuggestions, setStopSearchSuggestions] = useState([]);
\tconst stopSearchTimerRef = useRef(null);

\t// Pothole reporting
\tconst [userReports, setUserReports] = useState([]);
\tconst [reportForm, setReportForm] = useState({
\t\tseverity: "moderate",
\t\tdescription: "",
\t\tphotoPreview: null,
\t\tcoord: null,
\t\tcaptureAt: null,
\t\tphotoSource: null, // 'camera' or 'upload'
\t});
\tconst [ocrBusy, setOcrBusy] = useState(false);
\tconst [ocrMessage, setOcrMessage] = useState("");

\t// Admin & moderation
\tconst [adminMode, setAdminMode] = useState(false);
\tconst [showOnlyUnverified, setShowOnlyUnverified] = useState(false);
\tconst [rejectModal, setRejectModal] = useState({ open: false, reportId: null });
\tconst [rejectReason, setRejectReason] = useState("");
\tconst [fixModal, setFixModal] = useState({ open: false, reportId: null });
\tconst [fixPhotoPreview, setFixPhotoPreview] = useState(null);
\tconst [imageModal, setImageModal] = useState({ open: false, src: null, title: null });
\tconst [adminMessages, setAdminMessages] = useState([]);
\tconst [showMessages, setShowMessages] = useState(false);

\t// Camera
\tconst [cameraOpen, setCameraOpen] = useState(false);
\tconst [cameraMode, setCameraMode] = useState(null); // 'report' or 'fix'
\tconst cameraVideoRef = useRef(null);
\tconst cameraStreamRef = useRef(null);

\t// Notice banner
\tconst [notice, setNotice] = useState(null); // { type: 'success'|'warn'|'error'|'info', message: string, undoId?: number }

\t// Traffic data
\tconst [trafficByRoute, setTrafficByRoute] = useState({});
\tconst [congestionSegments, setCongestionSegments] = useState([]);

\t// Weather data
\tconst [routeWeather, setRouteWeather] = useState({});
\tconst weatherMarkersRef = useRef({});

\t// Report adjustment
\tconst [reportAdjustMode, setReportAdjustMode] = useState(false);
\tconst [reportAdjustOriginal, setReportAdjustOriginal] = useState(null);
\tconst reportAdjustMarkerRef = useRef(null);

\t// Refs
\tconst sourceMarkerRef = useRef(null);
\tconst destMarkerRef = useRef(null);
\tconst userMarkerRef = useRef(null);
\tconst stopMarkersRef = useRef([]);
\tconst potholeMarkersRef = useRef([]);
\tconst routeLayersRef = useRef([]);
\tconst autocompleteTimerRef = useRef(null);
\tconst geoWatchIdRef = useRef(null);

\t// Persist reports to localStorage
\tconst persistReports = (arr) => {
\t\ttry {
\t\t\tlocalStorage.setItem("stars_pothole_reports", JSON.stringify(arr));
\t\t} catch (e) {
\t\t\tconsole.error("Failed to persist reports:", e);
\t\t}
\t};

\t// Load reports from localStorage on mount
\tuseEffect(() => {
\t\ttry {
\t\t\tconst stored = localStorage.getItem("stars_pothole_reports");
\t\t\tif (stored) {
\t\t\t\tconst parsed = JSON.parse(stored);
\t\t\t\tsetUserReports(Array.isArray(parsed) ? parsed : []);
\t\t\t}
\t\t} catch (e) {
\t\t\tconsole.error("Failed to load reports:", e);
\t\t}
\t}, []);

\t// Initialize Mapbox
\tuseEffect(() => {
\t\tif (!mapContainerRef.current || !tokenPresent) {
\t\t\tif (!tokenPresent) setMapError("Mapbox token not found. Set VITE_MAPBOX_TOKEN in .env");
\t\t\treturn;
\t\t}
\t\tconst map = new mapboxgl.Map({
\t\t\tcontainer: mapContainerRef.current,
\t\t\tstyle: "mapbox://styles/mapbox/streets-v12",
\t\t\tcenter: [77.5946, 12.9716], // Bangalore
\t\t\tzoom: 12,
\t\t});
\t\twindow._mapInstance = map;

\t\tmap.on("load", () => {
\t\t\tmap.addControl(new mapboxgl.NavigationControl(), "bottom-right");
\t\t});

\t\tmap.on("click", (e) => {
\t\t\tif (pickingMode) {
\t\t\t\tconst { lng, lat } = e.lngLat;
\t\t\t\tif (pickingMode === "source") {
\t\t\t\t\tsetSourceCoord([lng, lat]);
\t\t\t\t\treverseGeocode(lng, lat).then((name) => {
\t\t\t\t\t\tsetSourceQuery(name || formatCoordLabel(lng, lat));
\t\t\t\t\t\tsetSourceLocked(true);
\t\t\t\t\t});
\t\t\t\t\tsetPickingMode(null);
\t\t\t\t} else if (pickingMode === "destination") {
\t\t\t\t\tsetDestCoord([lng, lat]);
\t\t\t\t\treverseGeocode(lng, lat).then((name) => {
\t\t\t\t\t\tsetDestQuery(name || formatCoordLabel(lng, lat));
\t\t\t\t\t\tsetDestLocked(true);
\t\t\t\t\t});
\t\t\t\t\tsetPickingMode(null);
\t\t\t\t} else if (pickingMode === "stop") {
\t\t\t\t\tsetStops((prev) => [...prev, [lng, lat]]);
\t\t\t\t\tsetPickingMode(null);
\t\t\t\t}
\t\t\t} else if (reportAdjustMode) {
\t\t\t\tconst { lng, lat } = e.lngLat;
\t\t\t\tconst orig = reportAdjustOriginal;
\t\t\t\tif (orig) {
\t\t\t\t\tconst dist = distMeters(orig, [lng, lat]);
\t\t\t\t\tif (dist > 250) {
\t\t\t\t\t\tsetNotice({ type: "warn", message: "Adjustment limited to 250m radius." });
\t\t\t\t\t\tsetTimeout(() => setNotice(null), 3000);
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tsetReportForm((f) => ({ ...f, coord: [lng, lat] }));
\t\t\t\tif (reportAdjustMarkerRef.current) {
\t\t\t\t\treportAdjustMarkerRef.current.setLngLat([lng, lat]);
\t\t\t\t}
\t\t\t}
\t\t});

\t\treturn () => {
\t\t\tif (map) map.remove();
\t\t\twindow._mapInstance = null;
\t\t};
\t}, [tokenPresent]);

\t// Render source/dest markers
\tuseEffect(() => {
\t\tconst map = window._mapInstance;
\t\tif (!map) return;

\t\t// Source marker
\t\tif (sourceMarkerRef.current) sourceMarkerRef.current.remove();
\t\tif (sourceCoord) {
\t\t\tconst el = document.createElement("div");
\t\t\tel.className = "w-8 h-8 bg-green-500 rounded-full border-4 border-white shadow-lg";
\t\t\tsourceMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(sourceCoord).addTo(map);
\t\t}

\t\t// Dest marker
\t\tif (destMarkerRef.current) destMarkerRef.current.remove();
\t\tif (destCoord) {
\t\t\tconst el = document.createElement("div");
\t\t\tel.className = "w-8 h-8 bg-red-500 rounded-full border-4 border-white shadow-lg";
\t\t\tdestMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(destCoord).addTo(map);
\t\t}

\t\t// User marker
\t\tif (userMarkerRef.current) userMarkerRef.current.remove();
\t\tif (userCoord) {
\t\t\tconst el = document.createElement("div");
\t\t\tel.className = "w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md animate-pulse";
\t\t\tuserMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(userCoord).addTo(map);
\t\t}
\t}, [sourceCoord, destCoord, userCoord]);

\t// This is a MASSIVE file - I'll continue building it systematically
\t// For now, let me save this progress and continue...
"""

# Save to file
with open('c:/Users/deepa/OneDrive/Documents/STARS_RouteFinder_Full/rebuild_app.py', 'w', encoding='utf-8') as f:
    f.write("# This script will rebuild the complete App.jsx\\n")
    f.write("# The file is too large to build in one go, so I'm creating a comprehensive version\\n\\n")
    f.write(app_jsx_content)

print("Partial rebuild script created. This is a complex task that requires building a 2700+ line file.")
print("I'll need to create this systematically by combining information from multiple sources.")
