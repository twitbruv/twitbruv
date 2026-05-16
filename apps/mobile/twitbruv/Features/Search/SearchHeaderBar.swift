import SwiftUI

enum SearchScope: String, CaseIterable, Identifiable {
    case top, people, posts
    var id: String { rawValue }
    var label: String {
        switch self {
        case .top: return "Top"
        case .people: return "People"
        case .posts: return "Posts"
        }
    }
}

struct SearchHeaderBar: View {
    @Binding var query: String
    @Binding var scope: SearchScope
    let showScopes: Bool
    let activeFilterCount: Int
    let canSave: Bool
    let onSubmit: () -> Void
    let onTapFilter: () -> Void
    let onTapSave: () -> Void

    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                field
                if fieldFocused {
                    Button("Cancel") {
                        fieldFocused = false
                    }
                    .font(TBTypography.meta.weight(.medium))
                    .foregroundStyle(TBColor.textPrimary)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                } else {
                    filterButton
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .padding(.horizontal, TBLayout.glassBarOuterMargin + 4)
            .animation(.spring(response: 0.28, dampingFraction: 0.85), value: fieldFocused)

            if showScopes {
                HStack(spacing: 10) {
                    TBFeedSegmented(
                        selection: $scope,
                        options: SearchScope.allCases.map { ($0.label, $0) }
                    )
                    .padding(.leading, TBLayout.glassBarOuterMargin)
                    Spacer(minLength: 8)
                    if canSave {
                        Button(action: onTapSave) {
                            HeroIcon(name: "bookmark-solid", size: 16)
                                .foregroundStyle(TBColor.accent)
                                .frame(width: 36, height: 36)
                                .tbGlass(
                                    .chrome,
                                    in: Circle(),
                                    interactive: true,
                                    shadow: false
                                )
                        }
                        .buttonStyle(TBSquishButtonStyle())
                        .accessibilityLabel("Save search")
                        .padding(.trailing, TBLayout.glassBarOuterMargin)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.85), value: canSave)
                .transition(
                    .move(edge: .top)
                        .combined(with: .opacity)
                )
            }
        }
        .padding(.top, 4)
        .padding(.bottom, 6)
    }

    private var field: some View {
        HStack(spacing: 10) {
            HeroIcon(name: "magnifying-glass-solid", size: 16)
                .foregroundStyle(TBColor.textTertiary)
            TextField("People, posts, #tags", text: $query)
                .font(TBTypography.body)
                .foregroundStyle(TBColor.textPrimary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($fieldFocused)
                .onSubmit(onSubmit)
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    HeroIcon(name: "xmark-solid", size: 14)
                        .foregroundStyle(TBColor.textTertiary)
                        .frame(width: 22, height: 22)
                        .background(
                            Circle().fill(TBColor.subtleFill)
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
                .transition(.opacity.combined(with: .scale))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 40)
        .tbGlassCapsule(.field, interactive: true, shadow: false)
        .animation(.easeOut(duration: 0.15), value: query.isEmpty)
    }

    private var filterButton: some View {
        Button(action: onTapFilter) {
            ZStack(alignment: .topTrailing) {
                HeroIcon(name: "adjustments-horizontal-solid", size: 16)
                    .foregroundStyle(
                        activeFilterCount > 0 ? TBColor.accent : TBColor.textSecondary
                    )
                    .frame(width: 40, height: 40)
                    .tbGlass(
                        .chrome,
                        in: Circle(),
                        interactive: true,
                        shadow: false
                    )
                if activeFilterCount > 0 {
                    Text("\(activeFilterCount)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(TBColor.textOnInverse)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Circle().fill(TBColor.accent))
                        .offset(x: 2, y: -2)
                }
            }
        }
        .buttonStyle(TBSquishButtonStyle())
        .accessibilityLabel(
            activeFilterCount > 0
                ? "Filters — \(activeFilterCount) active"
                : "Filters"
        )
    }
}
