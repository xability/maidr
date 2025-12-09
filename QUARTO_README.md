# Quarto Documentation Setup

This repository uses Quarto to generate a comprehensive documentation website that includes:
- Home page (README content)
- Interactive Examples
- API Reference (TypeDoc-generated)

## Prerequisites

To build and preview the documentation locally, you need to install Quarto:

### macOS
```bash
brew install quarto
```

### Windows
Download and install from: https://quarto.org/docs/get-started/

### Linux
```bash
# Ubuntu/Debian
sudo apt-get install quarto

# Or download from website
wget https://github.com/quarto-dev/quarto-cli/releases/download/v1.4.550/quarto-1.4.550-linux-amd64.deb
sudo dpkg -i quarto-1.4.550-linux-amd64.deb
```

## Local Development

### 1. Install Node.js dependencies
```bash
npm install
```

### 2. Build TypeDoc documentation
```bash
npm run docs
```

### 3. Preview the Quarto site
```bash
quarto preview
```

This will start a local server (usually at http://localhost:4000) where you can preview the documentation.

### 4. Build the site for production
```bash
quarto render
```

This will generate the static site in the `_site` directory.

## Project Structure

```
maidr/
├── _quarto.yml          # Quarto configuration
├── index.qmd            # Home page (includes README.md)
├── examples.qmd         # Examples page with embedded demos
├── api-reference.qmd    # API documentation page
├── styles.css           # Custom styling
├── README.md            # Main README (included in index.qmd)
├── examples/            # Example HTML files
│   ├── barplot.html
│   ├── scatter_plot.html
│   └── ...
└── docs/                # TypeDoc-generated API documentation
    ├── index.html
    ├── classes/
    ├── interfaces/
    └── ...
```

## GitHub Pages Deployment

The documentation is automatically deployed to GitHub Pages when changes are pushed to the main branch. The workflow:

1. Builds TypeDoc documentation
2. Renders Quarto site
3. Deploys to GitHub Pages

The site will be available at: https://xability.github.io/maidr/

## Customization

### Modifying the Navigation

Edit `_quarto.yml` to change the navigation structure:

```yaml
navbar:
  left:
    - text: "Your Page"
      href: your-page.qmd
```

### Adding New Pages

1. Create a new `.qmd` file (e.g., `tutorials.qmd`)
2. Add it to the navigation in `_quarto.yml`
3. Write your content using Quarto Markdown

### Styling

Edit `styles.css` to customize the appearance of the documentation.

## Troubleshooting

### Quarto not found
Make sure Quarto is installed and available in your PATH:
```bash
quarto --version
```

### TypeDoc build fails
Ensure all TypeScript dependencies are installed:
```bash
npm ci
npm run docs
```

### Preview server not starting
Check if port 4000 is already in use, or specify a different port:
```bash
quarto preview --port 4001
```

## Additional Resources

- [Quarto Documentation](https://quarto.org/docs/websites/)
- [TypeDoc Documentation](https://typedoc.org/)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)