import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/**
 * Live vs free-flow traffic chart for the route traffic popup.
 *
 * Extracted from App.jsx and lazy-loaded so recharts stays out of the
 * initial bundle (it is only needed once a traffic popup is opened).
 *
 * @param {Object} props
 * @param {Array<{idx:number, speedLive:number, speedFree:number, delayPct:number}>} props.points
 */
export default function TrafficChart({ points = [] }) {
  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
  );
}
