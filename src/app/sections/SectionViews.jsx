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

// Lazy: keeps the chart library and prediction UI out of the initial bundle
const AnalyticsPanel = React.lazy(() => import("../../features/community/AnalyticsPanel"));
const PredictiveSafetyPanel = React.lazy(() => import("../../features/safety/PredictiveSafetyPanel"));

/**
 * Dedicated section views: Road Safety, Report a Hazard, Trips,
 * Road Intelligence and Settings.
 *
 * Rendered by App while `section !== "navigate"`; the map view stays
 * mounted (hidden) underneath so Mapbox never re-initializes. All data
 * arrives through props from the App composition root — this module
 * owns presentation only.
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
		whatIf, whatIfMode, setWhatIfMode, whatIfAdjustments, setWhatIfAdjustments,
		adminMode, municipalSummary, municipalReports, municipalFilters,
		setMunicipalFilters, locationOptions,
		routePreferences, setRoutePreferences, sourceCoord, destCoord, getRoutes,
		voiceSettings, setVoiceSettings, isSpeechSupported, cancelSpeech,
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
		<main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
			{section === "safety" && (
				<div className="space-y-6">
					<div>
						<h2 className="stars-h2">Road Safety</h2>
						<p className="stars-caption">Overall safety for your routes plus advanced risk estimates. Every figure is computed from live route, incident and hazard-report data — nothing is simulated.</p>
					</div>
					<div className="stars-card p-4 sm:p-6">
						<h3 className="stars-h3 mb-3">Overall safety</h3>
						{routeAnalyses.length === 0 ? (
							<p className="stars-empty">No routes analyzed yet. Find a route on the Navigate screen to see safety scores, risk factors and the recommendation here.</p>
						) : (
							<>
								<ul className="space-y-2" role="list">
									{routeAnalyses.map((a, i) => (
										<li key={i} className="flex items-center justify-between gap-3 text-sm">
											<span className="font-medium text-gray-800 dark:text-gray-100 inline-flex items-center gap-2">
												Route {i + 1}
												{recommendation?.recommendedIndex === i && <span className="stars-badge-ok">Recommended</span>}
											</span>
											<span className="font-bold" style={{ color: a.classification?.color }}>{a.classification?.label} · {a.score}/100</span>
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
						<h2 className="stars-h2">Report a Road Hazard</h2>
						<p className="stars-caption">One workflow for every hazard type: pick the type, add evidence, confirm the location, choose severity and submit. The form shows the actual submission status.</p>
					</div>
					{reportCardEl}
				</div>
			)}

			{section === "trips" && (
				<div className="space-y-6">
					<div>
						<h2 className="stars-h2">Trips</h2>
						<p className="stars-caption">Trips are recorded automatically when you open a route and complete when you reach the destination.</p>
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
						<h2 className="stars-h2">Settings</h2>
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
		</main>
	);
}
