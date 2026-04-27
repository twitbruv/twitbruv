/**
 * Seed script — populates the database with realistic test data for development.
 * Covers: users, posts (with media), replies, nested replies, reposts, quote tweets,
 * long posts, short posts, likes, follows.
 *
 * Usage:
 *   bun run --env-file=../../.env packages/db/src/seed.ts
 *
 * Idempotent: checks for existing seed users by email before inserting.
 * Pass --force to wipe existing seed data and re-seed.
 */

import { eq, sql, inArray } from "drizzle-orm"
import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3"
import { createDbFromEnv } from "./client.ts"
import * as schema from "./schema/index.ts"

const db = createDbFromEnv()
const force = process.argv.includes("--force")

// ---------------------------------------------------------------------------
// S3 / MinIO client
// ---------------------------------------------------------------------------

const s3 = new S3Client({
	endpoint: process.env.S3_ENDPOINT!,
	region: process.env.S3_REGION ?? "auto",
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY_ID!,
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
	},
	forcePathStyle: true, // MinIO requires path-style
})
const BUCKET = process.env.S3_BUCKET ?? "twotter-media"

async function uploadFromUrl(key: string, imageUrl: string): Promise<{ width: number; height: number }> {
	const res = await fetch(imageUrl)
	if (!res.ok) throw new Error(`Failed to fetch ${imageUrl}: ${res.status}`)
	const buf = Buffer.from(await res.arrayBuffer())
	const contentType = res.headers.get("content-type") ?? "image/jpeg"

	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: buf,
			ContentType: contentType,
		}),
	)

	// Parse width/height from Unsplash URL params or use defaults
	const url = new URL(imageUrl)
	const w = parseInt(url.searchParams.get("w") ?? "1200")
	const h = parseInt(url.searchParams.get("h") ?? "800")
	return { width: w, height: h }
}

// ---------------------------------------------------------------------------
// Seed images (Unsplash)
// ---------------------------------------------------------------------------

