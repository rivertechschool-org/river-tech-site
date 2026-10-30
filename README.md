# Ask River Tech pilot

Astra answers from the public River Tech website, streamed to the browser.

Deploy the Docker service defined in render.yaml. Use one instance and the mounted /var/data disk. Set OPENAI_API_KEY privately in Render; never commit it. ASK_VISITOR_SALT is generated privately. ASK_PUBLIC_ORIGIN must match the actual HTTPS address.

Dan approved hosting up to $10/month, API usage up to $25/month and $5/day on October 30, 2026. Configure ASK_MONTHLY_USD=25 and ASK_DAILY_USD=5. Defaults allow five concurrent answers, five questions per minute and twenty per day per public IP. Do not enable autoscaling.

Deploy only this allowlisted branch; the main school website and private development pages are separate. Source refresh reads only public school pages and approved public documents. Sources expire after seven days; failed refresh preserves the last good index.

Before inviting families: verify HTTPS, streaming through Render, trustworthy CF-Connecting-IP, restart-persistent limits, source refresh and real answer reliability. No claims of hosted verification follow solely from local tests.
