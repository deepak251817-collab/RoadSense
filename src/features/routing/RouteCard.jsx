import React from "react";
import { Info, Gauge, AlertTriangle, CloudSun } from "lucide-react";
import { routeLabel } from "./routeIdentity";

/**
 * One consistent route card (UI Phase 7).
 *
 * The single presentation for a route in the Route Options list: label
 * (once), travel time, distance, safety score + risk classification when
 * analysis exists, hazard information, and Recommended/Fastest indicators.
 * The route count is never repeated here — it is shown once above the list.
 *
 * Pure presentational: identity, data and every handler come from the
 * caller (App.jsx). Expandable detail panels (safety analysis, traffic,
 * incidents, weather) are passed as `children` and render below the card
 * summary inside the same <li>.
 *
 * @param {Object} props
 * @param {number} props.idx zero-based route index (selection key)
 * @param {number} props.minutes travel time in minutes
 * @param {string} props.km distance formatted in km
 * @param {number} props.delta minutes slower than the fastest route (0 = fastest)
 * @param {number} props.relWidthPct relative-time bar width (10–100)
 * @param {boolean} props.selected whether this route is selected
 * @param {boolean} props.recommended whether this route is the recommended one
 * @param {string} [props.recommendedTitle] honest reason shown on the RECOMMENDED badge
 * @param {boolean} [props.fastestTied] several routes share the minimum duration
 * @param {boolean} [props.isShortest] this route has the minimum distance
 * @param {boolean} [props.shortestTied] several routes share the minimum distance
 * @param {boolean} [props.isSafest] this route uniquely holds the top safety score
 * @param {number} props.potCount user-reported potholes near the route
 * @param {number} props.stopCount planned stops on the route
 * @param {Object|null} props.analysis route analysis (score/classification) or null
 * @param {Function} props.onSelect select this route on the map
 * @param {boolean} props.detailsOpen safety-details panel open
 * @param {Function} props.onToggleDetails toggle the safety-details panel
 * @param {boolean} props.trafficOpen traffic panel open
 * @param {Function} props.onToggleTraffic toggle the traffic panel (fetches on open)
 * @param {boolean} props.incidentOpen incidents panel open
 * @param {Function} props.onToggleIncidents toggle the incidents panel
 * @param {number} props.incidentCount live incident count (0 = none)
 * @param {boolean} props.weatherOpen weather panel open
 * @param {Function} props.onToggleWeather toggle the weather panel (fetches on open)
 * @param {number} props.weatherPointCount weather forecast points loaded
 * @param {React.ReactNode} props.children expandable panels rendered below the summary
 */
