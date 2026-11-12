# OSM to Domains

CLI converter for **Overpass Turbo / OpenStreetMap CSV exports**. Turns map objects into unique website domains you can pass to a CMS/technology scanner such as Joomla K2 Finder.

- Node.js **18+**
- No npm packages or external APIs
- All processing is local
- Keeps source-company names, business categories, and OSM object IDs
- Normalizes `www`, deduplicates domains, and separates frequently occurring domains
- Records invalid URL values and social/marketplace links in a separate CSV

## Quick start

1. In [Overpass Turbo](https://overpass-turbo.eu/), run a query that returns businesses with website tags.
2. Export the results as **CSV**, with `website` and/or `contact:website` columns.
3. Save the file as `overpass.csv`.
4. Run:

```bash
node osm-to-domains.mjs overpass.csv
```

Optionally specify the output directory:

```bash
node osm-to-domains.mjs overpass.csv ./my-results
```

No `npm install` is required.

## Outputs

By default, the script creates `./osm-leads/`:

| File | Contents |
| --- | --- |
| `domains.txt` | All normalized unique hostnames, one per line |
| `priority-domains.txt` | Domains with fewer than 5 OSM objects; **not** a quality or technology score |
| `companies.csv` | Domain, OSM object count, company names, categories, sample URL, OSM IDs |
| `frequent-domains.csv` | Domains used by 5+ mapped objects (often chains) |
| `skipped.csv` | Invalid URLs and excluded social/marketplace links |

**Note:** OSM data is crowdsourced and may be outdated, incomplete, or contain several branches of the same company. This tool does **not** detect Joomla, K2, PHP, vulnerabilities, or whether the business is still active. Run an independent technical scan and verify every lead before contacting its owner.

## Example Overpass Turbo CSV query

Paste the query below into [Overpass Turbo](https://overpass-turbo.eu/) and run it over your current map view:

```overpassql
[out:csv(::type,::id,name,website,"contact:website",shop,office,craft,"man_made";true;",")][timeout:60];
(
  nwr["shop"]["website"]({{bbox}});
  nwr["shop"]["contact:website"]({{bbox}});
  nwr["office"="company"]["website"]({{bbox}});
  nwr["craft"]["website"]({{bbox}});
  nwr["man_made"="works"]["website"]({{bbox}});
);
out center;
```

Export using **Export → Data → raw data directly from Overpass API**, and save the response as a `.csv` file. The query returns comma-separated data and a header row. Keep the map area reasonably small to avoid Overpass timeouts.

The script accepts the `@type`/`@id` metadata column names typically seen in Overpass CSV output.

## Testing with the included example

```bash
node osm-to-domains.mjs examples/overpass-example.csv ./test-results
```

The sample should report **7 unique domains** (9 OSM records, including one invalid URL and two branches that share one domain).

## License

No license has been selected yet. The repository owner can add one if they intend to permit redistribution or modification.
