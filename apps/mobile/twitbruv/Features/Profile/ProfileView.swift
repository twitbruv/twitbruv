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
        guard user != nil else { return }
        let was = user?.viewer?.following == true
        if user?.viewer == nil {
            user?.viewer = PublicUser.ViewerFlags(
                following: nil, followedBy: nil, blocking: nil, muting: nil
            )
        }
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
    @Environment(AuthStore.self) private var auth

    let handle: String
    @Binding var navigationPath: NavigationPath

    @State private var vm: ProfileViewModel?
    @State private var tab: ProfileTab = .posts
    @State private var postsLoader: PagedLoader<Post, PostsResponse>?
    @State private var articlesLoader: PagedLoader<Article, ArticlesResponse>?
    @State private var showFollowers = false
    @State private var showFollowing = false
    @State private var showSettings = false
    @State private var showEditProfile = false
    @State private var reportTarget: Post?
    @State private var reportUser: ReportSubject?

    private var profileBannerTopUnderlap: CGFloat {
        TBLayout.profileBannerNavUnderlap(topSafeArea: 59, navChrome: 0)
    }

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                if let vm, let user = vm.user {
                    profileList(vm: vm, user: user)
                } else if let error = vm?.error {
                    ErrorBanner(message: error.localizedDescription) {
                        Task { await vm?.load() }
                    }
                } else {
                    ProgressView()
                        .tint(TBColor.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.clear)
                }
            }
            if let vm, let profileUser = vm.user {
                ProfileFloatingChrome(
                    navigationPath: $navigationPath,
                    isSelf: auth.currentUser?.handle == handle,
                    vm: vm,
                    user: profileUser,
                    showSettings: $showSettings,
                    reportUser: $reportUser
                )
                .padding(.horizontal, TBLayout.pagePadding)
                .padding(.top, profileBannerTopUnderlap + 4)
            }
        }
        .navigationDestination(for: FeedRoute.self) { route in
            switch route {
            case .thread(let id):
                ThreadView(postId: id)
                    .toolbarVisibility(.automatic, for: .navigationBar)
            case .profile(let h):
                ProfileView(handle: h, navigationPath: $navigationPath)
            case .compose(let replyTo):
                ComposerView(mode: .reply(replyTo))
                    .toolbarVisibility(.automatic, for: .navigationBar)
            case .quote(let target):
                ComposerView(mode: .quote(target))
                    .toolbarVisibility(.automatic, for: .navigationBar)
            case .hashtag(let tag):
                HashtagView(tag: tag)
                    .toolbarVisibility(.automatic, for: .navigationBar)
            case .search(let q):
                SearchStackContent(path: $navigationPath, initialQuery: q)
                    .toolbarVisibility(.automatic, for: .navigationBar)
            }
        }
        .navigationDestination(for: ArticleRoute.self) { route in
            switch route {
            case .detail(let h, let slug):
                ArticleReaderView(handle: h, slug: slug)
                    .toolbarVisibility(.automatic, for: .navigationBar)
            }
        }
        .navigationDestination(for: DMRoute.self) { route in
            switch route {
            case .conversation(let id):
                ConversationView(conversationId: id)
                    .toolbarVisibility(.automatic, for: .navigationBar)
            case .invite(let token):
                InviteAcceptView(token: token)
                    .toolbarVisibility(.automatic, for: .navigationBar)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbarVisibility(.hidden, for: .navigationBar)
        .sheet(isPresented: $showEditProfile) {
            NavigationStack {
                EditProfileView()
            }
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsView()
            }
            .presentationDragIndicator(.visible)
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
        .sheet(item: $reportUser) { subject in
            ReportSheet(subject: subject)
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

    @ViewBuilder
    private func profileList(vm: ProfileViewModel, user: PublicUser) -> some View {
        List {
            Section {
                ProfileHeader(
                    user: user,
                    vm: vm,
                    bannerNavUnderlap: profileBannerTopUnderlap,
                    navigationPath: $navigationPath,
                    onEditProfile: { showEditProfile = true },
                    onFollowers: { showFollowers = true },
                    onFollowing: { showFollowing = true }
                )
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }

            Section {
                TBFeedSegmented(
                    selection: $tab,
                    options: ProfileTab.allCases.map { ($0.label, $0) }
                )
                .listRowInsets(
                    EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16)
                )
                .listRowSeparator(.hidden)
            }

            switch tab {
            case .posts:
                if let loader = postsLoader {
                    ForEach(loader.items) { post in
                        PostCardView(
                            post: post,
                            onLike: {
                                Task { await PostActions(api: env.api).toggleLike(post) }
                            },
                            onRepost: {
                                Task { await PostActions(api: env.api).toggleRepost(post) }
                            },
                            onBookmark: {
                                Task { await PostActions(api: env.api).toggleBookmark(post) }
                            },
                            onReply: nil,
                            onTapAuthor: nil,
                            onMenuAction: { action in
                                if case .report = action { reportTarget = post }
                            }
                        )
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .onTapGesture {
                            navigationPath.append(FeedRoute.thread(id: post.id))
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
                        NavigationLink(
                            value: ArticleRoute.detail(
                                handle: handle,
                                slug: article.slug ?? ""
                            )
                        ) {
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
        .listRowSpacing(TBLayout.feedListRowSpacing)
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .refreshable {
            await vm.load()
            await postsLoader?.reload()
            await articlesLoader?.reload()
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

private struct ProfileFloatingChrome: View {
    @Binding var navigationPath: NavigationPath
    let isSelf: Bool
    let vm: ProfileViewModel
    let user: PublicUser
    @Binding var showSettings: Bool
    @Binding var reportUser: ReportSubject?

    var body: some View {
        HStack(alignment: .center) {
            if !navigationPath.isEmpty {
                Button {
                    navigationPath.removeLast()
                } label: {
                    HeroIcon(name: "chevron-left-solid", size: 16)
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(.plain)
                .tbGlass(.chrome, in: Circle(), interactive: true, shadow: false)
                .accessibilityLabel("Back")
            }
            Spacer(minLength: 0)
            Menu {
                if isSelf {
                    Button {
                        showSettings = true
                    } label: {
                        Label("Settings", hero: "cog-6-tooth-solid")
                    }
                } else {
                    Button {
                        Task { await vm.setMute(!(user.viewer?.muting == true)) }
                    } label: {
                        Label(
                            (user.viewer?.muting == true) ? "Unmute" : "Mute",
                            hero: "speaker-x-mark-solid"
                        )
                    }
                    Button {
                        if let h = user.handle {
                            reportUser = ReportSubject.user(handle: h, id: user.id)
                        }
                    } label: {
                        Label("Report", hero: "flag-solid")
                    }
                    if user.viewer?.blocking == true {
                        Button {
                            Task { await vm.setBlock(false) }
                        } label: {
                            Label("Unblock", hero: "hand-raised-solid")
                        }
                    } else {
                        Button(role: .destructive) {
                            Task { await vm.setBlock(true) }
                        } label: {
                            Label("Block", hero: "hand-raised-solid")
                        }
                    }
                }
            } label: {
                HeroIcon(name: "ellipsis-horizontal-solid", size: 16)
                    .foregroundStyle(TBColor.textPrimary)
                    .frame(height: 40)
                    .padding(.horizontal, 14)
            }
            .buttonStyle(.plain)
            .tbGlassCapsule(.chrome, interactive: true, shadow: false)
            .accessibilityLabel("More")
        }
    }
}

private struct ProfileHeader: View {
    let user: PublicUser
    let vm: ProfileViewModel
    var bannerNavUnderlap: CGFloat = 0
    @Binding var navigationPath: NavigationPath
    let onEditProfile: () -> Void
    let onFollowers: () -> Void
    let onFollowing: () -> Void

    private var bannerPull: CGFloat {
        max(0, bannerNavUnderlap)
    }

    private let bannerHeight: CGFloat = 180
    private let avatarSize: CGFloat = 64
    private let avatarLift: CGFloat = 40

    private var joinedLine: String? {
        guard let d = user.createdAt else { return nil }
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("MMM yyyy")
        return "Joined \(f.string(from: d))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            heroBand
            detailsBand
        }
    }

    private var heroBand: some View {
        ZStack(alignment: .bottomLeading) {
            Color.clear
                .frame(maxWidth: .infinity)
                .frame(height: bannerHeight + bannerPull)
                .offset(y: -bannerPull)
                .background {
                    AsyncImage(url: user.bannerUrl.flatMap(URL.init(string:))) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                        default:
                            TBColor.base2
                        }
                    }
                }
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

            HStack(alignment: .bottom, spacing: 10) {
                AvatarView(
                    urlString: user.avatarUrl,
                    size: avatarSize,
                    fallbackInitial: user.displayName ?? user.handle
                )
                .overlay {
                    Circle()
                        .strokeBorder(TBColor.base1, lineWidth: 3)
                }
                .padding(.leading, TBLayout.pagePadding)

                Spacer(minLength: 8)

                ProfileActionsRow(
                    vm: vm,
                    user: user,
                    navigationPath: $navigationPath,
                    onEditProfile: onEditProfile
                )
                .padding(.trailing, TBLayout.pagePadding)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: bannerHeight + avatarLift)
    }

    private var detailsBand: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(user.displayName ?? user.handle ?? "—")
                    .font(TBTypography.pageTitle)
                    .foregroundStyle(TBColor.textPrimary)
                if user.isVerified == true {
                    HeroIcon(name: "check-badge-solid", size: 18)
                        .foregroundStyle(TBColor.accent)
                }
            }
            if let h = user.handle?.trimmingCharacters(in: .whitespaces), !h.isEmpty {
                Text("@\(h)")
                    .font(TBTypography.bodySecondary)
                    .foregroundStyle(TBColor.textSecondary)
            }
            if let bio = user.bio, !bio.isEmpty {
                Text(bio)
                    .font(TBTypography.bodySecondary)
                    .foregroundStyle(TBColor.textPrimary)
            }
            metaLine
            websiteGlobeRow
            ProfileMetricsRow(user: user, onFollowers: onFollowers, onFollowing: onFollowing)
        }
        .padding(.horizontal, TBLayout.pagePadding)
        .padding(.top, 16)
    }

    @ViewBuilder
    private var metaLine: some View {
        let loc = user.location?.trimmingCharacters(in: .whitespaces) ?? ""
        let hasLoc = !loc.isEmpty
        let secondary = joinedLine
        if hasLoc || secondary != nil {
            HStack(spacing: 6) {
                if hasLoc {
                    HeroIcon(name: "map-pin-solid", size: 12)
                }
                Group {
                    if hasLoc, let s = secondary {
                        Text(loc)
                        Text("·")
                            .foregroundStyle(TBColor.textTertiary)
                        Text(s)
                    } else if hasLoc {
                        Text(loc)
                    } else if let s = secondary {
                        Text(s)
                    }
                }
            }
            .font(TBTypography.caption)
            .foregroundStyle(TBColor.textSecondary)
        }
    }

    @ViewBuilder
    private var websiteGlobeRow: some View {
        if let raw = user.websiteUrl?.trimmingCharacters(in: .whitespaces), !raw.isEmpty,
           let url = profileWebsiteURL(from: raw)
        {
            Link(destination: url) {
                HeroIcon(name: "globe-alt-solid", size: 18)
                    .foregroundStyle(TBColor.textSecondary)
            }
        }
    }
}

private func profileWebsiteURL(from raw: String) -> URL? {
    if let u = URL(string: raw), u.scheme != nil { return u }
    return URL(string: "https://\(raw)")
}

private struct ProfileActionsRow: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AuthStore.self) private var auth

    let vm: ProfileViewModel
    let user: PublicUser
    @Binding var navigationPath: NavigationPath
    let onEditProfile: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            let isMe = auth.currentUser?.handle == user.handle
            if isMe {
                Button(action: onEditProfile) {
                    Text("Edit profile")
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(TBColor.textPrimary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .tbGlassCapsule(.chrome, interactive: true, shadow: false)
                }
                .buttonStyle(.plain)
            } else {
                let following = user.viewer?.following == true
                let blocking = user.viewer?.blocking == true
                TBButton(
                    title: following ? "Following" : "Follow",
                    style: following ? .outline : .primary,
                    expands: false,
                    isDisabled: blocking
                ) {
                    Task { await vm.setFollow(!following) }
                }
                Button {
                    Task { await startDM() }
                } label: {
                    HeroIcon(name: "envelope-solid", size: 16)
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
                .disabled(blocking)
                .tbGlass(.chrome, in: Circle(), interactive: true, shadow: false)
            }
        }
    }

    private func startDM() async {
        do {
            let response: ConversationDetailResponse = try await env.api.send(
                API.DMs.start(),
                body: StartDMBody(userIds: [user.id], name: nil)
            )
            navigationPath.append(DMRoute.conversation(id: response.conversation.id))
        } catch {}
    }
}

private struct ProfileMetricsRow: View {
    let user: PublicUser
    var onFollowers: () -> Void
    var onFollowing: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Button(action: onFollowing) {
                metricLabel(count: user.counts?.following ?? 0, noun: "following")
            }
            Text("·")
                .foregroundStyle(TBColor.textTertiary)
            Button(action: onFollowers) {
                metricLabel(count: user.counts?.followers ?? 0, noun: "followers")
            }
            Text("·")
                .foregroundStyle(TBColor.textTertiary)
            metricLabel(count: user.counts?.posts ?? 0, noun: "posts")
            Spacer(minLength: 0)
        }
        .font(TBTypography.meta)
        .padding(.vertical, 2)
        .buttonStyle(.plain)
    }

    private func metricLabel(count: Int, noun: String) -> some View {
        HStack(spacing: 4) {
            Text("\(count)")
                .foregroundStyle(TBColor.textSecondary)
            Text(noun)
                .foregroundStyle(TBColor.textTertiary)
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

#if DEBUG
private struct ProfilePreviewHost: View {
    @State private var path = NavigationPath()
    let handle: String

    var body: some View {
        ProfileView(handle: handle, navigationPath: $path)
    }
}

#Preview("Light") {
    ProfilePreviewHost(handle: PreviewConst.peerHandle)
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    ProfilePreviewHost(handle: PreviewConst.peerHandle)
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
