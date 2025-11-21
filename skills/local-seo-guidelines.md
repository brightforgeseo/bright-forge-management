# Local SEO Guidelines - Bright Forge SEO

## Google Business Profile Optimization

### Profile Completion
- [ ] Business name (exact legal name)
- [ ] Complete address
- [ ] Phone number (local, trackable)
- [ ] Website URL
- [ ] Business hours (including special hours)
- [ ] Business categories (primary + secondary)
- [ ] Service areas (if applicable)
- [ ] Business description (750 characters)
- [ ] Opening date
- [ ] Attributes (women-led, LGBTQ+ friendly, etc.)

### Photos & Media
- [ ] Logo (square, minimum 720x720px)
- [ ] Cover photo (landscape, 1024x576px)
- [ ] Interior photos (minimum 3)
- [ ] Exterior photos (minimum 3)
- [ ] Team photos
- [ ] Product/service photos
- [ ] Videos (if applicable)
- [ ] Upload new photos monthly

**Photo Best Practices:**
- High resolution and well-lit
- No filters or watermarks
- Shows business accurately
- Different from competitors
- Regular updates (monthly)

### Business Information
- [ ] Products/services listed
- [ ] Menus (if restaurant)
- [ ] Appointment booking link
- [ ] Messaging enabled
- [ ] Q&A section monitored

### Posts
- [ ] Weekly posts (minimum)
- [ ] Event posts (as applicable)
- [ ] Offer posts (promotions)
- [ ] Product posts
- [ ] What's new posts

**Post Guidelines:**
- 100-300 words
- Include CTA button
- Use high-quality images
- Include keywords naturally
- Post on consistent schedule

---

## NAP Consistency

### NAP = Name, Address, Phone

**Critical Rules:**
- Must be EXACTLY the same everywhere
- Include/exclude punctuation consistently
- Use same phone number format
- Same address format (Street vs St., Suite vs Ste.)

### Where NAP Must Match
- [ ] Google Business Profile
- [ ] Website footer
- [ ] Website contact page
- [ ] All directory listings
- [ ] Social media profiles
- [ ] Citations
- [ ] Schema markup

### NAP Audit Process
1. Document official NAP format
2. Check all listings
3. Update inconsistencies
4. Monitor regularly (quarterly)

---

## Local Citations

### Top Priority Citations
- [ ] Google Business Profile
- [ ] Bing Places
- [ ] Apple Maps
- [ ] Facebook Business Page
- [ ] Yelp
- [ ] Yellow Pages
- [ ] Industry-specific directories
- [ ] Local chamber of commerce
- [ ] Local business associations

### Citation Building Process
1. **Audit existing citations**
   - Use citation finder tools
   - Document all current listings
   - Note inconsistencies

2. **Build new citations**
   - Start with top 50 general directories
   - Add industry-specific directories
   - Local directories (city-specific)
   - Quality over quantity

3. **Optimize citations**
   - Complete all fields
   - Consistent NAP
   - Add photos where possible
   - Include business description
   - Link to website

4. **Monitor citations**
   - Quarterly audit
   - Update any changes
   - Remove duplicates
   - Fix inconsistencies

---

## Local Content Strategy

### Location Pages
For businesses serving multiple locations:

**Each Location Page Should Include:**
- [ ] Unique title tag with city name
- [ ] Unique meta description with location
- [ ] Location-specific content (not duplicated)
- [ ] Embedded Google Map
- [ ] Local address and phone
- [ ] Local business hours
- [ ] Local testimonials
- [ ] Area-specific services
- [ ] Directions/parking information
- [ ] Local team members
- [ ] Photos of location

### Local Blog Content Ideas
- Local event coverage
- Local industry news
- Community involvement
- Local case studies
- City/neighborhood guides
- Local partnerships
- Local statistics/data
- "Best [service] in [city]" guides

### Location-Specific Keywords
**Target:**
- [service] + [city name]
- [service] + near me
- [service] + [neighborhood]
- best [service] + [city]
- [city] + [service provider]

---

## Reviews Management

### Review Strategy
**Goal:** Consistent flow of positive reviews

**Process:**
1. **Request reviews systematically**
   - After successful service/sale
   - Via email follow-up
   - In-person requests
   - Text message (if appropriate)

2. **Make it easy**
   - Direct link to review page
   - Step-by-step instructions
   - QR code at location
   - Multiple platform options

3. **Respond to ALL reviews**
   - Positive: Thank them, personalize
   - Negative: Address professionally, offer resolution
   - Response time: Within 24-48 hours

### Review Request Email Template

**Subject:** How was your experience with [Business Name]?

Hi [Customer Name],

Thank you for choosing [Business Name]! We hope you were pleased with [specific service].

If you have a moment, we'd really appreciate it if you could share your experience in a Google review. It only takes a minute and helps other local customers find us.

[Direct Link to Google Review Page]

Thanks again, and please don't hesitate to reach out if you need anything!

Best regards,
[Your Name]
[Business Name]

### Responding to Negative Reviews

**Template:**

Hi [Reviewer Name],

Thank you for taking the time to share your feedback. I'm sorry to hear that your experience didn't meet your expectations.

[Acknowledge specific issue they mentioned]

I'd like to make this right. Could you please contact me directly at [email/phone] so we can discuss this further?

We value your business and hope to have the opportunity to improve your experience.

Sincerely,
[Your Name]
[Title]
[Business Name]

**Never:**
- Argue or be defensive
- Ask them to remove review
- Make excuses
- Ignore the review
- Respond emotionally

---

## Local Link Building

