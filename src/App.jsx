import React, { useEffect, useMemo, useRef, useState } from "react";
import lowIcon from "./assets/potholes/low.svg";
import moderateIcon from "./assets/potholes/moderate.svg";
import highIcon from "./assets/potholes/high.svg";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, CloudSun, Gauge, Info, Upload, ShieldCheck, Bell, LocateFixed, Camera, Search, List, FileText, X, Settings, Maximize2, Minimize2, Cloud, AlertTriangle, Volume2, VolumeX, CloudRain, CloudSnow, CloudDrizzle, CloudLightning, CloudFog, Sun, Wind } from "lucide-react";
import {
  downscaleImage,
  getBestLocation,
  processImageCoordinates,
  detectPothole,
} from "./services/potholeDetection";
import { clusterReports } from "./utils/clustering";
import { assessReportConfidence } from "./utils/confidence";
import { buildSafetyHeatmapData } from "./utils/heatmap";
import { detectHotspots, HOTSPOT_CONFIG } from "./utils/hotspots";
import { hourlyTimeRiskProfile, getSafestWindow } from "./utils/safetyScore";
import {
  normalizeStatus,
  nextStatuses,
  STATUS_LABELS,
  STATUS_STYLES,
} from "./utils/hazardLifecycle";
import { analyzeRoutes, collectRouteReports } from "./utils/routeAnalysis";
import { recommendRoute, buildRecommendationReasons } from "./utils/recommendation";
import { buildRouteIncidents, fetchExternalIncidents, INCIDENT_TYPE_LABELS } from "./services/incidentService";
import { formatAheadDistance } from "./utils/hazardAlerts";
import useHazardAlerts from "./hooks/useHazardAlerts";
import {
  isSpeechSupported,
  loadVoiceSettings,
  saveVoiceSettings,
  cancelSpeech,
  speakNavigationInstruction,
  speakSafetyWarning,
  pickNextStepAnnouncement,
} from "./services/voiceNavigation";
import { distMeters } from "./utils/geo";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	CartesianGrid,
} from "recharts";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Geographic threshold for grouping duplicate pothole reports into one map marker
const CLUSTER_THRESHOLD_METERS = 50;

// Report pothole section will be rendered later in JSX (standalone card)

