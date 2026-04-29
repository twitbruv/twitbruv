import { XStatusCard } from "@workspace/ui/components/x-status-card"

export default function XStatusCardExample() {
	return (
		<XStatusCard
			url="https://x.com/rauchg/status/1234"
			text="Vercel just deployed its 1 billionth build. What a ride."
			authorScreenName="rauchg"
			authorName="Guillermo Rauch"
			authorVerified
			replies={342}
			retweets={1200}
			likes={8400}
			quotes={89}
			views={1200000}
			createdAt="2026-04-28T14:30:00Z"
		/>
	)
}
