GitHub Pages publishing package

Upload these files into the same GitHub repository folder/root:
- index.html
- flights.json
- apple-touch-icon.png and any favicon files, if used

Important:
- index.html now loads flight data using fetch('flights.json').
- Do not open index.html directly from local file system for testing, because browsers may block fetch() on file:// URLs.
- Test using GitHub Pages or a local web server.

Data update workflow:
1. Edit/replace flights.json only.
2. Commit and push to GitHub.
3. The website will load the updated data automatically.
