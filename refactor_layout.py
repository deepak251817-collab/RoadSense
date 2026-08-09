import re

file_path = 'c:/Users/deepa/OneDrive/Documents/STARS_RouteFinder_Full/src/App.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Root Div to be h-screen and flex-col
content = content.replace(
    'min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:bg-gradient-to-br dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 text-gray-900 dark:text-gray-100',
    'h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden'
)

# 2. Extract Main Content
# Find <main ...> ... </main>
main_pattern = re.compile(r'(<main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">)(.*?)(</main>)', re.DOTALL)
match = main_pattern.search(content)

if match:
    main_start_tag = match.group(1)
    main_inner = match.group(2)
    main_end_tag = match.group(3)

    # Extract Section (Controls + Map)
    section_pattern = re.compile(r'(<section className="lg:col-span-2 space-y-6">)(.*?)(</section>)', re.DOTALL)
    sec_match = section_pattern.search(main_inner)
    
    controls_block = ""
    map_block = ""
    
    if sec_match:
        sec_inner = sec_match.group(2)
        # Split into Controls and Map
        # Controls is the first div with class "p-6 ..."
        # Map is the div with class "relative h-[600px] ..."
        
        # We can try to split by the map div start
        map_div_start = '<div className="relative h-[600px] rounded-3xl overflow-hidden shadow-2xl shadow-gray-200/50 dark:shadow-black/20 border-4 border-white dark:border-gray-800">'
        parts = sec_inner.split(map_div_start)
        
        if len(parts) == 2:
            controls_block = parts[0].strip()
            map_content = parts[1].rsplit('</div>', 1)[0].strip() # Remove last closing div of section? No, map div closes itself.
            # actually parts[1] contains the map content + closing div of map + closing div of section maybe?
            # The split removes the start tag.
            
            # Let's reconstruct map block
            # The map block ends with </div>. 
            # It contains <div ref={mapContainerRef} ... /> and {mapError ...} and buttons.
            
            # Simple approach: The map block is the second child of section.
            # Let's use regex to find the map block specifically.
            map_regex = re.compile(r'(<div className="relative h-\[600px\].*?">)(.*?)(</div>\s*$)', re.DOTALL)
            # This regex is tricky because of nested divs.
            
            # Alternative: Just grab the known strings.
            controls_start = '<div className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl shadow-gray-200/50 dark:shadow-black/20">'
            controls_end = '</div>' # First closing div after controls start? No.
            
            # Let's rely on the structure we know from view_file.
            # Controls block is everything before the map block.
            controls_block = parts[0]
            
            # Map block is map_div_start + parts[1] (but we need to trim the end)
            # parts[1] ends with the closing div of the map, then newlines, then closing section.
            # We can just take parts[1] and remove the trailing whitespace.
            # Actually, let's look at the file content again.
            # The section contains: Controls Div, then Map Div.
            
            map_block = map_div_start + parts[1]
            
            # Remove the "relative h-[600px] ..." class and border from map block for full screen
            map_block = map_block.replace('relative h-[600px] rounded-3xl overflow-hidden shadow-2xl shadow-gray-200/50 dark:shadow-black/20 border-4 border-white dark:border-gray-800', 'absolute inset-0 w-full h-full')
            
            # Also remove the "p-6 ..." wrapper from controls to make it cleaner? 
            # Or keep it but wrap in floating container.
            # We'll keep the controls block as is, just wrapped.
            
    # Extract Aside (Sidebar)
    aside_pattern = re.compile(r'(<aside className="space-y-6">)(.*?)(</aside>)', re.DOTALL)
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
				<div className="absolute top-24 left-4 z-10 w-full max-w-md pointer-events-none">
					<div className="pointer-events-auto max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar pr-2">
""" + controls_block + """
					</div>
				</div>

				{/* Floating Sidebar (Right) */}
				<div className="absolute top-24 right-4 z-10 w-full max-w-sm pointer-events-none">
					<div className="pointer-events-auto max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar pl-2">
						<aside className="space-y-4">
""" + aside_block + """
						</aside>
					</div>
				</div>
                
                {/* Extra Feature: Quick Settings */}
                <div className="absolute bottom-6 left-6 z-20">
                    <button className="p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:scale-110 transition-transform text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700" title="Settings">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                </div>
			</main>
"""
    
    # Replace the main block
    content = content.replace(match.group(0), new_main)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
