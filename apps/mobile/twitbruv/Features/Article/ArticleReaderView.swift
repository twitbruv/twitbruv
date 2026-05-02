import SwiftUI

struct ArticleReaderView: View {
    @Environment(AppEnvironment.self) private var env

    let handle: String
    let slug: String

    @State private var article: Article?
    @State private var error: APIError?

    var body: some View {
        ScrollView {
            if let article {
                VStack(alignment: .leading, spacing: 16) {
                    if let cover = article.coverImageUrl, let url = URL(string: cover) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFill()
                            default: TBColor.base2
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .aspectRatio(16.0 / 9.0, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: TBLayout.radiusLG, style: .continuous))
                    }
                    Text(article.title ?? "Untitled")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(TBColor.textPrimary)
                    if let subtitle = article.subtitle {
                        Text(subtitle)
                            .font(TBTypography.body)
                            .foregroundStyle(TBColor.textSecondary)
                    }
                    HStack(spacing: 8) {
                        if let author = article.author {
                            AvatarView(
                                urlString: author.avatarUrl, size: 28,
                                fallbackInitial: author.displayName ?? author.handle
                            )
                            Text(author.displayName ?? author.handle ?? "—")
                                .font(TBTypography.meta.weight(.semibold))
                                .foregroundStyle(TBColor.textPrimary)
                        }
                        Spacer()
                        if let pub = article.publishedAt {
                            Text(pub.formatted(date: .abbreviated, time: .omitted))
                                .font(TBTypography.caption)
                                .foregroundStyle(TBColor.textSecondary)
                        }
                    }
                    Rectangle()
                        .fill(TBColor.borderNeutral)
                        .frame(height: 0.5)
                    if let body = article.body {
                        Text(LocalizedStringKey(body))
                            .font(TBTypography.body)
                            .foregroundStyle(TBColor.textPrimary)
                            .lineSpacing(4)
                    }
                }
                .padding(TBLayout.pagePadding)
            } else if let error {
                ErrorBanner(message: error.localizedDescription) {
                    Task { await load() }
                }
                .padding(.top, 40)
            } else {
                ProgressView()
                    .tint(TBColor.accent)
                    .padding(.top, 80)
            }
        }
        .background(TBColor.base1)
        .navigationTitle(article?.title ?? "Article")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let response: ArticleResponse = try await env.api.get(
                API.Users.article(handle, slug: slug)
            )
            article = response.article
            error = nil
        } catch let e as APIError {
            error = e
        } catch {
            self.error = .invalidResponse
        }
    }
}
