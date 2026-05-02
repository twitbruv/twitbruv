import SwiftUI
import Observation

@Observable
@MainActor
final class ProfileViewModel {
    let handle: String
    let api: APIClient
    var user: PublicUser?
    var error: APIError?

    init(handle: String, api: APIClient) {
        self.handle = handle
        self.api = api
    }

    func load() async {
        do {
            let response: ProfileResponse = try await api.get(API.Users.get(handle))
            user = response.user
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func setFollow(_ follow: Bool) async {
        guard let _ = user else { return }
        let was = user?.viewer?.following == true
        if user?.viewer == nil { user?.viewer = PublicUser.ViewerFlags(following: nil, followedBy: nil, blocking: nil, muting: nil) }
        user?.viewer?.following = follow
        if let counts = user?.counts {
            user?.counts = PublicUser.Counts(
                followers: (counts.followers ?? 0) + (follow ? 1 : -1),
                following: counts.following,
                posts: counts.posts
            )
        }
        do {
            if follow {
                try await api.sendVoid(API.Users.follow(handle))
            } else {
                try await api.sendVoid(API.Users.unfollow(handle))
            }
        } catch {
            user?.viewer?.following = was
        }
    }

    func setBlock(_ block: Bool) async {
        do {
            if block { try await api.sendVoid(API.Users.block(handle)) }
            else { try await api.sendVoid(API.Users.unblock(handle)) }
            user?.viewer?.blocking = block
        } catch {}
    }

    func setMute(_ mute: Bool) async {
        do {
            if mute { try await api.sendVoid(API.Users.mute(handle)) }
            else { try await api.sendVoid(API.Users.unmute(handle)) }
            user?.viewer?.muting = mute
        } catch {}
    }
}

struct ProfileView: View {
    @Environment(AppEnvironment.self) private var env
    let handle: String

    @State private var vm: ProfileViewModel?
    @State private var tab: ProfileTab = .posts
    @State private var postsLoader: PagedLoader<Post, PostsResponse>?
    @State private var articlesLoader: PagedLoader<Article, ArticlesResponse>?
    @State private var showFollowers = false
    @State private var showFollowing = false
    @State private var path = NavigationPath()
    @State private var reportTarget: Post?

    var body: some View {
        Group {
            if let vm, let user = vm.user {
                List {
                    Section {
                        ProfileHeader(user: user)
                            .listRowInsets(EdgeInsets())
                        ProfileActionsRow(vm: vm, user: user)
                            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        ProfileMetricsRow(
                            user: user,
                            onFollowers: { showFollowers = true },
                            onFollowing: { showFollowing = true }
                        )
                    }

                    Section {
                        TBFeedSegmented(
                            selection: $tab,
                            options: ProfileTab.allCases.map { ($0.label, $0) }
                        )
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
                        .listRowSeparator(.hidden)
                    }

                    switch tab {
                    case .posts:
                        if let loader = postsLoader {
                            ForEach(loader.items) { post in
                                PostCardView(
                                    post: post,
                                    onLike: { Task { await PostActions(api: env.api).toggleLike(post) } },
                                    onRepost: { Task { await PostActions(api: env.api).toggleRepost(post) } },
                                    onBookmark: { Task { await PostActions(api: env.api).toggleBookmark(post) } },
                                    onReply: nil,
                                    onTapAuthor: nil,
                                    onMenuAction: { action in
                                        if case .report = action { reportTarget = post }
                                    }
                                )
                                .listRowInsets(EdgeInsets())
                                .onTapGesture {
                                    path.append(FeedRoute.thread(id: post.id))
                                }
                            }
                            LoadMoreFooter(
                                hasMore: loader.nextCursor != nil,
                                isLoading: loader.isLoading
                            ) { await loader.loadMore() }
                        }
                    case .articles:
                        if let loader = articlesLoader {
                            ForEach(loader.items) { article in
                                NavigationLink(value: ArticleRoute.detail(handle: handle, slug: article.slug ?? "")) {
                                    ArticleRow(article: article)
                                }
                            }
                            LoadMoreFooter(
                                hasMore: loader.nextCursor != nil,
                                isLoading: loader.isLoading
                            ) { await loader.loadMore() }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(TBColor.base1)
                .refreshable {
                    await vm.load()
                    await postsLoader?.reload()
                    await articlesLoader?.reload()
                }
            } else if let error = vm?.error {
                ErrorBanner(message: error.localizedDescription) {
                    Task { await vm?.load() }
                }
            } else {
                ProgressView()
                    .tint(TBColor.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(TBColor.base1)
            }
        }
        .navigationTitle(handle)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: FeedRoute.self) { route in
            switch route {
            case .thread(let id): ThreadView(postId: id)
            case .profile(let h): ProfileView(handle: h)
            case .compose(let replyTo): ComposerView(mode: .reply(replyTo))
            case .hashtag(let tag): HashtagView(tag: tag)
            }
        }
        .navigationDestination(for: ArticleRoute.self) { route in
            switch route {
            case .detail(let h, let slug):
                ArticleReaderView(handle: h, slug: slug)
            }
        }
        .sheet(isPresented: $showFollowers) {
            UsersListView(title: "Followers", endpoint: { cursor in
                API.Users.followers(handle, cursor: cursor)
            })
        }
        .sheet(isPresented: $showFollowing) {
            UsersListView(title: "Following", endpoint: { cursor in
                API.Users.following(handle, cursor: cursor)
            })
        }
        .sheet(item: $reportTarget) { post in
            ReportSheet(subject: .post(id: post.id))
        }
        .task {
            if vm == nil { vm = ProfileViewModel(handle: handle, api: env.api) }
            if postsLoader == nil {
                postsLoader = PagedLoader<Post, PostsResponse>(
                    api: env.api,
                    endpoint: { cursor in API.Users.posts(handle, cursor: cursor) },
                    extract: { ($0.posts, $0.nextCursor) }
                )
                await postsLoader?.loadInitial()
            }
            if articlesLoader == nil {
                articlesLoader = PagedLoader<Article, ArticlesResponse>(
                    api: env.api,
                    endpoint: { cursor in API.Users.articles(handle, cursor: cursor) },
                    extract: { ($0.articles, $0.nextCursor) }
                )
            }
            await vm?.load()
        }
        .onChange(of: tab) { _, new in
            if new == .articles, articlesLoader?.didLoadOnce == false {
                Task { await articlesLoader?.loadInitial() }
            }
        }
    }
}

enum ProfileTab: String, CaseIterable, Identifiable {
    case posts, articles
    var id: String { rawValue }
    var label: String {
        switch self {
        case .posts: return "Posts"
        case .articles: return "Articles"
        }
    }
}

enum ArticleRoute: Hashable {
    case detail(handle: String, slug: String)
}

private struct ProfileHeader: View {
    let user: PublicUser
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .bottomLeading) {
                AsyncImage(url: user.bannerUrl.flatMap(URL.init(string:))) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    default: TBColor.base2
                    }
                }
                .frame(height: 140)
                .clipped()
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [Color.black.opacity(0.12), Color.clear],
                                startPoint: .bottom,
                                endPoint: .top
                            )
                        )
                        .frame(height: 48)
                }

