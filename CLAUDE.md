# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **static HTML/CSS/JavaScript personal portfolio and blog website** for a Computer Vision researcher, hosted on GitHub Pages at `joe-smith-computer-vision.com`. There is no build system, framework, or package manager — all files are hand-coded and served directly.

## Blog Workflow

Create a new blog post using the helper script:

```bash
./scripts/new-blog-post.sh "Your Post Title" YYYY-MM-DD <read-time-minutes>
```

After running the script:
1. Fill in the post content in the generated file at `blog/posts/{DATE}-{SLUG}.html`
2. Add a post card to `blog/index.html`
3. Optionally add a featured card to the main `index.html`

## Architecture

### Key Files

- **`index.html`** — Main portfolio page with sections: About, Education, Work History, Skills, Awards, Publications, Presentations, Blog cards, Contact
- **`css/styles.css`** — Single stylesheet for the entire site; uses CSS custom properties (`--bg`, `--surface`, `--text`, `--brand`, etc.) for theming
- **`js/script.js`** — Vanilla JS handling smooth scrolling, image modal/lightbox, and blog tag filtering
- **`blog/index.html`** — Blog landing page with tag-based client-side filtering
- **`blog/posts/`** — Individual blog post HTML files (one per post)
- **`blog/templates/post-template.html`** — Template used by `new-blog-post.sh` when generating new posts

### Blog Post Structure

Each post in `blog/posts/` is a self-contained HTML file with:
- Shared header/nav matching the main site
- Post metadata (title, date, read time, tags)
- Hero image
- Content sections (Problem Context, Method and Setup, Results and Interpretation, Practical Guidance, Related Papers)
- Related posts section

### External Dependencies (CDN, no install required)

- Google Fonts: Montserrat + Merriweather
- Font Awesome v5.15.4
- Lightbox2 v2.11.3
- Umami analytics

### CSS Cache-Busting

CSS and JS imports use version query strings (e.g., `styles.css?v=1.x`). Increment the version when making changes that should bypass browser cache.
