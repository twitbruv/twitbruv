import SwiftUI
import Observation

@Observable
@MainActor
final class ProfileViewModel {
    let handle: String
    let api: APIClient
    var user: PublicUser?
    var githubProfile: GithubProfilePayload?
    var error: APIError?

    init(handle: String, api: APIClient) {
        self.handle = handle
        self.api = api
    }

    func load() async {
        do {
            async let userReq: ProfileResponse = api.get(API.Users.get(handle))
            async let githubReq: GithubProfilePayload? = (try? api.get(API.Users.github(handle)))
            
            let (response, ghProfile) = try await (userReq, githubReq)
            user = response.user
            githubProfile = ghProfile
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func setFollow(_ follow: Bool) async -> Bool {
        guard user != nil else { return false }
        let was = user?.viewer?.following == true
        if user?.viewer == nil {
            user?.viewer = PublicUser.ViewerFlags(
                following: nil, followedBy: nil, blocking: nil, muting: nil
            )
        }
        user?.viewer?.following = follow
        if let counts = user?.counts {
            user?.counts = PublicUser.Counts(
                followers: max(0, (counts.followers ?? 0) + (follow ? 1 : -1)),
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
            return true
        } catch {
            user?.viewer?.following = was
            return false
        }
    }

    func setBlock(_ block: Bool) async -> Bool {
        do {
            if block { try await api.sendVoid(API.Users.block(handle)) }
            else { try await api.sendVoid(API.Users.unblock(handle)) }
            user?.viewer?.blocking = block
            return true
        } catch {
            return false
        }
    }

    func setMute(_ mute: Bool) async -> Bool {
        do {
            if mute { try await api.sendVoid(API.Users.mute(handle)) }
            else { try await api.sendVoid(API.Users.unmute(handle)) }
            user?.viewer?.muting = mute
            return true
        } catch {
            return false
        }
    }
}

struct ProfileView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AuthStore.self) private var auth
    @Environment(\.openURL) private var openURL

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
    @State private var actions: PostActions?
    @State private var mediaViewer: MediaViewerItem?

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
                .padding(.top, TBLayout.profileFloatingChromeTopPadding)
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
                    .toolbarVisibility(.hidden, for: .navigationBar)
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
        .sheet(item: $mediaViewer) { item in
            MediaViewerView(media: item.media, initialID: item.initialID)
        }
        .sheet(item: $reportUser) { subject in
            ReportSheet(subject: subject)
        }
        .task {
            if vm == nil { vm = ProfileViewModel(handle: handle, api: env.api) }
            if actions == nil { actions = PostActions(api: env.api) }
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
        .onReceive(
            NotificationCenter.default.publisher(for: .postMutated)
        ) { note in
            guard let loader = postsLoader,
                  let box = note.userInfo?["mutation"] as? MutationBox
            else { return }
            if let id = note.userInfo?["id"] as? String {
                if case .deleted = box.mutation {
                    loader.remove(id: id)
                } else {
                    loader.patch(id: id) { post in box.mutation.apply(to: &post) }
                }
            } else if note.userInfo?["pollId"] is String {
                loader.patchAll { post in box.mutation.apply(to: &post) }
            }
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
                        TappableRow(action: {
                            navigationPath.append(FeedRoute.thread(id: post.id))
                        }) {
                            PostCardView(
                                post: post,
                                onLike: { Task { await actions?.toggleLike(post) } },
                                onRepost: { Task { await actions?.toggleRepost(post) } },
                                onQuote: { navigationPath.append(FeedRoute.quote(target: post)) },
                                onBookmark: { Task { await actions?.toggleBookmark(post) } },
                                onReply: { navigationPath.append(FeedRoute.compose(replyTo: post)) },
                                onTapAuthor: {
                                    if let h = post.author.handle {
                                        navigationPath.append(FeedRoute.profile(handle: h))
                                    }
                                },
                                onTapMedia: { media, all in
                                    mediaViewer = MediaViewerItem(media: all, initialID: media.id)
                                },
                                onTapHashtag: { tag in
                                    navigationPath.append(FeedRoute.hashtag(tag: tag))
                                },
                                onTapURL: { url in openURL(url) },
                                onVotePoll: { pollId, optionId in
                                    Task {
                                        await actions?.votePoll(
                                            pollId: pollId,
                                            optionId: optionId,
                                            previousOptionIds: post.poll?.viewerVoteOptionIds
                                        )
                                    }
                                },
                                onMenuAction: { action in
                                    handlePostMenu(action, post: post)
                                }
                            )
                        }
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
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
        .ignoresSafeArea(edges: .top)
        .refreshable {
            await vm.load()
            await postsLoader?.reload()
            await articlesLoader?.reload()
        }
    }

    private func handlePostMenu(_ action: PostMenuAction, post: Post) {
        switch action {
        case .copyLink(let id):
            UIPasteboard.general.string =
                Config.webBaseURL.appendingPathComponent(
                    "/@\(post.author.handle ?? "")/\(id)"
                ).absoluteString
            env.toast.show("Post link copied")
        case .viewProfile(let handle):
            navigationPath.append(FeedRoute.profile(handle: handle))
        case .report(_):
            reportTarget = post
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

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    private let bannerGlassIconSize: CGFloat = 44

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Group {
                if !navigationPath.isEmpty {
                    if reduceTransparency {
                        Button {
                            navigationPath.removeLast()
                        } label: {
                            HeroIcon(name: "chevron-left-solid", size: 17)
                                .foregroundStyle(TBColor.textPrimary)
                                .frame(width: bannerGlassIconSize, height: bannerGlassIconSize)
                                .background(Circle().fill(TBColor.base2))
                                .overlay {
                                    Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Back")
                    } else {
                        Button {
                            navigationPath.removeLast()
                        } label: {
                            HeroIcon(name: "chevron-left-solid", size: 17)
                                .foregroundStyle(TBColor.textPrimary)
                                .frame(width: bannerGlassIconSize, height: bannerGlassIconSize)
                                .background { Circle().fill(.clear) }
                                .glassEffect(Glass.clear.interactive(), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Back")
                    }
                }
            }
            Spacer(minLength: 0)
            if reduceTransparency {
                HStack(spacing: 10) {
                    Button {
                        navigationPath.append(FeedRoute.search(initialQuery: ""))
                    } label: {
                        HeroIcon(name: "magnifying-glass-solid", size: 17)
                            .foregroundStyle(TBColor.textPrimary)
                            .frame(width: bannerGlassIconSize, height: bannerGlassIconSize)
                            .background(Circle().fill(TBColor.base2))
                            .overlay {
                                Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Search")
                    ProfileOverflowMenu(
                        isSelf: isSelf,
                        vm: vm,
                        user: user,
                        showSettings: $showSettings,
                        reportUser: $reportUser,
                        reduceTransparency: true
                    )
                }
            } else {
                HStack(spacing: 8) {
                    Button {
                        navigationPath.append(FeedRoute.search(initialQuery: ""))
                    } label: {
                        HeroIcon(name: "magnifying-glass-solid", size: 17)
                            .foregroundStyle(TBColor.textPrimary)
                            .frame(width: bannerGlassIconSize, height: bannerGlassIconSize)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Search")
                    ProfileOverflowMenu(
                        isSelf: isSelf,
                        vm: vm,
                        user: user,
                        showSettings: $showSettings,
                        reportUser: $reportUser,
                        reduceTransparency: false
                    )
                }
                .compositingGroup()
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .glassEffect(Glass.clear.interactive(), in: .capsule)
            }
        }
    }
}

private struct ProfileOverflowMenu: View {
    @Environment(AppEnvironment.self) private var env

    let isSelf: Bool
    let vm: ProfileViewModel
    let user: PublicUser
    @Binding var showSettings: Bool
    @Binding var reportUser: ReportSubject?
    let reduceTransparency: Bool

    @State private var confirmBlock = false

    private let bannerGlassIconSize: CGFloat = 44

    var body: some View {
        Group {
            if reduceTransparency {
                Menu {
                    menuContent
                } label: {
                    HeroIcon(name: "ellipsis-horizontal-solid", size: 17)
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: bannerGlassIconSize, height: bannerGlassIconSize)
                        .background(Circle().fill(TBColor.base2))
                        .overlay {
                            Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                        }
                }
                .menuStyle(.button)
                .buttonStyle(.plain)
                .accessibilityLabel("More")
            } else {
                Menu {
                    menuContent
                } label: {
                    HeroIcon(name: "ellipsis-horizontal-solid", size: 17)
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: bannerGlassIconSize, height: bannerGlassIconSize)
                }
                .menuStyle(.button)
                .buttonStyle(.plain)
                .accessibilityLabel("More")
            }
        }
        .confirmationDialog(
            "Block @\(user.handle ?? "this user")?",
            isPresented: $confirmBlock,
            titleVisibility: .visible
        ) {
            Button("Block", role: .destructive) {
                Task {
                    let ok = await vm.setBlock(true)
                    env.toast.show(
                        ok ? "User blocked" : "Could not block user",
                        kind: ok ? .success : .error
                    )
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They will not be able to follow or message you.")
        }
    }

    @ViewBuilder
    private var menuContent: some View {
        if isSelf {
            Button {
                showSettings = true
            } label: {
                Label("Settings", hero: "cog6-tooth-solid")
            }
        } else {
            Button {
                Task {
                    let shouldMute = !(user.viewer?.muting == true)
                    let ok = await vm.setMute(shouldMute)
                    env.toast.show(
                        ok
                            ? (shouldMute ? "User muted" : "User unmuted")
                            : "Could not update mute",
                        kind: ok ? .success : .error
                    )
                }
            } label: {
                Label(
                    (user.viewer?.muting == true) ? "Unmute" : "Mute",
                    hero: "speaker-xmark-solid"
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
                    Task {
                        let ok = await vm.setBlock(false)
                        env.toast.show(
                            ok ? "User unblocked" : "Could not unblock user",
                            kind: ok ? .success : .error
                        )
                    }
                } label: {
                    Label("Unblock", hero: "hand-raised-solid")
                }
            } else {
                Button(role: .destructive) {
                    confirmBlock = true
                } label: {
                    Label("Block", hero: "hand-raised-solid")
                }
            }
        }
    }
}

private struct ProfileHeader: View {
    let user: PublicUser
    let vm: ProfileViewModel
    @Binding var navigationPath: NavigationPath
    let onEditProfile: () -> Void
    let onFollowers: () -> Void
    let onFollowing: () -> Void

    private let bannerHeight: CGFloat = 220
    private let bannerSafeAreaPad: CGFloat = 60
    private let avatarSize: CGFloat = 80
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
            AsyncImage(url: user.bannerUrl.flatMap(URL.init(string:))) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFill()
                default:
                    TBColor.base2
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: bannerHeight + bannerSafeAreaPad)
            .clipped()
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.black.opacity(0.3),
                                Color.black.opacity(0.1),
                                Color.clear,
                            ],
                            startPoint: .bottom,
                            endPoint: .top
                        )
                    )
                    .frame(height: 72)
            }

            HStack(alignment: .bottom, spacing: 0) {
                AvatarView(
                    urlString: user.avatarUrl,
                    size: avatarSize,
                    fallbackInitial: user.displayName ?? user.handle
                )
                .overlay {
                    Circle()
                        .strokeBorder(TBColor.base1, lineWidth: 4)
                }
                .padding(.leading, TBLayout.pagePadding)
                .offset(y: avatarLift)

                Spacer(minLength: 8)

                ProfileActionsRow(
                    vm: vm,
                    user: user,
                    navigationPath: $navigationPath,
                    onEditProfile: onEditProfile
                )
                .padding(.trailing, TBLayout.pagePadding)
                .padding(.bottom, 12)
            }
        }
        .frame(height: bannerHeight + bannerSafeAreaPad)
        .padding(.bottom, avatarLift)
        .padding(.top, -bannerSafeAreaPad)
    }

    private var detailsBand: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 6) {
                Text(user.displayName ?? user.handle ?? "—")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(TBColor.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if user.isVerified == true {
                    HeroIcon(name: "check-badge-solid", size: 20)
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
                    .foregroundStyle(TBColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            metaLine
            socialLinksRow
            if let githubProfile = vm.githubProfile, githubProfile.connected {
                GithubProfileSection(profile: githubProfile)
                    .padding(.top, 4)
            }
            ProfileMetricsRow(user: user, onFollowers: onFollowers, onFollowing: onFollowing)
            Rectangle()
                .fill(TBColor.borderNeutral.opacity(0.45))
                .frame(height: 0.5)
                .padding(.top, 6)
        }
        .padding(.horizontal, TBLayout.pagePadding)
        .padding(.top, 12)
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
    private var socialLinksRow: some View {
        if let raw = user.websiteUrl?.trimmingCharacters(in: .whitespaces), !raw.isEmpty,
           let url = profileWebsiteURL(from: raw)
        {
            HStack(spacing: 12) {
                Link(destination: url) {
                    HeroIcon(name: "globe-alt-solid", size: 18)
                        .foregroundStyle(TBColor.textSecondary)
                        .frame(width: 36, height: 36)
                        .background(
                            Circle().fill(TBColor.subtleFill.opacity(0.55))
                        )
                }
            }
            .padding(.top, 2)
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
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    let vm: ProfileViewModel
    let user: PublicUser
    @Binding var navigationPath: NavigationPath
    let onEditProfile: () -> Void

    private let dmGlassButtonSize: CGFloat = 44

    private var viewerFollowing: Bool { user.viewer?.following == true }
    private var viewerBlocking: Bool { user.viewer?.blocking == true }

    var body: some View {
        let isMe = auth.currentUser?.handle == user.handle
        HStack(spacing: 8) {
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
                TBButton(
                    title: viewerFollowing ? "Following" : "Follow",
                    style: viewerFollowing ? .outline : .promote,
                    expands: false,
                    isDisabled: viewerBlocking
                ) {
                    Task {
                        let shouldFollow = !viewerFollowing
                        let ok = await vm.setFollow(shouldFollow)
                        env.toast.show(
                            ok
                                ? (shouldFollow ? "Following" : "Unfollowed")
                                : "Could not update follow",
                            kind: ok ? .success : .error
                        )
                    }
                }
                Button {
                    Task { await startDM() }
                } label: {
                    if reduceTransparency {
                        HeroIcon(name: "envelope-solid", size: 17)
                            .foregroundStyle(TBColor.textPrimary)
                            .frame(width: dmGlassButtonSize, height: dmGlassButtonSize)
                            .background(Circle().fill(TBColor.base2))
                            .overlay {
                                Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                            }
                    } else {
                        HeroIcon(name: "envelope-solid", size: 17)
                            .foregroundStyle(TBColor.textPrimary)
                            .frame(width: dmGlassButtonSize, height: dmGlassButtonSize)
                            .background { Circle().fill(.clear) }
                            .glassEffect(Glass.clear.interactive(), in: Circle())
                    }
                }
                .buttonStyle(.plain)
                .disabled(viewerBlocking)
                .accessibilityLabel("Message")
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
        } catch {
            env.toast.show("Could not start conversation", kind: .error)
        }
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
        VStack(alignment: .leading, spacing: 8) {
            Text(article.title ?? "Untitled")
                .font(TBTypography.cardTitle)
                .foregroundStyle(TBColor.textPrimary)
                .lineLimit(2)
            if let subtitle = article.subtitle {
                Text(subtitle)
                    .font(TBTypography.bodySecondary)
                    .foregroundStyle(TBColor.textSecondary)
                    .lineLimit(2)
            }
            HStack(spacing: 6) {
                if let pub = article.publishedAt {
                    Text(pub.relativeShort)
                }
                if let mins = article.readingTimeMinutes {
                    Text("·")
                    Text("\(mins) min read")
                }
            }
            .font(TBTypography.caption)
            .foregroundStyle(TBColor.textSecondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tbGlass(
            .card,
            in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
            interactive: true,
            shadow: false
        )
        .padding(.horizontal, TBLayout.pagePadding)
        .padding(.vertical, 4)
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
