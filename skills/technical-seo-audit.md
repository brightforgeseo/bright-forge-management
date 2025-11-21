# Technical SEO Audit Checklist - Bright Forge SEO

## Crawlability & Indexability

### Robots.txt
- [ ] File exists and is accessible
- [ ] Not blocking important pages
- [ ] Sitemap referenced in robots.txt
- [ ] No syntax errors
- [ ] Test with Google Search Console

### XML Sitemap
- [ ] Sitemap exists and is accessible
- [ ] All important URLs included
- [ ] No broken URLs in sitemap
- [ ] Submitted to Google Search Console
- [ ] Submitted to Bing Webmaster Tools
- [ ] Updated automatically
- [ ] Image sitemap (if applicable)
- [ ] Video sitemap (if applicable)

### Indexation
- [ ] Check site:[domain] in Google
- [ ] Compare indexed pages vs total pages
- [ ] Identify indexation issues
- [ ] Check for duplicate content
- [ ] Verify canonical tags
- [ ] Check noindex tags usage
- [ ] Review index coverage in GSC

## Site Architecture

### URL Structure
- [ ] URLs are clean and readable
- [ ] Keywords in URLs where appropriate
- [ ] No dynamic parameters (or minimal)
- [ ] Consistent URL structure
- [ ] Proper use of hyphens (not underscores)
- [ ] Lowercase URLs
- [ ] No special characters

### Navigation
- [ ] Clear site hierarchy
- [ ] Maximum 3 clicks to any page
- [ ] Breadcrumb navigation
- [ ] Footer navigation
- [ ] HTML sitemap
- [ ] Search functionality

### Internal Linking
- [ ] Strong internal link structure
- [ ] Descriptive anchor text
- [ ] No broken internal links
- [ ] Important pages well-linked
- [ ] Orphan pages identified
- [ ] Deep links to important content

## Page Speed & Performance

### Core Web Vitals
- [ ] LCP < 2.5 seconds
- [ ] FID < 100 milliseconds
- [ ] CLS < 0.1
- [ ] Check mobile and desktop

### Performance Metrics
- [ ] Page load time < 3 seconds
- [ ] Time to first byte < 600ms
- [ ] Total page size < 3MB
- [ ] HTTP requests minimized
- [ ] Render-blocking resources minimized

### Optimization
- [ ] Images compressed and optimized
- [ ] Browser caching enabled
- [ ] GZIP compression enabled
- [ ] Minified CSS/JS
- [ ] CDN implementation (if needed)
- [ ] Lazy loading images
- [ ] Critical CSS inline
- [ ] Defer non-critical JS

## Mobile Optimization

### Mobile-Friendly
- [ ] Responsive design
- [ ] Mobile-friendly test passed
- [ ] No horizontal scrolling
- [ ] Touch elements properly sized
- [ ] Text readable without zooming
- [ ] No Flash or incompatible plugins

### Mobile Usability
- [ ] Check Google Mobile-Friendly Test
- [ ] Review mobile usability in GSC
- [ ] Test on multiple devices
- [ ] Check viewport configuration
- [ ] Font sizes appropriate

## On-Page SEO

### Title Tags
- [ ] Unique on every page
- [ ] 50-60 characters
- [ ] Contains target keyword
- [ ] Compelling and descriptive
- [ ] No keyword stuffing

### Meta Descriptions
- [ ] Unique on every page
- [ ] 150-160 characters
- [ ] Contains target keyword
- [ ] Includes call-to-action
- [ ] Compelling copy

### Heading Tags
- [ ] One H1 per page
- [ ] Proper heading hierarchy (H1-H6)
- [ ] Keywords in headings (where natural)
- [ ] Descriptive and useful
- [ ] No skipping levels

### Content
- [ ] Sufficient content length
- [ ] No thin content pages
- [ ] No duplicate content
- [ ] Keywords naturally integrated
- [ ] Content matches search intent
- [ ] Updated regularly

### Images
- [ ] Alt text on all images
- [ ] Descriptive file names
- [ ] Proper image format (WebP preferred)
- [ ] Responsive images
- [ ] Compressed/optimized
- [ ] No broken images

## Security & HTTPS

### SSL Certificate
- [ ] Valid SSL certificate
- [ ] HTTPS enabled site-wide
- [ ] No mixed content warnings
- [ ] HSTS implemented
- [ ] Certificate not expiring soon

