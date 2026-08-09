import os

file_path = 'c:/Users/deepa/OneDrive/Documents/STARS_RouteFinder_Full/src/App.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Head is up to line 2022 (index 2021)
head = lines[:2022]

# Tail is from line 2024 (index 2023) onwards
# Line 2024 in the file (index 2023) is: 				<Info className="w-3.5 h-3.5" /> Details
tail = lines[2023:]

# Construct Middle
middle = []

# Close useEffect
middle.append("	}, []);\n\n")

# Start Return
middle.append("	return (\n")
middle.append('		<div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:bg-gradient-to-br dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 text-gray-900 dark:text-gray-100">\n')

# Header
middle.append('			<header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-all duration-300">\n')
middle.append('				<div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">\n')
middle.append('					<div className="flex items-center gap-3 group cursor-pointer">\n')
middle.append('						<div className="p-2.5 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl shadow-lg shadow-primary-500/20 group-hover:shadow-primary-500/30 transition-all duration-300 group-hover:scale-105">\n')
middle.append('							<MapPin className="w-6 h-6 text-white" />\n')
middle.append('						</div>\n')
middle.append('						<div>\n')
middle.append('							<h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">STARS</h1>\n')
middle.append('							<p className="text-[10px] font-semibold text-primary-600 dark:text-primary-400 tracking-wider uppercase">Route Finder</p>\n')
middle.append('						</div>\n')
middle.append('					</div>\n')
middle.append('					<div className="flex items-center gap-4">\n')
middle.append('						<div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 text-xs font-medium text-gray-600 dark:text-gray-300">\n')
middle.append('							<Info className="w-4 h-4 text-primary-500" />\n')
middle.append('							<span>Smarter travel, safer roads</span>\n')
middle.append('						</div>\n')
middle.append('						<div className="flex items-center gap-2">\n')
middle.append('							<button onClick={() => setShowMessages((s) => !s)} className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-all duration-200 hover:text-primary-600 dark:hover:text-primary-400">\n')
middle.append('								<Bell className="w-5 h-5" />\n')
middle.append('								{adminMessages.length > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-900 animate-pulse" />}\n')
middle.append('							</button>\n')
middle.append('							<button onClick={() => { if (!adminMode) { const pin = prompt("Enter admin PIN (demo: 1234)"); if (pin === "1234") setAdminMode(true); else alert("Invalid PIN"); } else { setAdminMode(false); } }} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${adminMode ? "bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-800" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>\n')
middle.append('								<ShieldCheck className={`w-4 h-4 ${adminMode ? "text-primary-600 dark:text-primary-400" : ""}`} />\n')
middle.append('								{adminMode ? "Admin Active" : "Admin"}\n')
middle.append('							</button>\n')
middle.append('						</div>\n')
middle.append('					</div>\n')
middle.append('				</div>\n')
middle.append('			</header>\n')

# Notice Banner
middle.append('			{notice && (\n')
middle.append('				<div className="max-w-7xl mx-auto px-6 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">\n')
middle.append('					<div className={`px-4 py-3 text-sm rounded-xl shadow-lg backdrop-blur-sm flex items-center justify-between ${notice.type==="success" ? "bg-green-100/90 border-2 border-green-300 text-green-900" : notice.type==="warn" ? "bg-yellow-100/90 border-2 border-yellow-300 text-yellow-900" : notice.type==="error" ? "bg-red-100/90 border-2 border-red-300 text-red-900" : "bg-blue-100/90 border-2 border-blue-300 text-blue-900"}`}>\n')
middle.append('						<span>{notice.message}</span>\n')
middle.append('						{notice.undoId && <button onClick={() => undoDeleteRequest(notice.undoId)} className="ml-4 text-xs underline hover:opacity-80">Undo</button>}\n')
middle.append('					</div>\n')
middle.append('				</div>\n')
middle.append('			)}\n')

# Modals (Simplified)
middle.append('			{rejectModal.open && (\n')
middle.append('				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">\n')
middle.append('					<div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl max-w-md w-full">\n')
middle.append('						<h3 className="text-lg font-bold mb-4">Reject Report</h3>\n')
middle.append('						<textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason..." className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 mb-4" />\n')
middle.append('						<div className="flex justify-end gap-2">\n')
middle.append('							<button onClick={closeRejectModal} className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">Cancel</button>\n')
middle.append('							<button onClick={confirmRejectModal} className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700">Reject</button>\n')
middle.append('						</div>\n')
middle.append('					</div>\n')
middle.append('				</div>\n')
middle.append('			)}\n')