                AvatarView(
                    urlString: user.avatarUrl,
                    size: 76,
                    fallbackInitial: user.displayName ?? user.handle
                )
                .overlay {
                    Circle()
                        .strokeBorder(TBColor.base1, lineWidth: 4)
                }
                .padding(.leading)
                .offset(y: 38)
            }
            .padding(.bottom, 38)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(user.displayName ?? user.handle ?? "—")
                        .font(TBTypography.cardTitle.weight(.bold))
                        .foregroundStyle(TBColor.textPrimary)
                    if user.isVerified == true {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(TBColor.accent)
                    }
                }
                if let handle = user.handle {
                    Text("@\(handle)")
                        .font(TBTypography.bodySecondary)
                        .foregroundStyle(TBColor.textSecondary)
                }
                if let bio = user.bio, !bio.isEmpty {
                    Text(bio)
                        .font(TBTypography.bodySecondary)
                        .foregroundStyle(TBColor.textPrimary)
                }
                HStack(spacing: 16) {
                    if let location = user.location, !location.isEmpty {
                        Label(location, systemImage: "mappin.and.ellipse")
                    }
                    if let website = user.websiteUrl, !website.isEmpty,
                       let url = URL(string: website) {
                        Link(destination: url) {
                            Label(url.host ?? website, systemImage: "link")
                        }
                    }
                }
                .font(TBTypography.caption)
                .foregroundStyle(TBColor.textSecondary)
            }
            .padding(.horizontal)
        }
    }
}