### Security Headers
- [ ] X-Content-Type-Options set
- [ ] X-Frame-Options set
- [ ] X-XSS-Protection set
- [ ] Content-Security-Policy (if applicable)

## Structured Data

### Schema Markup
- [ ] Organization schema
- [ ] Website schema
- [ ] Breadcrumb schema
- [ ] Article schema (blog posts)
- [ ] Product schema (e-commerce)
- [ ] Local business schema (if applicable)
- [ ] Review schema (if applicable)
- [ ] FAQ schema (if applicable)
- [ ] How-to schema (if applicable)
- [ ] Validate with Google Rich Results Test

## International SEO (if applicable)

### Hreflang
- [ ] Hreflang tags implemented
- [ ] Correct language codes
- [ ] Self-referencing hreflang
- [ ] Bidirectional hreflang links
- [ ] No hreflang errors in GSC

## Errors & Redirects

### Crawl Errors
- [ ] No 404 errors (or minimal)
- [ ] No 500 server errors
- [ ] No timeout errors
- [ ] Check GSC coverage report

### Redirects
- [ ] All redirects are 301 (permanent)
- [ ] No redirect chains
- [ ] No redirect loops
- [ ] Old URLs properly redirected
- [ ] HTTP to HTTPS redirects

### Broken Links
- [ ] No broken internal links
- [ ] No broken external links
- [ ] Check with Screaming Frog or similar

## Analytics & Tracking

### Google Analytics
- [ ] GA4 properly installed
- [ ] Tracking code on all pages
- [ ] Goals/conversions configured
- [ ] No duplicate tracking codes
- [ ] IP exclusion filters set
- [ ] E-commerce tracking (if applicable)

### Google Search Console
- [ ] Property verified
- [ ] All versions added (www/non-www)
- [ ] Sitemap submitted
- [ ] Regular monitoring
- [ ] Email notifications enabled

### Other Tracking
- [ ] Bing Webmaster Tools setup
- [ ] Rank tracking tool configured
- [ ] Heatmap/session recording (optional)

## Content Management

### Duplicate Content
- [ ] No duplicate title tags
- [ ] No duplicate meta descriptions
- [ ] Canonical tags properly used
- [ ] Parameter handling correct
- [ ] Pagination handled correctly
- [ ] No printer-friendly duplicates

### Low-Quality Pages
- [ ] Identify thin content pages
- [ ] No doorway pages
- [ ] No auto-generated content
- [ ] Tag/category pages optimized or noindexed

## Local SEO (if applicable)

### Google Business Profile
- [ ] Claimed and verified
- [ ] Complete information
- [ ] Consistent NAP (Name, Address, Phone)
- [ ] Categories selected
- [ ] Photos added
- [ ] Regular posts
- [ ] Reviews management

### Local Citations
- [ ] NAP consistent across web
- [ ] Listed in relevant directories
- [ ] Local schema markup

## Advanced Technical

### Log File Analysis
- [ ] Review server logs
- [ ] Identify crawl budget issues
- [ ] Check for crawl errors
- [ ] Monitor bot behavior

### JavaScript SEO
- [ ] Dynamic content crawlable
- [ ] Test with Google Mobile-Friendly Test
- [ ] Check rendering in GSC
- [ ] Critical content not hidden
- [ ] Pre-rendering/SSR if needed

### Pagination
- [ ] Proper pagination structure
- [ ] Rel="next" and rel="prev" (optional)
- [ ] Canonical tags on paginated pages
- [ ] View All page (if applicable)

## Priority Recommendations

After completing audit, categorize issues:

### Critical (Fix Immediately)
- [ ] [List critical issues]
- [ ] [Estimated impact: High]
- [ ] [Effort: X hours]

### High Priority (Fix Within 2 Weeks)
- [ ] [List high priority issues]
- [ ] [Estimated impact: Medium-High]
- [ ] [Effort: X hours]

### Medium Priority (Fix Within 1 Month)
- [ ] [List medium priority issues]
- [ ] [Estimated impact: Medium]
- [ ] [Effort: X hours]

### Low Priority (Nice to Have)
- [ ] [List low priority issues]
- [ ] [Estimated impact: Low]
- [ ] [Effort: X hours]

## Tools Used
- Google Search Console
- Google Analytics
- Screaming Frog SEO Spider
- GTmetrix / PageSpeed Insights
- Mobile-Friendly Test
- Structured Data Testing Tool
- Ahrefs/SEMrush (optional)

## Audit Date: [Date]
## Auditor: [Name]
## Client: [Client Name]
## Website: [URL]
