import re

file_path = 'c:/Users/deepa/OneDrive/Documents/STARS_RouteFinder_Full/src/App.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Root Div
content = content.replace(
    'min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:bg-gradient-to-br dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 text-gray-900 dark:text-gray-100',
    'h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden'
)

# 2. Extract Main Content
# Handle potential spaces in closing tags
main_pattern = re.compile(r'(<main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">)(.*?)(</main\s*>)', re.DOTALL)
match = main_pattern.search(content)

if match:
    main_inner = match.group(2)
    
    # Extract Section (Controls + Map)
    section_pattern = re.compile(r'(<section className="lg:col-span-2 space-y-6">)(.*?)(</section\s*>)', re.DOTALL)
    sec_match = section_pattern.search(main_inner)
    
    controls_block = ""
    map_block = ""
    
    if sec_match:
        sec_inner = sec_match.group(2)
        # Map div start
        map_div_start = '<div className="relative h-[600px] rounded-3xl overflow-hidden shadow-2xl shadow-gray-200/50 dark:shadow-black/20 border-4 border-white dark:border-gray-800">'
        if map_div_start in sec_inner:
            parts = sec_inner.split(map_div_start)
            controls_block = parts[0].strip()
            
            # Map block is the rest, but we need to be careful about closing divs
            # The map block is <div ...> ... </div>
            # We can take parts[1] and assume it ends with </div> (plus whitespace)
            # Actually, parts[1] contains the content of map div + closing div.
            # Let's reconstruct.
            map_content_raw = parts[1]
            # Remove the last </div> which closes the map div
            # Find the last </div>
            last_div_idx = map_content_raw.rfind('</div>')
            if last_div_idx != -1:
                map_inner = map_content_raw[:last_div_idx] # Content inside map div
                # Reconstruct map block with new class
                map_block = '<div className="absolute inset-0 w-full h-full">' + map_inner + '</div>'
            else:
                # Fallback
                map_block = map_div_start.replace('relative h-[600px] rounded-3xl overflow-hidden shadow-2xl shadow-gray-200/50 dark:shadow-black/20 border-4 border-white dark:border-gray-800', 'absolute inset-0 w-full h-full') + parts[1]

    # Extract Aside (Sidebar)
    aside_pattern = re.compile(r'(<aside className="space-y-6">)(.*?)(</aside\s*>)', re.DOTALL)
    aside_match = aside_pattern.search(main_inner)
    aside_block = ""
    if aside_match:
        aside_block = aside_match.group(2)

    # Construct New Main
    new_main = """
			<main className="flex-1 relative w-full h-full overflow-hidden">
				{/* Map Layer (Background) */}
				<div className="absolute inset-0 z-0">
""" + map_block + """
				</div>

				{/* Floating Controls (Top Left) */}
				<div className="absolute top-4 left-4 z-10 w-full max-w-md pointer-events-none">
					<div className="pointer-events-auto max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar pr-2">
""" + controls_block + """
					</div>
				</div>

				{/* Floating Sidebar (Right) */}
				<div className="absolute top-4 right-4 z-10 w-full max-w-sm pointer-events-none">
					<div className="pointer-events-auto max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar pl-2">
						<aside className="space-y-4">
""" + aside_block + """
						</aside>
					</div>
				</div>
                
                {/* Extra Feature: Quick Settings */}
                <div className="absolute bottom-6 left-6 z-20">
                    <button className="p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:scale-110 transition-transform text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700" title="Settings">
                        <Settings className="w-6 h-6" />
                    </button>
                </div>
			</main>
"""
    
    # Replace the main block
    content = content.replace(match.group(0), new_main)

# Ensure Settings import
if 'import { MapPin, CloudSun, Gauge, Info, Upload, ShieldCheck, Bell, LocateFixed, Camera }' in content:
    content = content.replace(
        'import { MapPin, CloudSun, Gauge, Info, Upload, ShieldCheck, Bell, LocateFixed, Camera }',
        'import { MapPin, CloudSun, Gauge, Info, Upload, ShieldCheck, Bell, LocateFixed, Camera, Settings }'
    )
elif 'import { MapPin, CloudSun, Gauge, Info, Upload, ShieldCheck, Bell, LocateFixed, Camera, Settings }' not in content:
    # Try to find where to insert Settings
    content = content.replace(
        'import { MapPin, CloudSun, Gauge, Info, Upload, ShieldCheck, Bell, LocateFixed, Camera',
        'import { MapPin, CloudSun, Gauge, Info, Upload, ShieldCheck, Bell, LocateFixed, Camera, Settings'
    )

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