private struct ProfileActionsRow: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AuthStore.self) private var auth
    let vm: ProfileViewModel
    let user: PublicUser

    var body: some View {
        HStack(spacing: 10) {
            let isMe = auth.currentUser?.handle == user.handle
            if isMe {
                NavigationLink {
                    EditProfileView()
                } label: {
                    Text("Edit profile")
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(TBColor.base2, in: Capsule(style: .continuous))
                        .overlay {
                            Capsule(style: .continuous)
                                .strokeBorder(TBColor.borderNeutral, lineWidth: 1)
                        }
                }
                .buttonStyle(.plain)
            } else {
                let following = user.viewer?.following == true
                TBButton(
                    title: following ? "Following" : "Follow",
                    style: following ? .outline : .primary,
                    expands: true
                ) {
                    Task { await vm.setFollow(!following) }
                }

                Menu {
                    let muting = user.viewer?.muting == true
                    Button {
                        Task { await vm.setMute(!muting) }
                    } label: {
                        Label(muting ? "Unmute" : "Mute", systemImage: "speaker.slash")
                    }
                    let blocking = user.viewer?.blocking == true
                    Button(role: .destructive) {
                        Task { await vm.setBlock(!blocking) }
                    } label: {
                        Label(blocking ? "Unblock" : "Block", systemImage: "hand.raised")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(TBColor.textSecondary)
                        .frame(width: TBLayout.hitTarget, height: 36)
                        .background(TBColor.base2, in: RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                                .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
                        }
                }
            }
        }
    }
}

private struct ProfileMetricsRow: View {
    let user: PublicUser
    var onFollowers: () -> Void
    var onFollowing: () -> Void

    var body: some View {
        HStack(spacing: 24) {
            Button(action: onFollowing) {
                metric("Following", value: user.counts?.following ?? 0)
            }
            Button(action: onFollowers) {
                metric("Followers", value: user.counts?.followers ?? 0)
            }
            metric("Posts", value: user.counts?.posts ?? 0)
            Spacer()
        }
        .padding(.horizontal)
        .buttonStyle(.plain)
    }

    private func metric(_ label: String, value: Int) -> some View {
        HStack(spacing: 4) {
            Text("\(value)")
                .font(TBTypography.meta.weight(.semibold))
                .foregroundStyle(TBColor.textPrimary)
            Text(label)
                .font(TBTypography.meta)
                .foregroundStyle(TBColor.textSecondary)
        }
    }
}

private struct ArticleRow: View {
    let article: Article
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(article.title ?? "Untitled")
                .font(TBTypography.cardTitle)
                .foregroundStyle(TBColor.textPrimary)
            if let subtitle = article.subtitle {
                Text(subtitle)
                    .font(TBTypography.bodySecondary)
                    .foregroundStyle(TBColor.textSecondary)
                    .lineLimit(2)
            }
            HStack {
                if let pub = article.publishedAt {
                    Text(pub.relativeShort)
                }
                if let mins = article.readingTimeMinutes {
                    Text("· \(mins) min read")
                }
            }
            .font(TBTypography.caption)
            .foregroundStyle(TBColor.textSecondary)
        }
        .padding(.vertical, 6)
    }
}
