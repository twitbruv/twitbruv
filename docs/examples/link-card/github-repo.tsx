import { GithubRepoCard } from "@workspace/ui/components/github-card"

export default function GithubRepoCardExample() {
	return (
		<GithubRepoCard
			url="https://github.com/vercel/next.js"
			nameWithOwner="vercel/next.js"
			description="The React Framework for the Web. Built on React 19 with support for Server Components, Actions, and more."
			stars={131000}
			forks={28100}
			primaryLanguage={{ name: "TypeScript", color: "#3178c6" }}
			topics={["react", "nextjs", "javascript", "ssr"]}
		/>
	)
}
