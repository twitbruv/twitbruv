import SwiftUI

struct GithubProfileSection: View {
    let profile: GithubProfilePayload

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text("GitHub")
                        .font(TBTypography.meta.weight(.bold))
                        .foregroundStyle(TBColor.textPrimary)
                    
                    Rectangle()
                        .fill(TBColor.borderNeutral)
                        .frame(width: 1, height: 12)
                    
                    if let urlString = profile.htmlUrl, let url = URL(string: urlString) {
                        Link(destination: url) {
                            Text("@\(profile.login ?? "")")
                                .font(TBTypography.bodySecondary)
                                .foregroundStyle(TBColor.textSecondary)
                        }
                    } else {
                        Text("@\(profile.login ?? "")")
                            .font(TBTypography.bodySecondary)
                            .foregroundStyle(TBColor.textSecondary)
                    }
                }
                
                if let contributions = profile.contributions {
                    GithubContributionsHeatmap(contributions: contributions)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous)
                    .fill(TBColor.subtleFill)
            )

            if let pinned = profile.pinned, !pinned.isEmpty {
                VStack(spacing: 8) {
                    ForEach(pinned) { repo in
                        GithubPinnedRepoCard(repo: repo)
                    }
                }
            }
        }
    }
}

private struct GithubContributionsHeatmap: View {
    let contributions: GithubContributions
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                ForEach(contributions.weeks, id: \.self) { week in
                    VStack(spacing: 2) {
                        ForEach(week.days, id: \.self) { day in
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(Color(hex: day.color))
                                .frame(width: 10, height: 10)
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                .fill(TBColor.base1)
        )
    }
}

private struct GithubPinnedRepoCard: View {
    let repo: GithubPinnedRepo
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(repo.name)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(TBColor.textPrimary)
                    .lineLimit(1)
                
                if let desc = repo.description {
                    Text(desc)
                        .font(.system(size: 12, weight: .light))
                        .foregroundStyle(TBColor.textSecondary)
                        .lineLimit(2)
                }
            }
            
            Spacer(minLength: 0)
            
            HStack(spacing: 12) {
                if let lang = repo.primaryLanguage {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color(hex: lang.color ?? "#888888"))
                            .frame(width: 10, height: 10)
                        Text(lang.name)
                    }
                }
                
                if repo.stars > 0 {
                    HStack(spacing: 4) {
                        HeroIcon(name: "star-solid", size: 14)
                        Text("\(repo.stars)")
                    }
                }
                
                if repo.forks > 0 {
                    HStack(spacing: 4) {
                        HeroIcon(name: "arrows-right-left-solid", size: 14)
                        Text("\(repo.forks)")
                    }
                }
            }
            .font(.system(size: 11.5))
            .foregroundStyle(TBColor.textSecondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                .fill(TBColor.subtleFill)
        )
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
