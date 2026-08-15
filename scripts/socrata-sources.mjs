// Per-region config for the generic Socrata ingestion adapter.
// NYC Open Data and Oregon's data.oregon.gov both run Socrata, so the same
// adapter (ingest-socrata.mjs) covers both regions off one config entry each.
//
// categoryMap only lists categories worth showing on a "nearby nature" map.
// Any dataset category not listed here is skipped, not dumped into "other" —
// NYC's Parks Properties dataset includes ~1000 rows of playgrounds, traffic
// triangles, and maintenance lots that would clutter the map without adding
// real nature value.

export const SOCRATA_SOURCES = {
  nyc: {
    domain: "data.cityofnewyork.us",
    datasetId: "enfh-gkve", // Parks Properties
    idField: "objectid",
    nameFields: ["name311", "signname"],
    geometryField: "multipolygon",
    categoryField: "typecategory",
    categoryMap: {
      "Community Park": "park",
      "Flagship Park": "park",
      "Neighborhood Park": "park",
      "Nature Area": "park",
      "Parkway": "park",
      "Mall": "park",
      "Waterfront Facility": "park",
      "Historic House Park": "park",
      "Garden": "garden",
    },
  },
};
