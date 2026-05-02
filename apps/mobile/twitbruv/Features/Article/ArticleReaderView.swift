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
                            default: Color(.tertiarySystemFill)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .aspectRatio(16.0 / 9.0, contentMode: .fit)
                        .clipShape(.rect(cornerRadius: 12))
                    }
                    Text(article.title ?? "Untitled")
                        .font(.largeTitle.weight(.bold))
                    if let subtitle = article.subtitle {
                        Text(subtitle)
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    HStack(spacing: 8) {
                        if let author = article.author {
                            AvatarView(
                                urlString: author.avatarUrl, size: 28,
                                fallbackInitial: author.displayName ?? author.handle
                            )
                            Text(author.displayName ?? author.handle ?? "—")
                                .font(.callout.weight(.semibold))
                        }
                        Spacer()
                        if let pub = article.publishedAt {
                            Text(pub.formatted(date: .abbreviated, time: .omitted))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Divider()
                    if let body = article.body {
                        Text(LocalizedStringKey(body))
                            .font(.body)
                            .lineSpacing(4)
                    }
                }
                .padding()
            } else if let error {
                ErrorBanner(message: error.localizedDescription) {
                    Task { await load() }
                }
                .padding(.top, 40)
            } else {
                ProgressView().padding(.top, 80)
            }
        }
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
