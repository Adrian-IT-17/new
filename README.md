# Seven Continents Travel & Tours

A responsive, static travel agency website built with HTML, CSS and vanilla JavaScript. There is no framework, package installation or build step. The existing GitHub Pages workflow deploys the project on pushes to `main`.

## Preview and validation

Open the project with VS Code Live Server and visit `index.html`. The shared stylesheet and script have matching version parameters on both pages to prevent an older cached animation implementation from appearing.

Run syntax and whitespace checks:

```powershell
node --check js/main.js
git diff --check
```

For rendered browser checks, run:

```powershell
node scripts/check-site.mjs
```

The dependency-free script uses installed Chrome or Edge, creates a temporary local server and disposable browser profile, and prints its results and screenshot folder. Set `CHROME_PATH` if your browser is installed elsewhere. It checks both pages at 360, 390, 768, 1024, 1280 and 1920 pixels, local assets and anchor links, mobile navigation, keyboard focus, actual button motion, gallery filters/history/lightbox (including touch swipes), reduced motion, JavaScript-disabled access and planner behavior. Configured form delivery is tested with a local browser mock; the test never sends a real enquiry.

## Content and interface

Both pages share the same header, footer and contact links. All eight original services, the mission and vision, five values, both competencies, six destination categories and eighteen gallery photographs are retained. The destination/date/traveler planner fields removed in an earlier commit are restored.

The interface uses warm ivory, deep blue and a warm accent with Playfair Display and Inter. Photography and logos come from the existing `images/` collection; no new stock imagery or third-party image URLs were added. Existing optimized WebP images are used with explicit dimensions and lazy loading below the hero.

Motion includes staged hero entrances, a slow opening photo zoom, section and photo reveals, hover/focus transitions, tap and keyboard activation feedback, animated gallery filtering and lightbox photo changes. Interactive scale/translate properties are separate from reveal transforms, preventing entrance animations from suppressing hover feedback. Native cross-document view transitions are progressive enhancements where supported; links remain regular links in other browsers. The operating system's reduced-motion preference disables animation, including scripted effects.

## Enquiry behavior

The original form only contained `YOUR_WEB3FORMS_KEY`; it was never connected to a working submission account. Until a real key is configured, the planner validates the input and copies a trip summary locally. If clipboard access is unavailable, it exposes selectable text. It explicitly says the enquiry has not been sent. Visitors can call the team or share their details using the Facebook link. Personal details are not stored in browser storage.

To enable sending, replace the hidden `access_key` value in `index.html` with the client's actual Web3Forms access key. The existing endpoint, honeypot and fields are preserved. The interface then switches to “Send inquiry”; it only confirms delivery after the endpoint returns a successful response with `success: true`. Failure preserves the visitor's text and provides direct contact alternatives.

## Business details to confirm before publication

At the user's request, contact information was restored from the first implemented website (`d80fa9a`), also present in `0c7724b`:

- Address: 2/F Bluebay Walk Metro Park, Macapagal Blvd. cor Edsa Extension, Pasay City Manila, 1300.
- Telephone: 02 8364 3904; link: `tel:+63283643904`.
- Office hours: Monday–Friday, 9:00 a.m.–5:00 p.m.
- Facebook: [sevencontinentstravelandtours](https://www.facebook.com/sevencontinentstravelandtours), displayed as 7ContinentsTT in the original.
- Instagram: [7continentsPH](https://www.instagram.com/7continentsPH/).

These are restored project details, not independently verified current business records. Older source material mentions conflicting contact details; confirm the address, telephone, social accounts and hours with the client. The map link searches for the named Bluebay Walk complex; it does not claim an exact office pin. No email address was provided, so none has been invented.

Also confirm the existing canonical domain `https://www.seven7continents.com/` before publishing elsewhere, updating both page heads, `robots.txt` and `sitemap.xml` together if it changes. No packages, prices, testimonials, awards or new business claims have been fabricated.
