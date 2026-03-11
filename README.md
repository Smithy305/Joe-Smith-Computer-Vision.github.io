# Joe-Smith-Computer-Vision.github.io
My Website

## Blog workflow

- Blog landing page: `blog/index.html`
- Blog posts live in: `blog/posts/`
- Post template: `blog/templates/post-template.html`

Create a new post:

```bash
./scripts/new-blog-post.sh "Your Post Title" 2026-03-11 6
```

Then:

1. Fill in the generated post content.
2. Add a post card to `blog/index.html`.
3. Optionally add it to the featured blog cards in `index.html`.
