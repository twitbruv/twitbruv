export function CharacterRing({ used, max }: { used: number; max: number }) {
	const radius = 6
	const circumference = 2 * Math.PI * radius
	const pct = Math.min(used / max, 1)
	const dash = circumference * pct
	const remaining = max - used

	let colorClass = "text-tertiary"
	if (remaining < 0) {
		colorClass = "text-danger"
	} else if (remaining < 20) {
		colorClass = "text-warn"
	}

	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			className={`shrink-0 -rotate-90 ${colorClass}`}
		>
			<circle
				cx="8"
				cy="8"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				opacity="0.15"
			/>
			<circle
				cx="8"
				cy="8"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray={`${dash} ${circumference}`}
				strokeDashoffset="0"
				strokeLinecap="round"
			/>
		</svg>
	)
}