export default function RouteCard({
	idx,
	minutes,
	km,
	delta,
	relWidthPct,
	selected,
	recommended,
	recommendedTitle,
	fastestTied,
	isShortest,
	shortestTied,
	isSafest,
	potCount,
	stopCount,
	analysis,
	onSelect,
	detailsOpen,
	onToggleDetails,
	trafficOpen,
	onToggleTraffic,
	incidentOpen,
	onToggleIncidents,
	incidentCount,
	weatherOpen,
	onToggleWeather,
	weatherPointCount,
	children,
}) {
	return (
		<li
			className={`w-full text-sm rounded-xl px-4 py-3 border-2 relative cursor-pointer transition-all duration-200 hover:shadow-lg ${selected ? "border-primary-400 bg-primary-50/70 dark:bg-primary-900/25 shadow-md" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"}`}
			style={{ minHeight: "88px" }}
			aria-current={selected ? "true" : undefined}
		>
			<div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${selected ? "bg-primary-500" : "bg-transparent"}`} />
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="min-w-0">
					<div className="font-semibold flex items-center gap-2">
						<span className="text-gray-900 dark:text-gray-100">{routeLabel(idx)}</span>
						{recommended && (
							<span className="stars-badge-ok" title={recommendedTitle || "Recommended route"}>RECOMMENDED</span>
						)}
						{isSafest && <span className="stars-badge bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" title="Highest safety score of all routes">Safest</span>}
						{isShortest && <span className="stars-badge bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" title={shortestTied ? "Shortest distance (tied with another route)" : "Shortest distance of all routes"}>Shortest{shortestTied ? " (tied)" : ""}</span>}
						{potCount > 0 && (
							<span className="stars-badge-danger animate-pulse" title="User-reported potholes along this route">{potCount} pothole{potCount > 1 ? "s" : ""}</span>
						)}
						{selected && <span className="stars-badge bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-300">Selected</span>}
					</div>
					<div className="mt-0.5 flex items-center gap-2 text-gray-700 dark:text-gray-200">
						<span className="text-[11px] px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">{minutes} min</span>
						<span className="text-[11px] px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">{km} km</span>
						{stopCount > 0 && <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">via {stopCount} stop{stopCount > 1 ? "s" : ""}</span>}
						<span className={`text-[11px] px-2 py-1 rounded-full font-medium ${delta === 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-700"}`} title={delta === 0 ? (fastestTied ? "Shares the shortest travel time with another route" : "Shortest travel time of all routes") : undefined}>{delta === 0 ? (fastestTied ? "Fastest (tied)" : "Fastest") : `+${delta} min`}</span>
						{analysis && (
							<span
								className="text-[11px] px-2 py-1 rounded-full font-semibold text-white whitespace-nowrap"
								style={{ backgroundColor: analysis.classification?.color }}
								title={`Safety score ${analysis.score}/100 — ${analysis.classification?.label}`}
							>
								{analysis.classification?.label} {analysis.score}/100
							</span>
						)}
					</div>
					<div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden w-40 shadow-inner">
						<div className={`h-full transition-all duration-300 ${selected ? "bg-primary-500" : "bg-emerald-500"}`} style={{ width: `${relWidthPct}%` }} />
					</div>
				</div>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<button
						className={`px-3 py-1.5 rounded-control text-xs font-semibold transition-colors duration-150 whitespace-nowrap ${selected ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"}`}
						onClick={onSelect}
					>
						{selected ? "Selected" : "Select"}
					</button>
					<button
						aria-expanded={detailsOpen}
						className="px-3 py-1.5 rounded-control text-xs font-medium border border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-700 flex items-center gap-1 transition-colors duration-150"
						onClick={onToggleDetails}
					>
						<Info className="w-3.5 h-3.5" /> Details
					</button>
					<button
						aria-pressed={trafficOpen}
						className={`px-3 py-1.5 rounded-control text-xs font-medium border flex items-center gap-1 transition-colors duration-150 ${trafficOpen ? "border-primary-600 bg-primary-600 text-white hover:bg-primary-700" : "border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
						onClick={onToggleTraffic}
					>
						<Gauge className="w-3.5 h-3.5" /> Traffic
					</button>
					<button
						aria-pressed={incidentOpen}
						className={`px-3 py-1.5 rounded-control text-xs font-medium border flex items-center gap-1 transition-colors duration-150 whitespace-nowrap ${incidentOpen ? "border-primary-600 bg-primary-600 text-white hover:bg-primary-700" : "border-rose-300 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/30"}`}
						onClick={onToggleIncidents}
					>
						<AlertTriangle className="w-3.5 h-3.5" /> Incidents
						{incidentCount ? (
							<span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-600 text-white" aria-label={`${incidentCount} incidents`}>{incidentCount}</span>
						) : null}
					</button>
					<button
						aria-pressed={weatherOpen}
						className={`px-3 py-1.5 rounded-control text-xs font-medium border flex items-center gap-1 transition-colors duration-150 whitespace-nowrap ${weatherOpen ? "border-primary-600 bg-primary-600 text-white hover:bg-primary-700" : "border-sky-300 dark:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30"}`}
						onClick={onToggleWeather}
					>
						<span className={`inline-flex items-center justify-center rounded-full ${weatherOpen ? "bg-sky-600 text-white" : "bg-sky-200 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"} w-5 h-5`}>
							<CloudSun className="w-3 h-3" />
						</span>
						<span className="ml-1">Weather</span>
						{weatherPointCount ? (
							<span className="ml-1 inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full bg-sky-200 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
								{weatherPointCount}
							</span>
						) : null}
					</button>
				</div>
			</div>
			{children}
		</li>
	);
}