middle.append('			{fixModal.open && (\n')
middle.append('				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">\n')
middle.append('					<div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl max-w-md w-full">\n')
middle.append('						<h3 className="text-lg font-bold mb-4">Mark Fixed</h3>\n')
middle.append('						<div className="mb-4">\n')
middle.append('							<button onClick={() => openCameraModal("fix")} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-primary-500 hover:bg-primary-50 flex items-center justify-center gap-2">\n')
middle.append('								<Camera className="w-5 h-5" /> Take Photo\n')
middle.append('							</button>\n')
middle.append('						</div>\n')
middle.append('						{fixPhotoPreview && <img src={fixPhotoPreview} className="w-full h-48 object-cover rounded-xl mb-4" />}\n')
middle.append('						<div className="flex justify-end gap-2">\n')
middle.append('							<button onClick={closeFixModal} className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">Cancel</button>\n')
middle.append('							<button onClick={submitFixProof} disabled={!fixPhotoPreview} className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Submit</button>\n')
middle.append('						</div>\n')
middle.append('					</div>\n')
middle.append('				</div>\n')
middle.append('			)}\n')

middle.append('			{imageModal.open && (\n')
middle.append('				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={closeImageModal}>\n')
middle.append('					<img src={imageModal.src} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />\n')
middle.append('				</div>\n')
middle.append('			)}\n')

middle.append('			{cameraOpen && (\n')
middle.append('				<div className="fixed inset-0 z-50 bg-black flex flex-col">\n')
middle.append('					<video ref={cameraVideoRef} autoPlay playsInline muted className="flex-1 object-cover" />\n')
middle.append('					<div className="p-6 flex justify-between items-center bg-black/50 backdrop-blur-md absolute bottom-0 w-full">\n')
middle.append('						<button onClick={closeCameraModal} className="text-white px-4 py-2">Cancel</button>\n')
middle.append('						<button onClick={captureFromCamera} className="bg-white text-black px-8 py-4 rounded-full font-bold">Capture</button>\n')
middle.append('					</div>\n')
middle.append('				</div>\n')
middle.append('			)}\n')

middle.append('			{showMessages && (\n')
middle.append('				<div className="fixed top-20 right-6 z-40 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4">\n')
middle.append('					<h3 className="font-bold mb-2">Messages</h3>\n')
middle.append('					<ul className="space-y-2 max-h-60 overflow-auto">\n')
middle.append('						{adminMessages.map(m => <li key={m.id} className="text-sm p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">{m.message}</li>)}\n')
middle.append('					</ul>\n')
middle.append('				</div>\n')
middle.append('			)}\n')

# Main Layout
middle.append('			<main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">\n')
middle.append('				<section className="lg:col-span-2 space-y-6">\n')

# Controls
middle.append('					<div className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl shadow-gray-200/50 dark:shadow-black/20">\n')
middle.append('						<div className="grid gap-6 md:grid-cols-2">\n')
middle.append('							<div className="relative group">\n')
middle.append('								<label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block ml-1">Starting Point</label>\n')
middle.append('								<div className="relative">\n')
middle.append('									<input type="text" value={sourceQuery} onChange={(e) => { setSourceLocked(false); setSourceQuery(e.target.value); }} placeholder="Where are you starting?" className="w-full pl-4 pr-12 py-3.5 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-transparent focus:border-primary-500/20 focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-primary-500/10 transition-all duration-200 text-sm font-medium placeholder:text-gray-400" />\n')
middle.append('									<button onClick={handleUseMyLocation} className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-primary-600 hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-all duration-200"><LocateFixed className="w-5 h-5" /></button>\n')
middle.append('									{sourceSuggestions.length > 0 && <ul className="absolute z-10 w-full bg-white dark:bg-gray-800 shadow-xl rounded-xl mt-2 overflow-hidden border border-gray-100 dark:border-gray-700">{sourceSuggestions.map(s => <li key={s.id} onClick={() => { setSourceCoord(s.center); setSourceQuery(s.name); setSourceSuggestions([]); setSourceLocked(true); }} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm">{s.name}</li>)}</ul>}\n')
middle.append('								</div>\n')
middle.append('							</div>\n')
middle.append('							<div className="relative group">\n')
middle.append('								<label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block ml-1">Destination</label>\n')
middle.append('								<div className="relative">\n')
middle.append('									<input type="text" value={destQuery} onChange={(e) => { setDestLocked(false); setDestQuery(e.target.value); }} placeholder="Where do you want to go?" className="w-full pl-4 pr-12 py-3.5 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-transparent focus:border-red-500/20 focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-red-500/10 transition-all duration-200 text-sm font-medium placeholder:text-gray-400" />\n')
middle.append('									{destSuggestions.length > 0 && <ul className="absolute z-10 w-full bg-white dark:bg-gray-800 shadow-xl rounded-xl mt-2 overflow-hidden border border-gray-100 dark:border-gray-700">{destSuggestions.map(s => <li key={s.id} onClick={() => { setDestCoord(s.center); setDestQuery(s.name); setDestSuggestions([]); setDestLocked(true); }} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm">{s.name}</li>)}</ul>}\n')
middle.append('								</div>\n')
middle.append('							</div>\n')
middle.append('						</div>\n')
middle.append('						<div className="mt-6 flex flex-wrap gap-3">\n')
middle.append('							<button onClick={() => enableMapPick("source")} className={`px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all duration-200 ${pickingMode==="source" ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 hover:border-gray-300"}`}>Pick Source</button>\n')
middle.append('							<button onClick={() => enableMapPick("destination")} className={`px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all duration-200 ${pickingMode==="destination" ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 hover:border-gray-300"}`}>Pick Destination</button>\n')
middle.append('							<button onClick={() => getRoutes()} disabled={!sourceCoord || !destCoord} className="ml-auto px-8 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-700 hover:to-primary-600 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all duration-300">Find Routes</button>\n')
middle.append('						</div>\n')
middle.append('					</div>\n')

