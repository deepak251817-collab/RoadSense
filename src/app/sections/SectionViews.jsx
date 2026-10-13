import React, { Suspense } from "react";
import TripsPanel from "../../features/community/TripsPanel";
import HotspotsPanel from "../../features/safety/HotspotsPanel";
import SegmentRiskStrip from "../../features/routing/SegmentRiskStrip";
import WaterloggingPanel from "../../features/road-conditions/WaterloggingPanel";
import NightSafetyPanel from "../../features/road-conditions/NightSafetyPanel";
import RoadHealthPanel from "../../features/road-conditions/RoadHealthPanel";
import ChangeDetectionPanel from "../../features/road-conditions/ChangeDetectionPanel";
import RepairPriorityPanel from "../../features/admin/RepairPriorityPanel";
import WhatIfPanel from "../../features/routing/WhatIfPanel";
import MunicipalDashboard from "../../features/admin/MunicipalDashboard";
import RoutePreferencesPanel from "../../features/routing/RoutePreferencesPanel";
import { routeLabel } from "../../features/routing/routeIdentity";
import { FACTOR_LABELS } from "../../features/safety/safetyScore";
import { hazardTypeMeta } from "../../features/safety/hazardTypes";
import { STATUS_LABELS, STATUS_STYLES } from "../../features/admin/hazardLifecycle";

// Lazy: keeps the chart library and prediction UI out of the initial bundle
const AnalyticsPanel = React.lazy(() => import("../../features/community/AnalyticsPanel"));
const PredictiveSafetyPanel = React.lazy(() => import("../../features/safety/PredictiveSafetyPanel"));

/**
 * Dedicated section views: Safety, Hazards, Environment, Analytics,
 * Road Intelligence and Tools.
 *
 * Rendered by App while `section !== "navigate"`; the map view stays
 * mounted (hidden) underneath so Mapbox never re-initializes. All data
 * arrives through props from the App composition root — this module
 * owns presentation only. Each section renders its own content; route
 * results live exclusively on the Navigate page.
 *
 * @param {Object} props
 * @param {string} props.section active section key
 * @param {Object} props.hidden per-panel hide state within the section
 * @param {Function} props.setHidden setter for the hide state
 */
