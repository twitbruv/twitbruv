# Mobile ↔ Web design parity

SwiftUI views are mapped to the closest web route or shared component. Use for regression checks (light/dark).

| Mobile (SwiftUI) | Web |
| --- | --- |
| `AppRouter` / `SplashView` | App shell loading |
| `MaintenanceFullView`, `MaintenanceBannerView` | Maintenance UX |
| `RateLimitToast` | Rate limit feedback |
| `SignInView` | `/login` |
| `SignUpView` | `/signup` |
| `MagicLinkRequestView` | Magic link flow |
| `OAuthSignInView` | OAuth buttons |
| `TwoFactorChallengeView` | 2FA |
| `EmailVerifyPendingView` | Email verification |
| `HandleClaimView` | Handle onboarding |
| `MainTabView` | `AppSidebar` + primary nav |
| `HomeFeedView`, `FeedListView` | `/` feed |
| `PostCardView` | `PostCard` |
| `ThreadView` | `/$handle/p/$id` |
| `ComposerView` | Compose |
| `SearchView`, `HashtagView` | `/search`, hashtag timeline |
| `NotificationsView` | `/notifications` |
| `ConversationsListView`, `ConversationView`, `NewConversationView`, `GroupSettingsView`, `InviteAcceptView` | `/inbox`, DM thread |
| `MyProfileView`, `ProfileView`, `EditProfileView` | `/$handle`, edit profile |
| `UsersListView` | Followers/following/lists of users |
| `BookmarksView` | `/bookmarks` |
| `MyListsView`, `ListDetailView`, `AddMembersSheet` | `/lists` |
| `ScheduledPostsView`, `ScheduledEditorView` | Scheduled posts / drafts patterns |
| `ReportSheet` | Report flow |
| `ArticleReaderView` | Article reader |
| `MediaCarouselView` | Post media grid |
| `ErrorBanner`, `EmptyStateView`, `LoadMoreFooter` | `Alert`, `Empty`, pagination |
| `DevDiagnosticsView` | DEBUG diagnostics only |

## Verification

- Compare each screen in **Simulator** (light and dark) against the corresponding web route listed above.
- iOS build: **Xcode** (`twitbruv` scheme). This environment had no full Xcode for `xcodebuild`.
- Web/TS gates from repo root: `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run build` (completed; lint reported one pre-existing web warning in `github-contributions-heatmap.tsx`).