# Map
middle.append('					<div className="relative h-[600px] rounded-3xl overflow-hidden shadow-2xl shadow-gray-200/50 dark:shadow-black/20 border-4 border-white dark:border-gray-800">\n')
middle.append('						<div ref={mapContainerRef} className="absolute inset-0" />\n')
middle.append('						{mapError && <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-red-500">{mapError}</div>}\n')
middle.append('						<div className="absolute top-4 right-4 flex gap-2">\n')
middle.append('							<button onClick={() => switchMapStyle("streets")} className="px-3 py-1.5 bg-white/90 backdrop-blur rounded-lg text-xs font-medium shadow-sm hover:bg-white">Streets</button>\n')
middle.append('							<button onClick={() => switchMapStyle("satellite")} className="px-3 py-1.5 bg-white/90 backdrop-blur rounded-lg text-xs font-medium shadow-sm hover:bg-white">Satellite</button>\n')
middle.append('							<button onClick={() => switchMapStyle("traffic")} className="px-3 py-1.5 bg-white/90 backdrop-blur rounded-lg text-xs font-medium shadow-sm hover:bg-white">Traffic</button>\n')
middle.append('						</div>\n')
middle.append('					</div>\n')
middle.append('				</section>\n')

# Route Options Aside
middle.append('				<aside className="space-y-6">\n')
middle.append('					{routes.length > 0 && (\n')
middle.append('						<div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl overflow-hidden">\n')
middle.append('							<div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-sm sticky top-0 z-10">\n')
middle.append('								<h2 className="text-lg font-bold">Route Options</h2>\n')
middle.append('							</div>\n')
middle.append('							<ul className="p-4 space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">\n')
middle.append('								{routes.map((r, idx) => {\n')
middle.append('									const minutes = Math.round(r.duration / 60);\n')
middle.append('									const km = (r.distance / 1000).toFixed(1);\n')
middle.append('									const selected = String(idx) === String(selectedRouteId);\n')
middle.append('									const bestMinutes = Math.min(...routes.map((x) => Math.round((x.duration || 0) / 60)));\n')
middle.append('									const delta = minutes - bestMinutes;\n')
middle.append('									const rel = Math.max(10, Math.min(100, Math.round((bestMinutes / Math.max(1, minutes)) * 100)));\n')
middle.append('									return (\n')
middle.append('										<li key={idx} className={`group relative w-full rounded-2xl p-4 border-2 cursor-pointer transition-all duration-300 ${selected ? "border-primary-500 bg-primary-50/50 dark:bg-primary-900/10 shadow-md ring-1 ring-primary-500/20" : "border-transparent bg-gray-50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-lg"}`}>\n')
middle.append('											<div className="flex items-center justify-between">\n')
middle.append('												<div>\n')
middle.append('													<div className="font-bold text-gray-900 dark:text-white flex items-center gap-2">Route {idx + 1} {selected && <span className="text-[10px] px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">Selected</span>}</div>\n')
middle.append('													<div className="text-xs text-gray-500 mt-1">{minutes} min · {km} km</div>\n')
middle.append('													<div className="mt-3 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden w-full">\n')
middle.append('														<div className={`h-full rounded-full transition-all duration-500 ${selected ? "bg-primary-500" : "bg-emerald-500"}`} style={{ width: `${rel}%` }} />\n')
middle.append('													</div>\n')
middle.append('												</div>\n')
middle.append('												<div className="flex flex-col gap-2">\n')
middle.append('													<button className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${selected ? "bg-primary-600 text-white" : "bg-white border border-gray-200"}`} onClick={() => { const map = window._mapInstance; if (!map) return; selectRouteById(map, routes, idx); }}>{selected ? "Selected" : "Select"}</button>\n')
middle.append('													<button className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 hover:bg-gray-50" onClick={() => setOpenDetailsId((cur) => (String(idx) === String(cur) ? null : String(idx)))}>\n')

# Combine
full_content = head + middle + tail

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(full_content)
