import os

file_path = 'c:/Users/deepa/OneDrive/Documents/STARS_RouteFinder_Full/src/App.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix malformed tags
content = content.replace('< button', '<button')
content = content.replace('</button >', '</button>')
content = content.replace('className =', 'className=')
content = content.replace('onClick =', 'onClick=')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
