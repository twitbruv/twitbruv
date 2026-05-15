/**
 * Development-only seed endpoint. Creates fake users, posts with images,
 * replies, reposts, quote tweets, likes, and follows. Also creates a few
 * posts for the currently authenticated user.
 *
 * POST /api/dev/seed
 *
 * Returns 404 when NODE_ENV !== "development".
 */

import { Hono } from "hono"
import { eq, sql, inArray } from "@workspace/db"
import { schema } from "@workspace/db"
import { putObject } from "@workspace/media/s3"
import { requireAuth, type HonoEnv } from "../middleware/session.ts"

export const devRoute = new Hono<HonoEnv>()

// ---------------------------------------------------------------------------
// Seed images (Unsplash)
// ---------------------------------------------------------------------------

const SEED_IMAGES = [
	{ key: "seed/code-desk.jpg", url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&h=800&fit=crop&q=80", alt: "laptop on desk with code", w: 1200, h: 800 },
	{ key: "seed/sunset.jpg", url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&h=800&fit=crop&q=80", alt: "mountain sunset landscape", w: 1200, h: 800 },
	{ key: "seed/coffee.jpg", url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&h=800&fit=crop&q=80", alt: "cup of coffee on table", w: 1200, h: 800 },
	{ key: "seed/keyboard.jpg", url: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=1200&h=800&fit=crop&q=80", alt: "mechanical keyboard", w: 1200, h: 800 },
	{ key: "seed/plants.jpg", url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=1200&h=800&fit=crop&q=80", alt: "indoor plants on shelf", w: 1200, h: 800 },
	{ key: "seed/architecture.jpg", url: "https://images.unsplash.com/photo-1486718448742-163732cd1544?w=1200&h=800&fit=crop&q=80", alt: "modern architecture", w: 1200, h: 800 },
	{ key: "seed/desk-minimal.jpg", url: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&h=800&fit=crop&q=80", alt: "minimal desk setup", w: 1200, h: 800 },
	{ key: "seed/city-night.jpg", url: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200&h=800&fit=crop&q=80", alt: "city at night", w: 1200, h: 800 },
]

// ---------------------------------------------------------------------------
// Seed users
// ---------------------------------------------------------------------------

const SEED_USERS = [
	{ email: "alice@seed.local", handle: "alice", displayName: "Alice Chen", bio: "building things on the internet. design engineering. prev @stripe" },
	{ email: "bob@seed.local", handle: "bob", displayName: "Bob Park", bio: "swe. rust, go, typescript. opinions are my own" },
	{ email: "carol@seed.local", handle: "carol", displayName: "Carol Reeves", bio: "product designer. making interfaces that feel right" },
	{ email: "dave@seed.local", handle: "dave", displayName: "Dave Kim", bio: "lurking" },
	{ email: "eve@seed.local", handle: "eve", displayName: "Eve Martinez", bio: "open source maintainer. coffee enthusiast. she/her" },
]

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

devRoute.post("/seed", requireAuth(), async (c) => {
	const ctx = c.get("ctx")
	if (ctx.env.NODE_ENV !== "development") return c.notFound()

	const session = c.get("session")!
	const currentUserId = session.user.id
	const db = ctx.db
	const ago = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000)

	// ─── 1. Upsert seed users ────────────────────────────────────────────

	await db
		.insert(schema.users)
		.values(SEED_USERS.map((u) => ({
			email: u.email,
			handle: u.handle,
			displayName: u.displayName,
			name: u.displayName,
			bio: u.bio,
			emailVerified: true,
		})))
		.onConflictDoNothing({ target: schema.users.email })

	const seededUsers = await db
		.select({ id: schema.users.id, handle: schema.users.handle })
		.from(schema.users)
		.where(inArray(schema.users.email, SEED_USERS.map((u) => u.email)))

	const userMap = new Map(seededUsers.map((u) => [u.handle!, u.id]))
	const alice = userMap.get("alice")!
	const bob = userMap.get("bob")!
	const carol = userMap.get("carol")!
	const dave = userMap.get("dave")!
	const eve = userMap.get("eve")!

	// ─── 2. Upload images to S3 ──────────────────────────────────────────

	const mediaIds: string[] = []
	for (const img of SEED_IMAGES) {
		try {
			const res = await fetch(img.url)
			if (!res.ok) continue
			const buf = new Uint8Array(await res.arrayBuffer())

			await putObject({
				s3: ctx.s3,
				bucket: ctx.mediaEnv.S3_BUCKET,
				key: img.key,
				body: buf,
				contentType: "image/jpeg",
			})

			const [inserted] = await db
				.insert(schema.media)
				.values({
					ownerId: alice,
					kind: "image",
					originalKey: img.key,
					mimeType: "image/jpeg",
					width: img.w,
					height: img.h,
					altText: img.alt,
					processingState: "ready",
					variants: [
						{ kind: "medium", key: img.key, width: img.w, height: img.h },
						{ kind: "thumb", key: img.key, width: 400, height: Math.round(400 * (img.h / img.w)) },
					],
				})
				.returning({ id: schema.media.id })
			if (inserted) mediaIds.push(inserted.id)
		} catch {
			// Skip failed image uploads
		}
	}

	// ─── 3. Helper to insert posts ──────────────────────────────────────

	async function createPost(opts: {
		authorId: string
		text: string
		minutesAgo: number
		replyToId?: string
		quoteOfId?: string
		repostOfId?: string
		rootId?: string
		conversationDepth?: number
		mediaIndex?: number[]
	}) {
		const rows = await db
			.insert(schema.posts)
			.values({
				authorId: opts.authorId,
				text: opts.text,
				createdAt: ago(opts.minutesAgo),
				replyToId: opts.replyToId,
				quoteOfId: opts.quoteOfId,
				repostOfId: opts.repostOfId,
				rootId: opts.rootId,
				conversationDepth: opts.conversationDepth ?? 0,
			})
			.returning({ id: schema.posts.id })

		const postId = rows[0]!.id

		// Attach media
		if (opts.mediaIndex) {
			for (let i = 0; i < opts.mediaIndex.length; i++) {
				const idx = opts.mediaIndex[i]
				if (idx === undefined) continue
				const mid = mediaIds[idx]
				if (mid) {
					await db.insert(schema.postMedia).values({ postId, mediaId: mid, position: i })
				}
			}
		}

		return postId
	}

	// ─── 4. Seed posts from fake users ──────────────────────────────────

	const p1 = await createPost({ authorId: alice, text: "just shipped a new component library for our design system. took three months of iteration but the API surface is finally clean. sometimes the best work is what you remove, not what you add.", minutesAgo: 0 })
	const p2 = await createPost({ authorId: bob, text: "hot take: most \"best practices\" in software engineering are just cargo cult patterns that made sense in a specific context and got generalized way too aggressively", minutesAgo: 2 })
	const p3 = await createPost({ authorId: carol, text: "spent the morning redesigning our onboarding flow. reduced the steps from 7 to 3. the trick was realizing we were asking for information we could infer later.", minutesAgo: 5 })
	const p4 = await createPost({ authorId: alice, text: "new desk setup. minimal vibes only.", minutesAgo: 8, mediaIndex: [6] })
	const p5 = await createPost({ authorId: carol, text: "some shots from this weekend. the light was perfect.", minutesAgo: 12, mediaIndex: [1, 5, 7] })
	const p6 = await createPost({ authorId: dave, text: "nice", minutesAgo: 15 })
	const p7 = await createPost({ authorId: alice, text: "the gap between \"works on my machine\" and \"works in production\" is where 80% of engineering effort goes.\n\nmost of what makes software hard is not the code. the network is unreliable, the database has latency, the user has a slow phone.\n\nyou can write perfect code and still have a broken product.", minutesAgo: 20 })
	const p8 = await createPost({ authorId: eve, text: "released v2.0 of the CLI today. biggest change: we dropped the config file entirely. everything is flags now. migration guide in the thread.", minutesAgo: 25 })
	const p9 = await createPost({ authorId: bob, text: "debugging a race condition in our WebSocket handler. the bug only reproduces under load with >500 concurrent connections. this is fine.", minutesAgo: 30 })
	const p10 = await createPost({ authorId: eve, text: "morning coffee and code. best way to start the day.", minutesAgo: 40, mediaIndex: [2] })
	const p11 = await createPost({ authorId: carol, text: "people underestimate how much good typography matters. swapped our body font from system-ui to Inter and the perceived quality of the whole app went up. no other changes.", minutesAgo: 50 })
	const p12 = await createPost({ authorId: bob, text: "wrote a blog post about why we moved from microservices back to a monolith. tl;dr: the network is not reliable, latency adds up, and we had 4 engineers maintaining 23 services.", minutesAgo: 60 })
	const p13 = await createPost({ authorId: alice, text: "new keyboard arrived. the thock is immaculate.", minutesAgo: 75, mediaIndex: [3] })
	const p14 = await createPost({ authorId: eve, text: "open source maintenance is a weird job. you wake up to 47 notifications, 3 bug reports, and someone telling you your life's work is \"mid\". then you fix the bugs because you care.", minutesAgo: 90 })
	const p15 = await createPost({ authorId: dave, text: "been lurking on this platform for a week. vibes are good. might actually start posting.", minutesAgo: 120 })
	const p16 = await createPost({ authorId: bob, text: "before and after. code cleanup makes such a difference.", minutesAgo: 150, mediaIndex: [0, 4] })

	// ─── 5. Replies (nested) ────────────────────────────────────────────

	const r1 = await createPost({ authorId: bob, text: "congrats! what made you decide to go with the compound component pattern?", minutesAgo: 1, replyToId: p1, rootId: p1, conversationDepth: 1 })
	const r2 = await createPost({ authorId: alice, text: "readability mostly. when you see <Card.Header> it is immediately obvious what it does and where it belongs.", minutesAgo: 1, replyToId: r1, rootId: p1, conversationDepth: 2 })
	const r3 = await createPost({ authorId: carol, text: "agree with this approach. we did the same and our component docs became way easier to write too.", minutesAgo: 0, replyToId: r2, rootId: p1, conversationDepth: 3 })
	await createPost({ authorId: eve, text: "the API surface part is so true. we spent 6 weeks just on the props interface for our Button component alone.", minutesAgo: 1, replyToId: p1, rootId: p1, conversationDepth: 1 })
	await createPost({ authorId: carol, text: "not even a hot take. this is just true.", minutesAgo: 3, replyToId: p2, rootId: p2, conversationDepth: 1 })
	await createPost({ authorId: dave, text: "based", minutesAgo: 3, replyToId: p2, rootId: p2, conversationDepth: 1 })
	const r7 = await createPost({ authorId: alice, text: "dropping the config file is bold. how are people migrating?", minutesAgo: 22, replyToId: p8, rootId: p8, conversationDepth: 1 })
	const r8 = await createPost({ authorId: eve, text: "we wrote a codemod that converts the JSON config to CLI flags. runs in about 2 seconds.", minutesAgo: 21, replyToId: r7, rootId: p8, conversationDepth: 2 })
	await createPost({ authorId: bob, text: "this is the way. config files are where developer experience goes to die.", minutesAgo: 21, replyToId: r8, rootId: p8, conversationDepth: 3 })

	// ─── 5b. Deep thread: design systems debate ───────────────────────

	const dt1 = await createPost({ authorId: bob, text: "controversial opinion: design tokens are overengineered for 90% of products. just use CSS variables and move on with your life.", minutesAgo: 180 })
	const dt2 = await createPost({ authorId: alice, text: "hard disagree. design tokens aren't about the tech — they're about having a shared language between design and engineering. CSS variables don't give you that.", minutesAgo: 178, replyToId: dt1, rootId: dt1, conversationDepth: 1 })
	const dt3 = await createPost({ authorId: carol, text: "alice is right. we tried the \"just CSS variables\" approach and ended up with 400+ variables that nobody could find or remember. tokens with proper naming = searchability.", minutesAgo: 175, replyToId: dt2, rootId: dt1, conversationDepth: 2 })
	const dt4 = await createPost({ authorId: bob, text: "ok but how many of those 400 variables did you actually need? sounds like the problem was not having a system, not the lack of tokens.", minutesAgo: 172, replyToId: dt3, rootId: dt1, conversationDepth: 3 })
	const dt5 = await createPost({ authorId: eve, text: "I think the real answer is: it depends on your team size. 2-3 engineers? CSS variables are fine. 10+ engineers across multiple platforms? you need tokens.", minutesAgo: 170, replyToId: dt4, rootId: dt1, conversationDepth: 4 })
	const dt6 = await createPost({ authorId: alice, text: "this. we have web, iOS, and Android all consuming the same token set. try doing that with CSS variables.", minutesAgo: 168, replyToId: dt5, rootId: dt1, conversationDepth: 5 })
	const dt7 = await createPost({ authorId: dave, text: "just use tailwind", minutesAgo: 167, replyToId: dt6, rootId: dt1, conversationDepth: 6 })
	const dt8 = await createPost({ authorId: bob, text: "lmao dave with the nuclear take", minutesAgo: 166, replyToId: dt7, rootId: dt1, conversationDepth: 7 })
	await createPost({ authorId: carol, text: "dave woke up and chose violence today", minutesAgo: 165, replyToId: dt7, rootId: dt1, conversationDepth: 7 })

	// Branch off dt2 — side discussion about naming conventions
	const dt_b1 = await createPost({ authorId: eve, text: "the naming part is actually the hardest part. do you go semantic (color-primary) or descriptive (blue-500)?", minutesAgo: 176, replyToId: dt2, rootId: dt1, conversationDepth: 2 })
	const dt_b2 = await createPost({ authorId: alice, text: "semantic for anything consumer-facing. descriptive for the scale definitions. so you have blue-500 in your primitives and color-primary maps to it.", minutesAgo: 174, replyToId: dt_b1, rootId: dt1, conversationDepth: 3 })
	await createPost({ authorId: bob, text: "we do the same. two layers: raw scale + semantic aliases. works well across themes too.", minutesAgo: 173, replyToId: dt_b2, rootId: dt1, conversationDepth: 4 })
	await createPost({ authorId: carol, text: "this is exactly how we set it up. changed our lives. dark mode went from 2 weeks to 2 hours.", minutesAgo: 171, replyToId: dt_b2, rootId: dt1, conversationDepth: 4 })

	// Branch off dt1 — different angle
	await createPost({ authorId: dave, text: "genuinely curious — what do you use for your design system?", minutesAgo: 179, replyToId: dt1, rootId: dt1, conversationDepth: 1 })

	// ─── 5c. Deep thread: deployment horror story ──────────────────────

	const dp1 = await createPost({ authorId: eve, text: "storytime: our deploy pipeline went down at 2am. what followed was the most chaotic 4 hours of my career. thread 🧵", minutesAgo: 300 })
	const dp2 = await createPost({ authorId: eve, text: "so our CD system uses a custom Kubernetes operator. turns out someone merged a PR that changed the CRD schema without updating the operator. deployments just... stopped.", minutesAgo: 298, replyToId: dp1, rootId: dp1, conversationDepth: 1 })
	const dp3 = await createPost({ authorId: eve, text: "we didn't notice for 3 hours because the monitoring was also deployed via the same pipeline. monitoring was stuck on the old version. no alerts fired.", minutesAgo: 296, replyToId: dp2, rootId: dp1, conversationDepth: 2 })
	const dp4 = await createPost({ authorId: eve, text: "by the time we figured it out, there were 47 queued deployments. rolling them all forward at once caused a cascading OOM across the cluster.", minutesAgo: 294, replyToId: dp3, rootId: dp1, conversationDepth: 3 })
	const dp5 = await createPost({ authorId: eve, text: "lesson learned: never deploy your monitoring through the same pipeline as your application. and always have a manual escape hatch.", minutesAgo: 292, replyToId: dp4, rootId: dp1, conversationDepth: 4 })
	await createPost({ authorId: bob, text: "we had almost the exact same thing happen. our fix was a simple cron job that checks if deployments are stuck and pages on-call. saved us twice since.", minutesAgo: 290, replyToId: dp5, rootId: dp1, conversationDepth: 5 })
	await createPost({ authorId: alice, text: "the monitoring monitoring the monitoring. it's turtles all the way down.", minutesAgo: 289, replyToId: dp5, rootId: dp1, conversationDepth: 5 })

	// Branch off dp2 — people sharing similar experiences
	const dp_b1 = await createPost({ authorId: bob, text: "CRD schema changes are terrifying. we now have a CI check that diffs the CRD and blocks the PR if the operator isn't updated too.", minutesAgo: 297, replyToId: dp2, rootId: dp1, conversationDepth: 2 })
	await createPost({ authorId: eve, text: "that's smart. we've added something similar since. also made the operator backwards compatible so old CRDs still work.", minutesAgo: 295, replyToId: dp_b1, rootId: dp1, conversationDepth: 3 })

	// Branch off dp3 — discussion about monitoring
	const dp_b2 = await createPost({ authorId: carol, text: "this is why we run our monitoring completely separately. different cluster, different cloud account, different deploy pipeline.", minutesAgo: 295, replyToId: dp3, rootId: dp1, conversationDepth: 3 })
	await createPost({ authorId: alice, text: "same. and we have a dead-simple health check that runs from a lambda every 30 seconds. if it doesn't get a 200 from the monitoring API, it pages.", minutesAgo: 293, replyToId: dp_b2, rootId: dp1, conversationDepth: 4 })
	await createPost({ authorId: dave, text: "we just use uptime robot for this lol", minutesAgo: 291, replyToId: dp_b2, rootId: dp1, conversationDepth: 4 })

	// ─── 5d. Thread: quick back-and-forth ──────────────────────────────

	const qb1 = await createPost({ authorId: carol, text: "what's everyone's go-to monospace font for coding? I've been using JetBrains Mono but thinking about switching.", minutesAgo: 100 })
	const qb2 = await createPost({ authorId: alice, text: "Berkeley Mono. worth every penny.", minutesAgo: 99, replyToId: qb1, rootId: qb1, conversationDepth: 1 })
	const qb3 = await createPost({ authorId: bob, text: "Fira Code. free, ligatures are nice, and it's been reliable for years.", minutesAgo: 98, replyToId: qb1, rootId: qb1, conversationDepth: 1 })
	const qb4 = await createPost({ authorId: dave, text: "comic sans", minutesAgo: 97, replyToId: qb1, rootId: qb1, conversationDepth: 1 })
	await createPost({ authorId: eve, text: "Monaspace Neon. the texture healing feature is genuinely useful.", minutesAgo: 96, replyToId: qb1, rootId: qb1, conversationDepth: 1 })
	await createPost({ authorId: carol, text: "dave I'm going to block you", minutesAgo: 96, replyToId: qb4, rootId: qb1, conversationDepth: 2 })
	await createPost({ authorId: dave, text: "you joke but Comic Mono (the monospace fork) is actually surprisingly readable", minutesAgo: 95, replyToId: qb4, rootId: qb1, conversationDepth: 2 })
	await createPost({ authorId: alice, text: "I tried it ironically and now I actually like it. what is happening to me.", minutesAgo: 94, replyToId: qb4, rootId: qb1, conversationDepth: 2 })
	await createPost({ authorId: carol, text: "ooh I hadn't seen Berkeley Mono. that italic is gorgeous.", minutesAgo: 98, replyToId: qb2, rootId: qb1, conversationDepth: 2 })
	await createPost({ authorId: bob, text: "tried Monaspace — the argon variant with the wider spacing is really nice for presentations.", minutesAgo: 93, replyToId: qb1, rootId: qb1, conversationDepth: 1 })

	// ─── 6. Reposts ─────────────────────────────────────────────────────

	await createPost({ authorId: bob, text: "", minutesAgo: 1, repostOfId: p1 })
	await createPost({ authorId: eve, text: "", minutesAgo: 7, repostOfId: p3 })
	await createPost({ authorId: dave, text: "", minutesAgo: 4, repostOfId: p2 })
	await createPost({ authorId: carol, text: "", minutesAgo: 160, repostOfId: dt1 })
	await createPost({ authorId: alice, text: "", minutesAgo: 280, repostOfId: dp1 })

	// ─── 7. Quote tweets ────────────────────────────────────────────────

	await createPost({ authorId: carol, text: "this is why I always say: design the API first, build the implementation second. if the API feels wrong, the implementation will never feel right.", minutesAgo: 0, quoteOfId: p1 })
	await createPost({ authorId: alice, text: "this is exactly the kind of bold product decision more tools need. flags > files when the option count is small.", minutesAgo: 24, quoteOfId: p8 })
	await createPost({ authorId: bob, text: "required reading for anyone running infrastructure. the monitoring part is chef's kiss.", minutesAgo: 285, quoteOfId: dp1 })
	await createPost({ authorId: dave, text: "the correct answer is obviously comic sans", minutesAgo: 95, quoteOfId: qb1 })

	// ─── 8. Posts for the current user ──────────────────────────────────

	const cu1 = await createPost({ authorId: currentUserId, text: "just getting started here. building something cool.", minutesAgo: 10 })
	const cu2 = await createPost({ authorId: currentUserId, text: "shipped a big update today. feels good to finally get this out the door.", minutesAgo: 25, mediaIndex: [0] })
	const cu3 = await createPost({ authorId: currentUserId, text: "anyone else spend more time configuring their dev environment than actually writing code?", minutesAgo: 45 })
	const cu4 = await createPost({ authorId: currentUserId, text: "new setup who dis", minutesAgo: 60, mediaIndex: [6] })
	const cu5 = await createPost({ authorId: currentUserId, text: "hot take: the best code is the code you delete", minutesAgo: 100 })

	// Seed users reply to current user's posts
	const cuR1 = await createPost({ authorId: alice, text: "welcome! excited to see what you build.", minutesAgo: 9, replyToId: cu1, rootId: cu1, conversationDepth: 1 })
	await createPost({ authorId: bob, text: "following!", minutesAgo: 9, replyToId: cu1, rootId: cu1, conversationDepth: 1 })
	await createPost({ authorId: carol, text: "that desk setup is clean! what monitor is that?", minutesAgo: 55, replyToId: cu4, rootId: cu4, conversationDepth: 1 })
	await createPost({ authorId: eve, text: "not a hot take, just facts. we deleted 40% of our codebase last quarter and everything runs better.", minutesAgo: 95, replyToId: cu5, rootId: cu5, conversationDepth: 1 })
	await createPost({ authorId: bob, text: "congrats on the launch! what stack are you using?", minutesAgo: 23, replyToId: cu2, rootId: cu2, conversationDepth: 1 })
	await createPost({ authorId: dave, text: "yes. every single day.", minutesAgo: 40, replyToId: cu3, rootId: cu3, conversationDepth: 1 })

	// Seed users quote current user's posts
	await createPost({ authorId: alice, text: "couldn't agree more. simplicity is the ultimate sophistication.", minutesAgo: 90, quoteOfId: cu5 })

	// Seed users repost current user's posts
	await createPost({ authorId: bob, text: "", minutesAgo: 50, repostOfId: cu4 })
	await createPost({ authorId: eve, text: "", minutesAgo: 85, repostOfId: cu5 })

	// ─── 9. Likes ───────────────────────────────────────────────────────

	const likePairs = [
		{ userId: bob, postId: p1 }, { userId: carol, postId: p1 }, { userId: eve, postId: p1 }, { userId: dave, postId: p1 },
		{ userId: alice, postId: p2 }, { userId: carol, postId: p2 }, { userId: dave, postId: p2 },
		{ userId: alice, postId: p3 }, { userId: bob, postId: p3 }, { userId: eve, postId: p3 },
		{ userId: carol, postId: p4 }, { userId: bob, postId: p4 },
		{ userId: alice, postId: p5 }, { userId: eve, postId: p5 },
		{ userId: bob, postId: p7 }, { userId: carol, postId: p7 }, { userId: eve, postId: p7 },
		{ userId: alice, postId: p8 }, { userId: bob, postId: p8 }, { userId: carol, postId: p8 },
		{ userId: alice, postId: p14 }, { userId: bob, postId: p14 }, { userId: carol, postId: p14 },
		{ userId: alice, postId: p11 }, { userId: bob, postId: p11 },
		// Likes on current user's posts
		{ userId: alice, postId: cu1 }, { userId: bob, postId: cu1 }, { userId: carol, postId: cu1 },
		{ userId: alice, postId: cu2 }, { userId: bob, postId: cu2 }, { userId: eve, postId: cu2 },
		{ userId: carol, postId: cu3 }, { userId: dave, postId: cu3 },
		{ userId: alice, postId: cu4 }, { userId: bob, postId: cu4 }, { userId: carol, postId: cu4 }, { userId: eve, postId: cu4 },
		{ userId: alice, postId: cu5 }, { userId: bob, postId: cu5 }, { userId: carol, postId: cu5 }, { userId: dave, postId: cu5 }, { userId: eve, postId: cu5 },
		// Current user likes some posts
		{ userId: currentUserId, postId: p1 }, { userId: currentUserId, postId: p5 }, { userId: currentUserId, postId: p14 },
		// Likes on deep threads
		{ userId: alice, postId: dt1 }, { userId: carol, postId: dt1 }, { userId: eve, postId: dt1 },
		{ userId: bob, postId: dt2 }, { userId: carol, postId: dt3 }, { userId: eve, postId: dt4 },
		{ userId: alice, postId: dt5 }, { userId: bob, postId: dt5 }, { userId: carol, postId: dt5 },
		{ userId: alice, postId: dt7 }, { userId: bob, postId: dt7 }, { userId: carol, postId: dt7 }, { userId: eve, postId: dt7 },
		{ userId: bob, postId: dt8 },
		{ userId: alice, postId: dp1 }, { userId: bob, postId: dp1 }, { userId: carol, postId: dp1 }, { userId: dave, postId: dp1 },
		{ userId: alice, postId: dp5 }, { userId: bob, postId: dp5 },
		{ userId: alice, postId: qb1 }, { userId: bob, postId: qb1 }, { userId: eve, postId: qb1 },
		{ userId: carol, postId: qb4 }, { userId: eve, postId: qb4 },
		{ userId: currentUserId, postId: dt1 }, { userId: currentUserId, postId: dp1 }, { userId: currentUserId, postId: qb1 },
	]

	await db.insert(schema.likes).values(likePairs).onConflictDoNothing()

	// ─── 10. Follows ────────────────────────────────────────────────────

	const followPairs = [
		// Seed users follow each other
		{ followerId: bob, followeeId: alice }, { followerId: carol, followeeId: alice },
		{ followerId: dave, followeeId: alice }, { followerId: eve, followeeId: alice },
		{ followerId: alice, followeeId: bob }, { followerId: alice, followeeId: carol },
		{ followerId: alice, followeeId: dave }, { followerId: alice, followeeId: eve },
		{ followerId: bob, followeeId: carol }, { followerId: bob, followeeId: eve },
		{ followerId: carol, followeeId: eve }, { followerId: eve, followeeId: bob },
		// Seed users follow the current user
		{ followerId: alice, followeeId: currentUserId },
		{ followerId: bob, followeeId: currentUserId },
		{ followerId: carol, followeeId: currentUserId },
		{ followerId: eve, followeeId: currentUserId },
		// Current user follows some seed users
		{ followerId: currentUserId, followeeId: alice },
		{ followerId: currentUserId, followeeId: bob },
		{ followerId: currentUserId, followeeId: carol },
	]

	await db.insert(schema.follows).values(followPairs).onConflictDoNothing()

	// ─── 11. Notifications for the current user ────────────────────────

	const notifs = [
		// Likes on cu1 (grouped — 3 people)
		{ userId: currentUserId, kind: "like" as const, actorId: alice, entityType: "post", entityId: cu1, createdAt: ago(9) },
		{ userId: currentUserId, kind: "like" as const, actorId: bob, entityType: "post", entityId: cu1, createdAt: ago(8) },
		{ userId: currentUserId, kind: "like" as const, actorId: carol, entityType: "post", entityId: cu1, createdAt: ago(7) },
		// Likes on cu2 (post with image — grouped)
		{ userId: currentUserId, kind: "like" as const, actorId: alice, entityType: "post", entityId: cu2, createdAt: ago(22) },
		{ userId: currentUserId, kind: "like" as const, actorId: bob, entityType: "post", entityId: cu2, createdAt: ago(21) },
		{ userId: currentUserId, kind: "like" as const, actorId: eve, entityType: "post", entityId: cu2, createdAt: ago(20) },
		// Likes on cu4 (desk setup with image — grouped)
		{ userId: currentUserId, kind: "like" as const, actorId: alice, entityType: "post", entityId: cu4, createdAt: ago(52) },
		{ userId: currentUserId, kind: "like" as const, actorId: bob, entityType: "post", entityId: cu4, createdAt: ago(51) },
		{ userId: currentUserId, kind: "like" as const, actorId: carol, entityType: "post", entityId: cu4, createdAt: ago(50) },
		{ userId: currentUserId, kind: "like" as const, actorId: eve, entityType: "post", entityId: cu4, createdAt: ago(49) },
		// Likes on cu5 (hot take — grouped)
		{ userId: currentUserId, kind: "like" as const, actorId: alice, entityType: "post", entityId: cu5, createdAt: ago(92) },
		{ userId: currentUserId, kind: "like" as const, actorId: bob, entityType: "post", entityId: cu5, createdAt: ago(91) },
		{ userId: currentUserId, kind: "like" as const, actorId: carol, entityType: "post", entityId: cu5, createdAt: ago(90) },
		{ userId: currentUserId, kind: "like" as const, actorId: dave, entityType: "post", entityId: cu5, createdAt: ago(89) },
		{ userId: currentUserId, kind: "like" as const, actorId: eve, entityType: "post", entityId: cu5, createdAt: ago(88) },
		// Single likes on cu3
		{ userId: currentUserId, kind: "like" as const, actorId: carol, entityType: "post", entityId: cu3, createdAt: ago(38) },
		{ userId: currentUserId, kind: "like" as const, actorId: dave, entityType: "post", entityId: cu3, createdAt: ago(37) },
		// Replies to current user's posts
		{ userId: currentUserId, kind: "reply" as const, actorId: alice, entityType: "post", entityId: cuR1, createdAt: ago(9) },
		{ userId: currentUserId, kind: "reply" as const, actorId: bob, entityType: "post", entityId: cu1, createdAt: ago(9) },
		{ userId: currentUserId, kind: "reply" as const, actorId: carol, entityType: "post", entityId: cu4, createdAt: ago(55) },
		{ userId: currentUserId, kind: "reply" as const, actorId: eve, entityType: "post", entityId: cu5, createdAt: ago(95) },
		{ userId: currentUserId, kind: "reply" as const, actorId: bob, entityType: "post", entityId: cu2, createdAt: ago(23) },
		{ userId: currentUserId, kind: "reply" as const, actorId: dave, entityType: "post", entityId: cu3, createdAt: ago(40) },
		// Follows
		{ userId: currentUserId, kind: "follow" as const, actorId: alice, entityType: "user", entityId: alice, createdAt: ago(6) },
		{ userId: currentUserId, kind: "follow" as const, actorId: bob, entityType: "user", entityId: bob, createdAt: ago(5) },
		{ userId: currentUserId, kind: "follow" as const, actorId: carol, entityType: "user", entityId: carol, createdAt: ago(4) },
		{ userId: currentUserId, kind: "follow" as const, actorId: eve, entityType: "user", entityId: eve, createdAt: ago(3) },
		{ userId: currentUserId, kind: "follow" as const, actorId: dave, entityType: "user", entityId: dave, createdAt: ago(2) },
		// Reposts of current user's posts
		{ userId: currentUserId, kind: "repost" as const, actorId: bob, entityType: "post", entityId: cu4, createdAt: ago(50) },
		{ userId: currentUserId, kind: "repost" as const, actorId: eve, entityType: "post", entityId: cu5, createdAt: ago(85) },
		// Quote of current user's post
		{ userId: currentUserId, kind: "quote" as const, actorId: alice, entityType: "post", entityId: cu5, createdAt: ago(90) },
	]

	await db.insert(schema.notifications).values(notifs).onConflictDoNothing()

	// ─── 12. Update denormalized counts ─────────────────────────────────

	await db.execute(sql`
		UPDATE posts SET like_count = (
			SELECT count(*) FROM likes WHERE likes.post_id = posts.id
		)
	`)
	await db.execute(sql`
		UPDATE posts SET reply_count = (
			SELECT count(*) FROM posts AS r WHERE r.reply_to_id = posts.id
		)
	`)
	await db.execute(sql`
		UPDATE posts SET repost_count = (
			SELECT count(*) FROM posts AS r WHERE r.repost_of_id = posts.id
		)
	`)
	await db.execute(sql`
		UPDATE posts SET quote_count = (
			SELECT count(*) FROM posts AS q WHERE q.quote_of_id = posts.id
		)
	`)

	return c.json({
		ok: true,
		message: "Seed data created",
		counts: {
			users: seededUsers.length,
			images: mediaIds.length,
			posts: "~50 top-level + threads",
			currentUserPosts: 3,
			threads: "4 deep threads with branching",
			reposts: 5,
			quoteTweets: 4,
			likes: likePairs.length,
			follows: followPairs.length,
		},
	})
})
