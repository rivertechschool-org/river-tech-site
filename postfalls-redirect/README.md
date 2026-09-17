# postfalls.art redirects

This isolated branch serves permanent redirects from the retired Wix school pages to their current River Tech School equivalents. It does not deploy or change the main school website or the living-world service.

Render blueprint: `postfalls-redirect/render.yaml`. Publish only `postfalls-redirect/public`.

There must be no `index.html` in the published directory: Render serves existing files before applying redirects, so an index file would prevent the homepage redirect.

Update `build_config.py` and run it to regenerate the blueprint. Deploy deliberately; automatic deployments are off. Unmapped pages return 404 rather than sending unrelated searches to the homepage. Existing Wix pages remain in the Wix account.

Keep postfalls.art registered and maintain these redirects for at least a year, preferably indefinitely. Preserve all email records and other subdomains when changing the web DNS records.
