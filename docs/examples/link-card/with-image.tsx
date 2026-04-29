import { LinkCard } from "@workspace/ui/components/link-card"

export default function LinkCardWithImage() {
	return (
		<LinkCard
			url="https://mahlke.design"
			title="Aaron Mahlke – Design & Engineering"
			description="I craft the surface – the part people see, hear, and interact with."
			imageUrl="/og-image.png"
			siteName="mahlke.design"
		/>
	)
}