export default function SectionViews({ section, hidden, setHidden, ...ctx }) {
	const {
		reportCardEl,
		routeAnalyses, recommendation, recommendationReasons, routes,
		predictive, routeSegments, waterlogging, nightSafety,
		selectedRouteId, routeWeather, fetchWeatherForRoute,
		tripHistory, tripStats, clearTrips, safetyAnalytics,
		hotspots, focusHotspot, userReports, roadHealth, changes, rankedRepairs,
		focusHazard,
		whatIf, whatIfMode, setWhatIfMode, whatIfAdjustments, setWhatIfAdjustments,
		adminMode, municipalSummary, municipalReports, municipalFilters,
		setMunicipalFilters, locationOptions,
		routePreferences, setRoutePreferences, sourceCoord, destCoord, getRoutes,
		voiceSettings, setVoiceSettings, isSpeechSupported, cancelSpeech,
		trafficByRoute, sources,
	} = ctx;

	// Panels are shown by default inside a section; the chips fold them away
	const sec = (key) => !hidden[key];
	const secToggle = (key) => setHidden((s) => ({ ...s, [key]: !s[key] }));
	const secHide = (key) => setHidden((s) => ({ ...s, [key]: true }));
	const sectionChips = (items) => {
		if (!items.length) return null;
		return (
			<div className="flex flex-wrap gap-2" role="group" aria-label="Show or hide section panels">
				{items.map((it) => {
					const on = sec(it.key);
					return (
						<button
							key={it.key}
							type="button"
							aria-pressed={on}
							onClick={() => secToggle(it.key)}
							className={on
								? "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors border-primary-600 bg-primary-600 text-white"
								: "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}
						>
							{it.label}
						</button>
					);
				})}
			</div>
		);
	};

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
			{section === "safety" && (
				<div className="space-y-6">
					<div>
						<h2 className="stars-h2">Safety</h2>
						<p className="stars-caption">Overall safety for your routes plus advanced risk estimates. Every figure is computed from live route, incident and hazard-report data — nothing is simulated.</p>
					</div>							<div className="stars-card p-4 sm:p-6">
								<h3 className="stars-h3 mb-1">Overall safety</h3>
								<p className="text-xs text-gray-500 dark:text-gray-400 mb-3">The score (0–100) ranks each route from live traffic, hazard reports, weather, incidents and time of day. Confidence is shown separately — it reflects how much of that data existed, not how safe the route is. Panels below are labeled estimates, never guarantees.</p>
								{routeAnalyses.length === 0 ? (
							<p className="stars-empty">No routes analyzed yet. Find a route on the Navigate screen to see safety scores, risk factors and the recommendation here.</p>
						) : (
							<>											<ul className="space-y-3" role="list">
												{routeAnalyses.map((a, i) => (
													<li key={i}>
														<div className="flex items-center justify-between gap-3 text-sm">
															<span className="font-medium text-gray-800 dark:text-gray-100 inline-flex items-center gap-2">
																{routeLabel(i)}
																{recommendation?.recommendedIndex === i && <span className="stars-badge-ok">Recommended</span>}
															</span>
															<span className="font-bold" style={{ color: a.classification?.color }}>{a.classification?.label} · {a.score}/100</span>
														</div>
														<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
															<span
																className="px-1.5 py-0.5 rounded-full font-semibold border"
																style={{ color: a.confidence?.color, borderColor: a.confidence?.color }}
																title={(a.confidence?.reasons || []).join(" · ")}
															>
																Confidence: {a.confidence?.label} ({a.confidence?.availableFactors}/{a.confidence?.totalFactors} factors)
															</span>
															{Object.entries(a.factorRisks || {}).map(([k, v]) => (
																<span key={k} className="text-gray-500 dark:text-gray-400" title={`${FACTOR_LABELS[k] || k} risk ${Math.round(v)}/100 (higher = more risk)`}>
																	{FACTOR_LABELS[k] || k}: {Math.round(v)}
																</span>
															))}
															{(a.missingFactors || []).length > 0 && (
																<span className="text-amber-700 dark:text-amber-400">Insufficient data: {a.missingFactors.map((k) => FACTOR_LABELS[k] || k).join(", ")}</span>
															)}
														</div>
													</li>
												))}
											</ul>
								{recommendationReasons.length > 0 && (
									<div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
										<h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Why this route</h4>
										<ul className="space-y-1 text-[13px] text-gray-700 dark:text-gray-200 list-disc pl-5">
											{recommendationReasons.map((reason, ri) => (
												<li key={`${ri}-${reason}`}>{reason}</li>
											))}
										</ul>
									</div>
								)}
							</>
						)}
					</div>
					{sectionChips([
						...(routes?.length ? [
							{ key: "predictive", label: "Prediction" },
							{ key: "segments", label: "Segment risk" },
							{ key: "waterlogging", label: "Flood risk" },
							{ key: "night", label: "Night safety" },
						] : []),
					])}
					{sec("predictive") && (
						<Suspense fallback={null}>
							<PredictiveSafetyPanel show prediction={predictive} onClose={() => secHide("predictive")} />
						</Suspense>
					)}
					<SegmentRiskStrip show={sec("segments")} segments={routeSegments} onClose={() => secHide("segments")} />
					<WaterloggingPanel
						show={sec("waterlogging")}
						assessment={waterlogging}
						onClose={() => secHide("waterlogging")}
						onEnableWeather={() => {
							const idx = selectedRouteId != null ? Number(selectedRouteId) : 0;
							if (!routeWeather[idx]) fetchWeatherForRoute(idx);
						}}
					/>
					<NightSafetyPanel show={sec("night")} assessment={nightSafety} onClose={() => secHide("night")} />
				</div>
			)}

			{section === "report" && (
				<div className="space-y-6 max-w-2xl">
					<div>
						<h2 className="stars-h2">Hazards</h2>
						<p className="stars-caption">Every reported hazard — type, severity, location and review status — plus one workflow to report a new one: pick the type, add evidence, confirm the location, choose severity and submit.</p>
					</div>
					{reportCardEl}
					<div>
						<h3 className="stars-h3 mb-3">Reported hazards ({userReports.length})</h3>
						{userReports.length === 0 ? (
							<p className="stars-empty">No hazards reported yet. Use the form above to report the first one — it will show up here with its type, severity, location and review status.</p>
						) : (
							<ul className="space-y-2" role="list">
								{userReports.map((r) => {
									const typeLabel = hazardTypeMeta(r.type).label;
									const st = STATUS_STYLES[r.status] || STATUS_STYLES.reported;
									const stLabel = STATUS_LABELS[r.status] || "Reported";
									const ts = r.captureAt || r.createdAt;
									return (
										<li key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
											<div className="flex flex-wrap items-center gap-2 text-sm">
												<span className="font-semibold text-gray-800 dark:text-gray-100">{typeLabel}</span>
												<span className="text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{r.severity || "moderate"}</span>
												<span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: st.bg, color: st.text }}>{stLabel}</span>
												{ts && <span className="text-[11px] text-gray-500 dark:text-gray-400">{new Date(ts).toLocaleString()}</span>}
											</div>
											{r.description && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{r.description}</p>}
											<div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
												{r.coord && <span>{r.coord[1].toFixed(5)}, {r.coord[0].toFixed(5)}</span>}
												{r.coord && (
													<button onClick={() => focusHazard(r.coord)} className="text-[11px] font-semibold text-primary-700 dark:text-primary-300 underline">Show on map</button>
												)}
											</div>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</div>
			)}

			{section === "environment" && (
				<div className="space-y-6 max-w-3xl">
					<div>
						<h2 className="stars-h2">Environment</h2>
						<p className="stars-caption">Traffic and weather along your active route, plus which data sources are connected on this device. When a source is not wired, the value shows as unavailable — never estimated.</p>
					</div>
					{sectionChips([
						{ key: "traffic", label: "Traffic" },
						{ key: "weather", label: "Weather" },
						{ key: "sources", label: "Data sources" },
					])}

					{sec("traffic") && (
						<section className="stars-card p-4 sm:p-6" aria-label="Traffic conditions">
							<h3 className="stars-h3 mb-3">Traffic</h3>
							{!routes?.length ? (
								<p className="stars-empty">No route calculated yet. Find a route on the Navigate page — per-route traffic measurements then appear here.</p>
							) : (
								<ul className="space-y-2" role="list">
									{routes.map((_, idx) => {
										const t = trafficByRoute?.[idx];
										return (
											<li key={idx} className="flex flex-wrap items-center gap-2 text-sm">
												<span className="font-semibold text-gray-800 dark:text-gray-100">{routeLabel(idx)}</span>
												{t?.loading && <span className="stars-badge stars-badge-neutral">Measuring…</span>}
												{!t?.loading && t?.error && <span className="stars-badge stars-badge-warn">Unavailable</span>}
												{!t?.loading && !t?.error && t?.points && (
													<span className="stars-badge stars-badge-ok">
														{Math.round(t.liveMinutes)} min now (free-flow {Math.round(t.freeMinutes)} min){t.updatedAt ? ` · ${new Date(t.updatedAt).toLocaleTimeString()}` : ""}
													</span>
												)}
												{!t?.loading && !t?.error && !t?.points && (
													<span className="stars-badge stars-badge-neutral">Not fetched yet — open Traffic on the route card</span>
												)}
											</li>
										);
									})}
								</ul>
							)}
						</section>
					)}

					{sec("weather") && (
						<section className="stars-card p-4 sm:p-6" aria-label="Weather conditions">
							<h3 className="stars-h3 mb-3">Weather</h3>
							{!routes?.length ? (
								<p className="stars-empty">No route calculated yet. Find a route on the Navigate page, then fetch weather from its route card.</p>
							) : !sources?.weather ? (
								<p className="stars-empty">No weather source is configured on this device, so STARS has no weather to show. Add a OpenWeather key (VITE_OPENWEATHER_KEY) to enable it — the app never invents weather values.</p>
							) : (() => {
								const anyFetched = routes.some((_, idx) => routeWeather?.[idx]?.points?.length);
								if (!anyFetched) {
									return <p className="stars-empty">Weather not fetched yet — open the Weather toggle on a route card to measure conditions along it.</p>;
								}
								return (
									<div className="space-y-3">
										{routes.map((_, idx) => {
											const w = routeWeather?.[idx];
											if (!w?.points?.length) return null;
											return (
												<div key={idx}>
													<div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">{routeLabel(idx)}</div>
													{w.error ? (
														<span className="stars-badge stars-badge-warn">Fetch failed — {String(w.error).slice(0, 80)}</span>
													) : (
														<ul className="flex flex-wrap gap-2" role="list">
															{w.points.map((p, pi) => (
																<li key={pi} className="text-xs px-2 py-1 rounded-control border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200">
																	<span className="font-medium">{p.label || `Point ${pi + 1}`}</span>
																	{p.data?.weather?.[0]?.description ? ` · ${p.data.weather[0].description}` : ""}
																	{Number.isFinite(p.data?.main?.temp) ? ` · ${Math.round(p.data.main.temp)}°C` : ""}
																</li>
															))}
														</ul>
													)}
												</div>
											);
										})}
									</div>
								);
							})()}
						</section>
					)}

					{sec("sources") && (
						<section className="stars-card p-4 sm:p-6" aria-label="Data sources">
							<h3 className="stars-h3 mb-3">Data sources</h3>
							<ul className="space-y-2 text-sm" role="list">
								{[
									{ name: "Mapbox (map, directions, geocoding)", on: !!sources?.mapbox, note: sources?.mapbox ? "Token configured" : "VITE_MAPBOX_TOKEN missing — routing unavailable" },
									{ name: "OpenWeather (route weather)", on: !!sources?.weather, note: sources?.weather ? "API key configured" : "Not configured — weather stays unavailable" },
									{ name: "Incident feed (road incidents)", on: !!sources?.incidents, note: sources?.incidents ? "Feed URL configured" : "Not configured — incident counts show —" },
									{ name: "Optional report backend", on: !!sources?.backend, note: sources?.backend ? "VITE_API_BASE_URL configured" : "Not configured — reports persist in this browser" },
								].map((s) => (
									<li key={s.name} className="flex flex-wrap items-center gap-2">
										<span className={`stars-badge ${s.on ? "stars-badge-ok" : "stars-badge-neutral"}`}>{s.on ? "Connected" : "Not connected"}</span>
										<span className="font-medium text-gray-800 dark:text-gray-100">{s.name}</span>
										<span className="stars-caption">{s.note}</span>
									</li>
								))}
							</ul>
							<p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">Hazard reports are stored on this device. Missing sources are reported as missing — STARS never fabricates traffic, weather, incident or safety values.</p>
						</section>
					)}
				</div>
			)}

			{section === "trips" && (
				<div className="space-y-6">
					<div>
						<h2 className="stars-h2">Analytics</h2>
						<p className="stars-caption">Trip history and safety analytics computed from your recorded trips. Every figure derives from real stored data — nothing is simulated.</p>
					</div>
					{sectionChips([
						{ key: "trips", label: "Trip history" },
						...(safetyAnalytics ? [{ key: "analytics", label: "Analytics" }] : []),
					])}
					<TripsPanel show={sec("trips")} trips={tripHistory} stats={tripStats} onClear={clearTrips} onClose={() => secHide("trips")} />
					{sec("analytics") && (
						<Suspense fallback={null}>
							<AnalyticsPanel show analytics={safetyAnalytics} onClose={() => secHide("analytics")} />
						</Suspense>
					)}
				</div>
			)}

			{section === "intelligence" && (
				<div className="space-y-6">
					<div>
						<h2 className="stars-h2">Road Intelligence</h2>
						<p className="stars-caption">Road conditions, verified hazards, road health and repair priorities — all derived from the report database.</p>
					</div>
					{sectionChips([
						{ key: "hotspots", label: "Hotspots" },
						...(roadHealth ? [{ key: "roadHealth", label: "Road health" }] : []),
						...(changes ? [{ key: "changes", label: "Changes" }] : []),
						...(rankedRepairs?.length ? [{ key: "priority", label: "Repair priority" }] : []),
						...(routes?.length && whatIf ? [{ key: "whatIf", label: "Scenario simulation" }] : []),
						...(adminMode ? [{ key: "municipal", label: "Municipal dashboard" }] : []),
					])}
					<HotspotsPanel show={sec("hotspots")} hotspots={hotspots} hasReports={userReports.length > 0} onClose={() => secHide("hotspots")} onFocus={focusHotspot} />
					<RoadHealthPanel show={sec("roadHealth")} health={roadHealth} onClose={() => secHide("roadHealth")} />
					<ChangeDetectionPanel show={sec("changes")} changes={changes} onClose={() => secHide("changes")} />
					<RepairPriorityPanel
						show={sec("priority")}
						ranked={rankedRepairs}
						onClose={() => secHide("priority")}
						onFocus={(report) => {
							const map = window._mapInstance;
							if (map && Array.isArray(report.coord)) map.flyTo({ center: report.coord, zoom: 16, duration: 800 });
						}}
					/>
					<WhatIfPanel
						show={sec("whatIf")}
						result={whatIf}
						mode={whatIfMode}
						onModeChange={setWhatIfMode}
						adjustments={whatIfAdjustments}
						onAdjustmentsChange={setWhatIfAdjustments}
						onClose={() => secHide("whatIf")}
					/>
					{adminMode ? (
						<MunicipalDashboard
							show={sec("municipal")}
							summary={municipalSummary}
							reports={municipalReports}
							filters={municipalFilters}
							onFiltersChange={setMunicipalFilters}
							locationChoices={locationOptions(userReports)}
							totalReports={userReports.length}
							onClose={() => secHide("municipal")}
							onFocus={(report) => {
								const map = window._mapInstance;
								if (map && Array.isArray(report.coord)) map.flyTo({ center: report.coord, zoom: 16, duration: 800 });
							}}
						/>
					) : (							<div className="stars-card p-4 sm:p-6 stars-empty">
							Municipal repair, verification and administrative actions are available in Admin mode. Use the <span className="font-semibold">Admin</span> button in the header to sign in — they are never exposed in the ordinary user interface.
						</div>
					)}
				</div>
			)}

			{section === "settings" && (
				<div className="space-y-6 max-w-2xl">
					<div>
						<h2 className="stars-h2">Tools</h2>
						<p className="stars-caption">Routing preferences and guidance controls for this device.</p>
					</div>
					{sectionChips([{ key: "prefs", label: "Route preferences" }])}
					<RoutePreferencesPanel
						show={sec("prefs")}
						preferences={routePreferences}
						onChange={setRoutePreferences}
						onClose={() => secHide("prefs")}
						onApplyRoutes={() => {
							if (sourceCoord && destCoord && routes?.length) getRoutes();
						}}
					/>
					<div className="stars-card p-4 sm:p-6">
						<h3 className="stars-h3 mb-1">Voice guidance</h3>
						<p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
							{isSpeechSupported() ? "Spoken turn instructions and safety alerts while a route is active." : "Speech synthesis is not supported in this browser."}
						</p>
						<div className="flex flex-wrap gap-4 text-sm">
							<label className="inline-flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-200">
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
								Navigation announcements
							</label>
							<label className="inline-flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-200">
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
								Safety alerts
							</label>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
