import { YoutubeVideoCard } from "@workspace/ui/components/youtube-card"

export default function YoutubeVideoCardExample() {
	return (
		<YoutubeVideoCard
			url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
			title="Rick Astley - Never Gonna Give You Up (Official Music Video)"
			channelTitle="Rick Astley"
			thumbnailUrl="https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
			durationSec={213}
			viewCount={1600000000}
			likeCount={16000000}
			commentCount={3200000}
		/>
	)
}