### Local Link Opportunities
- [ ] Local chamber of commerce
- [ ] Business associations
- [ ] Local news sites
- [ ] Local blogs
- [ ] Event sponsorships
- [ ] Community organizations
- [ ] Local schools/universities
- [ ] Charity partnerships
- [ ] Local suppliers
- [ ] Local business partners

### Local Link Building Tactics
1. **Sponsor local events**
   - Get link from event page
   - Logo and link on sponsor page

2. **Join local organizations**
   - Member directory listing
   - Participation gets mentions

3. **Local PR**
   - Press releases for local news
   - Expert commentary
   - Local media mentions

4. **Community involvement**
   - Sponsor local teams
   - Charity work
   - Community events

5. **Local partnerships**
   - Cross-promotion
   - Joint events
   - Resource sharing

---

## Schema Markup for Local

### Required Schema Types

**LocalBusiness Schema:**
```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "[Business Name]",
  "image": "[Image URL]",
  "@id": "[Website URL]",
  "url": "[Website URL]",
  "telephone": "[Phone]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[Street Address]",
    "addressLocality": "[City]",
    "addressRegion": "[State/Province]",
    "postalCode": "[Postal Code]",
    "addressCountry": "[Country]"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": [Latitude],
    "longitude": [Longitude]
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      "opens": "09:00",
      "closes": "17:00"
    }
  ]
}
```

**Additional Schema:**
- Organization schema
- Review schema (aggregate rating)
- Service schema
- FAQ schema
- Breadcrumb schema

---

## Local Keyword Research

### Finding Local Keywords

**Tools:**
- Google Keyword Planner (filter by location)
- Google autocomplete
- "People also ask"
- Google Trends (by region)
- Competitor analysis (local competitors)

**Keyword Patterns:**
- [service] + [city]
- [service] + near me
- [city] + [service provider]
- best [service] + [location]
- [service] + [neighborhood]
- [service] + [landmark]

### Search Intent for Local

**Informational:**
- "plumber in [city]" - researching options
- "best restaurants [city]" - comparing

**Navigational:**
- "[business name] hours" - existing customer
- "[business name] phone" - finding contact

**Transactional:**
- "hire [service] [city]" - ready to buy
- "emergency [service] [city]" - immediate need

---

## Local Technical SEO

### On-Page Optimization
- [ ] Title tags include city name
- [ ] H1 includes city name
- [ ] Content mentions location naturally
- [ ] Local landmarks/neighborhoods mentioned
- [ ] Map embedded on contact page
- [ ] Location pages for each service area
- [ ] Click-to-call phone numbers (mobile)

### Mobile Optimization
- [ ] Responsive design
- [ ] Fast mobile load time
- [ ] Easy-to-tap buttons
- [ ] Mobile-friendly forms
- [ ] Click-to-call buttons
- [ ] Mobile-optimized maps

### Voice Search Optimization
- [ ] Conversational content
- [ ] Question-based keywords
- [ ] FAQ pages
- [ ] Natural language
- [ ] "Near me" optimization

---

## Local Competitive Analysis

### Analyze Local Competitors

**For Each Competitor:**
1. Google Business Profile
   - Categories used
   - Number of reviews
   - Average rating
   - Post frequency
   - Photo quantity/quality
   - Response to reviews

2. Local Rankings
   - Keywords they rank for
   - Their rank positions
   - Content quality
   - Domain authority

3. Local Citations
   - Where are they listed?
   - NAP consistency
   - Quality of listings

4. Local Content
   - Location-specific pages
   - Local blog content
   - Local keywords targeted

5. Local Links
   - Local directories
   - Local partnerships
   - Community involvement

---

## Local SEO Audit Checklist

### Google Business Profile
- [ ] Claimed and verified
- [ ] 100% complete
- [ ] Categories optimized
- [ ] Regular posts (weekly)
- [ ] Photos updated monthly
- [ ] Reviews responded to
- [ ] Q&A monitored

### Citations & NAP
- [ ] NAP consistent everywhere
- [ ] Listed in top 50 directories
- [ ] Industry directories complete
- [ ] No duplicate listings
- [ ] Local directories done

### On-Page
- [ ] Location in title tags
- [ ] Location in meta descriptions
- [ ] Location in H1 tags
- [ ] Location mentioned naturally
- [ ] Click-to-call buttons
- [ ] Embedded maps

### Content
- [ ] Location pages created
- [ ] Local blog content
- [ ] Service + location pages
- [ ] Local keywords targeted
- [ ] Community involvement shown

### Technical
- [ ] Schema markup implemented
- [ ] Mobile-optimized
- [ ] Fast load times
- [ ] HTTPS secure
- [ ] Mobile-friendly

### Reviews
- [ ] Review generation system
- [ ] Review response process
- [ ] Multiple platforms
- [ ] Positive review flow

### Links
- [ ] Local business listings
- [ ] Chamber of commerce
- [ ] Local partnerships
- [ ] Community involvement
- [ ] Local press mentions

---

## Tracking Local SEO Success

### Key Metrics
- Google Business Profile views
- Google Business Profile actions (calls, directions, website clicks)
- Local pack rankings
- Organic rankings for local keywords
- Reviews (quantity and rating)
- Citation consistency score
- Local organic traffic
- Conversion rate from local traffic

### Monthly Reporting
- [ ] GBP insights
- [ ] Local keyword rankings
- [ ] Review summary
- [ ] Citation status
- [ ] Local traffic metrics
- [ ] Competitor comparison

---

## Local SEO Timeline

**Month 1:**
- Set up/optimize GBP
- Audit citations
- Implement schema

**Months 2-3:**
- Build citations
- Create location content
- Start review generation

**Months 4-6:**
- Local link building
- Ongoing content
- Monitor and optimize

**Results typically visible:** 3-6 months