export default function App() {
	const mapContainerRef = useRef(null);
	const sourceInputRef = useRef(null);
	const destInputRef = useRef(null);
	const reportCardRef = useRef(null);
	const [mapError, setMapError] = useState(null);
	const tokenPresent = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);

	// Source/Destination state
	const [sourceQuery, setSourceQuery] = useState("");
	const [destQuery, setDestQuery] = useState("");
	const [sourceSuggestions, setSourceSuggestions] = useState([]);
	const [destSuggestions, setDestSuggestions] = useState([]);
	// Autocomplete lock: after selecting a suggestion or programmatic fill, keep hidden until user types again
	const [sourceLocked, setSourceLocked] = useState(false);
	const [destLocked, setDestLocked] = useState(false);
	const [sourceCoord, setSourceCoord] = useState(null); // [lng, lat]
	const [destCoord, setDestCoord] = useState(null); // [lng, lat]
	const [userCoord, setUserCoord] = useState(null);
	const [routes, setRoutes] = useState([]); // directions alternatives
	const [selectedRouteId, setSelectedRouteId] = useState(null);
	const [openDetailsId, setOpenDetailsId] = useState(null);
	const [openWeatherId, setOpenWeatherId] = useState(null);
	const [openTrafficId, setOpenTrafficId] = useState(null);
	// Recommendation panel: null until the user accepts or keeps a route
	const [recChoice, setRecChoice] = useState(null); // null | 'use' | 'keep'
	// Incident intelligence state
	const [externalIncidents, setExternalIncidents] = useState({ available: false, items: [], error: null });
	const [openIncidentId, setOpenIncidentId] = useState(null);
	const incidentMarkersRef = useRef([]);
	const incidentPopupsRef = useRef([]);

	// Optional external incident feed (accidents/closures/construction) via VITE_INCIDENTS_URL
	useEffect(() => {
		let alive = true;
		fetchExternalIncidents(import.meta.env.VITE_INCIDENTS_URL).then((res) => {
			if (alive) setExternalIncidents(res);
		});
		return () => { alive = false; };
	}, []);
	// Waypoints and map picking
	const [stops, setStops] = useState([]); // [[lng, lat], ...]
	const [pickingMode, setPickingMode] = useState(null); // 'source' | 'destination' | 'stop' | null
	// Stop search mini-UI state
	const [stopSearchOpen, setStopSearchOpen] = useState(false);
	const [stopSearchQuery, setStopSearchQuery] = useState("");
	const [stopSearchSuggestions, setStopSearchSuggestions] = useState([]);
	const [trafficByRoute, setTrafficByRoute] = useState({}); // { [routeId]: { loading, error, points: [{idx, speedLive, speedFree, delayPct}], liveMinutes, freeMinutes, updatedAt } }
	const [congestionSegments, setCongestionSegments] = useState([]); // GeoJSON Feature[] for selected route congestion coloring
	const [openPotholeId, setOpenPotholeId] = useState(null);
	const [potholesByRoute, setPotholesByRoute] = useState({}); // { [routeId]: { loading, error, items: [{ id, coord: [lng,lat], tags }], updatedAt } }
	// User-reported potholes (persistent in localStorage)
	const [userReports, setUserReports] = useState([]); // [{id, coord, severity, description, photoDataUrl, routeIdx, createdAt, status, reviewedAt}]
	const [reportForm, setReportForm] = useState({ coord: null, coordSource: null, severity: "moderate", description: "", photoPreview: null, captureAt: null, photoSource: null, detection: null });
	const [routeWeather, setRouteWeather] = useState({}); // { [routeId]: { loading, error, points: [ { label, coord, data } ] } }
	const [ocrMessage, setOcrMessage] = useState(""); // status for overlay OCR fallback
	const [ocrBusy, setOcrBusy] = useState(false);
	const [notice, setNotice] = useState(null); // { type: 'info'|'success'|'warn'|'error', message: string }
	const [showFixed, setShowFixed] = useState(true); // show/hide fixed reports on map
	// Avoidance feature removed for now
	const [showOnlyUnverified, setShowOnlyUnverified] = useState(false); // admin filter: only unverified
	// Admin mode (simple local toggle with optional PIN)
	const [adminMode, setAdminMode] = useState(false);
	// Admin-to-user messages (persisted)
	const [adminMessages, setAdminMessages] = useState([]); // { id, reportId, message, createdAt }
	const [showMessages, setShowMessages] = useState(false);
	// Reject modal state (replace prompt-based rejects)
	const [rejectModal, setRejectModal] = useState({ open: false, reportId: null });
	const [rejectReason, setRejectReason] = useState("");
	// Fix proof modal state (user submits evidence that pothole is fixed)
	const [fixModal, setFixModal] = useState({ open: false, reportId: null });
	const [fixPhotoPreview, setFixPhotoPreview] = useState(null);
	const [fixCoord, setFixCoord] = useState(null); // [lng,lat] extracted from EXIF
	const [fixOcrMessage, setFixOcrMessage] = useState("");
	// Generic image preview modal
	const [imageModal, setImageModal] = useState({ open: false, src: null, caption: "" });
	// Report location adjust on map
	const [reportAdjustMode, setReportAdjustMode] = useState(false);
	const reportBaseCoordRef = useRef(null); // original coord to limit drag distance
	const reportAdjustMarkerRef = useRef(null);
	// BBMP integration state
	const [bbmpLoaded, setBbmpLoaded] = useState(false); // whether external BBMP dataset layer is added
	const [bbmpCount, setBbmpCount] = useState(0); // count of loaded BBMP features
	const bbmpDataRef = useRef(null); // store fetched GeoJSON features
	// Safety heatmap layer (weighted hazard density over the map)
	const [safetyHeatmapOn, setSafetyHeatmapOn] = useState(false);
	// Hazard hotspot panel (ranked areas of concentrated active hazards)
	const [showHotspots, setShowHotspots] = useState(false);
	// Camera capture for report
	const [cameraOpen, setCameraOpen] = useState(false);
	const [cameraError, setCameraError] = useState(null);
	const [cameraMode, setCameraMode] = useState(null); // 'report' | 'fix' | null
	const cameraVideoRef = useRef(null);
	const cameraStreamRef = useRef(null);
	// Geolocation (precise) tracking for camera capture
	const bestGeoRef = useRef({ coord: null, accuracy: Infinity, timestamp: 0 });
	const [geoAccuracy, setGeoAccuracy] = useState(null);
	const openImageModal = (src, caption = "") => setImageModal({ open: true, src, caption });
	const closeImageModal = () => setImageModal({ open: false, src: null, caption: "" });

	const openFixModal = (reportId) => { setFixModal({ open: true, reportId }); setFixPhotoPreview(null); setFixCoord(null); setFixOcrMessage(""); };
	const closeFixModal = () => { setFixModal({ open: false, reportId: null }); setFixPhotoPreview(null); setFixCoord(null); };
	const submitFixProof = () => {
		if (!fixModal.reportId || !fixPhotoPreview || !fixCoord) return;
		setUserReports(prev => {
			const arr = prev.map(r => r.id === fixModal.reportId ? { ...r, status: 'repair-requested', pendingFixReview: true, fixProofPhotoDataUrl: fixPhotoPreview, fixProofCoord: fixCoord, fixRequestedAt: Date.now() } : r);
			persistReports(arr);
			return arr;
		});
		addAdminMessage(fixModal.reportId, 'User submitted fix proof for review.');
		closeFixModal();
		// Immediate user confirmation
		setNotice({ type: 'success', message: 'Fix proof submitted. Awaiting admin review.' });
		setTimeout(() => setNotice(null), 4000);
		setTimeout(() => { if (window._mapInstance) renderUserPotholeMarkers(); }, 50);
	};

	const openRejectModal = (reportId) => { setRejectReason(""); setRejectModal({ open: true, reportId }); };
	const closeRejectModal = () => setRejectModal({ open: false, reportId: null });
	const confirmRejectModal = () => {
		const id = rejectModal.reportId;
		if (!id) { closeRejectModal(); return; }
		setUserReports((prev) => {
			const arr = prev.map((x) => x.id === id ? { ...x, status: 'rejected', reviewedAt: Date.now(), rejectionReason: rejectReason, hiddenGlobally: true, pendingRemoval: false } : x);
			persistReports(arr);
			return arr;
		});
		addAdminMessage(id, `Your report was rejected by admin: ${rejectReason || 'No reason provided'}`);
		closeRejectModal();
		setTimeout(() => { if (window._mapInstance) renderUserPotholeMarkers(); }, 50);
	};
	// Keep map markers for weather icons per route id
	const weatherMarkersRef = useRef({}); // { [routeId]: mapboxgl.Marker[] }
	// Keep pothole markers per route id
	const potholeMarkersRef = useRef({}); // { [routeId]: mapboxgl.Marker[] }

	// Fullscreen map mode
	const [fullMap, setFullMap] = useState(false);

	// Camera helpers
	const openCameraModal = async (mode = 'report') => {
		setCameraError(null);
		setCameraMode(mode);
		try {
			// Request camera
			const stream = await navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: { ideal: 'environment' } }, audio: false });
			if (!stream) throw new Error('No camera stream');
			cameraStreamRef.current = stream;
			setCameraOpen(true);
			setTimeout(() => {
				try {
					if (cameraVideoRef.current) {
						cameraVideoRef.current.srcObject = stream;
						cameraVideoRef.current.play?.();
					}
				} catch { }
			}, 0);
			// Start precise GPS watching for best accuracy while camera is open
			if (navigator.geolocation) {
				try {
					bestGeoRef.current = { coord: null, accuracy: Infinity, timestamp: 0 };
					setGeoAccuracy(null);
					const id = navigator.geolocation.watchPosition(
						(pos) => {
							const { latitude, longitude, accuracy } = pos.coords;
							setGeoAccuracy(accuracy);
							if (accuracy != null && accuracy < bestGeoRef.current.accuracy) {
								bestGeoRef.current = { coord: [longitude, latitude], accuracy, timestamp: pos.timestamp };
							}
						},
						(err) => { /* ignore per update; fallback handled in capture */ },
						{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
					);
					geoWatchIdRef.current = id;
				} catch { }
			}
		} catch (err) {
			setCameraError('Unable to access camera. Please allow camera permission.');
			setNotice({ type: 'error', message: 'Camera access denied or unavailable.' });
			setTimeout(() => setNotice(null), 3500);
		}
	};

	const closeCameraModal = () => {
		try {
			const s = cameraStreamRef.current; if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch { } }); }
		} catch { }
		cameraStreamRef.current = null;
		try {
			if (geoWatchIdRef.current != null) {
				navigator.geolocation.clearWatch(geoWatchIdRef.current);
				geoWatchIdRef.current = null;
			}
		} catch { }
		setCameraOpen(false);
		setCameraMode(null);
	};

	const waitForBetterAccuracy = (threshold = 25, maxWaitMs = 3000) => new Promise((resolve) => {
		const start = Date.now();
		const iv = setInterval(() => {
			if ((bestGeoRef.current.accuracy || Infinity) <= threshold || Date.now() - start > maxWaitMs) {
				clearInterval(iv);
				resolve(bestGeoRef.current);
			}
		}, 250);
	});

	const captureFromCamera = async () => {
		const video = cameraVideoRef.current; if (!video) return;
		try {
			const w = video.videoWidth || 1280; const h = video.videoHeight || 720;
			const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
			const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, w, h);
			const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

			// helper to prefer bestGeoRef current fix
			const tryUseBestFix = async (applyFn, setMsgFn) => {
				const best = bestGeoRef.current || { coord: null, accuracy: Infinity, timestamp: 0 };
				if (best.coord && isFinite(best.accuracy) && Date.now() - (best.timestamp || 0) < 15000) {
					applyFn(best.coord);
					if (setMsgFn) setMsgFn(`Using live location (±${Math.round(best.accuracy)} m).`);
					const improved = await waitForBetterAccuracy(25, 3000);
					if (improved?.coord) { applyFn(improved.coord); if (setMsgFn) setMsgFn(`Using live location (±${Math.round(improved.accuracy)} m).`); }
					return true;
				}
				return false;
			};

			if (cameraMode === 'fix') {
				// Attach to fix modal
				setFixPhotoPreview(dataUrl);
				closeCameraModal();
				if (navigator.geolocation) {
					setFixOcrMessage('Getting precise location…');
					const used = await tryUseBestFix((coord) => setFixCoord(coord), (m) => setFixOcrMessage(m));
					if (!used) {
						// Fallback to one-shot + short watch (shared helper)
						const best = await getBestLocation({
							onUpdate: ({ coord, message }) => {
								if (coord) setFixCoord(coord);
								if (message) setFixOcrMessage(message);
							},
						});
						if (!best?.coord) setFixOcrMessage('Live location not available. Please set location manually or upload a geotagged photo.');
					}
				} else {
					setFixOcrMessage('Live location not supported by this browser.');
				}
			} else {
				// report mode
				setReportForm((f) => ({ ...f, photoPreview: dataUrl, captureAt: Date.now(), photoSource: 'camera' }));
				closeCameraModal();
				if (navigator.geolocation) {
					setOcrBusy(true);
					setOcrMessage('Getting precise location…');
					const used = await tryUseBestFix((coord) => { setReportForm((f) => ({ ...f, coord, coordSource: "gps" })); reportBaseCoordRef.current = coord; }, (m) => setOcrMessage(m));
					if (!used) {
						const best = await getBestLocation({
							onUpdate: ({ coord, message }) => {
								if (coord) {
									setReportForm((f) => ({ ...f, coord, coordSource: "gps" }));
									reportBaseCoordRef.current = coord;
								}
								if (message) setOcrMessage(message);
							},
						});
						setOcrBusy(false);
						if (!best?.coord) { setOcrMessage('Live location not available. Please set the location on the map.'); setTimeout(() => setLocationOnMapNow(), 0); }
					} else {
						setOcrBusy(false);
					}
				} else {
					setOcrMessage('Live location not supported by this browser.');
					setOcrBusy(false);
				}
			}
		} catch (e) {
			setNotice({ type: 'error', message: 'Failed to capture photo.' });
			setTimeout(() => setNotice(null), 3000);
		}
	};

	// Cleanup camera stream on unmount
	useEffect(() => () => { try { const s = cameraStreamRef.current; if (s) s.getTracks().forEach(t => t.stop()); } catch { } }, []);

	// Enable/disable report location adjust marker on map
	const startReportAdjust = () => {
		const map = window._mapInstance; if (!map || !Array.isArray(reportForm.coord)) return;
		// Initialize base coord if missing
		if (!Array.isArray(reportBaseCoordRef.current)) reportBaseCoordRef.current = [...reportForm.coord];
		// Remove existing marker
		try { reportAdjustMarkerRef.current?.remove(); } catch { }
		// Create a visible draggable marker
		const el = document.createElement('div');
		el.style.width = '22px'; el.style.height = '22px'; el.style.borderRadius = '50%';
		el.style.background = '#2563eb'; el.style.border = '2px solid #fff'; el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
		el.title = 'Drag to adjust location';
		const mk = new mapboxgl.Marker({ element: el, draggable: true, anchor: 'center' })
			.setLngLat(reportForm.coord)
			.addTo(map);
		mk.on('dragend', () => {
			try {
				const lngLat = mk.getLngLat();
				const candidate = [lngLat.lng, lngLat.lat];
				const base = reportBaseCoordRef.current || reportForm.coord;
				const maxDrag = 250; // meters
				const d = distMeters(candidate, base);
				if (d > maxDrag) {
					setNotice({ type: 'warn', message: `Too far from original location (${Math.round(d)} m). Max allowed is ${maxDrag} m.` });
					setTimeout(() => setNotice(null), 3500);
					// revert to previous safe position
					mk.setLngLat(reportForm.coord);
					return;
				}
				setReportForm((f) => ({ ...f, coord: candidate }));
			} catch { }
		});
		reportAdjustMarkerRef.current = mk;
		setReportAdjustMode(true);
		try { map.flyTo({ center: reportForm.coord, zoom: Math.max(map.getZoom(), 16) }); } catch { }
	};

	const finishReportAdjust = () => {
		try { reportAdjustMarkerRef.current?.remove(); } catch { }
		reportAdjustMarkerRef.current = null;
		setReportAdjustMode(false);
	};

	const cancelReportAdjust = () => {
		// Reset to base coordinate and remove marker
		if (Array.isArray(reportBaseCoordRef.current)) setReportForm((f) => ({ ...f, coord: [...reportBaseCoordRef.current] }));
		finishReportAdjust();
	};

	// Fallback: let user set location on map if GPS not available
	const setLocationOnMapNow = () => {
		const map = window._mapInstance;
		if (!map) {
			setNotice({ type: 'error', message: 'Map not ready. Please wait for the map to load.' });
			setTimeout(() => setNotice(null), 3000);
			return;
		}
		const c = map.getCenter();
		const coord = [c.lng, c.lat];
		setReportForm((f) => ({ ...f, coord, coordSource: "map-pick" }));
		reportBaseCoordRef.current = coord;
		setTimeout(() => startReportAdjust(), 0);
		setNotice({ type: 'info', message: 'Drag the blue marker to the exact location.' });
		setTimeout(() => setNotice(null), 3000);
	};

	// Manual retry: request precise location now and update the form
	const requestPreciseLocationNow = async () => {
		if (!navigator.geolocation) {
			setNotice({ type: 'error', message: 'Geolocation not supported in this browser.' });
			setTimeout(() => setNotice(null), 3000);
			return;
		}
		setOcrBusy(true);
		setOcrMessage('Retrying to get live location…');
		const best = await getBestLocation({
			onUpdate: ({ coord, message }) => {
				if (coord) {
					setReportForm((f) => ({ ...f, coord, coordSource: "gps" }));
					reportBaseCoordRef.current = coord;
				}
				if (message) setOcrMessage(message);
			},
		});
		setOcrBusy(false);
		if (!best?.coord) {
			setNotice({ type: 'warn', message: 'Live location unavailable. Set the point on the map.' });
			setTimeout(() => setNotice(null), 3500);
		}
	};

	// Shared image pipeline for report + fix-proof uploads
	// (downscale → EXIF GPS → OCR fallback → coordinate validation)
	const handleImageSelected = async (file, target = 'report') => {
		if (!file) return;
		const isFix = target === 'fix';
		const setStatus = isFix ? setFixOcrMessage : setOcrMessage;
		if (!isFix) setOcrBusy(true);
		const originalUrl = await new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = (ev) => resolve(ev.target.result);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(file);
		});
		if (!originalUrl) {
			setStatus("Couldn't load image for OCR.");
			if (!isFix) setOcrBusy(false);
			return;
		}
		const scaledUrl = await downscaleImage(originalUrl);
		if (isFix) {
			setFixPhotoPreview(scaledUrl);
		} else {
			setReportForm((f) => ({ ...f, photoPreview: scaledUrl, photoSource: 'upload' }));
		}
		const res = await processImageCoordinates(file, scaledUrl, { onStatus: setStatus, extractDate: !isFix });
		if (isFix) {
			setFixCoord(res.coord);
		} else {
			// Optional assistive detection — only a registered "ai" detector's
			// result is kept; the bundled rule-based stub never fabricates one.
			let detection = null;
			try {
				const det = await detectPothole(scaledUrl);
				if (det.detector.kind === "ai") detection = det;
			} catch { /* detection is optional */ }
			setReportForm((f) => ({ ...f, coord: res.coord, coordSource: res.source && res.source !== "none" ? res.source : null, detection }));
			if (res.capturedAt) setReportForm((f) => ({ ...f, captureAt: res.capturedAt }));
			setOcrBusy(false);
		}
	};
	// Keep markers for user-reported potholes (global)
	const userPotholeMarkersRef = useRef([]); // mapboxgl.Marker[]
	const userPotholePopupsRef = useRef([]); // mapboxgl.Popup[]

	// Marker refs
	const sourceMarkerRef = useRef(null);
	const destMarkerRef = useRef(null);
	const userMarkerRef = useRef(null);
	const stopMarkersRef = useRef([]);
	const geoWatchIdRef = useRef(null);
	// Keep map route layer event handlers to avoid duplicate bindings
	const routeLayerHandlersRef = useRef(null);
	const routeHoverPopupRef = useRef(null);
	const notifiedPotholesRef = useRef({}); // { [reportId]: lastNotifiedTimestamp }
	const lastWarnTimeRef = useRef(0);
	const stopDragIndexRef = useRef(null);
	const rerouteTimerRef = useRef(null);

	const rerouteIfReady = (delay = 250) => {
		if (sourceCoord && destCoord) {
			if (rerouteTimerRef.current) clearTimeout(rerouteTimerRef.current);
			rerouteTimerRef.current = setTimeout(() => { try { getRoutes(); } catch { } }, delay);
		}
	};

	const srcTimer = useRef(null);
	const dstTimer = useRef(null);
	const stopTimer = useRef(null);

	// Map style mode: 'streets' | 'satellite' | 'traffic'
	const [mapStyleMode, setMapStyleMode] = useState('streets');

	const STYLE_MAP = {
		streets: 'mapbox://styles/mapbox/streets-v12',
		satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
		traffic: 'mapbox://styles/mapbox/traffic-day-v2',
	};

	const switchMapStyle = (mode) => {
		const map = window._mapInstance;
		if (!map) return;
		const styleUrl = STYLE_MAP[mode] || STYLE_MAP.streets;
		try {
			map.setStyle(styleUrl);
			setMapStyleMode(mode);
			// Re-render interactive overlays after style loads
			map.once('styledata', () => {
				try { drawRoutesOnMap(map, routes, selectedRouteId); } catch { }
				try { renderUserPotholeMarkers(); } catch { }
				try { if (openWeatherId != null) renderWeatherMarkersFor(openWeatherId); } catch { }
				// Ensure stop markers reappear after style change
				try { renderStopMarkers(); } catch { }
				try { renderIncidentMarkers(); } catch { }
				// Re-add BBMP layer if previously loaded
				try { if (bbmpLoaded) addBbmpLayer(); } catch { }
				// Re-add safety heatmap if it was on
				try { if (safetyHeatmapOn) renderSafetyHeatmap(); } catch { }
			});
		} catch (e) {
			setNotice({ type: 'error', message: 'Failed to switch map style: ' + (e.message || e) });
			setTimeout(() => setNotice(null), 4000);
		}
	};

	const geocode = async (q) => {
		// Use OpenStreetMap Nominatim for autocomplete
		if (!q || q.length < 3) return [];
		const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
		try {
			const res = await fetch(url, {
				headers: {
					// Identify application per Nominatim usage policy
					"Accept": "application/json",
				},
			});
			const data = await res.json();
			return (
				data?.map((item) => ({
					id: item.place_id,
					name: item.display_name,
					center: [parseFloat(item.lon), parseFloat(item.lat)],
				})) ?? []
			);
		} catch (e) {
			return [];
		}
	};

	const reverseGeocode = async (lng, lat) => {
		try {
			const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
			const res = await fetch(url, { headers: { Accept: "application/json" } });
			if (!res.ok) return null;
			const data = await res.json();
			return data?.display_name || null;
		} catch {
			return null;
		}
	};

	const formatCoordLabel = (lng, lat) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

	// Geo helpers and report proximity rules now live in utils/geo + utils/routeAnalysis
	const computeUserPotholeCountForRoute = (route, reports, opts, thresholdMeters = 120) =>
		collectRouteReports(route, reports, opts, thresholdMeters).count;

	// Count avoidance hazards near a route: high severity & confirmed, plus optionally high severity unverified if enabled
	// Avoidance hazard computation removed for now

	// Ensure we have user's current location as source and then route (used when only destination is provided)
	const autoRouteFromLiveIfNeeded = async () => {
		if (sourceCoord || !destCoord) return;
		if (!navigator.geolocation) {
			setMapError("Geolocation not supported by this browser.");
			return;
		}
		try {
			const pos = await new Promise((resolve, reject) =>
				navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
			);
			const coord = [pos.coords.longitude, pos.coords.latitude];
			setUserCoord(coord);
			setSourceCoord(coord);
			reverseGeocode(coord[0], coord[1]).then((name) => { setSourceQuery(name || formatCoordLabel(coord[0], coord[1])); setSourceSuggestions([]); setSourceLocked(true); });
			const map = window._mapInstance; if (map) map.flyTo({ center: coord, zoom: 13 });
			setTimeout(() => getRoutes(), 0);
		} catch (err) {
			setMapError("Location permission required to route from your location.");
		}
	};

	// When destination has been chosen and source is empty, try routing from live location automatically
	useEffect(() => {
		if (destCoord && !sourceCoord) {
			autoRouteFromLiveIfNeeded();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [destCoord, sourceCoord]);

	// Avoidance feature removed: no hazard-based re-selection

	useEffect(() => {
		if (!tokenPresent) {
			setMapError("Missing Mapbox token (VITE_MAPBOX_TOKEN).");
			return;
		}
		if (!mapContainerRef.current) return;
		let map;
		try {
			map = new mapboxgl.Map({
				container: mapContainerRef.current,
				style: "mapbox://styles/mapbox/streets-v12",
				center: [0, 0],
				zoom: 1.5,
			});
			map.addControl(new mapboxgl.NavigationControl(), "top-right");
			// keep a global reference to update markers later
			// eslint-disable-next-line no-underscore-dangle
			window._mapInstance = map;
			// Ensure any pre-existing stops are drawn once the style loads
			try { map.on('load', () => { try { renderStopMarkers(); } catch { } try { renderSafetyHeatmap(); } catch { } }); } catch { }
			// Attempt to start live location watch so user marker is always shown (permission based)
			if (navigator.geolocation) {
				// Wrap permission check in an async IIFE without making effect async
				(async () => {
					try {
						const perm = await navigator.permissions.query({ name: "geolocation" });
						if (perm.state === "granted") {
							if (geoWatchIdRef.current == null) {
								geoWatchIdRef.current = navigator.geolocation.watchPosition(
									(pos) => {
										const { longitude, latitude } = pos.coords;
										setUserCoord([longitude, latitude]);
									},
									(err) => console.warn("Live location watch error", err),
									{ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
								);
							}
						}
						// If prompt or denied, user can still click the button later
					} catch {
						// Permissions API not supported; rely on button
					}
				})();
			}
		} catch (e) {
			setMapError(e.message || "Map initialization failed");
		}
		return () => {
			if (map) map.remove();
			window._mapInstance = null;
		};
	}, [tokenPresent]);

	// Resize map after entering/exiting full view
	useEffect(() => {
		const map = window._mapInstance;
		if (!map) return;
		setTimeout(() => { try { map.resize(); } catch {} }, 50);
	}, [fullMap]);

	// Autocomplete effects
	useEffect(() => {
		if (srcTimer.current) clearTimeout(srcTimer.current);
		if (!sourceQuery || sourceQuery.length < 3 || sourceLocked) {
			setSourceSuggestions([]);
			return;
		}
		srcTimer.current = setTimeout(() => {
			geocode(sourceQuery).then(setSourceSuggestions);
		}, 300);
		return () => srcTimer.current && clearTimeout(srcTimer.current);
	}, [sourceQuery, sourceLocked]);

	useEffect(() => {
		if (dstTimer.current) clearTimeout(dstTimer.current);
		if (!destQuery || destQuery.length < 3 || destLocked) {
			setDestSuggestions([]);
			return;
		}
		dstTimer.current = setTimeout(() => {
			geocode(destQuery).then(setDestSuggestions);
		}, 300);
		return () => dstTimer.current && clearTimeout(dstTimer.current);
	}, [destQuery, destLocked]);

	// Stop search suggestions (only when stop search UI open)
	useEffect(() => {
		if (!stopSearchOpen) { setStopSearchSuggestions([]); return; }
		if (stopTimer.current) clearTimeout(stopTimer.current);
		if (!stopSearchQuery || stopSearchQuery.length < 3) {
			setStopSearchSuggestions([]);
			return;
		}
		stopTimer.current = setTimeout(() => {
			geocode(stopSearchQuery).then(setStopSearchSuggestions);
		}, 300);
		return () => stopTimer.current && clearTimeout(stopTimer.current);
	}, [stopSearchOpen, stopSearchQuery]);

	// Update markers when coords change
	useEffect(() => {
		const map = window._mapInstance;
		if (!map) return;
		if (sourceCoord) {
			if (sourceMarkerRef.current) sourceMarkerRef.current.remove();
			sourceMarkerRef.current = new mapboxgl.Marker({ color: "#22c55e" })
				.setLngLat(sourceCoord)
				.addTo(map);
		}
	}, [sourceCoord]);

	useEffect(() => {
		const map = window._mapInstance;
		if (!map) return;
		if (destCoord) {
			if (destMarkerRef.current) destMarkerRef.current.remove();
			destMarkerRef.current = new mapboxgl.Marker({ color: "#ef4444" })
				.setLngLat(destCoord)
				.addTo(map);
		}
	}, [destCoord]);

	useEffect(() => {
		const map = window._mapInstance;
		if (!map) return;
		if (userCoord) {
			// Replace default marker with pulsing custom element for better visibility
			if (userMarkerRef.current) { try { userMarkerRef.current.remove(); } catch { } }
			const wrapper = document.createElement("div");
			wrapper.style.position = "relative";
			wrapper.style.width = "20px"; wrapper.style.height = "20px";
			const core = document.createElement("div");
			core.style.width = "14px"; core.style.height = "14px"; core.style.borderRadius = "50%"; core.style.background = "#3b82f6"; core.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.35)";
			const pulse = document.createElement("div");
			pulse.style.position = "absolute"; pulse.style.inset = "0"; pulse.style.border = "2px solid #3b82f6"; pulse.style.borderRadius = "50%"; pulse.style.opacity = "0.6"; pulse.style.animation = "pulseAnim 1.8s ease-out infinite";
			wrapper.appendChild(pulse); wrapper.appendChild(core);
			// Add keyframes dynamically once
			if (!document.getElementById("pulse-keyframes")) {
				const styleEl = document.createElement("style"); styleEl.id = "pulse-keyframes"; styleEl.textContent = `@keyframes pulseAnim {0% {transform: scale(0.6); opacity:0.7;}70% {transform: scale(1.8); opacity:0;}100% {transform: scale(2.2); opacity:0;}}`;
				document.head.appendChild(styleEl);
			}
			userMarkerRef.current = new mapboxgl.Marker({ element: wrapper, anchor: "center" }).setLngLat(userCoord).addTo(map);
		}
	}, [userCoord]);

	// Select/highlight a route both in state and on the map
	const selectRouteById = (map, routesArr, idx) => {
		setSelectedRouteId(String(idx));
		try {
			if (map.getLayer('route-primary')) map.setFilter('route-primary', ['==', ['get', 'id'], String(idx)]);
			if (map.getLayer('route-labels')) { map.setFilter('route-labels', null); }
			const coords = routesArr?.[idx]?.geometry?.coordinates || [];
			if (coords.length) {
				const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
				for (const c of coords) bounds.extend(c);
				map.fitBounds(bounds, { padding: 60, duration: 800 });
			}
		} catch { }
	};

	// Draw routes (primary + alternatives), with midpoint labels and optional congestion overlay
	const drawRoutesOnMap = (map, routesData, primaryId) => {
		if (!map || !routesData?.length) return;
		try {
			['route-primary', 'routes-alt', 'route-labels', 'congestion-overlay'].forEach(l => { if (map.getLayer(l)) map.removeLayer(l); });
			['routes', 'route-labels', 'congestion'].forEach(s => { if (map.getSource(s)) map.removeSource(s); });
		} catch { }
		const routeFeatures = routesData.map((r, i) => ({ type: 'Feature', geometry: r.geometry, properties: { id: String(i) } }));
		map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: routeFeatures } });
		map.addLayer({ id: 'routes-alt', type: 'line', source: 'routes', paint: { 'line-color': '#9ca3af', 'line-width': 3, 'line-opacity': 0.55 } });
		map.addLayer({ id: 'route-primary', type: 'line', source: 'routes', filter: ['==', ['get', 'id'], String(primaryId)], paint: { 'line-color': '#6366f1', 'line-width': 5 } });
		// Midpoint labels
		const labelFeatures = routesData.map((r, i) => { const coords = r?.geometry?.coordinates || []; const mid = coords[Math.floor(coords.length / 2)] || coords[0]; return { type: 'Feature', geometry: { type: 'Point', coordinates: mid }, properties: { label: `Route ${i + 1}`, id: String(i) } }; });
		map.addSource('route-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: labelFeatures } });
		map.addLayer({ id: 'route-labels', type: 'symbol', source: 'route-labels', layout: { 'text-field': ['get', 'label'], 'text-size': 14, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-offset': [0, 0.8] }, paint: { 'text-color': '#111827', 'text-halo-color': '#ffffff', 'text-halo-width': 1 } });

		// Bind click/hover handlers so users can select routes directly on the map
		try {
			// Unbind any previous handlers
			if (routeLayerHandlersRef.current) {
				const h = routeLayerHandlersRef.current;
				try { map.off('click', 'routes-alt', h.altClick); } catch { }
				try { map.off('mouseenter', 'routes-alt', h.altEnter); } catch { }
				try { map.off('mouseleave', 'routes-alt', h.altLeave); } catch { }
				try { map.off('click', 'route-primary', h.priClick); } catch { }
				try { map.off('mouseenter', 'route-primary', h.priEnter); } catch { }
				try { map.off('mouseleave', 'route-primary', h.priLeave); } catch { }
				try { map.off('mousemove', 'routes-alt', h.altMove); } catch { }
				try { map.off('mousemove', 'route-primary', h.priMove); } catch { }
			}
			// Remove any existing hover popup
			try { if (routeHoverPopupRef.current) { routeHoverPopupRef.current.remove(); routeHoverPopupRef.current = null; } } catch { }
			const altClick = (e) => { const id = e?.features?.[0]?.properties?.id; if (id == null) return; selectRouteById(map, routesData, Number(id)); };
			const priClick = (e) => { const id = e?.features?.[0]?.properties?.id; if (id == null) return; selectRouteById(map, routesData, Number(id)); };
			const altEnter = () => { try { map.getCanvas().style.cursor = 'pointer'; } catch { } };
			const altLeave = () => { try { map.getCanvas().style.cursor = ''; } catch { } try { if (routeHoverPopupRef.current) { routeHoverPopupRef.current.remove(); routeHoverPopupRef.current = null; } } catch { } };
			const priEnter = () => { try { map.getCanvas().style.cursor = 'pointer'; } catch { } };
			const priLeave = () => { try { map.getCanvas().style.cursor = ''; } catch { } try { if (routeHoverPopupRef.current) { routeHoverPopupRef.current.remove(); routeHoverPopupRef.current = null; } } catch { } };
			const ensureHoverPopup = () => {
				if (!routeHoverPopupRef.current) {
					const p = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'route-hover-popup' });
					routeHoverPopupRef.current = p;
				}
				return routeHoverPopupRef.current;
			};
			const renderHoverPopup = (lngLat, idx) => {
				const r = routesData?.[Number(idx)]; if (!r) return;
				const minutes = Math.round((r.duration || 0) / 60);
				const km = ((r.distance || 0) / 1000).toFixed(1);
				const el = document.createElement('div');
				el.className = 'route-hover-box';
				el.style.cssText = 'pointer-events:auto;';
				el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:rgba(17,24,39,0.85);color:#fff;box-shadow:0 6px 16px rgba(0,0,0,0.35);font-size:12px;font-weight:600;">
	        		<span style="background:#fff;color:#111827;border-radius:9999px;padding:2px 8px;font-weight:700;">Route ${Number(idx) + 1}</span>
	        		<span>${minutes} min · ${km} km</span>
	        		<span style="margin-left:6px;opacity:0.8;">Click to select</span>
	        	</div>`;
				el.onclick = (ev) => { ev.stopPropagation?.(); selectRouteById(map, routesData, Number(idx)); };
				const p = ensureHoverPopup();
				p.setLngLat(lngLat).setDOMContent(el).addTo(map);
			};
			const altMove = (e) => { const id = e?.features?.[0]?.properties?.id; if (id == null) return; renderHoverPopup(e.lngLat, id); };
			const priMove = (e) => { const id = e?.features?.[0]?.properties?.id; if (id == null) return; renderHoverPopup(e.lngLat, id); };
			if (map.getLayer('routes-alt')) {
				map.on('click', 'routes-alt', altClick);
				map.on('mouseenter', 'routes-alt', altEnter);
				map.on('mouseleave', 'routes-alt', altLeave);
				map.on('mousemove', 'routes-alt', altMove);
			}
			if (map.getLayer('route-primary')) {
				map.on('click', 'route-primary', priClick);
				map.on('mouseenter', 'route-primary', priEnter);
				map.on('mouseleave', 'route-primary', priLeave);
				map.on('mousemove', 'route-primary', priMove);
			}
			routeLayerHandlersRef.current = { altClick, altEnter, altLeave, priClick, priEnter, priLeave, altMove, priMove };
		} catch { }
		// Congestion overlay segments if present
		try {
			if (congestionSegments?.length) {
				map.addSource('congestion', { type: 'geojson', data: { type: 'FeatureCollection', features: congestionSegments } });
				map.addLayer({ id: 'congestion-overlay', type: 'line', source: 'congestion', paint: { 'line-width': 4, 'line-color': ['match', ['get', 'congestion'], 'low', '#22c55e', 'moderate', '#f59e0b', 'heavy', '#dc2626', 'severe', '#7f1d1d', '#6b7280'], 'line-opacity': 0.85 } });
			}
		} catch { }
		// Fit bounds to primary route
		const idx = Number(primaryId ?? 0);
		const coords = routesData[idx]?.geometry?.coordinates ?? [];
		if (coords.length) {
			const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
			for (const c of coords) bounds.extend(c);
			map.fitBounds(bounds, { padding: 60, duration: 800 });
		}
	};

	// Count user-uploaded potholes near each route (updates when routes, reports or filters change)
	const userPotholeCounts = useMemo(() => {
		if (!routes?.length) return [];
		return routes.map((r) => computeUserPotholeCountForRoute(r, userReports, { showFixed, adminMode }));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [routes, userReports, showFixed, adminMode]);

	// Build the factual incident list per route (congestion + reports + optional feed)
	const routeIncidentResults = useMemo(() => {
		if (!routes?.length) return [];
		return routes.map((r, i) =>
			buildRouteIncidents(r, {
				congestionSegments: trafficByRoute?.[i]?.congestionSegments || [],
				congestionAvailable: Array.isArray(trafficByRoute?.[i]?.congestionSegments),
				reports: userReports,
				showFixed,
				adminMode,
				external: externalIncidents,
			})
		);
	}, [routes, trafficByRoute, userReports, showFixed, adminMode, externalIncidents]);

	// Per-route safety analysis for multi-route comparison (deterministic, data-driven)
	const routeAnalyses = useMemo(() => {
		const incidentsByIndex = routeIncidentResults.map((r) => r.incidents);
		return analyzeRoutes(routes, {
			reports: userReports,
			showFixed,
			adminMode,
			trafficByRoute,
			routeWeather,
			// Incident factor is known from real sources; accident risk only counts
			// when an accident-capable source (external feed) exists.
			incidentsByRoute: routes?.length ? incidentsByIndex : null,
			accidentsAvailable: externalIncidents.available,
		});
	}, [routes, userReports, showFixed, adminMode, trafficByRoute, routeWeather, routeIncidentResults, externalIncidents]);

	// Safety-aware recommendation (travel-time tolerant) over the analyzed routes
	const recommendation = useMemo(() => recommendRoute(routeAnalyses), [routeAnalyses]);

	// Data-driven explanations for the recommendation (only real metric differences)
	const recommendationReasons = useMemo(() => buildRecommendationReasons(routeAnalyses, recommendation), [routeAnalyses, recommendation]);

	// Ranked hazard hotspots (concentrated active hazards, best-first)
	const hotspots = useMemo(() => detectHotspots(userReports, { includeFixed: showFixed }), [userReports, showFixed]);

	// Typical lowest-risk travel window for today's weekday (hour pattern, not a forecast)
	const safestWindow = useMemo(() => getSafestWindow(hourlyTimeRiskProfile()), []);

	// Fly the map to a hotspot zone
	const focusHotspot = (coord) => {
		const map = window._mapInstance;
		if (!map || !Array.isArray(coord)) return;
		try { map.flyTo({ center: coord, zoom: 15, duration: 800 }); } catch { }
	};

	// Route-aware hazard alerts for the currently selected route
	const selectedRouteCoords =
		selectedRouteId != null && routes?.[Number(selectedRouteId)]?.geometry?.coordinates
			? routes[Number(selectedRouteId)].geometry.coordinates
			: null;
	const hazardAlerts = useHazardAlerts({
		userCoord,
		routeCoords: selectedRouteCoords,
		incidents: selectedRouteId != null && routeIncidentResults?.length
			? routeIncidentResults[Number(selectedRouteId)]?.incidents || []
			: null,
		enabled: routes?.length > 0,
	});

	// Voice settings (optional, persisted; both channels opt-in)
	const [voiceSettings, setVoiceSettings] = useState(() => loadVoiceSettings());
	useEffect(() => { saveVoiceSettings(voiceSettings); }, [voiceSettings]);
	const announcedStepsRef = useRef(new Set());
	const spokenAlertsRef = useRef(new Set());
	useEffect(() => {
		announcedStepsRef.current = new Set();
		spokenAlertsRef.current = new Set();
	}, [selectedRouteId]); // fresh route → fresh announcements

	// Speak upcoming turn-by-turn maneuvers while navigation voice is enabled
	useEffect(() => {
		if (!voiceSettings.navigation || !isSpeechSupported() || !userCoord || !selectedRouteCoords || selectedRouteId == null) return;
		const route = routes?.[Number(selectedRouteId)];
		const steps = Array.isArray(route?.legs) ? route.legs.flatMap((l) => l?.steps || []) : [];
		if (!steps.length) return;
		const ann = pickNextStepAnnouncement({
			routeCoords: selectedRouteCoords,
			steps,
			userCoord,
			announcedSet: announcedStepsRef.current,
		});
		if (ann) {
			announcedStepsRef.current.add(ann.key);
			speakNavigationInstruction(ann.text);
		}
	}, [userCoord, selectedRouteCoords, selectedRouteId, voiceSettings.navigation, routes]);

	// Speak new hazard alerts while safety warnings are enabled
	useEffect(() => {
		if (!voiceSettings.safety || !isSpeechSupported()) return;
		for (const a of hazardAlerts.alerts) {
			if (spokenAlertsRef.current.has(a.key)) continue;
			spokenAlertsRef.current.add(a.key);
			speakSafetyWarning(`${a.title}. ${a.message}.`);
		}
	}, [hazardAlerts.alerts, voiceSettings.safety]);

	// Avoidance metrics removed

	const getRoutes = async () => {
		const map = window._mapInstance;
		if (!map || !sourceCoord || !destCoord) return;
		try {
			const profile = "driving"; // could be walking, cycling, driving-traffic
			const coordsList = [sourceCoord, ...stops, destCoord]
				.map((c) => `${c[0]},${c[1]}`)
				.join(";");
			const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsList}?alternatives=true&geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}`;
			const res = await fetch(url);
			const data = await res.json();
			const routesData = data?.routes ?? [];
			if (!routesData.length) {
				setMapError("No routes found between these points.");
				return;
			}
			// Clear weather markers/state when fetching new routes
			Object.keys(weatherMarkersRef.current).forEach((k) => {
				const arr = weatherMarkersRef.current[k] || [];
				arr.forEach((m) => { try { m.remove(); } catch { } });
				weatherMarkersRef.current[k] = [];
			});
			setRouteWeather({});
			setOpenWeatherId(null);
			setTrafficByRoute({});
			// Clear pothole markers/state on new fetch
			Object.keys(potholeMarkersRef.current).forEach((k) => {
				(potholeMarkersRef.current[k] || []).forEach((m) => { try { m.remove(); } catch { } });
				potholeMarkersRef.current[k] = [];
			});
			setPotholesByRoute({});
			setOpenPotholeId(null);
			setCongestionSegments([]);
			setRoutes(routesData);
			// Choose the shortest-duration route as primary
			let primaryId = 0;
			try {
				let bestDur = Number.MAX_SAFE_INTEGER;
				routesData.forEach((r, i) => { const d = r?.duration ?? Number.MAX_SAFE_INTEGER; if (d < bestDur) { bestDur = d; primaryId = i; } });
			} catch { }
			setSelectedRouteId(String(primaryId));
			setRecChoice(null); // fresh routes → fresh recommendation offer
			drawRoutesOnMap(map, routesData, primaryId);
			// re-render user-reported markers after route change
			renderUserPotholeMarkers();
			// Pull live traffic for every alternative so all routes get a full analysis
			routesData.forEach((_, i) => { try { fetchTrafficForRoute(i); } catch { } });
		} catch (e) {
			setMapError(e.message || "Failed to fetch routes");
		}
	};

	// Map picking handler for setting source/destination/stop
	const mapPickHandlerRef = useRef(null);
	const enableMapPick = (mode) => {
		const map = window._mapInstance; if (!map) return;
		// ensure previous handler is removed to prevent multiple modes firing
		disableMapPick();
		setPickingMode(mode);
		map.getCanvas().style.cursor = "crosshair";
		const handler = (e) => {
			const lngLat = e.lngLat;
			if (mode === "source") {
				const coord = [lngLat.lng, lngLat.lat];
				setSourceCoord(coord);
				reverseGeocode(coord[0], coord[1]).then((name) => {
					setSourceQuery(name || formatCoordLabel(coord[0], coord[1]));
					setSourceSuggestions([]);
					setSourceLocked(true);
				});
			} else if (mode === "destination") {
				const coord = [lngLat.lng, lngLat.lat];
				setDestCoord(coord);
				reverseGeocode(coord[0], coord[1]).then((name) => {
					setDestQuery(name || formatCoordLabel(coord[0], coord[1]));
					setDestSuggestions([]);
					setDestLocked(true);
				});
			} else if (mode === "stop") {
				setStops((prev) => {
					const arr = [...prev, [lngLat.lng, lngLat.lat]];
					// Render with the new list explicitly to avoid one-tick lag
					setTimeout(() => { try { renderStopMarkers(arr); } catch { } }, 0);
					rerouteIfReady(200);
					return arr;
				});
			}
			disableMapPick();
		};
		mapPickHandlerRef.current = handler;
		map.on("click", handler);
	};

	const disableMapPick = () => {
		const map = window._mapInstance; if (!map) return;
		map.getCanvas().style.cursor = "";
		if (mapPickHandlerRef.current) {
			map.off("click", mapPickHandlerRef.current);
			mapPickHandlerRef.current = null;
		}
		setPickingMode(null);
	};

	// Weather helpers
	const OW_KEY = import.meta.env.VITE_OPENWEATHER_KEY;
	const samplePointsForRoute = (route) => {
		const coords = route?.geometry?.coordinates || [];
		if (!coords.length) return [];
		// Pick 5 evenly spaced points along the geometry (by index, not distance)
		const picks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
			const idx = Math.max(0, Math.min(coords.length - 1, Math.round((coords.length - 1) * t)));
			return coords[idx];
		});
		return [
			{ label: "Start", coord: picks[0] },
			{ label: "25%", coord: picks[1] },
			{ label: "50%", coord: picks[2] },
			{ label: "75%", coord: picks[3] },
			{ label: "End", coord: picks[4] },
		];
	};

	const removeWeatherMarkersFor = (idx) => {
		const arr = weatherMarkersRef.current[String(idx)] || [];
		arr.forEach((m) => {
			try { m.remove(); } catch { }
		});
		weatherMarkersRef.current[String(idx)] = [];
	};

	const renderWeatherMarkersFor = (idx) => {
		const map = window._mapInstance;
		if (!map) return;
		const weather = routeWeather[idx];
		if (!weather || !weather.points?.length) return;
		// Clear any existing markers for this route first
		removeWeatherMarkersFor(idx);
		const markers = weather.points.map((p) => {
			const main = (p?.data?.weather?.[0]?.main || '').toLowerCase();
			const desc = (p?.data?.weather?.[0]?.description || '').toLowerCase();
			// Debug: log weather conditions to help troubleshooting
			console.log(`Weather at ${p.label}: main="${main}", desc="${desc}"`);
			// Enhanced weather icon mapping with more conditions
			let emoji = '☀️'; // default sunny
			if (main.includes('thunder') || desc.includes('thunder')) emoji = '⛈️';
			else if (main.includes('drizzle') || desc.includes('drizzle') || desc.includes('light rain')) emoji = '🌦️';
			else if (main.includes('rain') || desc.includes('rain')) {
				if (desc.includes('heavy') || desc.includes('extreme')) emoji = '🌧️';
				else if (desc.includes('shower')) emoji = '🌧️';
				else emoji = '🌧️';
			}
			else if (main.includes('snow') || desc.includes('snow') || desc.includes('sleet')) emoji = '❄️';
			else if (main.includes('mist') || main.includes('fog') || main.includes('haze') || main.includes('smoke') || desc.includes('mist') || desc.includes('fog')) emoji = '🌫️';
			else if (main.includes('cloud') || desc.includes('cloud')) {
				if (desc.includes('few') || desc.includes('scattered')) emoji = '⛅';
				else if (desc.includes('broken') || desc.includes('overcast')) emoji = '☁️';
				else emoji = '☁️';
			}
			else if (main.includes('clear') || desc.includes('clear') || desc.includes('sunny')) emoji = '☀️';
			else if (desc.includes('dust') || desc.includes('sand') || desc.includes('ash')) emoji = '🌪️';
			else if (desc.includes('squall') || desc.includes('tornado')) emoji = '🌪️';
			else if (desc.includes('wind')) emoji = '💨';
			const wrap = document.createElement("div");
			wrap.style.display = "flex";
			wrap.style.flexDirection = "column";
			wrap.style.alignItems = "center";
			wrap.style.pointerEvents = "none";
			wrap.style.transform = "translateY(-4px)";
			const iconSpan = document.createElement("span");
			iconSpan.textContent = emoji;
			iconSpan.style.fontSize = "28px";
			iconSpan.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.45))";
			const label = document.createElement("span");
			label.textContent = p.label;
			label.style.fontSize = "10px";
			label.style.fontWeight = "700";
			label.style.padding = "2px 6px";
			label.style.borderRadius = "6px";
			label.style.background = "rgba(0,0,0,0.65)";
			label.style.color = "#fff";
			label.style.marginTop = "-2px";
			label.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
			wrap.appendChild(iconSpan);
			wrap.appendChild(label);
			const marker = new mapboxgl.Marker({ element: wrap, anchor: "bottom" })
				.setLngLat(p.coord)
				.addTo(map);
			if (marker.setZIndex) try { marker.setZIndex(999); } catch { }
			return marker;
		});
		weatherMarkersRef.current[String(idx)] = markers;
	};

	const fetchWeatherForRoute = async (idx, force = false) => {
		if (!OW_KEY) {
			setRouteWeather((prev) => ({
				...prev,
				[idx]: { loading: false, error: "Missing OpenWeather API key (VITE_OPENWEATHER_KEY)", points: [], fetchedAt: Date.now() },
			}));
			return;
		}
		const route = routes[idx];
		if (!route) return;
		// Avoid refetching very recently unless force requested (simple throttle ~2 min)
		const prevEntry = routeWeather[idx];
		if (!force && prevEntry?.fetchedAt && Date.now() - prevEntry.fetchedAt < 120000 && prevEntry.points?.length) {
			return; // keep existing data
		}
		const pts = samplePointsForRoute(route);
		setRouteWeather((prev) => ({ ...prev, [idx]: { loading: true, error: null, points: [], fetchedAt: prevEntry?.fetchedAt || null } }));
		try {
			const results = await Promise.all(
				pts.map(async (p) => {
					const [lng, lat] = p.coord;
					const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OW_KEY}&units=metric`;
					const res = await fetch(url);
					if (!res.ok) throw new Error(`Weather error ${res.status}`);
					const data = await res.json();
					return { ...p, data };
				})
			);
			setRouteWeather((prev) => ({ ...prev, [idx]: { loading: false, error: null, points: results, fetchedAt: Date.now() } }));
			// Render icons on the map immediately after data loads
			renderWeatherMarkersFor(idx);
		} catch (e) {
			setRouteWeather((prev) => ({
				...prev,
				[idx]: { loading: false, error: e.message || "Failed to fetch weather", points: [], fetchedAt: Date.now() },
			}));
		}
	};

	// Ensure markers appear when data arrives and panel is open (extra safety)
	useEffect(() => {
		if (openWeatherId == null) return;
		const w = routeWeather?.[openWeatherId];
		if (w && w.points && w.points.length) {
			renderWeatherMarkersFor(openWeatherId);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [routeWeather, openWeatherId]);

	// Helpers for route details
	const getStepsForRoute = (route) => {
		if (!route?.legs?.length) return [];
		return route.legs.flatMap((leg) => leg.steps || []);
	};

	// Enhance steps with stop labels: insert virtual step entries at stop coordinates
	const getStepsWithStopsAnnotated = (route) => {
		const steps = getStepsForRoute(route).slice();
		if (!Array.isArray(stops) || !stops.length || !route?.geometry?.coordinates?.length) return steps;
		// We'll approximate by finding nearest step start to each stop and tagging the instruction
		return steps.map((s) => ({ ...s }));
	};

	// Derive simple traffic metrics from step speeds (synthetic, based on duration vs distance)
	const computeTrafficData = (route) => {
		const steps = getStepsForRoute(route);
		if (!steps.length) return [];
		return steps.map((step, idx) => {
			const d = step?.distance || 0; // meters
			const t = step?.duration || 0; // seconds
			const speedMs = t > 0 ? d / t : 0;
			const speedKmh = speedMs * 3.6;
			// Congestion score: 0 (free flow) to 100 (heavy) using a naive expected free-flow 65 km/h
			const freeFlow = 65;
			let congestion = Math.max(0, Math.min(100, 100 - (speedKmh / freeFlow) * 100));
			if (!isFinite(congestion)) congestion = 0;
			return { idx: idx + 1, speedKmh: Number(speedKmh.toFixed(1)), congestion: Number(congestion.toFixed(0)) };
		});
	};

	// Fetch real-time traffic vs free-flow for the selected alternative index using Mapbox Directions
	const fetchTrafficForRoute = async (idx, force = false) => {
		if (!sourceCoord || !destCoord) return;
		if (!force && trafficByRoute[idx]?.loading) return;
		// throttle to ~2 min
		const prev = trafficByRoute[idx];
		if (!force && prev?.updatedAt && Date.now() - prev.updatedAt < 120000 && prev.points?.length) return;
		setTrafficByRoute((p) => ({ ...p, [idx]: { ...(p[idx] || {}), loading: true, error: null } }));
		const baseParams = `alternatives=true&geometries=geojson&overview=full&steps=true`;
		try {
			const trafficUrl = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${sourceCoord[0]},${sourceCoord[1]};${destCoord[0]},${destCoord[1]}?${baseParams}&annotations=congestion&access_token=${mapboxgl.accessToken}`;
			const freeUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${sourceCoord[0]},${sourceCoord[1]};${destCoord[0]},${destCoord[1]}?${baseParams}&access_token=${mapboxgl.accessToken}`;
			const [trRes, frRes] = await Promise.all([fetch(trafficUrl), fetch(freeUrl)]);
			let trData, frData;
			if (!trRes.ok) {
				const msg = await trRes.text();
				throw new Error(`Traffic fetch ${trRes.status} ${trRes.statusText}: ${msg.slice(0, 200)}`);
			}
			if (!frRes.ok) {
				const msg = await frRes.text();
				throw new Error(`Free-flow fetch ${frRes.status} ${frRes.statusText}: ${msg.slice(0, 200)}`);
			}
			trData = await trRes.json();
			frData = await frRes.json();
			const trRoutes = trData?.routes || [];
			const frRoutes = frData?.routes || [];
			if (!trRoutes.length || !frRoutes.length) throw new Error("Traffic data not available");
			const trRoute = trRoutes[Math.min(idx, trRoutes.length - 1)];
			const frRoute = frRoutes[Math.min(idx, frRoutes.length - 1)];
			const trSteps = getStepsForRoute(trRoute);
			const frSteps = getStepsForRoute(frRoute);
			const n = Math.min(trSteps.length, frSteps.length);
			const pts = [];
			for (let i = 0; i < n; i += 1) {
				const d = trSteps[i]?.distance || frSteps[i]?.distance || 0;
				const tLive = trSteps[i]?.duration || 0;
				const tFree = frSteps[i]?.duration || 0;
				const speedLive = tLive > 0 ? (d / tLive) * 3.6 : 0;
				const speedFree = tFree > 0 ? (d / tFree) * 3.6 : 0;
				const delayPct = tFree > 0 ? Math.max(-100, ((tLive / tFree) - 1) * 100) : 0;
				pts.push({ idx: i + 1, speedLive: Number(speedLive.toFixed(1)), speedFree: Number(speedFree.toFixed(1)), delayPct: Number(delayPct.toFixed(0)) });
			}
			const liveMinutes = (trRoute?.duration || 0) / 60;
			const freeMinutes = (frRoute?.duration || 0) / 60;
			// Build congestion-colored segments along the selected route geometry using leg annotations if present
			let congFeatures = [];
			try {
				const leg = trRoute?.legs?.[0];
				const steps = leg?.steps || [];
				for (const step of steps) {
					const coords = step?.geometry?.coordinates || [];
					const cong = step?.intersections?.[0]?.classes || null; // fallback: not reliable; use annotations below if available
					// Mapbox Directions annotations for congestion can be in leg.annotation.congestion aligned with leg.annotation.distance/ duration and leg.geometry
				}
				const legAnno = trRoute?.legs?.[0]?.annotation;
				const legCoords = trRoute?.legs?.[0]?.geometry?.coordinates || [];
				const congArr = legAnno?.congestion || [];
				// Create small segments between consecutive coordinates and tag with congestion where possible
				if (legCoords.length > 1 && congArr.length) {
					const count = Math.min(congArr.length, legCoords.length - 1);
					for (let i = 0; i < count; i += 1) {
						const level = congArr[i] || "unknown"; // low, moderate, heavy, severe, unknown
						congFeatures.push({
							type: "Feature",
							geometry: { type: "LineString", coordinates: [legCoords[i], legCoords[i + 1]] },
							properties: { congestion: level },
						});
					}
				}
			} catch { }
			setTrafficByRoute((p) => ({
				...p,
				[idx]: { loading: false, error: null, points: pts, liveMinutes, freeMinutes, updatedAt: Date.now(), congestionSegments: congFeatures },
			}));
			// If this traffic belongs to the currently selected route, draw congestion overlay
			if (String(idx) === String(selectedRouteId) && congFeatures.length) {
				setCongestionSegments(congFeatures);
				const map = window._mapInstance;
				if (map) {
					// trigger layer update by calling drawRoutesOnMap with same data
					drawRoutesOnMap(map, routes, selectedRouteId);
				}
			}
		} catch (e) {
			setTrafficByRoute((p) => ({ ...p, [idx]: { loading: false, error: e.message || "Failed to load traffic", points: [] } }));
		}
	};

	// Build a bounding box around the selected route to query OSM for pothole-related tags (using Overpass API)
	const fetchPotholesForRoute = async (idx, force = false) => {
		if (!routes[idx]) return;
		const prev = potholesByRoute[idx];
		if (!force && prev?.updatedAt && Date.now() - prev.updatedAt < 120000 && prev.items?.length) return;
		setPotholesByRoute((p) => ({ ...p, [idx]: { ...(p[idx] || {}), loading: true, error: null } }));
		try {
			const coords = routes[idx].geometry.coordinates;
			if (!coords.length) throw new Error("No route geometry");
			let minLng = coords[0][0], maxLng = coords[0][0], minLat = coords[0][1], maxLat = coords[0][1];
			for (const c of coords) {
				if (c[0] < minLng) minLng = c[0];
				if (c[0] > maxLng) maxLng = c[0];
				if (c[1] < minLat) minLat = c[1];
				if (c[1] > maxLat) maxLat = c[1];
			}
			// Expand bbox slightly (~200m) to capture nearby nodes
			const pad = 0.002; // approx ~200m depending on latitude
			minLng -= pad; maxLng += pad; minLat -= pad; maxLat += pad;
			// Overpass query for nodes/ways with tags indicating bad surface or hazard pothole
			const overpassQL = `[out:json][timeout:25];(node["hazard"~"pothole"](${minLat},${minLng},${maxLat},${maxLng});way["hazard"~"pothole"](${minLat},${minLng},${maxLat},${maxLng});way["surface"~"gravel|unpaved|dirt|ground|potholes"](${minLat},${minLng},${maxLat},${maxLng});node["surface"~"potholes"](${minLat},${minLng},${maxLat},${maxLng}););out body center qt;`;
			const res = await fetch("https://overpass-api.de/api/interpreter", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: `data=${encodeURIComponent(overpassQL)}`,
			});
			if (!res.ok) throw new Error(`Overpass ${res.status}`);
			const json = await res.json();
			const elements = json.elements || [];
			const items = elements.map((el) => {
				const lng = el.lon || el.center?.lon;
				const lat = el.lat || el.center?.lat;
				if (lng == null || lat == null) return null;
				return { id: el.id, coord: [lng, lat], tags: el.tags || {} };
			}).filter(Boolean);
			setPotholesByRoute((p) => ({ ...p, [idx]: { loading: false, error: null, items, updatedAt: Date.now() } }));
			// Render markers
			renderPotholeMarkersFor(idx, items);
		} catch (e) {
			setPotholesByRoute((p) => ({ ...p, [idx]: { loading: false, error: e.message || "Failed to load potholes", items: [], updatedAt: Date.now() } }));
		}
	};

	const removePotholeMarkersFor = (idx) => {
		(potholeMarkersRef.current[String(idx)] || []).forEach((m) => { try { m.remove(); } catch { } });
		potholeMarkersRef.current[String(idx)] = [];
	};

	const renderPotholeMarkersFor = (idx, items = null) => {
		const map = window._mapInstance; if (!map) return;
		const data = items || potholesByRoute[idx]?.items || [];
		removePotholeMarkersFor(idx);
		const markers = data.slice(0, 100).map((it) => {
			const el = document.createElement("div");
			el.style.width = "18px";
			el.style.height = "18px";
			el.style.borderRadius = "50%";
			el.style.background = "#dc2626"; // red
			el.style.display = "flex";
			el.style.alignItems = "center";
			el.style.justifyContent = "center";
			el.style.color = "#fff";
			el.style.fontSize = "10px";
			el.style.fontWeight = "700";
			el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.4)";
			el.title = it.tags?.hazard || it.tags?.surface || it.tags?.smoothness || "pothole";
			el.textContent = "P";
			const mk = new mapboxgl.Marker({ element: el }).setLngLat(it.coord).addTo(map);
			return mk;
		});
		potholeMarkersRef.current[String(idx)] = markers;
	};

	/*
	NOTE: External pothole fetching (Overpass API) is disabled per requirement to only display user-uploaded potholes.
	The helper and state remain but are no longer invoked.
	*/

	// User-reported pothole utilities
	useEffect(() => {
		// Load persisted reports
		try {
			const raw = localStorage.getItem("userPotholeReports");
			if (raw) {
				const parsed = JSON.parse(raw) || [];
				// Backfill missing fields for older entries
				const normalized = parsed.map((r) => ({
					...r,
					status: normalizeStatus(r.status), // migrates legacy "unverified"/"confirmed"
					reviewedAt: r.reviewedAt || null,
					hiddenForUser: Boolean(r.hiddenForUser) || false,
					pendingRemoval: Boolean(r.pendingRemoval) || false,
					hiddenGlobally: Boolean(r.hiddenGlobally) || false,
					pendingFixReview: Boolean(r.pendingFixReview) || false,
					fixProofPhotoDataUrl: r.fixProofPhotoDataUrl || null,
					fixProofCoord: r.fixProofCoord || null,
					fixRequestedAt: r.fixRequestedAt || null,
					reportedToBBMP: Boolean(r.reportedToBBMP) || false,
					coordSource: r.coordSource || null,
					detection: r.detection || null,
				}));
				setUserReports(normalized);
			}
		} catch { }
		// Load admin messages
		try {
			const raw = localStorage.getItem('adminMessages');
			if (raw) setAdminMessages(JSON.parse(raw) || []);
		} catch { }
		// Load showFixed preference
		try {
			const sf = localStorage.getItem('showFixed');
			if (sf != null) setShowFixed(sf === 'true');
		} catch { }
		// Load showOnlyUnverified preference
		try {
			const suv = localStorage.getItem('showOnlyUnverified');
			if (suv != null) setShowOnlyUnverified(suv === 'true');
		} catch { }
	}, []);

	// Persist showFixed preference
	useEffect(() => {
		try { localStorage.setItem('showFixed', String(showFixed)); } catch { }
	}, [showFixed]);

	// Persist showOnlyUnverified preference
	useEffect(() => {
		try { localStorage.setItem('showOnlyUnverified', String(showOnlyUnverified)); } catch { }
	}, [showOnlyUnverified]);

	const persistReports = (arr) => {
		try { localStorage.setItem("userPotholeReports", JSON.stringify(arr)); } catch { }
	};

	const persistAdminMessages = (arr) => {
		try { localStorage.setItem('adminMessages', JSON.stringify(arr)); } catch { }
	};

	const addAdminMessage = (reportId, message) => {
		const msg = { id: Date.now(), reportId, message, createdAt: Date.now() };
		setAdminMessages((prev) => {
			const arr = [...prev, msg];
			persistAdminMessages(arr);
			return arr;
		});
		// notify immediately via notice for the active user
		setNotice({ type: 'info', message });
		setTimeout(() => setNotice(null), 4000);
	};

	// Export userReports to BBMP JSON format
	const exportToBBMP = () => {
		if (!userReports.length) { setNotice({ type: 'warn', message: 'No reports to export.' }); setTimeout(() => setNotice(null), 3000); return; }
		const exportData = userReports.map(r => ({
			service_name: 'Pothole repair',
			description: r.description || 'Pothole reported by citizen',
			lat: r.coord[1],
			long: r.coord[0],
			media_url: r.photoDataUrl || null,
			created_at: r.captureAt || r.createdAt,
			severity: r.severity,
			status: normalizeStatus(r.status),
			source: 'STARS App'
		}));
		try {
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url; a.download = 'bbmp_pothole_reports.json'; a.click();
			URL.revokeObjectURL(url);
			// Mark all as reportedToBBMP locally
			setUserReports(prev => { const arr = prev.map(p => ({ ...p, reportedToBBMP: true })); persistReports(arr); return arr; });
			setNotice({ type: 'success', message: 'Exported BBMP JSON and marked reports.' }); setTimeout(() => setNotice(null), 4000);
		} catch (e) {
			setNotice({ type: 'error', message: 'Export failed: ' + (e.message || e) }); setTimeout(() => setNotice(null), 4000);
		}
	};

	// Fetch and add BBMP external pothole layer (optional civic data)
	const addBbmpLayer = () => {
		const map = window._mapInstance; if (!map) return;
		// If layer exists remove first to avoid duplicates
		try { if (map.getLayer('bbmp_potholes_layer')) map.removeLayer('bbmp_potholes_layer'); } catch { }
		try { if (map.getSource('bbmp_potholes')) map.removeSource('bbmp_potholes'); } catch { }
		if (!bbmpDataRef.current) return; // need data first
		map.addSource('bbmp_potholes', { type: 'geojson', data: { type: 'FeatureCollection', features: bbmpDataRef.current } });
		map.addLayer({ id: 'bbmp_potholes_layer', type: 'circle', source: 'bbmp_potholes', paint: { 'circle-radius': 6, 'circle-color': '#f97316', 'circle-opacity': 0.85 } });
		// Auto-zoom to data so user can see it immediately
		try {
			const feats = bbmpDataRef.current || [];
			if (feats.length > 0) {
				let bounds = new mapboxgl.LngLatBounds();
				for (const f of feats) {
					if (Array.isArray(f?.geometry?.coordinates)) bounds = bounds.extend(f.geometry.coordinates);
				}
				// Only fit if bounds are valid (avoid NaN)
				if (bounds && isFinite(bounds.getEast()) && isFinite(bounds.getWest())) {
					map.fitBounds(bounds, { padding: 40, duration: 700 });
					setBbmpCount(feats.length);
				}
			}
		} catch { }
	};

	// Safety heatmap: weighted density of active hazards (severity × recency)
	const renderSafetyHeatmap = () => {
		const map = window._mapInstance; if (!map) return;
		try { if (map.getLayer('safety-heatmap')) map.removeLayer('safety-heatmap'); } catch { }
		try { if (map.getSource('safety-heatmap')) map.removeSource('safety-heatmap'); } catch { }
		if (!safetyHeatmapOn) return;
		const data = buildSafetyHeatmapData(userReports, { includeFixed: showFixed });
		if (!data.features.length) return; // nothing to show; keep layer absent
		map.addSource('safety-heatmap', { type: 'geojson', data });
		const layer = {
			id: 'safety-heatmap',
			type: 'heatmap',
			source: 'safety-heatmap',
			paint: {
				'heatmap-weight': ['get', 'weight'],
				'heatmap-intensity': 1,
				'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 14, 34, 18, 50],
				'heatmap-opacity': 0.78,
				'heatmap-color': [
					'interpolate', ['linear'], ['heatmap-density'],
					0, 'rgba(34,197,94,0)',
					0.2, 'rgba(34,197,94,0.55)',
					0.45, 'rgba(250,204,21,0.7)',
					0.7, 'rgba(249,115,22,0.85)',
					1, 'rgba(220,38,38,0.95)',
				],
			},
		};
		// Keep routes and traffic overlays drawn above the heatmap
		const below = ['routes-alt', 'route-primary', 'congestion-overlay', 'bbmp_potholes_layer'].find((id) => map.getLayer(id));
		try { if (below) map.addLayer(layer, below); else map.addLayer(layer); } catch { }
	};

	useEffect(() => { renderSafetyHeatmap(); }, [safetyHeatmapOn, userReports, showFixed]);

	const loadBBMPData = async () => {
		const map = window._mapInstance;
		if (!map) {
			setNotice({ type: 'info', message: 'Map is initializing… retrying BBMP load shortly.' });
			setTimeout(() => { try { loadBBMPData(); } catch { } }, 500);
			return;
		}
		if (bbmpLoaded && bbmpDataRef.current) { addBbmpLayer(); return; }
		setNotice({ type: 'info', message: 'Loading BBMP civic potholes…' });
		try {
			// Step 1: fetch dataset metadata to discover resource IDs.
			const datasetMetaUrl = 'https://data.opencity.in/api/dataset/bbmp-fix-my-street-data';
			const metaRes = await fetch(datasetMetaUrl);
			if (!metaRes.ok) throw new Error('Dataset metadata failed ' + metaRes.status);
			const meta = await metaRes.json();
			let resourceId = null;
			if (meta && Array.isArray(meta.resources)) {
				// Prefer a JSON/GeoJSON resource if present
				const preferred = meta.resources.find(r => /json|geojson/i.test(r.format)) || meta.resources[0];
				if (preferred) resourceId = preferred.id || preferred._id || preferred.uid;
			}
			if (!resourceId) {
				// If no resource id we provide a tiny fallback demo set
				const fallback = [
					{ longitude: 77.5946, latitude: 12.9716, status: 'unknown' },
					{ longitude: 77.5993, latitude: 12.9752, status: 'open' },
					{ longitude: 77.5871, latitude: 12.9698, status: 'in-progress' }
				];
				bbmpDataRef.current = fallback.map(d => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] }, properties: { title: 'BBMP Pothole (demo)', status: d.status } }));
				addBbmpLayer();
				setBbmpLoaded(true);
				setBbmpCount((bbmpDataRef.current || []).length);
				setNotice({ type: 'warn', message: 'BBMP resource not found; loaded demo points.' });
				setTimeout(() => setNotice(null), 5000);
				return;
			}
			// Step 2: fetch actual resource data.
			const resourceUrl = `https://data.opencity.in/api/dataset/bbmp-fix-my-street-data/resource/${resourceId}`;
			const res = await fetch(resourceUrl);
			if (!res.ok) throw new Error('Resource fetch failed ' + res.status);
			const raw = await res.json();
			// Data may be an array or wrapped in { data: [...] } or { records: [...] }
			const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.records) ? raw.records : [];
			const feats = arr.filter(d => d && isFinite(d.latitude) && isFinite(d.longitude)).map(d => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [Number(d.longitude), Number(d.latitude)] },
				properties: { title: 'BBMP Pothole', status: d.status || d.current_status || 'unknown' }
			}));
			if (!feats.length) {
				setNotice({ type: 'warn', message: 'BBMP data loaded but contained 0 mappable potholes.' });
				setTimeout(() => setNotice(null), 5000);
			}
			bbmpDataRef.current = feats;
			addBbmpLayer();
			setBbmpLoaded(true);
			setNotice({ type: 'success', message: `Loaded ${feats.length} BBMP potholes.` });
			setBbmpCount(feats.length);
			setTimeout(() => setNotice(null), 4000);
		} catch (e) {
			console.error('BBMP load error', e);
			// Provide demo fallback so the user still sees something on the map
			try {
				const fallback = [
					{ longitude: 77.5946, latitude: 12.9716, status: 'unknown' },
					{ longitude: 77.5993, latitude: 12.9752, status: 'open' },
					{ longitude: 77.5871, latitude: 12.9698, status: 'in-progress' }
				];
				bbmpDataRef.current = fallback.map(d => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] }, properties: { title: 'BBMP Pothole (demo)', status: d.status } }));
				addBbmpLayer();
				setBbmpLoaded(true);
				setBbmpCount((bbmpDataRef.current || []).length);
				setNotice({ type: 'warn', message: 'BBMP load failed; showing demo markers instead.' });
				setTimeout(() => setNotice(null), 5000);
			} catch { }
		}
	};

	const dismissAdminMessage = (id) => {
		setAdminMessages((prev) => {
			const arr = prev.filter((m) => m.id !== id);
			persistAdminMessages(arr);
			return arr;
		});
	};

	// Lifecycle transition helper (admin)
	const setReportStatus = (id, newStatus) => {
		const status = normalizeStatus(newStatus);
		setUserReports((prev) => {
			const arr = prev.map((x) => x.id === id ? {
				...x,
				status,
				reviewedAt: Date.now(),
				...(status === 'fixed' || status === 'rejected' ? { pendingFixReview: false } : {}),
				...(status === 'reported' ? { hiddenGlobally: false, rejectionReason: null } : {}),
			} : x);
			persistReports(arr);
			return arr;
		});
	};

	// Allow user to edit severity level of their report
	const updateReportSeverity = (id, newLevel) => {
		const allowed = ['low', 'moderate', 'high'];
		const level = allowed.includes(newLevel) ? newLevel : 'moderate';
		setUserReports((prev) => {
			const arr = prev.map((r) => (r.id === id ? { ...r, severity: level } : r));
			persistReports(arr);
			return arr;
		});
		try { setTimeout(() => { if (window._mapInstance) renderUserPotholeMarkers(); }, 0); } catch { }
		setNotice({ type: 'success', message: `Level updated to ${level}.` });
		setTimeout(() => setNotice(null), 2000);
	};

	const renderUserPotholeMarkers = () => {
		const map = window._mapInstance; if (!map) return;
		userPotholeMarkersRef.current.forEach((m) => { try { m.remove(); } catch { } });
		userPotholePopupsRef.current.forEach((p) => { try { p.remove(); } catch { } });
		userPotholeMarkersRef.current = [];
		userPotholePopupsRef.current = [];
	// Group nearby reports into hazard clusters (individual reports are preserved;
	// the marker shows one pin per location instead of one pin per duplicate)
	const visibleReports = userReports.filter((rep) => {
		if (!Array.isArray(rep?.coord)) return false;
		if (rep.hiddenGlobally) return false;
		if (rep.status === 'rejected') return false;
		if (rep.hiddenForUser && !adminMode) return false;
		if (rep.status === 'fixed' && !showFixed) return false;
		if (adminMode && showOnlyUnverified && normalizeStatus(rep.status) !== 'reported') return false;
		return true;
	});
	const reportClusters = clusterReports(visibleReports, { thresholdMeters: CLUSTER_THRESHOLD_METERS });
	for (const cluster of reportClusters) {
		// Representative report = most recent in the cluster; every member stays intact
		const rep = cluster.reports.reduce(
			(m, r) => (((r.captureAt || r.createdAt || 0) >= (m.captureAt || m.createdAt || 0)) ? r : m),
			cluster.reports[0]
		);
		const clusterIds = cluster.reports.map((r) => r.id);
		const el = document.createElement("div");
			el.style.width = "36px";
			el.style.height = "36px";
			el.style.display = "flex";
			el.style.alignItems = "center";
			el.style.justifyContent = "center";
			el.style.cursor = "pointer";
			el.style.transform = "translateY(-6px)";
			el.title = `${rep.severity} pothole: ${rep.description}`;
			const img = document.createElement("img");
			img.src = cluster.severity === "high" ? highIcon : cluster.severity === "moderate" ? moderateIcon : lowIcon;
			img.alt = `${cluster.severity} pothole${cluster.count > 1 ? ` (${cluster.count} reports)` : ""}`;
			img.style.width = "100%";
			img.style.height = "100%";
			img.style.objectFit = "contain";
			img.style.filter = "drop-shadow(0 4px 8px rgba(0,0,0,0.4))";
			el.appendChild(img);
			// Visual ring by status
			const ringStatus = normalizeStatus(rep.status);
			if (ringStatus === 'verified') {
				el.style.border = '2px solid #10b981';
				el.style.borderRadius = '9999px';
			} else if (ringStatus === 'repair-requested') {
				el.style.border = '2px solid #7c3aed';
				el.style.borderRadius = '9999px';
			} else if (ringStatus === 'under-review') {
				el.style.border = '2px solid #3b82f6';
				el.style.borderRadius = '9999px';
			} else if (ringStatus === 'fixed') {
				el.style.border = '2px solid #9ca3af';
				el.style.borderRadius = '9999px';
			} else {
				el.style.border = '2px solid #f59e0b';
				el.style.borderRadius = '9999px';
			}
			const mk = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat(cluster.coord).addTo(map);
			// Click to open popup with photo and date
			el.addEventListener("click", (ev) => {
				// Prevent map click from immediately closing the popup
				try { ev?.stopPropagation?.(); } catch { }
				try { ev?.stopImmediatePropagation?.(); } catch { }
				try { ev?.preventDefault?.(); } catch { }
				try { userPotholePopupsRef.current.forEach((p) => p.remove()); } catch { }
				userPotholePopupsRef.current = [];
				const wrap = document.createElement("div");
				wrap.style.maxWidth = "220px";
				wrap.style.fontSize = "12px";
				wrap.style.color = "#111827";
				// Build safe metadata block (severity, date, status, coordinates, description)
				const repConfidence = assessReportConfidence(cluster.reports);
				const meta = document.createElement("div");
				meta.style.marginTop = "6px";
				const displayedTs = rep.captureAt || rep.createdAt;
				const createdAt = new Date(displayedTs).toLocaleString();
				const sev = String(rep.severity || "").toUpperCase();
				const lng = Array.isArray(rep.coord) ? Number(rep.coord[0]) : NaN;
				const lat = Array.isArray(rep.coord) ? Number(rep.coord[1]) : NaN;
				const coordLine = (isFinite(lat) && isFinite(lng)) ? `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "";
				const safeDesc = (rep.description || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");						const statusBadge = (() => {
							const st = normalizeStatus(rep.status);
							const sty = STATUS_STYLES[st] || STATUS_STYLES.reported;
							const baseStyle = 'display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:.5px;margin-top:4px;';
							return `<span style="${baseStyle}background:${sty.bg};color:${sty.text};">${(STATUS_LABELS[st] || 'Reported').toUpperCase()}</span>`;
						})();
				meta.innerHTML = `
					<div><strong>${sev}</strong> • ${createdAt}</div>
					${statusBadge}
					<div style="margin-top:4px;font-size:10px;font-weight:600;color:#374151;">System confidence: ${repConfidence.level} (${repConfidence.score}/100)</div>
					${rep.reportedToBBMP ? '<div style="margin-top:4px;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:#312e81;color:#c7d2fe;">Reported to BBMP</div>' : ''}
					${coordLine ? `<div style="color:#4b5563;font-size:11px;margin-top:2px;">${coordLine}</div>` : ""}
					${safeDesc ? `<div style=\"color:#6b7280;margin-top:4px;\">${safeDesc}</div>` : ""}
				`;
				// Append photo if available
				if (rep.photoDataUrl) {
					const photo = document.createElement("img");
					photo.src = rep.photoDataUrl;
					photo.alt = "Hazard photo";
					photo.loading = "lazy";
					photo.style.width = "100%";
					photo.style.height = "auto";
					photo.style.maxHeight = "220px";
					photo.style.objectFit = "cover";
					photo.style.borderRadius = "6px";
					photo.style.border = "1px solid #e5e7eb";
					photo.style.cursor = "zoom-in";
					photo.addEventListener('click', (e) => { e.stopPropagation?.(); e.preventDefault?.(); try { openImageModal(rep.photoDataUrl, `Reported photo • ${new Date(rep.captureAt || rep.createdAt).toLocaleString()}`); } catch { } });
					wrap.appendChild(photo);
				}
				// Cluster summary — duplicates are grouped here, original reports stay intact
				if (cluster.count > 1) {
					const clusterConfidence = assessReportConfidence(cluster.reports);
					const clusterInfo = document.createElement('div');
					clusterInfo.style.cssText = 'margin-bottom:6px;padding:6px 8px;border-radius:6px;background:#fff7ed;border:1px solid #fed7aa;';
					clusterInfo.innerHTML = `<div style="font-weight:700;font-size:12px;color:#9a3412;">POTHOLE CLUSTER</div><div style="font-size:11px;color:#7c2d12;">${cluster.count} reports · Severity: ${String(cluster.severity).toUpperCase()}</div><div style="font-size:11px;color:#7c2d12;margin-top:2px;">System confidence: ${clusterConfidence.level} (${clusterConfidence.score}/100)</div>`;
					wrap.appendChild(clusterInfo);
				}
				wrap.appendChild(meta);
				// Add an explicit close button inside popup content
				const closeBtn = document.createElement("button");
				closeBtn.textContent = "Close";
				closeBtn.style.marginTop = "8px";
				closeBtn.style.width = "100%";
				closeBtn.style.padding = "6px 10px";
				closeBtn.style.borderRadius = "6px";
				closeBtn.style.border = "1px solid #d1d5db";
				closeBtn.style.background = "#f9fafb";
				closeBtn.style.color = "#111827";
				closeBtn.style.cursor = "pointer";
				wrap.appendChild(closeBtn);						const popup = new mapboxgl.Popup({ offset: 10, closeOnClick: false, closeButton: true })
							.setDOMContent(wrap)
							.setLngLat(cluster.coord)
							.addTo(map);
				closeBtn.addEventListener("click", (e) => { e?.stopPropagation?.(); e?.preventDefault?.(); try { popup.remove(); } catch { } });
				// Admin controls (inline) if adminMode
				if (adminMode) {
					const adminBar = document.createElement('div');
					adminBar.style.display = 'flex';
					adminBar.style.flexWrap = 'wrap';
					adminBar.style.gap = '4px';
					adminBar.style.marginTop = '8px';
					const mkBtn = (label, newStatus, color) => {
						const b = document.createElement('button');
						b.textContent = label;
						b.style.fontSize = '10px';
						b.style.padding = '4px 6px';
						b.style.borderRadius = '4px';
						b.style.border = '1px solid #d1d5db';
						b.style.cursor = 'pointer';
						b.style.background = color;
						b.style.color = '#111827';
						b.addEventListener('click', (ev2) => {
							ev2.stopPropagation(); ev2.preventDefault();
							setUserReports((prev) => {
								const arr = prev.map((r2) => clusterIds.includes(r2.id) ? { ...r2, status: newStatus, reviewedAt: Date.now() } : r2);
								persistReports(arr);
								return arr;
							});
							// Update popup without closing
							setTimeout(() => { renderUserPotholeMarkers(); }, 50);
						});
						return b;
					};
					adminBar.appendChild(mkBtn('Verify', 'verified', '#bfdbfe'));
					const fixedBtn = mkBtn('Mark Fixed', 'fixed', '#c7d2fe');
					fixedBtn.addEventListener('click', (ev2) => {
						ev2.stopPropagation(); ev2.preventDefault();
						// Also clear pendingFixReview flag when admin marks fixed from popup
						setUserReports((prev) => {
							const arr = prev.map((r2) => clusterIds.includes(r2.id) ? { ...r2, status: 'fixed', reviewedAt: Date.now(), pendingFixReview: false } : r2);
							persistReports(arr);
							return arr;
						});
						setTimeout(() => { renderUserPotholeMarkers(); }, 50);
					});
					if (rep.pendingFixReview) { fixedBtn.style.outline = '2px solid #1d4ed8'; fixedBtn.style.background = '#93c5fd'; }
					// If fix proof exists, add a quick view button
					if (rep.pendingFixReview && rep.fixProofPhotoDataUrl) {
						const viewBtn = document.createElement('button');
						viewBtn.textContent = 'View proof';
						viewBtn.style.fontSize = '10px';
						viewBtn.style.padding = '4px 6px';
						viewBtn.style.borderRadius = '4px';
						viewBtn.style.border = '1px solid #d1d5db';
						viewBtn.style.cursor = 'pointer';
						viewBtn.style.background = '#eef2ff';
						viewBtn.style.color = '#111827';
						viewBtn.addEventListener('click', (ev2) => { ev2.stopPropagation(); ev2.preventDefault(); try { openImageModal(rep.fixProofPhotoDataUrl, `Fix proof for report ${rep.id}`); } catch { } });
						adminBar.appendChild(viewBtn);
					}
					// Reset button to revert to reported and clear moderation flags
					const resetBtn = document.createElement('button');
					resetBtn.textContent = 'Reset';
					resetBtn.style.fontSize = '10px';
					resetBtn.style.padding = '4px 6px';
					resetBtn.style.borderRadius = '4px';
					resetBtn.style.border = '1px solid #d1d5db';
					resetBtn.style.cursor = 'pointer';
					resetBtn.style.background = '#e5e7eb';
					resetBtn.style.color = '#111827';
					resetBtn.addEventListener('click', (ev2) => {
						ev2.stopPropagation(); ev2.preventDefault();
						setUserReports((prev) => {
							const arr = prev.map((r2) => clusterIds.includes(r2.id) ? { ...r2, status: 'reported', reviewedAt: null, pendingFixReview: false, hiddenGlobally: false, rejectionReason: null } : r2);
							persistReports(arr);
							return arr;
						});
						setTimeout(() => { renderUserPotholeMarkers(); }, 50);
					});
					adminBar.appendChild(fixedBtn);
					adminBar.appendChild(resetBtn);
					// Mark reported to BBMP (manual flag toggle)
					const bbmpBtn = document.createElement('button');
					bbmpBtn.textContent = rep.reportedToBBMP ? 'Unmark BBMP' : 'Mark BBMP';
					bbmpBtn.style.fontSize = '10px'; bbmpBtn.style.padding = '4px 6px'; bbmpBtn.style.borderRadius = '4px'; bbmpBtn.style.border = '1px solid #d1d5db'; bbmpBtn.style.cursor = 'pointer'; bbmpBtn.style.background = rep.reportedToBBMP ? '#1e3a8a' : '#eef2ff'; bbmpBtn.style.color = rep.reportedToBBMP ? '#f8fafc' : '#111827';
					bbmpBtn.addEventListener('click', (ev2) => {
						ev2.stopPropagation(); ev2.preventDefault();
						setUserReports(prev => { const arr = prev.map(r2 => clusterIds.includes(r2.id) ? { ...r2, reportedToBBMP: !r2.reportedToBBMP } : r2); persistReports(arr); return arr; });
						setTimeout(() => { renderUserPotholeMarkers(); }, 50);
					});
					adminBar.appendChild(bbmpBtn);
					if (rep.pendingFixReview) {
						const note = document.createElement('div');
						note.textContent = 'Fix proof pending';
						note.style.fontSize = '10px';
						note.style.fontWeight = '600';
						note.style.background = '#dbeafe';
						note.style.padding = '2px 4px';
						note.style.borderRadius = '4px';
						note.style.marginTop = '2px';
						adminBar.appendChild(note);
					}
					// Reject button: prompt for reason and notify the report owner
					const rejBtn = document.createElement('button');
					rejBtn.textContent = 'Reject';
					rejBtn.style.fontSize = '10px';
					rejBtn.style.padding = '4px 6px';
					rejBtn.style.borderRadius = '4px';
					rejBtn.style.border = '1px solid #fca5a5';
					rejBtn.style.cursor = 'pointer';
					rejBtn.style.background = '#fecaca';
					rejBtn.style.color = '#7f1d1d';
					rejBtn.addEventListener('click', (ev2) => {
						ev2.stopPropagation(); ev2.preventDefault();
						openRejectModal(rep.id);
					});
					adminBar.appendChild(rejBtn);
					wrap.appendChild(adminBar);
				}
				userPotholePopupsRef.current.push(popup);
			});
			userPotholeMarkersRef.current.push(mk);
		}
	};

	// Send a browser notification (asks permission if needed) and also show in-app banner
	const sendNearbyPotholeNotification = (message, rep = null, distanceM = null) => {
		// In-app notice
		setNotice({ type: 'warn', message });
		setTimeout(() => setNotice(null), 5000);
		// Web Notification API
		try {
			if (typeof Notification === 'undefined') return;
			const body = distanceM != null ? `Approx ${Math.round(distanceM)} m away.` : undefined;
			const trigger = () => {
				const n = new Notification('Pothole nearby', { body });
				if (rep && Array.isArray(rep.coord)) {
					n.onclick = () => {
						try { window.focus(); } catch { }
						const map = window._mapInstance; if (map) map.flyTo({ center: rep.coord, zoom: 16 });
						try { n.close(); } catch { }
					};
				}
			};
			if (Notification.permission === 'granted') {
				trigger();
			} else if (Notification.permission === 'default') {
				Notification.requestPermission().then((perm) => { if (perm === 'granted') trigger(); });
			}
		} catch { }
	};

	// Check if user's live location is near any user-reported pothole and warn
	const checkNearbyPotholes = () => {
		if (!userCoord || !Array.isArray(userReports) || !userReports.length) return;
		// Filter reports similar to map visibility, and exclude fixed ones from warnings
		const candidates = userReports.filter((rep) => {
			if (!Array.isArray(rep.coord)) return false;
			if (rep.hiddenGlobally) return false;
			if (rep.status === 'rejected') return false;
			if (rep.hiddenForUser && !adminMode) return false;
			if (rep.status === 'fixed') return false; // don't warn for fixed
			return true;
		});
		if (!candidates.length) return;
		const nearThreshold = 150; // meters
		const cooldownMs = 10 * 60 * 1000; // 10 minutes per pothole
		let nearest = null; let minD = Infinity;
		for (const rep of candidates) {
			const d = distMeters(userCoord, rep.coord);
			if (isFinite(d) && d < minD) { minD = d; nearest = rep; }
		}
		if (!nearest || !isFinite(minD) || minD > nearThreshold) return;
		const now = Date.now();
		// Global small cooldown to avoid spamming when moving inside cluster
		if (now - (lastWarnTimeRef.current || 0) < 60 * 1000) return; // 1 minute global cooldown
		const last = notifiedPotholesRef.current[nearest.id] || 0;
		if (now - last < cooldownMs) return;
		notifiedPotholesRef.current[nearest.id] = now;
		lastWarnTimeRef.current = now;
		sendNearbyPotholeNotification(`Pothole nearby — be careful! (~${Math.max(1, Math.round(minD))} m)`, nearest, minD);
	};

	// Re-check proximity when location, reports, or visibility filters change
	useEffect(() => { checkNearbyPotholes(); }, [userCoord, userReports, showFixed, adminMode]);

	// Render numbered stop markers (for added waypoints between source and destination)
	const renderStopMarkers = (list) => {
		const map = window._mapInstance; if (!map) return;
		const items = Array.isArray(list) ? list : stops;
		// Remove existing stop markers first
		stopMarkersRef.current.forEach(m => { try { m.remove(); } catch { } });
		stopMarkersRef.current = [];
		if (!Array.isArray(items) || !items.length) return;
		items.forEach((coord, idx) => {
			if (!Array.isArray(coord) || coord.length < 2) return;
			// Build a simple numbered badge marker with a small pin icon
			const wrap = document.createElement('div');
			wrap.style.position = 'relative';
			wrap.style.width = '26px';
			wrap.style.height = '26px';
			wrap.style.borderRadius = '50%';
			wrap.style.background = '#f59e0b'; // amber
			wrap.style.display = 'flex';
			wrap.style.alignItems = 'center';
			wrap.style.justifyContent = 'center';
			wrap.style.color = '#fff';
			wrap.style.fontSize = '14px';
			wrap.style.fontWeight = '700';
			wrap.style.boxShadow = '0 4px 10px rgba(0,0,0,0.35)';
			wrap.style.cursor = 'pointer';
			wrap.style.pointerEvents = 'auto';
			wrap.style.zIndex = '2000';
			wrap.title = `Stop ${idx + 1}`;
			// Centered number label
			const num = document.createElement('span');
			num.textContent = String(idx + 1);
			num.style.position = 'relative';
			num.style.zIndex = '1';
			wrap.appendChild(num);
			// Small pin icon badge (emoji) at bottom-right
			const pin = document.createElement('span');
			pin.textContent = '📍';
			pin.style.position = 'absolute';
			pin.style.right = '-6px';
			pin.style.bottom = '-6px';
			pin.style.width = '16px';
			pin.style.height = '16px';
			pin.style.borderRadius = '50%';
			pin.style.background = '#fff';
			pin.style.display = 'flex';
			pin.style.alignItems = 'center';
			pin.style.justifyContent = 'center';
			pin.style.fontSize = '10px';
			pin.style.color = '#ef4444'; // red pin
			pin.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
			wrap.appendChild(pin);
			// Remove button (appears on hover)
			const rm = document.createElement('button');
			rm.setAttribute('aria-label', 'Remove stop');
			rm.textContent = '×';
			rm.style.position = 'absolute';
			rm.style.top = '-8px';
			rm.style.right = '-8px';
			rm.style.width = '18px';
			rm.style.height = '18px';
			rm.style.borderRadius = '50%';
			rm.style.border = '1px solid #fff';
			rm.style.background = '#111827';
			rm.style.color = '#fff';
			rm.style.fontSize = '12px';
			rm.style.lineHeight = '16px';
			rm.style.textAlign = 'center';
			rm.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
			rm.style.opacity = '0';
			rm.style.transition = 'opacity .15s ease';
			wrap.appendChild(rm);
			wrap.addEventListener('mouseenter', () => { rm.style.opacity = '1'; });
			wrap.addEventListener('mouseleave', () => { rm.style.opacity = '0'; });
			rm.addEventListener('click', (e) => {
				e.stopPropagation(); e.preventDefault();
				setStops((prev) => prev.filter((_, i) => i !== idx));
				setTimeout(() => { renderStopMarkers(); rerouteIfReady(200); }, 0);
			});
			const marker = new mapboxgl.Marker({ element: wrap, anchor: 'center' }).setLngLat(coord).addTo(map);
			try { marker.setZIndex?.(2000); } catch { }
			stopMarkersRef.current.push(marker);
			// Fly to marker when clicked
			wrap.addEventListener('click', (e) => { e.stopPropagation(); const m = window._mapInstance; if (m) m.flyTo({ center: coord, zoom: 14 }); });
		});
	};

	// Re-render stop markers whenever the stops array changes
	useEffect(() => { renderStopMarkers(stops); }, [stops]);

	useEffect(() => { renderUserPotholeMarkers(); }, [userReports, showFixed, adminMode]);

	// --- Incident markers for the selected route ---
	const renderIncidentMarkers = () => {
		const map = window._mapInstance;
		if (!map) return;
		incidentMarkersRef.current.forEach((m) => { try { m.remove(); } catch { } });
		incidentPopupsRef.current.forEach((p) => { try { p.remove(); } catch { } });
		incidentMarkersRef.current = [];
		incidentPopupsRef.current = [];
		if (selectedRouteId == null || !routeIncidentResults?.length) return;
		const list = routeIncidentResults[Number(selectedRouteId)]?.incidents || [];
		const SEV_COLOR = { low: '#eab308', medium: '#f59e0b', high: '#ef4444', critical: '#7f1d1d' };
		for (const inc of list) {
			if (!Array.isArray(inc.coord)) continue;
			const el = document.createElement('div');
			el.style.width = '20px';
			el.style.height = '20px';
			el.style.borderRadius = '50%';
			el.style.background = SEV_COLOR[inc.severity] || '#f59e0b';
			el.style.border = '2px solid #fff';
			el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.45)';
			el.style.display = 'flex';
			el.style.alignItems = 'center';
			el.style.justifyContent = 'center';
			el.style.fontSize = '11px';
			el.style.cursor = 'pointer';
			el.textContent = '⚠';
			el.title = `${INCIDENT_TYPE_LABELS[inc.type] || 'Incident'} (${inc.severity})`;
			el.setAttribute('role', 'img');
			el.setAttribute('aria-label', el.title);
			el.addEventListener('click', (ev) => {
				try { ev.stopPropagation?.(); } catch { }
				incidentPopupsRef.current.forEach((p) => { try { p.remove(); } catch { } });
				incidentPopupsRef.current = [];
				const wrap = document.createElement('div');
				wrap.style.maxWidth = '240px';
				wrap.style.fontSize = '12px';
				wrap.style.color = '#111827';
				const sev = String(inc.severity || '').toUpperCase();
				const locText = `${inc.coord[1].toFixed(5)}, ${inc.coord[0].toFixed(5)}`;
				const distText = inc.distanceFromRouteMeters === 0 ? 'on route' : `~${inc.distanceFromRouteMeters} m from route`;
				const safeDesc = String(inc.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				wrap.innerHTML = `
					<div style="font-weight:700;">${INCIDENT_TYPE_LABELS[inc.type] || 'Incident'} · <span style="color:${SEV_COLOR[inc.severity] || '#f59e0b'};">${sev}</span></div>
					<div style="color:#4b5563;font-size:11px;margin-top:2px;">📍 ${locText} (${distText})</div>
					<div style="margin-top:4px;">${safeDesc}</div>`;
				const popup = new mapboxgl.Popup({ offset: 10, closeButton: true })
					.setDOMContent(wrap)
					.setLngLat(inc.coord)
					.addTo(map);
				incidentPopupsRef.current.push(popup);
			});
			const mk = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(inc.coord).addTo(map);
			incidentMarkersRef.current.push(mk);
		}
	};

	// Refresh incident markers when selection, incidents or underlying data change
	useEffect(() => { renderIncidentMarkers(); }, [selectedRouteId, routeIncidentResults]);

	// Removed manual map picking for user reports; coordinates will be extracted from photo EXIF geotag.

	const submitPotholeReport = () => {
		if (!reportForm.coord || !reportForm.photoPreview || !reportForm.description) return;
		const newRep = {
			id: Date.now(),
			coord: reportForm.coord,
			severity: reportForm.severity,
			description: reportForm.description,
			photoDataUrl: reportForm.photoPreview,
			captureAt: reportForm.captureAt || Date.now(), // fallback to upload time if capture time missing
			routeIdx: selectedRouteId,
			createdAt: Date.now(),
			status: "reported", // lifecycle: reported → under review → verified → repair requested → fixed (or rejected)
			coordSource: reportForm.coordSource || null, // gps | exif | ocr | map-pick (feeds system confidence)
			detection: reportForm.detection || null, // assistive model result (null unless a real detector is registered)
			reviewedAt: null,
			hiddenForUser: false,
			pendingRemoval: false,
			hiddenGlobally: false,
			pendingFixReview: false,
			fixProofPhotoDataUrl: null,
			fixProofCoord: null,
			fixRequestedAt: null,
			reportedToBBMP: false,
		};
		setUserReports((prev) => {
			const arr = [...prev, newRep];
			persistReports(arr);
			return arr;
		});
		// reset form
		setReportForm({ coord: null, coordSource: null, severity: "moderate", description: "", photoPreview: null, captureAt: null, photoSource: null, detection: null });
		// no map picking to disable
	};

	const deleteReport = (id) => {
		setUserReports((prev) => {
			const arr = prev.filter((r) => r.id !== id);
			persistReports(arr);
			return arr;
		});
	};

	// Soft delete by user: hide locally and request admin removal
	const requestDeleteReport = (id) => {
		setUserReports((prev) => {
			const arr = prev.map((r) => r.id === id ? { ...r, hiddenForUser: true, pendingRemoval: true } : r);
			persistReports(arr);
			return arr;
		});
		setNotice({ type: 'info', message: 'Deletion request sent. An admin will complete removal.', undoId: id });
		setTimeout(() => setNotice(null), 4000);
	};

	// Undo a user's deletion request
	const undoDeleteRequest = (id) => {
		setUserReports((prev) => {
			const arr = prev.map((r) => r.id === id ? { ...r, hiddenForUser: false, pendingRemoval: false } : r);
			persistReports(arr);
			return arr;
		});
		setNotice({ type: 'success', message: 'Deletion request undone.' });
		setTimeout(() => setNotice(null), 3000);
	};

	const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
	const formatDuration = (s) => `${Math.round(s / 60)} min`;

	const handleUseMyLocation = () => {
		if (!navigator.geolocation) {
			setMapError("Geolocation not supported by this browser.");
			setNotice({ type: 'error', message: 'This browser does not support location.' });
			setTimeout(() => setNotice(null), 3000);
			return;
		}
		// Start watching position if not already
		if (geoWatchIdRef.current == null) {
			geoWatchIdRef.current = navigator.geolocation.watchPosition(
				(pos) => {
					const { longitude, latitude } = pos.coords;
					const coord = [longitude, latitude];
					setUserCoord(coord);
				},
				(err) => {
					setMapError(err.message || 'Unable to watch location');
				},
				{ enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
			);
		}
		// Set current user location as source (once) and center map
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const { longitude, latitude } = pos.coords;
				const coord = [longitude, latitude];
				setUserCoord(coord);
				setSourceCoord(coord); // per requirement: use my location sets source
				// Update input text with reverse geocoded name, fallback to coordinates label
				reverseGeocode(coord[0], coord[1]).then((name) => {
					setSourceQuery(name || formatCoordLabel(coord[0], coord[1]));
					setSourceSuggestions([]);
					// Lock autocomplete so it doesn't appear unless user types
					setSourceLocked(true);
				});
				const map = window._mapInstance;
				if (map) map.flyTo({ center: coord, zoom: 13 });
				// If destination already set, trigger routing
				try { if (destCoord) getRoutes(); } catch { }
			},
			(err) => {
				const msg = err && err.message ? err.message : 'Location permission denied or unavailable.';
				setMapError(msg);
				setNotice({ type: 'warn', message: msg });
				setTimeout(() => setNotice(null), 4000);
			},
			{ enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
		);
	};

	// Cleanup geolocation watch on unmount
	useEffect(() => () => {
		if (geoWatchIdRef.current != null && navigator.geolocation) {
			navigator.geolocation.clearWatch(geoWatchIdRef.current);
			geoWatchIdRef.current = null;
		}
	}, []);

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:bg-gradient-to-br dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 text-gray-900 dark:text-gray-100">
			<header className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-xl backdrop-blur-sm">
				<div className="max-w-7xl mx-auto px-6 py-5 flex items-center gap-4 text-white">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm shadow-lg">
							<MapPin className="w-7 h-7" />
						</div>
						<div>
							<h1 className="text-3xl font-bold tracking-tight">STARS</h1>
							<p className="text-xs opacity-90 font-medium">Route Finder</p>
						</div>
					</div>
					<div className="ml-auto text-sm opacity-95 flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm"><Info className="w-4 h-4" /> Smarter travel, safer roads</div>
					<button onClick={() => setShowMessages((s) => !s)} className="ml-4 flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 backdrop-blur-sm shadow-lg hover:shadow-xl hover:scale-105">
						<Bell className="w-4 h-4" />
						{adminMessages.length > 0 && <span className="text-xs px-2 py-0.5 bg-red-500 text-white rounded-full font-semibold animate-pulse">{adminMessages.length}</span>}
					</button>
					<button
						onClick={() => {
							if (!adminMode) {
								const pin = prompt("Enter admin PIN (demo: 1234)");
								if (pin === "1234") setAdminMode(true); else alert("Invalid PIN");
							} else {
								setAdminMode(false);
							}
						}}
						className={`ml-2 flex items-center gap-2 text-sm px-4 py-2 rounded-full transition-all duration-200 backdrop-blur-sm shadow-lg hover:shadow-xl hover:scale-105 ${adminMode ? 'bg-white/30 font-bold border-2 border-white/50' : 'bg-white/10 hover:bg-white/20 border border-white/30'}`}
					>
						<ShieldCheck className="w-4 h-4" /> {adminMode ? 'Admin Mode' : 'Admin'}
					</button>
				</div>
			</header>

			{/* Notice banner */}
			{notice && (
				<div className="max-w-7xl mx-auto px-6 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
					<div className={`px-4 py-3 text-sm rounded-xl shadow-lg backdrop-blur-sm flex items-center justify-between ${notice.type === 'success' ? 'bg-green-100/90 border-2 border-green-300 text-green-900 dark:bg-green-900/40 dark:border-green-700 dark:text-green-200' : notice.type === 'warn' ? 'bg-yellow-100/90 border-2 border-yellow-300 text-yellow-900 dark:bg-yellow-900/40 dark:border-yellow-700 dark:text-yellow-200' : notice.type === 'error' ? 'bg-red-100/90 border-2 border-red-300 text-red-900 dark:bg-red-900/40 dark:border-red-700 dark:text-red-200' : 'bg-blue-100/90 border-2 border-blue-300 text-blue-900 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-200'}`}>
						<span>{notice.message}</span>
					{notice.undoId && (
						<button onClick={() => undoDeleteRequest(notice.undoId)} className="ml-4 text-xs underline hover:opacity-80">Undo</button>
					)}
				</div>
			</div>
		)}

		{/* Route hazard alerts — auto-managed with throttling, dismissible */}
		{hazardAlerts.alerts.length > 0 && (
			<div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(94vw,460px)] space-y-2" aria-live="assertive" aria-label="Route hazard alerts">
				{hazardAlerts.alerts.map((a) => {
					const critical = a.severity === "critical" || a.title === "ROAD CLOSURE" || a.title === "ACCIDENT";
					return (
						<div key={a.key} role="alert" className={`rounded-xl shadow-2xl border-2 px-4 py-3 flex items-start gap-3 backdrop-blur-md ${critical ? "bg-red-50/95 border-red-400 text-red-900 dark:bg-red-950/90 dark:border-red-700 dark:text-red-100" : "bg-amber-50/95 border-amber-400 text-amber-900 dark:bg-amber-950/90 dark:border-amber-600 dark:text-amber-100"}`}>
							<AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${critical ? "text-red-600" : "text-amber-600"}`} aria-hidden="true" />
							<div className="flex-1 min-w-0">
								<div className="text-xs font-bold tracking-wide">{a.title}</div>
								<div className="text-sm font-medium">{a.message}</div>
							</div>
							<div className="text-sm font-bold whitespace-nowrap">{formatAheadDistance(a.aheadMeters)} ahead</div>
							<button
								onClick={() => hazardAlerts.dismiss(a.key)}
								aria-label={`Dismiss ${a.title} alert`}
								className="p-1 rounded hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-current"
							>
								<X className="w-4 h-4" aria-hidden="true" />
							</button>
						</div>
					);
				})}
			</div>
		)}

			{/* Global modals */}
			{/* Reject modal */}
			{rejectModal.open && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeRejectModal} />
					<div className="relative z-10 w-full max-w-md bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
						<h3 className="text-base font-bold mb-3">Reject Report</h3>
						<div className="text-xs text-gray-600 dark:text-gray-300 mb-3">Optionally add a reason to notify the reporter.</div>
						<textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (optional)" className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" rows={3} />
						<div className="mt-4 flex justify-end gap-2">
							<button onClick={closeRejectModal} className="px-4 py-2 text-sm font-medium rounded-xl border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
							<button onClick={confirmRejectModal} className="px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-700 hover:to-rose-700 shadow-md">Reject</button>
						</div>
					</div>
				</div>
			)}

			{/* Fix proof modal */}
			{fixModal.open && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeFixModal} />
					<div className="relative z-10 w-full max-w-md bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
						<h3 className="text-base font-bold mb-2">Mark Pothole Fixed</h3>
						<div className="text-xs text-gray-600 dark:text-gray-300 mb-3">Upload a geotagged photo as proof (GPS required).</div>
						<div className="mt-1 flex items-center gap-3">
							<button type="button" onClick={() => openCameraModal('fix')} className="px-4 py-2 text-xs font-medium rounded-xl border-2 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 inline-flex items-center gap-2 transition-all duration-200 hover:scale-105">
								<Camera className="w-4 h-4" /> Use camera
							</button>
							<span className="text-[11px] text-gray-500">or upload from gallery</span>
						</div>
						<input type="file" accept="image/*" className="w-full text-xs"						onChange={async (e) => {
							const file = e.target.files?.[0]; if (!file) return;
							await handleImageSelected(file, 'fix');
						}} />
						{fixPhotoPreview && (
							<div className="mt-2">
								<img
									src={fixPhotoPreview}
									alt="fix proof"
									className="w-full max-h-64 object-cover rounded border border-gray-200 dark:border-gray-700 cursor-zoom-in"
									onClick={() => openImageModal(fixPhotoPreview, 'Fix proof photo')}
								/>
								<div className="mt-1 text-[11px] text-gray-600 dark:text-gray-300">{fixCoord ? `Location: ${fixCoord[1].toFixed(5)}, ${fixCoord[0].toFixed(5)}` : fixOcrMessage}</div>
							</div>
						)}
						<div className="mt-3 flex justify-end gap-2">
							<button onClick={closeFixModal} className="px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50">Cancel</button>
							<button onClick={submitFixProof} disabled={!fixPhotoPreview || !fixCoord} className="px-3 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Submit proof</button>
						</div>
					</div>
				</div>
			)}

			{/* Image preview modal */}
			{imageModal.open && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeImageModal} />
					<div className="relative z-10 w-[90vw] max-w-5xl max-h-[90vh] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl p-3 shadow-2xl">
						<div className="flex items-center justify-between mb-2">
							<div className="text-xs text-gray-600 dark:text-gray-300 truncate pr-2">{imageModal.caption || 'Image preview'}</div>
							<div className="flex items-center gap-2">
								<a href={imageModal.src} target="_blank" rel="noreferrer" className="text-xs underline">Open in new tab</a>
								<button onClick={closeImageModal} className="text-xs px-3 py-1.5 rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800">Close</button>
							</div>
						</div>
						<div className="overflow-auto max-h-[80vh]">
							<img src={imageModal.src} alt="preview" className="w-full h-auto object-contain" />
						</div>
					</div>
				</div>
			)}

			{/* Messages panel */}
			{showMessages && (
				<div className="max-w-7xl mx-auto px-6 pt-4">
					<div className="rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 p-4 shadow-xl text-sm">
						<div className="flex items-center justify-between mb-2">
							<div className="font-medium">Messages from admin</div>
							<button onClick={() => setShowMessages(false)} className="text-xs underline">Close</button>
						</div>
						{adminMessages.length === 0 ? (
							<div className="text-xs text-gray-500">No messages.</div>
						) : (
							<ul className="space-y-2">
								{adminMessages.slice().reverse().map((m) => (
									<li key={m.id} className="flex items-start justify-between gap-3">
										<div>
											<div className="font-medium text-[13px]">Report {m.reportId}</div>
											<div className="text-xs text-gray-600">{m.message}</div>
											<div className="text-xs text-gray-400 mt-1">{new Date(m.createdAt).toLocaleString()}</div>
										</div>
										<div className="flex-shrink-0">
											<button onClick={() => dismissAdminMessage(m.id)} className="text-xs underline">Dismiss</button>
										</div>
									</li>
								))}
							</ul>
						)}

					</div>
				</div>
			)}

			{/* Camera capture modal */}
			{cameraOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCameraModal} />
					<div className="relative z-10 w-full max-w-md bg-black rounded-lg overflow-hidden shadow-xl">
						<div className="relative w-full aspect-[3/4] bg-black">
							<video ref={cameraVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
							{cameraError && (
								<div className="absolute inset-0 flex items-center justify-center text-sm text-red-200 bg-black/60 p-4 text-center">
									{cameraError}
								</div>
							)}
						</div>
						<div className="p-3 flex items-center justify-between bg-gray-900">
							<div className="text-[10px] text-gray-300">
								GPS accuracy: {geoAccuracy != null ? `${Math.round(geoAccuracy)} m` : '—'}
							</div>
							<div className="flex items-center gap-2">
								<button onClick={closeCameraModal} className="px-3 py-2 text-xs rounded border border-gray-700 text-gray-200 hover:bg-gray-800">Cancel</button>
								<button onClick={captureFromCamera} className="px-3 py-2 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1">
									<Camera className="w-4 h-4" /> Capture
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			<main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
				<section className="lg:col-span-2 space-y-6">
					{/* Controls */}
					<div ref={reportCardRef} className="p-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-xl hover:shadow-2xl transition-shadow duration-300">
						<div className="grid gap-4 md:grid-cols-2">
							<div className="relative">
								<label className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-2 block">Source</label>
								<input
									type="text"
									ref={sourceInputRef}
									value={sourceQuery}
									onChange={(e) => { setSourceLocked(false); setSourceQuery(e.target.value); }}
									placeholder="Search source location..."
									className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 shadow-sm hover:shadow-md"
								/>
								<button
									title="Use my location as source"
									onClick={handleUseMyLocation}
									type="button"
									className="absolute right-3 top-9 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:scale-110 transition-transform duration-200 p-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
								>
									<LocateFixed className="w-5 h-5" />
								</button>
								{sourceSuggestions.length > 0 && (
									<ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow">
										{sourceSuggestions.map((s) => (
											<li
												key={s.id}
												className="px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
												onClick={() => {
													setSourceCoord(s.center);
													setSourceQuery(s.name);
													setSourceSuggestions([]);
													setSourceLocked(true);
													const map = window._mapInstance;
													if (map) map.flyTo({ center: s.center, zoom: 12 });
												}}
											>
												{s.name}
											</li>
										))}
									</ul>
								)}
							</div>

							<div className="relative">
								<label className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-2 block">Destination</label>
								<input
									type="text"
									ref={destInputRef}
									value={destQuery}
									onChange={(e) => { setDestLocked(false); setDestQuery(e.target.value); }}
									placeholder="Search destination location..."
									className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 shadow-sm hover:shadow-md"
								/>
								{destSuggestions.length > 0 && (
									<ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow">
										{destSuggestions.map((s) => (
											<li
												key={s.id}
												className="px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
												onClick={() => {
													setDestCoord(s.center);
													setDestQuery(s.name);
													setDestSuggestions([]);
													setDestLocked(true);
													const map = window._mapInstance;
													if (map) map.flyTo({ center: s.center, zoom: 12 });
												}}
											>
												{s.name}
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
						<div className="mt-4 flex flex-wrap gap-3">
							<button onClick={() => enableMapPick('source')} className={`px-4 py-2.5 text-sm font-medium rounded-xl border-2 transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 ${pickingMode === 'source' ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400'}`}>Pick source</button>
							<button onClick={() => enableMapPick('destination')} className={`px-4 py-2.5 text-sm font-medium rounded-xl border-2 transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 ${pickingMode === 'destination' ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400'}`}>Pick destination</button>
							<div className="relative">
								<button
									onClick={() => {
										setStopSearchOpen((v) => !v);
										if (stopSearchOpen) { setStopSearchQuery(""); setStopSearchSuggestions([]); }
									}}
									className={`px-3 py-2 text-sm rounded border ${pickingMode === 'stop' ? 'border-amber-600 bg-amber-50 dark:bg-amber-900/30' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
								>
									Add stop
								</button>
								{stopSearchOpen && (
									<div className="absolute z-20 mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow">
										<div className="p-2 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800">
											<input
												type="text"
												value={stopSearchQuery}
												onChange={(e) => setStopSearchQuery(e.target.value)}
												placeholder="Search a place to add as stop"
												className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
											/>
											<button
												className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
												onClick={() => {
													enableMapPick('stop');
													setStopSearchOpen(false);
													setNotice({ type: 'info', message: 'Pick a stop location by clicking on the map.' });
													setTimeout(() => setNotice(null), 2500);
												}}
											>
												Pick on map
											</button>
										</div>
										<ul className="max-h-56 overflow-auto">
											{stopSearchSuggestions.length === 0 && stopSearchQuery.length >= 3 ? (
												<li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No results</li>
											) : stopSearchSuggestions.map((s) => (
												<li
													key={s.id}
													className="px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
													onClick={() => {
														const [lon, lat] = s.center;
														setStops((prev) => {
															const arr = [...prev, [lon, lat]];
															setTimeout(() => { try { renderStopMarkers(arr); } catch { } }, 0);
															rerouteIfReady(200);
															return arr;
														});
														setStopSearchOpen(false);
														setStopSearchQuery("");
														setStopSearchSuggestions([]);
														const map = window._mapInstance; if (map) map.flyTo({ center: [lon, lat], zoom: 14 });
													}}
												>
													<div className="font-medium text-sm">{s.name || s.text || 'Place'}</div>
													<div className="text-xs text-gray-600 dark:text-gray-400">{s.place_name || s.display_name}</div>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
							{stops.length > 0 && (
								<span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20">
									<MapPin className="w-3.5 h-3.5" /> {stops.length}
								</span>
							)}
							<button onClick={() => getRoutes()} disabled={!sourceCoord || !destCoord} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105">
								Find Routes
							</button>
							<button onClick={() => disableMapPick()} disabled={!pickingMode} className="px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400 transition-all duration-200">Cancel pick</button>
							<button
								onClick={() => {
									// Clear everything including stops
									setSourceCoord(null); setDestCoord(null); setStops([]);
									setSourceQuery(""); setDestQuery(""); setSourceSuggestions([]); setDestSuggestions([]);
									const map = window._mapInstance; if (map) {
										if (map.getLayer('route-primary')) map.removeLayer('route-primary');
										if (map.getLayer('routes-alt')) map.removeLayer('routes-alt');
										if (map.getSource('routes')) map.removeSource('routes');
										[sourceMarkerRef.current, destMarkerRef.current, ...stopMarkersRef.current].forEach((mk) => { if (mk) try { mk.remove(); } catch { } });
									}
									stopMarkersRef.current = [];
									setRoutes([]); setSelectedRouteId(null);
									Object.keys(weatherMarkersRef.current).forEach((k) => { (weatherMarkersRef.current[k] || []).forEach((m) => { try { m.remove(); } catch { } }); weatherMarkersRef.current[k] = []; });
									setRouteWeather({}); setOpenWeatherId(null);
									Object.keys(potholeMarkersRef.current).forEach((k) => { (potholeMarkersRef.current[k] || []).forEach((m) => { try { m.remove(); } catch { } }); potholeMarkersRef.current[k] = []; });
									setPotholesByRoute({}); setOpenPotholeId(null); setCongestionSegments([]);
								}}
								className="px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400 transition-all duration-200"
							>
								Clear all
							</button>
							{/* Map style toggles */}
							<div className="ml-2 flex items-center gap-2">
								<button onClick={() => switchMapStyle('streets')} className={`px-2 py-1 text-xs rounded border ${mapStyleMode === 'streets' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Streets</button>
								<button onClick={() => switchMapStyle('satellite')} className={`px-2 py-1 text-xs rounded border ${mapStyleMode === 'satellite' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Satellite</button>
								<button onClick={() => switchMapStyle('traffic')} className={`px-2 py-1 text-xs rounded border ${mapStyleMode === 'traffic' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Traffic</button>
								{stops.length > 0 && (
									<div className="mt-3 text-xs bg-gray-100 dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
										<div className="font-medium mb-1">Stops ({stops.length})</div>
										<ul className="space-y-1">
											{stops.map((s, i) => (
												<li key={i} className="flex items-center justify-between">
													<span>{i + 1}. {s[1].toFixed(4)}, {s[0].toFixed(4)}</span>
													<button onClick={() => setStops((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-600 text-[10px] underline">Remove</button>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						</div>{/* end controls inner grid / actions */}
					</div>{/* end controls card */}

					{/* Map filters: visible to all users */}
					<div className="mt-4 flex flex-wrap gap-3 text-sm">
						<label className="inline-flex items-center gap-2 border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md">
						<input type="checkbox" checked={showFixed} onChange={(e) => setShowFixed(e.target.checked)} className="w-4 h-4 rounded" />
						<span className="font-medium">Show fixed potholes</span>
					</label>
					<label className="inline-flex items-center gap-2 border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md" title="Density of active hazard reports (severity × recency)">
						<input type="checkbox" checked={safetyHeatmapOn} onChange={(e) => setSafetyHeatmapOn(e.target.checked)} className="w-4 h-4 rounded" />
						<span className="font-medium">Safety heatmap</span>
						{userReports.length === 0 && <span className="text-xs text-gray-400">(no reports yet)</span>}
					</label>
					<button
						onClick={() => setShowHotspots((v) => !v)}
						aria-expanded={showHotspots}
						className={`inline-flex items-center gap-2 border-2 rounded-xl px-4 py-2 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md ${showHotspots ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
					>
						<AlertTriangle className="w-4 h-4" aria-hidden="true" />
						<span className="font-medium">Hotspots{hotspots.length > 0 ? ` (${hotspots.length})` : ''}</span>
					</button>
					<div className="inline-flex items-center gap-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-all duration-200" role="group" aria-label="Voice guidance settings">
						<span
							className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200"
							title={isSpeechSupported() ? "Voice guidance" : "Speech synthesis is not supported in this browser"}
						>
							{voiceSettings.navigation || voiceSettings.safety ? <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" /> : <VolumeX className="w-4 h-4 text-gray-400" aria-hidden="true" />}
							Voice
						</span>
						<label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
							<input
								type="checkbox"
								checked={voiceSettings.navigation}
								disabled={!isSpeechSupported()}
								onChange={(e) => setVoiceSettings((s) => {
									const next = { ...s, navigation: e.target.checked };
									if (!next.navigation) cancelSpeech();
									return next;
								})}
								className="w-4 h-4 rounded"
							/>
							<span>Navigation</span>
						</label>
						<label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
							<input
								type="checkbox"
								checked={voiceSettings.safety}
								disabled={!isSpeechSupported()}
								onChange={(e) => setVoiceSettings((s) => {
									const next = { ...s, safety: e.target.checked };
									if (!next.safety) cancelSpeech();
									return next;
								})}
								className="w-4 h-4 rounded"
							/>
							<span>Safety</span>
						</label>
					</div>
						{/* Avoid feature removed for now */}
					</div>
					{/* Avoidance status removed */}
					{/* Ranked hazard hotspots */}
					{showHotspots && (
						<div className="mt-4 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 p-4" role="region" aria-label="Hazard hotspots">
							<div className="flex items-center justify-between mb-2">
								<h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Hazard hotspots</h3>
								<button onClick={() => setShowHotspots(false)} className="text-xs text-amber-700 dark:text-amber-300 underline">Hide</button>
							</div>
							{hotspots.length === 0 ? (
								<p className="text-sm text-gray-600 dark:text-gray-300">
									{userReports.length === 0
										? 'No hazard reports yet. Hotspots appear once 2+ active hazards cluster within 150 m.'
										: 'No hotspot zones found — active hazards are spread out rather than concentrated.'}
								</p>
							) : (
								<ul className="space-y-2">
									{hotspots.map((h, i) => (
										<li key={h.id}>
											<button
												onClick={() => focusHotspot(h.coord)}
												className="w-full flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-900 px-3 py-2 text-left hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
											>
												<span className="w-7 h-7 flex-shrink-0 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
												<span className="flex-1 min-w-0">
													<span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{h.label}</span>
													<span className="block text-xs text-gray-500 dark:text-gray-400">
														Risk {h.score}/100 · ~{h.radiusMeters} m zone{h.recentCount > 0 ? ` · ${h.recentCount} new in last ${HOTSPOT_CONFIG.recentDays}d` : ''}
													</span>
												</span>
												<span
													className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${h.severity === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}
												>
													{h.severity === 'high' ? 'HIGH' : h.severity.toUpperCase()}
												</span>
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
					<div className={`${fullMap ? 'fixed inset-0 z-40 h-screen w-screen m-0 rounded-none border-0' : 'relative mt-6 h-96 lg:h-[540px] rounded-2xl border-4'} overflow-hidden shadow-2xl hover:shadow-3xl transition-shadow duration-300 ${pickingMode ? 'ring-4 ring-amber-400 border-gray-200/50 dark:border-gray-700/50' : 'border-gray-200/50 dark:border-gray-700/50'}`}>
						<div ref={mapContainerRef} className="absolute inset-0" />
						{/* Map overlay: selected route chip + quick actions */}
						{selectedRouteId != null && (
							<div className="absolute top-4 left-4 flex items-center gap-2 animate-in slide-in-from-left duration-300">
								<div className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white backdrop-blur-sm shadow-lg border-2 border-white/30">Route {Number(selectedRouteId) + 1}</div>
							</div>
						)}
						<div className="absolute top-4 right-4 flex items-center gap-2">
							<button
								onClick={() => setFullMap((v) => !v)}
								title={fullMap ? 'Exit full view' : 'Full view'}
								className="px-3 py-2 rounded-xl text-sm font-semibold bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-2 border-gray-200 dark:border-gray-700 hover:bg-white hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl transition-all duration-300"
							>
								{fullMap ? <div className="inline-flex items-center gap-1.5"><Minimize2 className="w-4 h-4" /> Exit</div> : <div className="inline-flex items-center gap-1.5"><Maximize2 className="w-4 h-4" /> Full</div>}
							</button>
							<button
								onClick={() => {
									try {
										const map = window._mapInstance; if (!map) return;
										const idx = Number(selectedRouteId) || 0; const r = routes[idx]; if (!r?.geometry?.coordinates?.length) return;
										const coords = r.geometry.coordinates; let minX = coords[0][0], minY = coords[0][1], maxX = minX, maxY = minY;
										for (const c of coords) { if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0]; if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1]; }
										map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 600 });
									} catch { }
								}}
								className="px-3 py-2 rounded-xl text-sm font-semibold bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-2 border-gray-200 dark:border-gray-700 hover:bg-white hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl transition-all duration-300"
							>
								Zoom to route
							</button>
							<button
								onClick={() => { const map = window._mapInstance; if (!map || !sourceCoord) return; map.flyTo({ center: sourceCoord, zoom: 14 }); }}
								className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white shadow"
							>
								Center source
							</button>
							<button
								onClick={() => { const map = window._mapInstance; if (!map || !destCoord) return; map.flyTo({ center: destCoord, zoom: 14 }); }}
								className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white shadow"
							>
								Center destination
							</button>
						</div>
						{/* Floating quick actions (bottom-right) */}
						<div className="absolute bottom-4 right-4 flex flex-col gap-3">
							<button
								title="Search"
								onClick={() => {
									try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
									setTimeout(() => { try { sourceInputRef.current?.focus(); } catch {} }, 250);
								}}
								className="group p-3.5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white shadow-lg hover:shadow-xl hover:shadow-blue-500/50 dark:hover:shadow-blue-600/50 hover:scale-110 active:scale-95 transition-all duration-300 border-2 border-white/20"
							>
								<Search className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
							</button>
							<button
								title="My location"
								onClick={handleUseMyLocation}
								className="group p-3.5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-600 dark:to-emerald-700 text-white shadow-lg hover:shadow-xl hover:shadow-emerald-500/50 dark:hover:shadow-emerald-600/50 hover:scale-110 active:scale-95 transition-all duration-300 border-2 border-white/20"
							>
								<LocateFixed className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
							</button>
							<button
								title="Traffic"
								onClick={() => {
									const idx = selectedRouteId != null ? Number(selectedRouteId) : (routes?.length ? 0 : null);
									if (idx == null) { setNotice({ type: 'info', message: 'Select a route to view traffic.' }); setTimeout(() => setNotice(null), 2500); return; }
									const newOpen = String(openTrafficId) === String(idx) ? null : String(idx);
									setOpenTrafficId(newOpen);
									if (newOpen && !trafficByRoute[idx]) fetchTrafficForRoute(idx);
								}}
								className="group p-3.5 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700 text-white shadow-lg hover:shadow-xl hover:shadow-orange-500/50 dark:hover:shadow-orange-600/50 hover:scale-110 active:scale-95 transition-all duration-300 border-2 border-white/20"
							>
								<Gauge className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
							</button>
							<button
								title="Weather"
								onClick={() => {
									const idx = selectedRouteId != null ? Number(selectedRouteId) : (routes?.length ? 0 : null);
									if (idx == null) { setNotice({ type: 'info', message: 'Select a route to view weather.' }); setTimeout(() => setNotice(null), 2500); return; }
									const newOpen = String(openWeatherId) === String(idx) ? null : String(idx);
									setOpenWeatherId(newOpen);
									if (newOpen) { if (!routeWeather[idx]) fetchWeatherForRoute(idx); else renderWeatherMarkersFor(idx); } else { removeWeatherMarkersFor(idx); }
								}}
								className="group p-3.5 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 dark:from-cyan-600 dark:to-cyan-700 text-white shadow-lg hover:shadow-xl hover:shadow-cyan-500/50 dark:hover:shadow-cyan-600/50 hover:scale-110 active:scale-95 transition-all duration-300 border-2 border-white/20"
							>
								<CloudSun className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
							</button>
							<button
								title="Report pothole"
								onClick={() => {
									try {
										reportCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
										setTimeout(() => openCameraModal('report'), 400);
									} catch {}
								}}
								className="group p-4 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 dark:from-rose-600 dark:to-pink-700 text-white shadow-xl hover:shadow-2xl hover:shadow-rose-500/60 dark:hover:shadow-rose-600/60 hover:scale-110 active:scale-95 transition-all duration-300 border-2 border-white/30 animate-pulse"
							>
								<Camera className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
							</button>
						</div>
						{/* On-map route chips: show small boxes for each route with time/distance; click to select */}
						{routes.length > 0 && (
							<div className="absolute bottom-4 left-4 max-h-[45%] overflow-auto flex flex-col gap-2.5 pr-1">
								{routes.map((r, idx) => {
									const minutes = Math.round((r?.duration || 0) / 60);
									const km = ((r?.distance || 0) / 1000).toFixed(1);
									const selected = String(idx) === String(selectedRouteId);
									return (
										<button
											key={`map-route-chip-${idx}`}
											onClick={() => { const map = window._mapInstance; if (map) selectRouteById(map, routes, idx); }}
											className={`text-left px-4 py-2.5 rounded-xl text-xs font-semibold backdrop-blur-md shadow-lg border-2 transition-all duration-300 hover:scale-105 active:scale-95 ${selected ? 'bg-gradient-to-r from-indigo-500 to-purple-500 border-white/40 ring-2 ring-white/50 text-white shadow-indigo-500/50' : 'bg-white/90 dark:bg-gray-900/80 border-gray-200 dark:border-gray-700 hover:bg-white hover:shadow-xl text-gray-900 dark:text-gray-100'}`}
										>
											<div className="flex items-center justify-between gap-3">
												<span className="font-bold">Route {idx + 1}</span>
												<span className={`text-[11px] font-medium whitespace-nowrap ${selected ? 'text-white/90' : 'text-gray-600 dark:text-gray-300'}`}>{minutes} min · {km} km</span>
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
					{mapError && (
						<div className="px-3 py-2 text-sm rounded bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
							{mapError}
						</div>
					)}
					{!mapError && !tokenPresent && (
						<div className="px-3 py-2 text-sm rounded bg-yellow-50 border border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300">
							Add your Mapbox token in the .env file as VITE_MAPBOX_TOKEN to view the map.
						</div>
					)}
				</section>

				<aside className="space-y-6">
					{routes.length > 0 && (
						<div className="p-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-xl hover:shadow-2xl transition-shadow duration-300">
							<h2 className="text-base font-bold mb-4 text-gray-800 dark:text-gray-100 sticky top-4 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm z-10 px-1 py-1 rounded">Route Options</h2>

							{routes.length > 1 && recommendation && recChoice === null && routeAnalyses[recommendation.recommendedIndex] && (
								<div className="mb-4 rounded-xl border-2 border-emerald-400 dark:border-emerald-600 bg-emerald-50/80 dark:bg-emerald-900/20 p-3" role="region" aria-label="Recommended safer route">
									<div className="flex items-center justify-between gap-2">
										<span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Recommended safer route</span>
										<span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ backgroundColor: routeAnalyses[recommendation.recommendedIndex].classification.color }}>
											Safety: {routeAnalyses[recommendation.recommendedIndex].score}/100
										</span>
									</div>
									<div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
										<span className="font-bold">{routeAnalyses[recommendation.recommendedIndex].label}</span>
										<span className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">Travel time: {routeAnalyses[recommendation.recommendedIndex].durationMinutes} min</span>
										<span className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">{routeAnalyses[recommendation.recommendedIndex].distanceKm.toFixed(1)} km</span>
									</div>
									<div className="mt-1 text-[11px] text-gray-600 dark:text-gray-300">
										{recommendation.isFastest
											? "Also the fastest available route."
											: `${recommendation.timeDeltaMinutes > 0 ? `+${recommendation.timeDeltaMinutes} min` : "Same time"} vs fastest (+${recommendation.timeDeltaPct}%) · +${recommendation.safetyAdvantage} safety points`}
									</div>
									{recommendationReasons.length > 0 && (
										<div className="mt-2 rounded-lg bg-white/70 dark:bg-gray-900/50 border border-emerald-200 dark:border-emerald-800 p-2" role="group" aria-label="Why this route">
											<div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1">Why this route?</div>
											<ul className="space-y-0.5 text-[11px] text-gray-600 dark:text-gray-300 list-disc list-inside">
												{recommendationReasons.map((reason, ri) => (
													<li key={`${ri}-${reason}`}>{reason}</li>
												))}
											</ul>
										</div>
									)}
									<div className="mt-3 flex flex-wrap gap-2">
										<button
											onClick={() => {
												const map = window._mapInstance;
												if (map) selectRouteById(map, routes, recommendation.recommendedIndex);
												setRecChoice("use");
											}}
											className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-md hover:scale-105 transition-all duration-200"
										>
											Use Recommended Route
										</button>
										<button
											onClick={() => setRecChoice("keep")}
											className="px-3 py-1.5 rounded-lg text-xs font-medium border-2 border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800 transition-all duration-200"
										>
											Keep Current Route
										</button>
									</div>
								</div>
							)}
							<ul className="space-y-3" role="listbox" aria-label="Route options" onKeyDown={(e) => {
								const total = routes.length; if (!total) return;
								if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); const cur = Number(selectedRouteId) || 0; const nxt = Math.min(total - 1, cur + 1); const map = window._mapInstance; if (map) selectRouteById(map, routes, nxt); }
								if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); const cur = Number(selectedRouteId) || 0; const prv = Math.max(0, cur - 1); const map = window._mapInstance; if (map) selectRouteById(map, routes, prv); }
							}} tabIndex={0}>
								{routes.map((r, idx) => {
									const minutes = Math.round(r.duration / 60);
									const km = (r.distance / 1000).toFixed(1);
									const selected = String(idx) === String(selectedRouteId);
									const bestMinutes = Math.min(...routes.map((x) => Math.round((x.duration || 0) / 60)));
									const delta = minutes - bestMinutes;
									const rel = Math.max(10, Math.min(100, Math.round((bestMinutes / Math.max(1, minutes)) * 100)));
									// Count of user-uploaded potholes near this route (within ~120m)
									const potCount = userPotholeCounts[idx] || 0;
									return (
										<li key={idx} className={`w-full text-sm rounded-xl px-4 py-3 border-2 relative cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] ${selected ? "border-indigo-400 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/20 shadow-md" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"}`} style={{ minHeight: '88px' }}>
											<div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${selected ? "bg-gradient-to-b from-indigo-500 to-purple-500" : "bg-transparent"}`} />
											<div className="flex items-center justify-between">
												<div>
													<div className="font-semibold flex items-center gap-2">
														<span className="text-gray-900 dark:text-gray-100">Route {idx + 1}</span>
													{recommendation?.recommendedIndex === idx && (
														<span className="text-[10px] px-2 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-sm" title="Recommended safer route">RECOMMENDED</span>
													)}
														{potCount > 0 && (
															<span className="text-[10px] px-2 py-1 rounded-full bg-gradient-to-r from-orange-400 to-red-500 text-white font-bold shadow-sm animate-pulse" title="User-reported potholes along this route">{potCount} pothole{potCount > 1 ? 's' : ''}</span>
														)}
														{selected && <span className="text-[10px] px-2 py-1 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-sm">Primary</span>}
													</div>
													<div className="mt-0.5 flex items-center gap-2 text-gray-700 dark:text-gray-200">
														<span className="text-[11px] px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">{minutes} min</span>
														<span className="text-[11px] px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">{km} km</span>
														{stops.length > 0 && <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">via {stops.length} stop{stops.length > 1 ? "s" : ""}</span>}
														<span className={`text-[11px] px-2 py-1 rounded-full font-medium ${delta === 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-700"}`}>{delta === 0 ? "Fastest" : `+${delta} min`}</span>
													</div>
													<div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden w-40 shadow-inner">
														<div className={`h-full transition-all duration-300 ${selected ? "bg-gradient-to-r from-indigo-500 to-purple-500" : "bg-gradient-to-r from-emerald-400 to-teal-500"}`} style={{ width: `${rel}%` }} />
													</div>
												</div>
												<div className="mt-2 flex flex-wrap items-center gap-2">
													<button
														className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 whitespace-nowrap ${selected ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"}`}
														onClick={() => {
															const map = window._mapInstance;
															if (!map) return;
															selectRouteById(map, routes, idx);
														}}
													>
														{selected ? "Selected" : "Select"}
													</button>
													{/* Hazards badge removed with avoidance feature */}
													<button
														className="px-3 py-1.5 rounded-lg text-xs font-medium border-2 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-700 flex items-center gap-1 transition-all duration-200 hover:scale-105"
														onClick={() => setOpenDetailsId((cur) => (String(idx) === String(cur) ? null : String(idx)))}
													>
														<Info className="w-3.5 h-3.5" /> Details
													</button>

													{/* Potholes option removed as requested */}
													<button
														className="px-3 py-1.5 rounded-lg text-xs font-medium border-2 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1 transition-all duration-200 hover:scale-105"
														onClick={() => {
															const newOpen = String(openTrafficId) === String(idx) ? null : String(idx);
															setOpenTrafficId(newOpen);
															if (newOpen) {
																if (!trafficByRoute[idx]) fetchTrafficForRoute(idx);
																// If switching to another route, update overlay when data available
																if (trafficByRoute[idx]?.points && congestionSegments.length) {
																	setCongestionSegments([]);
																	const map = window._mapInstance; if (map) drawRoutesOnMap(map, routes, selectedRouteId);
																}
															}
														}}
													>
												<Gauge className="w-3.5 h-3.5" /> Traffic
											</button>
											<button
												className="px-3 py-1.5 rounded-lg text-xs font-medium border-2 border-rose-300 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-1 transition-all duration-200 hover:scale-105 whitespace-nowrap"
												onClick={() => setOpenIncidentId((cur) => (String(idx) === String(cur) ? null : String(idx)))}
											>
												<AlertTriangle className="w-3.5 h-3.5" /> Incidents
												{routeIncidentResults[idx]?.incidents?.length ? (
													<span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-600 text-white" aria-label={`${routeIncidentResults[idx].incidents.length} incidents`}>{routeIncidentResults[idx].incidents.length}</span>
												) : null}
											</button>
													<button
														className="px-3 py-1.5 rounded-lg text-xs font-medium border-2 border-sky-300 dark:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30 flex items-center gap-1 transition-all duration-200 hover:scale-105 whitespace-nowrap"
														onClick={() => {
															const newOpen = String(openWeatherId) === String(idx) ? null : String(idx);
															setOpenWeatherId(newOpen);
															if (newOpen) {
																// Weather panel opened for this route; fetch if missing
																if (!routeWeather[idx]) {
																	fetchWeatherForRoute(idx);
																} else {
																	// Render existing markers (ensure they match latest selection)
																	renderWeatherMarkersFor(idx);
																}
															} else {
																removeWeatherMarkersFor(idx);
															}
														}}
													>
														<span className={`inline-flex items-center justify-center rounded-full ${String(openWeatherId) === String(idx) ? 'bg-sky-600 text-white' : 'bg-sky-200 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'} w-5 h-5`}>
															<CloudSun className="w-3 h-3" />
														</span>
														<span className="ml-1">Weather</span>
														{routeWeather[idx]?.points?.length ? (
															<span className="ml-1 inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full bg-sky-200 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
																{routeWeather[idx].points.length}
															</span>
														) : null}
													</button>
												</div>
											</div>

											{routeAnalyses[idx] && (
									<div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 space-y-1.5">
										<div className="flex items-center justify-between gap-2">
											<span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Route analysis</span>
											<span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ backgroundColor: routeAnalyses[idx].classification.color }}>
												Safety: {routeAnalyses[idx].score}/100
											</span>
										</div>
										<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-700 dark:text-gray-300">
											<span>Distance: {routeAnalyses[idx].distanceKm.toFixed(1)} km</span>
											<span>Time: {routeAnalyses[idx].durationMinutes} min</span>
											<span>Traffic: {routeAnalyses[idx].traffic.label}{routeAnalyses[idx].traffic.estimated ? " (est.)" : ""}</span>
											<span>Potholes: {routeAnalyses[idx].potholes.count} ({routeAnalyses[idx].potholes.highCount} high)</span>
											<span>Weather: {routeAnalyses[idx].weather.label}</span>
											<span>Incidents: {routeAnalyses[idx].incidents.label}</span>
											<span style={{ color: routeAnalyses[idx].time.color, fontWeight: 600 }}>Time of day: {routeAnalyses[idx].time.label}</span>
										</div>
										<div className="text-[10px] text-gray-500 dark:text-gray-400">
											{routeAnalyses[idx].classification.label}
											{routeAnalyses[idx].missingFactors.length > 0 && ` · ${routeAnalyses[idx].missingFactors.length} factor(s) unavailable`}
											{' '}· Typical safest window {String(safestWindow.startHour).padStart(2, '0')}:00–{String(safestWindow.endHour).padStart(2, '0')}:00 (risk {safestWindow.risk})
										</div>
									</div>
								)}

								{String(openDetailsId) === String(idx) && (
												<div className="mt-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
													<h3 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">Turn-by-turn steps</h3>
													<ol className="list-decimal ml-5 space-y-1 text-xs">
														{getStepsForRoute(r).map((step, sIdx) => (
															<li key={sIdx} className="flex items-start justify-between gap-3">
																<span className="pr-2">
																	{(() => {
																		const base = step?.maneuver?.instruction || step?.name || 'Continue';
																		// Append stop labels if a stop is near this step start
																		try {
																			if (Array.isArray(stops) && stops.length && Array.isArray(step?.maneuver?.location)) {
																				const loc = step.maneuver.location; // [lng,lat]
																				const nearStops = stops
																					.map((st, i) => ({ st, i, d: distMeters(st, loc) }))
																					.filter(o => o.d < 80) // within 80m of step start
																					.sort((a, b) => a.d - b.d);
																				if (nearStops.length) {
																					const labels = nearStops.slice(0, 2).map(o => `Stop ${o.i + 1}`).join(', ');
																					return base + ` (near ${labels})`;
																				}
																			}
																		} catch { }
																		return base;
																	})()}
																</span>
																<span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
																	{formatDistance(step?.distance || 0)} · {formatDuration(step?.duration || 0)}
																</span>
															</li>
														))}
													</ol>
												</div>
											)}




											{String(openTrafficId) === String(idx) && (
												<div className="mt-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
													<h3 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">Traffic (live vs free-flow)</h3>
													<div className="flex items-center justify-between mb-2">
														{trafficByRoute[idx]?.updatedAt && (
															<div className="text-[10px] text-gray-500">Updated: {new Date(trafficByRoute[idx].updatedAt).toLocaleTimeString()}</div>
														)}
														<button onClick={() => fetchTrafficForRoute(idx, true)} className="px-2 py-1 rounded text-[10px] border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">Refresh</button>
													</div>
													{trafficByRoute[idx]?.loading && (
														<div className="mt-1">
															<div className="h-24 rounded border border-gray-200 dark:border-gray-700 p-2">
																<div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
																<div className="h-full w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
															</div>
															<div className="mt-1 text-[11px] text-gray-500">Loading traffic…</div>
														</div>
													)}
													{trafficByRoute[idx]?.error && <div className="text-[11px] text-red-600">{trafficByRoute[idx].error}</div>}
													{trafficByRoute[idx]?.points?.length > 0 && (
														<div>
															<div className="text-[11px] text-gray-700 dark:text-gray-300 mb-1">
																Live: {Math.round(trafficByRoute[idx].liveMinutes)} min · Free-flow: {Math.round(trafficByRoute[idx].freeMinutes)} min · Δ {Math.round(((trafficByRoute[idx].liveMinutes / Math.max(1, trafficByRoute[idx].freeMinutes)) - 1) * 100)}%
															</div>
															<div style={{ height: 160 }}>
																<ResponsiveContainer width="100%" height="100%">
																	<LineChart data={trafficByRoute[idx].points} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
																		<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
																		<XAxis dataKey="idx" tick={{ fontSize: 10 }} label={{ value: "Step", position: "insideBottom", dy: 0, fontSize: 10 }} />
																		<YAxis yAxisId="speed" tick={{ fontSize: 10 }} label={{ value: "km/h", angle: -90, position: "insideLeft", fontSize: 10 }} />
																		<YAxis yAxisId="delay" orientation="right" tick={{ fontSize: 10 }} label={{ value: "Delay %", angle: -90, position: "insideRight", fontSize: 10 }} />
																		<Tooltip />
																		<Line yAxisId="speed" type="monotone" dataKey="speedLive" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} name="Live speed" />
																		<Line yAxisId="speed" type="monotone" dataKey="speedFree" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} name="Free-flow speed" />
																		<Line yAxisId="delay" type="monotone" dataKey="delayPct" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} name="Delay %" />
																	</LineChart>
																</ResponsiveContainer>
															</div>
														</div>
													)}
													{!trafficByRoute[idx]?.loading && !trafficByRoute[idx]?.points?.length && !trafficByRoute[idx]?.error && computeTrafficData(r).length > 0 && (
														<div className="mt-2 text-[10px] text-gray-500">Showing approximate congestion based on route step speeds. Live traffic unavailable.</div>
													)}
												</div>
											)}

											{String(openIncidentId) === String(idx) && (
									<div className="mt-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
										<h3 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">
											Incidents ({(routeIncidentResults[idx]?.incidents || []).length})
										</h3>
										{(routeIncidentResults[idx]?.incidents || []).length === 0 ? (
											<div className="text-[11px] text-gray-500">No incidents detected from available sources.</div>
										) : (
											<ul className="space-y-2 text-[11px]">
												{(routeIncidentResults[idx].incidents || []).map((inc) => (
													<li key={inc.id} className="flex items-start gap-2 border-b border-gray-100 dark:border-gray-800 pb-1.5 last:border-0">
														<span className="mt-0.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inc.severity === 'critical' ? '#7f1d1d' : inc.severity === 'high' ? '#ef4444' : inc.severity === 'medium' ? '#f59e0b' : '#eab308' }} aria-hidden="true" />
														<div className="min-w-0">
															<div className="font-semibold">{INCIDENT_TYPE_LABELS[inc.type] || 'Incident'} · {String(inc.severity || '').toUpperCase()}</div>
															<div className="text-gray-600 dark:text-gray-400">{inc.description}</div>
															<div className="text-gray-400">
																{inc.coord[1].toFixed(5)}, {inc.coord[0].toFixed(5)} · {inc.distanceFromRouteMeters === 0 ? 'on route' : `~${inc.distanceFromRouteMeters} m from route`}
															</div>
														</div>
													</li>
												))}
											</ul>
										)}
										<div className="mt-2 text-[10px] text-gray-500">
											Sources: {routeIncidentResults[idx]?.availableSources?.length
												? routeIncidentResults[idx].availableSources.map((s) => (s === 'mapbox-congestion' ? 'Mapbox traffic' : s === 'user-reports' ? 'user reports' : 'incident feed')).join(', ')
												: 'none'}
										</div>
									</div>
								)}

								{String(openWeatherId) === String(idx) && (
												<div className="mt-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
													<h3 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">Weather along route</h3>
													<div className="flex items-center justify-between mb-2">
														{routeWeather[idx]?.fetchedAt && (
															<div className="text-[10px] text-gray-500">
																Updated: {new Date(routeWeather[idx].fetchedAt).toLocaleTimeString()}
															</div>
														)}
														<button
															onClick={() => fetchWeatherForRoute(idx, true)}
															className="px-2 py-1 rounded text-[10px] border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
														>
															Refresh
														</button>
													</div>
													{routeWeather[idx]?.loading && (
														<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
															{Array.from({ length: 3 }).map((_, sk) => (
																<div key={sk} className="rounded border border-gray-200 dark:border-gray-700 p-2">
																	<div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
																	<div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
																	<div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
																</div>
															))}
														</div>
													)}
													{routeWeather[idx]?.error && (
														<div className="text-xs text-red-600">{routeWeather[idx].error}</div>
													)}
													{routeWeather[idx]?.points?.length > 0 && (
														<ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
															{routeWeather[idx].points.map((p, wi) => {
																const w = p.data;
																const temp = Math.round(w?.main?.temp ?? 0);
																const feels = Math.round(w?.main?.feels_like ?? temp);
																const wind = Math.round(w?.wind?.speed ?? 0);
																const hum = Math.round(w?.main?.humidity ?? 0);
																const desc = w?.weather?.[0]?.description ?? "";
																const main = (w?.weather?.[0]?.main || '').toLowerCase();
																const chipCls = main.includes('rain') || main.includes('drizzle') || main.includes('thunder') ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' : main.includes('cloud') ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200' : main.includes('snow') ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : main.includes('mist') || main.includes('fog') || main.includes('haze') ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
																return (
																	<li key={wi} className="rounded border border-gray-200 dark:border-gray-700 p-2">
																		<div className="font-medium mb-1 flex items-center justify-between">
																			<span>{p.label}</span>
																			<span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${chipCls}`}>{w?.weather?.[0]?.main || 'Clear'}</span>
																		</div>
																		<div className="text-gray-700 dark:text-gray-200">{temp}°C <span className="text-[10px] text-gray-500">feels {feels}°</span></div>
																		<div className="text-gray-500 dark:text-gray-400 capitalize">{desc} · <span className="uppercase">wind</span> {wind} m/s · <span className="uppercase">hum</span> {hum}%</div>
																	</li>
																);
															})}
														</ul>
													)}
													{!routeWeather[idx]?.loading && !routeWeather[idx]?.points?.length && !routeWeather[idx]?.error && (
														<div className="text-[11px] text-gray-500">No weather data at sampled points yet. Try Refresh.</div>
													)}
													<div className="mt-2 text-[10px] text-gray-500">Weather data: OpenWeather</div>
												</div>
											)}
										</li>
									);
								})}
							</ul>
						</div>
					)}
					{/* User pothole reporting card */}
					<div className="p-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-xl hover:shadow-2xl transition-shadow duration-300">
						<h2 className="text-base font-bold mb-3 text-gray-800 dark:text-gray-100">Report a Pothole</h2>
						<p className="text-xs text-gray-600 dark:text-gray-300 mb-4">Help improve road data by adding local pothole observations. Your reports are stored locally in this browser (no server upload).</p>
						<div className="space-y-4">
							{/* Severity selector */}
							<div>
								<label className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide mb-2 block">Severity Level</label>
								<div className="mt-2 flex gap-3">
									{[
										{ key: "low", icon: lowIcon, label: "Low" },
										{ key: "moderate", icon: moderateIcon, label: "Moderate" },
										{ key: "high", icon: highIcon, label: "High" },
									].map((opt) => (
										<button
											key={opt.key}
											type="button"
											onClick={() => setReportForm((f) => ({ ...f, severity: opt.key }))}
											className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all duration-200 hover:scale-105 ${reportForm.severity === opt.key ? "border-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 shadow-md" : "border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
										>
											<img src={opt.icon} alt={opt.label} className="w-10 h-10 object-contain" />
											<span>{opt.label}</span>
										</button>
									))}
								</div>
							</div>

							{/* Description */}
							<div>
								<label className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide mb-2 block">Description</label>
								<textarea
									value={reportForm.description}
									onChange={(e) => setReportForm((f) => ({ ...f, description: e.target.value }))}
									placeholder="Short note (e.g. deep hole near curb)"
									className="mt-1 w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 shadow-sm hover:shadow-md"
									rows={3}
								/>
							</div>							{/* Photo upload */}
							<div>
								<label className="text-[11px] font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Photo</label>
								<div className="mt-1 flex items-center gap-2">
									<button type="button" onClick={() => openCameraModal('report')} className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-1">
										<Camera className="w-3.5 h-3.5" /> Use camera
									</button>
									<span className="text-[10px] text-gray-500">or upload from gallery</span>
								</div>
								<input
									type="file"
									accept="image/*"
									capture="environment"									onChange={(e) => {
										const file = e.target.files?.[0];
										if (!file) return;
										handleImageSelected(file, 'report');
									}}
									className="mt-1 w-full text-xs"
								/>
								{reportForm.photoPreview && (
									<div className="mt-2 flex items-center gap-2">
										<img
											src={reportForm.photoPreview}
											alt="preview"
											className="w-16 h-16 object-cover rounded border border-gray-300 dark:border-gray-700 cursor-zoom-in"
											onClick={() => openImageModal(reportForm.photoPreview, 'Reported photo')}
										/>
										<button
											onClick={() => setReportForm((f) => ({ ...f, photoPreview: null, coord: null }))}
											className="text-[10px] px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
										>
											Remove
										</button>
									</div>
								)}
								{reportForm.photoPreview && (
									<div className="mt-1 text-[10px] text-gray-600 dark:text-gray-400 flex items-center gap-2">
										{ocrBusy && <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" aria-label="loading" />}
										{reportForm.coord ? (
											<span>Location detected: {reportForm.coord[1].toFixed(5)}, {reportForm.coord[0].toFixed(5)}</span>
										) : (
											<span className="flex items-center gap-2">
												{reportForm.photoSource === 'camera'
													? (ocrMessage || 'Fetching live location…')
													: <>No GPS geotag in EXIF. {ocrMessage || ''}</>
												}
												<button type="button" onClick={requestPreciseLocationNow} className="px-2 py-0.5 text-[10px] rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Retry location</button>
												<button type="button" onClick={setLocationOnMapNow} className="px-2 py-0.5 text-[10px] rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Set location on map</button>
											</span>
										)}
									</div>
								)}
								{reportForm.detection && (
									<div className="mt-1 text-[10px] text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded px-2 py-1">
										Model analysis: {reportForm.detection.detected ? `pothole detected · confidence ${Math.round((reportForm.detection.confidence || 0) * 100)}%` : "no pothole detected"}{reportForm.detection.severity ? ` · ${reportForm.detection.severity}` : ""} · assistive only
									</div>
								)}
							</div>

							{/* Submit */}
							<div className="pt-1">
								<button
									onClick={submitPotholeReport}
									disabled={!reportForm.photoPreview || !reportForm.description || !reportForm.coord}
									className="px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-700 transition shadow-sm"
								>
									Submit report
								</button>
								{reportForm.photoPreview && !reportForm.coord && reportForm.photoSource === 'upload' && (
									<div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
										<span>This photo doesn't contain a GPS geotag. Enable location services when taking the photo to include coordinates.</span>
										<button type="button" onClick={setLocationOnMapNow} className="ml-auto px-2 py-1 text-xs rounded border border-yellow-300 hover:bg-yellow-100">Set location on map</button>
									</div>
								)}
							</div>
						</div>

						{/* Existing reports */}
						{userReports.filter(r => !r.hiddenForUser || adminMode).length > 0 && (
							<div className="mt-4">
								<div className="text-[11px] font-semibold mb-1">Your reports ({userReports.filter(r => !r.hiddenForUser || adminMode).length})</div>
								<ul className="max-h-40 overflow-auto divide-y divide-gray-200 dark:divide-gray-700">
									{userReports.slice().reverse().filter(r => !r.hiddenForUser || adminMode).map((r) => (
										<li key={r.id} className="py-2 text-[11px] flex items-start gap-2">
											<img src={r.severity === "high" ? highIcon : r.severity === "moderate" ? moderateIcon : lowIcon} alt={r.severity} className="w-8 h-8 object-contain flex-shrink-0 drop-shadow" />
											<div className="flex-1 min-w-0">
												<div className="font-medium truncate">{r.description || "(no description)"}</div>
												<div className="text-gray-500 dark:text-gray-400 truncate">
													{r.coord[0].toFixed(5)}, {r.coord[1].toFixed(5)} • {r.severity} • {(() => { const st = normalizeStatus(r.status); const sty = STATUS_STYLES[st] || STATUS_STYLES.reported; return <span className="px-1 rounded text-[10px] font-semibold" style={{ backgroundColor: sty.bg, color: sty.text }}>{STATUS_LABELS[st]}</span>; })()}
													{r.pendingFixReview && <span className="ml-2 px-1 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">Fix proof pending</span>}
												</div>
												{r.pendingFixReview && r.fixProofPhotoDataUrl && (
													<div className="mt-1 flex items-center gap-2">
														<img src={r.fixProofPhotoDataUrl} alt="fix proof" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-700 cursor-zoom-in" onClick={() => openImageModal(r.fixProofPhotoDataUrl, `Fix proof • ${r.fixRequestedAt ? new Date(r.fixRequestedAt).toLocaleString() : ''}`)} />
														<div className="text-gray-500 dark:text-gray-400">
															<div>Submitted: {r.fixRequestedAt ? new Date(r.fixRequestedAt).toLocaleString() : '—'}</div>
															{Array.isArray(r.fixProofCoord) && <div>Fix location: {r.fixProofCoord[1].toFixed(5)}, {r.fixProofCoord[0].toFixed(5)}</div>}
															<div className="text-[10px]">Awaiting admin review</div>
														</div>
													</div>
												)}
												<div className="mt-1 flex gap-2 flex-wrap">
													<button
														onClick={() => { const map = window._mapInstance; if (map) map.flyTo({ center: r.coord, zoom: 16 }); }}
														className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
													>
														View
													</button>
													{!adminMode && r.status !== 'fixed' && !r.pendingFixReview && !r.hiddenGlobally && (
														<button onClick={() => openFixModal(r.id)} className="px-2 py-1 rounded border border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">Mark pothole fixed</button>
													)}
													{adminMode ? (
														<button onClick={() => deleteReport(r.id)} className="px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
													) : (
														<button onClick={() => requestDeleteReport(r.id)} className="px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/30">Request delete</button>
													)}
													{/* Severity editing removed for regular user; only admins can change level */}
												</div>
											</div>
										</li>
									))}
								</ul>
								<div className="mt-2 text-[10px] text-gray-500">Reports are saved locally. Clearing browser storage will remove them.</div>
							</div>
						)}
					</div>

					{/* Admin panel */}
					{adminMode && (
						<div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
							<h2 className="text-sm font-medium mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Admin</h2>
							<div className="text-[11px] text-gray-600 dark:text-gray-300 mb-2">Moderate pothole reports and manage data (local-only).</div>
							<div className="mb-3 flex items-center gap-3 text-xs">
								<label className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-700 rounded px-2 py-1">
									<input type="checkbox" checked={showOnlyUnverified} onChange={(e) => setShowOnlyUnverified(e.target.checked)} />
									<span>Show only reported (awaiting review) on map</span>
								</label>
							</div>
							<div className="flex flex-wrap gap-2 text-xs mb-3">
								{/* Export/Import removed as requested */}
								<button onClick={() => {
									if (confirm('Clear ALL reports? This cannot be undone.')) {
										persistReports([]);
										setUserReports([]);
									}
								}} className="px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Clear all</button>
								<button onClick={exportToBBMP} className="px-2 py-1 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">Export to BBMP</button>
							</div>
							{userReports.length === 0 ? (
								<div className="text-[11px] text-gray-500">No reports.</div>
							) : (
								<ul className="max-h-48 overflow-auto divide-y divide-gray-200 dark:divide-gray-700 text-[11px]">
									{userReports.slice().reverse().map((r) => (
										<li key={r.id} className="py-2 flex items-start gap-2">
											<div className="min-w-0 flex-1">
												<div className="font-medium truncate">{r.description || '(no description)'} {(() => { const st = normalizeStatus(r.status); const sty = STATUS_STYLES[st] || STATUS_STYLES.reported; return <span className="ml-1 px-1 rounded text-[10px] font-semibold" style={{ backgroundColor: sty.bg, color: sty.text }}>{STATUS_LABELS[st]}</span>; })()}
													{r.reportedToBBMP && (
														<span className="ml-2 px-1 rounded bg-indigo-900/40 text-indigo-200 text-[11px]">Reported to BBMP</span>
													)}
													{r.pendingRemoval && (
														<span className="ml-2 px-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 text-[11px]">Pending removal</span>
													)}
													{r.pendingFixReview && (
														<span className="ml-2 px-1 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 text-[11px]">Fix proof pending</span>
													)}
												</div>
												<div className="text-gray-500 dark:text-gray-400">{r.coord[1].toFixed(5)}, {r.coord[0].toFixed(5)} • {new Date(r.captureAt || r.createdAt).toLocaleString()}</div>
							{(() => {
								const c = assessReportConfidence([r]);
								return <div className="mt-0.5"><span className="px-1 rounded text-[10px] font-semibold" style={{ backgroundColor: `${c.color}22`, color: c.color }}>System confidence: {c.level}</span></div>;
							})()}
												{r.pendingFixReview && r.fixProofPhotoDataUrl && (
													<div className="mt-1 flex items-center gap-2">
														<img src={r.fixProofPhotoDataUrl} alt="fix proof" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-700 cursor-zoom-in" onClick={() => openImageModal(r.fixProofPhotoDataUrl, `Fix proof for report ${r.id}`)} />
														<div className="text-gray-500 dark:text-gray-400">
															{Array.isArray(r.fixProofCoord) && <div>Fix location: {r.fixProofCoord[1].toFixed(5)}, {r.fixProofCoord[0].toFixed(5)}</div>}
															<div className="text-[10px]">Review and click “Mark fixed” if valid.</div>
														</div>
													</div>
												)}
												<div className="mt-1 flex flex-wrap gap-2">
													<button onClick={() => { const map = window._mapInstance; if (map) map.flyTo({ center: r.coord, zoom: 16 }); }} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">View</button>
													{nextStatuses(r.status).map((s) => (
														<button key={s} onClick={() => setReportStatus(r.id, s)} className="px-2 py-1 rounded border border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">{s === 'verified' ? 'Verify' : `Mark ${STATUS_LABELS[s].toLowerCase()}`}</button>
													))}
													<button onClick={() => openRejectModal(r.id)} className="px-2 py-1 rounded border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600">Reject</button>
													<button onClick={() => setUserReports((prev) => { const arr = prev.map(x => x.id === r.id ? { ...x, status: 'reported', reviewedAt: null, pendingFixReview: false, hiddenGlobally: false, rejectionReason: null } : x); persistReports(arr); return arr; })} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">Reset to reported</button>
													<button onClick={() => deleteReport(r.id)} className="px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
													<div className="inline-flex items-center gap-1">
														<span className="text-[10px] text-gray-500">Level:</span>
														<select value={r.severity} onChange={(e) => updateReportSeverity(r.id, e.target.value)} className="text-[11px] border border-gray-300 dark:border-gray-700 rounded px-1 py-0.5 bg-white dark:bg-gray-900">
															<option value="low">Low</option>
															<option value="moderate">Moderate</option>
															<option value="high">High</option>
														</select>
													</div>
												</div>
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
					{reportForm.coord && (
						<div className="mt-2 flex items-center gap-2">
							<button type="button" onClick={() => (reportAdjustMode ? finishReportAdjust() : startReportAdjust())} className={`px-2 py-1 text-xs rounded border ${reportAdjustMode ? 'border-blue-600 text-blue-700 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
								{reportAdjustMode ? 'Done adjusting' : 'Adjust on map'}
							</button>
							{reportAdjustMode && (
								<button type="button" onClick={cancelReportAdjust} className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
							)}
							<span className="text-[10px] text-gray-500">Max adjust radius 250 m</span>
						</div>
					)}

				</aside>
			</main>
		</div>
	);
}