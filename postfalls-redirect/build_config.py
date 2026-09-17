"""Generate permanent redirects from retired school pages to their replacements."""
import json
from pathlib import Path

BASE = "https://www.rivertechschool.com"
groups = {
    "/": ["/", "/index.html"],
    "elementary-school": ["elementary-school"],
    "middle-school": ["middle-school"],
    "high-school": ["high-school"],
    "a-la-carte": ["homeschool", "copy-of-courses-classes-1"],
    "monday-performing-arts": ["monday-musical"],
    "tuesday-science": ["tuesday-science"],
    "thursday-life-skills": ["copy-of-tuesday-science"],
    "friday-technology": ["copy-of-thursday-life"],
    "why-river-tech": ["why-river-tech", "about", "curriculum-roadmap",
        "post/where-your-child-s-gift-meets-their-future", "post/fame-meets-mit-private-school"],
    "technology": ["technology", "copy-of-technology", "robotics", "coding", "digital-arts", "design-template"],
    "performing-arts": ["performing-arts", "musical-theater"],
    "sports-fitness": ["copy-of-performing-arts"],
    "fieldtrips": ["s-projects-side-by-side", "why-river-tech/fieldtrips"],
    "reviews": ["reviews", "copy-of-references-reviews"],
    "enrollment": ["enroll", "enrollment", "research-phase", "copy-of-1-research-phase",
        "secure-your-spot", "copy-of-2-secure-your-spot", "connect-and-engage", "staff-interview",
        "application-outcome", "welcome-to-river-tech"],
    "tuition": ["tuition", "temp", "plans-pricing", "service-page/two-siblings-4-days",
        "service-page/two-5-day-sibl-in-full", "service-page/pay-in-full-4-days",
        "service-page/river-tech-599-month", "service-page/two-siblings-5-days",
        "service-page/split-cost-599-2-299-month", "service-page/river-tech-549-month",
        "service-page/two-4-day-sibl-in-full", "service-page/pay-in-full-5-days"],
    "faq": ["faq"],
    "tax-credit": ["tax-credit"],
    "school-resources": ["school-resources", "members"],
    "calendar": ["calendar"],
    "nonprofit": ["nonprofit"],
    "scholarships": ["scholarships"],
    "volunteer": ["volunteer"],
    "teach": ["careers", "career-opportunities", "community-manager-position", "qa-tester-position",
        "game-developer-position", "game-designer-position", "post/now-hiring-robotics-drone-engineering-teacher"],
}
routes = []
for target, sources in groups.items():
    destination = BASE + ("/" if target == "/" else "/pages/" + target + ".html")
    for source in sources:
        path = "/" + source.lstrip("/")
        routes.append(dict(type="redirect", source=path, destination=destination))
        if path != "/" and not path.endswith(".html"):
            routes.append(dict(type="redirect", source=path + "/", destination=destination))

# URLs that already use the replacement site's page paths keep that path.
routes.append(dict(type="redirect", source="/pages/*", destination=BASE + "/pages/*"))
config = {"services": [{
    "type": "web", "name": "postfalls-art-redirect", "runtime": "static",
    "repo": "https://github.com/rivertechschool-org/river-tech-site",
    "branch": "postfalls-redirect", "buildCommand": "true",
    "staticPublishPath": "postfalls-redirect/public", "autoDeployTrigger": "off",
    "domains": ["www.postfalls.art"], "routes": routes,
}]}
Path(__file__).with_name("render.yaml").write_text(json.dumps(config, indent=2) + "\n")
print(f"Prepared {len(routes)} permanent redirect rules.")