const SEED_IMAGES = [
	{ key: "seed/code-desk.jpg", url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&h=800&fit=crop&q=80", alt: "laptop on desk with code" },
	{ key: "seed/sunset.jpg", url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&h=800&fit=crop&q=80", alt: "mountain sunset landscape" },
	{ key: "seed/coffee.jpg", url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&h=800&fit=crop&q=80", alt: "cup of coffee on table" },
	{ key: "seed/keyboard.jpg", url: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=1200&h=800&fit=crop&q=80", alt: "mechanical keyboard" },
	{ key: "seed/plants.jpg", url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=1200&h=800&fit=crop&q=80", alt: "indoor plants on shelf" },
	{ key: "seed/architecture.jpg", url: "https://images.unsplash.com/photo-1486718448742-163732cd1544?w=1200&h=800&fit=crop&q=80", alt: "modern architecture" },
	{ key: "seed/desk-minimal.jpg", url: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&h=800&fit=crop&q=80", alt: "minimal desk setup" },
	{ key: "seed/city-night.jpg", url: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200&h=800&fit=crop&q=80", alt: "city at night" },
]

// ---------------------------------------------------------------------------
// Seed users
// ---------------------------------------------------------------------------

const SEED_USERS = [
	{
		email: "alice@seed.local",
		handle: "alice",
		displayName: "Alice Chen",
		bio: "building things on the internet. design engineering. prev @stripe",
	},
	{
		email: "bob@seed.local",
		handle: "bob",
		displayName: "Bob Park",
		bio: "swe. rust, go, typescript. opinions are my own",
	},
	{
		email: "carol@seed.local",
		handle: "carol",
		displayName: "Carol Reeves",
		bio: "product designer. making interfaces that feel right",
	},
	{
		email: "dave@seed.local",
		handle: "dave",
		displayName: "Dave Kim",
		bio: "lurking",
	},
	{
		email: "eve@seed.local",
		handle: "eve",
		displayName: "Eve Martinez",
		bio: "open source maintainer. coffee enthusiast. she/her",
	},
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
	console.log("seeding database...")

	// Check for existing seed data
	const existing = await db
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.email, "alice@seed.local"))

	if (existing.length > 0 && !force) {
		console.log("seed data already exists. pass --force to re-seed.")
		process.exit(0)
	}

	if (existing.length > 0 && force) {
		console.log("  wiping existing seed data...")
		const seedUserIds = await db
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(sql`${schema.users.email} LIKE '%@seed.local'`)
		const ids = seedUserIds.map((u) => u.id)
		if (ids.length > 0) {
			// Cascade deletes handle posts, likes, follows, media, etc.
			await db.delete(schema.users).where(inArray(schema.users.id, ids))
		}
		console.log(`  deleted ${ids.length} seed users and all related data`)
	}

	// -----------------------------------------------------------------------
	// 1. Users
	// -----------------------------------------------------------------------

	const insertedUsers = await db
		.insert(schema.users)
		.values(
			SEED_USERS.map((u) => ({
				email: u.email,
				handle: u.handle,
				displayName: u.displayName,
				name: u.displayName,
				bio: u.bio,
				emailVerified: true,
			})),
		)
		.returning({ id: schema.users.id, handle: schema.users.handle })

	const userMap = new Map(insertedUsers.map((u) => [u.handle!, u.id]))
	const alice = userMap.get("alice")!
	const bob = userMap.get("bob")!
	const carol = userMap.get("carol")!
	const dave = userMap.get("dave")!
	const eve = userMap.get("eve")!
	console.log(`  created ${insertedUsers.length} users`)

	// -----------------------------------------------------------------------
	// 2. Upload images to MinIO and create media records
	// -----------------------------------------------------------------------

	console.log("  uploading seed images to MinIO...")
	const mediaRecords: { id: string; key: string; ownerId: string }[] = []

	for (const img of SEED_IMAGES) {
		try {
			const { width, height } = await uploadFromUrl(img.key, img.url)
			const [inserted] = await db
				.insert(schema.media)
				.values({
					ownerId: alice, // all seed media owned by alice for simplicity
					kind: "image",
					originalKey: img.key,
					mimeType: "image/jpeg",
					width,
					height,
					altText: img.alt,
					processingState: "ready",
					variants: [
						{ kind: "medium", key: img.key, width, height },
						{ kind: "thumb", key: img.key, width: 400, height: Math.round(400 * (height / width)) },
					],
				})
				.returning({ id: schema.media.id })
			mediaRecords.push({ id: inserted!.id, key: img.key, ownerId: alice })
		} catch (e) {
			console.log(`    skipped ${img.key}: ${(e as Error).message}`)
		}
	}
	console.log(`  uploaded ${mediaRecords.length} images`)

	// -----------------------------------------------------------------------
	// 3. Posts — various types
	// -----------------------------------------------------------------------

	const ago = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000)

	// Helper to insert a post and return its id
	async function createPost(opts: {
		authorId: string
		text: string
		minutesAgo: number
		replyToId?: string
		quoteOfId?: string
		repostOfId?: string
		rootId?: string
		conversationDepth?: number
	}) {
		const [row] = await db
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
			return row!.id
	}

	// --- Regular posts ---

	const p1 = await createPost({
		authorId: alice,
		text: "just shipped a new component library for our design system. took three months of iteration but the API surface is finally clean. sometimes the best work is what you remove, not what you add.",
		minutesAgo: 5,
	})

	const p2 = await createPost({
		authorId: bob,
		text: "hot take: most \"best practices\" in software engineering are just cargo cult patterns that made sense in a specific context and got generalized way too aggressively",
		minutesAgo: 12,
	})

	const p3 = await createPost({
		authorId: carol,
		text: "spent the morning redesigning our onboarding flow. reduced the steps from 7 to 3. the trick was realizing we were asking for information we could infer later.",
		minutesAgo: 25,
	})

	// --- Post with single image ---

	const p4 = await createPost({
		authorId: alice,
		text: "new desk setup. minimal vibes only.",
		minutesAgo: 40,
	})
	if (mediaRecords[6]) {
		await db.insert(schema.postMedia).values({ postId: p4, mediaId: mediaRecords[6].id, position: 0 })
	}

	// --- Post with multiple images ---

	const p5 = await createPost({
		authorId: carol,
		text: "some shots from this weekend. the light was perfect.",
		minutesAgo: 55,
	})
	if (mediaRecords[1]) {
		await db.insert(schema.postMedia).values({ postId: p5, mediaId: mediaRecords[1].id, position: 0 })
	}
	if (mediaRecords[5]) {
		await db.insert(schema.postMedia).values({ postId: p5, mediaId: mediaRecords[5].id, position: 1 })
	}
	if (mediaRecords[7]) {
		await db.insert(schema.postMedia).values({ postId: p5, mediaId: mediaRecords[7].id, position: 2 })
	}

	// --- Short post ---

	const p6 = await createPost({
		authorId: dave,
		text: "nice",
		minutesAgo: 42,
	})

	// --- Long post (should trigger truncation) ---

	const p7 = await createPost({
		authorId: alice,
		text: "the gap between \"works on my machine\" and \"works in production\" is where 80% of engineering effort goes.\n\nmost of what makes software hard is not the code. the network is unreliable, the database has latency, the user has a slow phone, the CDN caches a stale version.\n\nyou can write perfect code and still have a broken product. the best engineers think about failure modes first.",
		minutesAgo: 70,
	})

	// --- More regular posts ---

	const p8 = await createPost({
		authorId: eve,
		text: "released v2.0 of the CLI today. biggest change: we dropped the config file entirely. everything is flags now. migration guide in the thread.",
		minutesAgo: 90,
	})

	const p9 = await createPost({
		authorId: bob,
		text: "debugging a race condition in our WebSocket handler. the bug only reproduces under load with >500 concurrent connections. this is fine.",
		minutesAgo: 120,
	})

	// --- Post with single image ---

	const p10 = await createPost({
		authorId: eve,
		text: "morning coffee and code. best way to start the day.",
		minutesAgo: 150,
	})
	if (mediaRecords[2]) {
		await db.insert(schema.postMedia).values({ postId: p10, mediaId: mediaRecords[2].id, position: 0 })
	}

	const p11 = await createPost({
		authorId: carol,
		text: "people underestimate how much good typography matters. swapped our body font from system-ui to Inter and the perceived quality of the whole app went up. no other changes.",
		minutesAgo: 180,
	})

	const p12 = await createPost({
		authorId: bob,
		text: "wrote a blog post about why we moved from microservices back to a monolith. tl;dr: the network is not reliable, latency adds up, and we had 4 engineers maintaining 23 services.",
		minutesAgo: 200,
	})

	// --- Post with keyboard image ---

	const p13 = await createPost({
		authorId: alice,
		text: "new keyboard arrived. the thock is immaculate.",
		minutesAgo: 220,
	})
	if (mediaRecords[3]) {
		await db.insert(schema.postMedia).values({ postId: p13, mediaId: mediaRecords[3].id, position: 0 })
	}

	const p14 = await createPost({
		authorId: eve,
		text: "open source maintenance is a weird job. you wake up to 47 notifications, 3 bug reports, and someone telling you your life's work is \"mid\". then you fix the bugs because you care.",
		minutesAgo: 250,
	})

	const p15 = await createPost({
		authorId: dave,
		text: "been lurking on this platform for a week. vibes are good. might actually start posting.",
		minutesAgo: 300,
	})

	// --- Post with two images ---

	const p16 = await createPost({
		authorId: bob,
		text: "before and after. code cleanup makes such a difference.",
		minutesAgo: 350,
	})
	if (mediaRecords[0]) {
		await db.insert(schema.postMedia).values({ postId: p16, mediaId: mediaRecords[0].id, position: 0 })
	}
	if (mediaRecords[4]) {
		await db.insert(schema.postMedia).values({ postId: p16, mediaId: mediaRecords[4].id, position: 1 })
	}

	const allPostIds = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15, p16]
	console.log(`  created ${allPostIds.length} posts`)

	// -----------------------------------------------------------------------
	// 4. Replies and nested replies
	// -----------------------------------------------------------------------

	// Replies to alice's component library post (p1)
	const r1 = await createPost({
		authorId: bob,
		text: "congrats! what made you decide to go with the compound component pattern?",
		minutesAgo: 4,
		replyToId: p1,
		rootId: p1,
		conversationDepth: 1,
	})

	const r2 = await createPost({
		authorId: alice,
		text: "readability mostly. when you see <Card.Header> it is immediately obvious what it does and where it belongs. named exports like CardHeader work too but they scatter across imports.",
		minutesAgo: 3,
		replyToId: r1,
		rootId: p1,
		conversationDepth: 2,
	})

	const r3 = await createPost({
		authorId: carol,
		text: "agree with this approach. we did the same and our component docs became way easier to write too.",
		minutesAgo: 2,
		replyToId: r2,
		rootId: p1,
		conversationDepth: 3,
	})

	const r4 = await createPost({
		authorId: eve,
		text: "the API surface part is so true. we spent 6 weeks just on the props interface for our Button component alone.",
		minutesAgo: 3,
		replyToId: p1,
		rootId: p1,
		conversationDepth: 1,
	})

	// Replies to bob's hot take (p2)
	const r5 = await createPost({
		authorId: carol,
		text: "not even a hot take. this is just true. \"always use TypeScript\" is advice that makes sense for teams of 10+ but is pure overhead for a solo prototype.",
		minutesAgo: 10,
		replyToId: p2,
		rootId: p2,
		conversationDepth: 1,
	})

	const r6 = await createPost({
		authorId: dave,
		text: "based",
		minutesAgo: 9,
		replyToId: p2,
		rootId: p2,
		conversationDepth: 1,
	})

	// Replies to eve's CLI release (p8)
	const r7 = await createPost({
		authorId: alice,
		text: "dropping the config file is bold. how are people migrating?",
		minutesAgo: 85,
		replyToId: p8,
		rootId: p8,
		conversationDepth: 1,
	})

	const r8 = await createPost({
		authorId: eve,
		text: "we wrote a codemod that converts the JSON config to CLI flags. runs in about 2 seconds. most projects have < 10 options anyway.",
		minutesAgo: 80,
		replyToId: r7,
		rootId: p8,
		conversationDepth: 2,
	})

	const r9 = await createPost({
		authorId: bob,
		text: "this is the way. config files are where developer experience goes to die.",
		minutesAgo: 78,
		replyToId: r8,
		rootId: p8,
		conversationDepth: 3,
	})

	console.log("  created 9 replies (including nested)")

	// -----------------------------------------------------------------------
	// 5. Reposts
	// -----------------------------------------------------------------------

	// Bob reposts alice's component library post
	const repost1 = await createPost({
		authorId: bob,
		text: "",
		minutesAgo: 4,
		repostOfId: p1,
	})

	// Eve reposts carol's onboarding post
	const repost2 = await createPost({
		authorId: eve,
		text: "",
		minutesAgo: 20,
		repostOfId: p3,
	})

	// Dave reposts bob's hot take
	const repost3 = await createPost({
		authorId: dave,
		text: "",
		minutesAgo: 8,
		repostOfId: p2,
	})

	console.log("  created 3 reposts")

	// -----------------------------------------------------------------------
	// 6. Quote tweets
	// -----------------------------------------------------------------------

	const qt1 = await createPost({
		authorId: carol,
		text: "this is why I always say: design the API first, build the implementation second. if the API feels wrong, the implementation will never feel right.",
		minutesAgo: 3,
		quoteOfId: p1,
	})

	const qt2 = await createPost({
		authorId: alice,
		text: "this is exactly the kind of bold product decision more tools need. flags > files when the option count is small.",
		minutesAgo: 75,
		quoteOfId: p8,
	})

	console.log("  created 2 quote tweets")

	// -----------------------------------------------------------------------
	// 7. Likes
	// -----------------------------------------------------------------------

	const likePairs: { userId: string; postId: string }[] = [
		// Alice's component post gets lots of love
		{ userId: bob, postId: p1 },
		{ userId: carol, postId: p1 },
		{ userId: eve, postId: p1 },
		{ userId: dave, postId: p1 },
		// Bob's hot take
		{ userId: alice, postId: p2 },
		{ userId: carol, postId: p2 },
		{ userId: dave, postId: p2 },
		// Carol's onboarding post
		{ userId: alice, postId: p3 },
		{ userId: bob, postId: p3 },
		{ userId: eve, postId: p3 },
		// Alice's desk setup
		{ userId: carol, postId: p4 },
		{ userId: bob, postId: p4 },
		// Carol's photos
		{ userId: alice, postId: p5 },
		{ userId: eve, postId: p5 },
		// Alice's long post
		{ userId: bob, postId: p7 },
		{ userId: carol, postId: p7 },
		{ userId: eve, postId: p7 },
		// Eve's CLI release
		{ userId: alice, postId: p8 },
		{ userId: bob, postId: p8 },
		{ userId: carol, postId: p8 },
		// Eve's coffee
		{ userId: alice, postId: p10 },
		// Carol's typography post
		{ userId: alice, postId: p11 },
		{ userId: bob, postId: p11 },
		// Eve's open source post
		{ userId: alice, postId: p14 },
		{ userId: bob, postId: p14 },
		{ userId: carol, postId: p14 },
		// Likes on replies
		{ userId: alice, postId: r5 },
		{ userId: bob, postId: r4 },
		{ userId: eve, postId: r2 },
		// Likes on quote tweets
		{ userId: bob, postId: qt1 },
		{ userId: eve, postId: qt2 },
	]

	await db.insert(schema.likes).values(likePairs).onConflictDoNothing()
	console.log(`  created ${likePairs.length} likes`)

	// -----------------------------------------------------------------------
	// 8. Follows
	// -----------------------------------------------------------------------

	const followPairs: { followerId: string; followeeId: string }[] = [
		// Everyone follows alice
		{ followerId: bob, followeeId: alice },
		{ followerId: carol, followeeId: alice },
		{ followerId: dave, followeeId: alice },
		{ followerId: eve, followeeId: alice },
		// Alice follows everyone
		{ followerId: alice, followeeId: bob },
		{ followerId: alice, followeeId: carol },
		{ followerId: alice, followeeId: dave },
		{ followerId: alice, followeeId: eve },
		// Cross-follows
		{ followerId: bob, followeeId: carol },
		{ followerId: bob, followeeId: eve },
		{ followerId: carol, followeeId: eve },
		{ followerId: eve, followeeId: bob },
	]

	await db.insert(schema.follows).values(followPairs).onConflictDoNothing()
	console.log(`  created ${followPairs.length} follows`)

	// -----------------------------------------------------------------------
	// Done
	// -----------------------------------------------------------------------

	console.log("\ndone! seed data created:")
	console.log(`  ${SEED_USERS.length} users`)
	console.log(`  ${allPostIds.length} top-level posts (${mediaRecords.length} with images)`)
	console.log("  9 replies (3 threads, up to 3 levels deep)")
	console.log("  3 reposts")
	console.log("  2 quote tweets")
	console.log(`  ${likePairs.length} likes`)
	console.log(`  ${followPairs.length} follows`)
	process.exit(0)
}

seed().catch((err) => {
	console.error("seed failed:", err)
	process.exit(1)
})
