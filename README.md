# WSDC Event Results Analyzer

Professional-grade user interface for loading, analyzing, and validating results from scoring.dance with WSDC RPSS algorithm verification.

## Features

### Core Features
- ✅ Load results via direct link to scoring.dance
- ✅ **WSDC RPSS Algorithm** - Full implementation of Relative Placement Scoring System
- ✅ **Automatic verification** - Compare official results with calculated placements
- ✅ Visual indicators for matching/mismatching placements (green ✓ / red ✗)
- ✅ Detailed calculation info (k-value, majority count, tie-breaks)
- ✅ Automatic JSON-LD data parsing from page
- ✅ Complete event information (name, date, location, judges, scoring system)

### Code Quality
- ✅ **Modular architecture** - Functions under 50 lines
- ✅ **URL validation** - Only accepts scoring.dance URLs
- ✅ **Error handling** - User-friendly error messages
- ✅ **DEV_MODE toggle** - Clean console in production
- ✅ **CSS variables** - Consistent theming
- ✅ **Mobile responsive** - Works on all devices

### Accessibility
- ✅ **ARIA labels** - Screen reader support
- ✅ **Keyboard navigation** - Full keyboard accessibility
- ✅ **Semantic HTML** - Proper table structure with caption
- ✅ **Color contrast** - WCAG compliant
- ✅ **Focus indicators** - Clear visual feedback

### UX Enhancements
- ✅ Auto-hide success messages (5 seconds)
- ✅ Debounced input (500ms)
- ✅ Loading states with spinner
- ✅ Color-coded placements (gold, silver, bronze)
- ✅ Medal indicators for top 3 places

## Usage

1. Open `index.html` file in your browser
2. Paste a link to results from scoring.dance (e.g., `https://scoring.dance/plPL/events/324/results/4758.html`)
3. Click "Load" or press Enter
4. Data will be fetched, analyzed, and displayed
5. Check "Calc Place" column to verify RPSS calculations

## Technology

- **Alpine.js 3.x** - Reactive JavaScript framework (Alpine.data pattern)
- **WSDC RPSS Algorithm** - Official Relative Placement Scoring System
- **CORS Proxy** - Automatic fallback if direct fetch fails
- **JSON-LD parsing** - Extracting structured data from scoring.dance
- **Modern CSS** - CSS Variables, Grid, Flexbox
- **Vanilla JavaScript** - No build tools required

## Example Links

- https://scoring.dance/plPL/events/324/results/4758.html
- https://scoring.dance/enUS/events/324/results/4758.html

## Data Structure

After loading, data is available in the application as:

```javascript
{
  eventInfo: {
    name: "Warsaw Halloween Swing 2025",
    category: "Newcomer Jack&Jill final",
    date: "10/30/2025",
    location: "Warszawa, Polska",
    judges: "judges list",
    calculationModel: "Majority System"
  },
  results: [
    {
      place: 1,
      leader: "First Last",
      leaderBib: "318",
      follower: "First Last",
      followerBib: "256",
      scores: {
        "Judge 1": 1,
        "Judge 2": 2,
        // ...
      }
    }
  ]
}
```

## Future Development

This application is a foundation for further work with data - you can easily add:
- Export to CSV/Excel
- Statistics and charts
- Comparing results
- Filtering and sorting
- Judge scoring analysis
