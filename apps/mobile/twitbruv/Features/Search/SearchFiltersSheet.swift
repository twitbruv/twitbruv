import SwiftUI

struct SearchFiltersSheet: View {
    @Environment(\.dismiss) private var dismiss

    let initial: SearchFilters
    let onApply: (SearchFilters) -> Void

    @State private var fromHandle: String = ""
    @State private var toHandle: String = ""
    @State private var hasMedia: Bool = false
    @State private var hasLink: Bool = false
    @State private var hasPoll: Bool = false
    @State private var lang: String = ""
    @State private var sinceEnabled: Bool = false
    @State private var since: Date = Date()
    @State private var untilEnabled: Bool = false
    @State private var until: Date = Date()
    @State private var minLikesText: String = ""
    @State private var minRepliesText: String = ""

    var body: some View {
        NavigationStack {
            ZStack {
                TBColor.base1.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        peopleSection
                        contentSection
                        dateSection
                        engagementSection
                    }
                    .padding(.horizontal, TBLayout.pagePadding)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                    .frame(maxWidth: TBLayout.feedMaxWidth)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(TBColor.textSecondary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Apply") {
                        onApply(currentFilters())
                        dismiss()
                    }
                    .font(TBTypography.meta.weight(.semibold))
                    .foregroundStyle(TBColor.accent)
                }
                if hasAnyValue {
                    ToolbarItem(placement: .principal) {
                        Button("Clear all") {
                            resetAll()
                        }
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(TBColor.danger)
                    }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear { loadFromInitial() }
    }

    private var peopleSection: some View {
        section(title: "People") {
            VStack(spacing: 12) {
                handleField(title: "From", placeholder: "username", text: $fromHandle)
                handleField(title: "To", placeholder: "username", text: $toHandle)
            }
        }
    }

    private var contentSection: some View {
        section(title: "Content") {
            VStack(spacing: 4) {
                toggleRow(title: "Has media", icon: "photo-solid", isOn: $hasMedia)
                divider
                toggleRow(title: "Has link", icon: "link-solid", isOn: $hasLink)
                divider
                toggleRow(title: "Has poll", icon: "chart-bar-solid", isOn: $hasPoll)
                divider
                HStack(spacing: 12) {
                    HeroIcon(name: "globe-alt-solid", size: 16)
                        .foregroundStyle(TBColor.textSecondary)
                    Text("Language")
                        .font(TBTypography.body)
                        .foregroundStyle(TBColor.textPrimary)
                    Spacer()
                    TextField("en", text: $lang)
                        .font(TBTypography.body)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .frame(maxWidth: 80)
                        .foregroundStyle(TBColor.textPrimary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
            }
        }
    }

    private var dateSection: some View {
        section(title: "Date") {
            VStack(spacing: 4) {
                dateRow(title: "Since", isOn: $sinceEnabled, date: $since)
                divider
                dateRow(title: "Until", isOn: $untilEnabled, date: $until)
            }
        }
    }

    private var engagementSection: some View {
        section(title: "Engagement") {
            VStack(spacing: 4) {
                numberRow(title: "Min likes", icon: "heart-solid", text: $minLikesText)
                divider
                numberRow(title: "Min replies", icon: "chat-bubble-left-solid", text: $minRepliesText)
            }
        }
    }

    private var divider: some View {
        TBColor.borderNeutral
            .frame(height: 0.5)
            .padding(.horizontal, 12)
    }

    @ViewBuilder
    private func section<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(TBTypography.label)
                .foregroundStyle(TBColor.textSecondary)
                .padding(.horizontal, 4)
            content()
                .frame(maxWidth: .infinity)
                .tbGlass(
                    .panel,
                    in: RoundedRectangle(
                        cornerRadius: TBLayout.radiusGlassPanel,
                        style: .continuous
                    )
                )
        }
    }

    private func handleField(
        title: String,
        placeholder: String,
        text: Binding<String>
    ) -> some View {
        HStack(spacing: 10) {
            Text(title)
                .font(TBTypography.body)
                .foregroundStyle(TBColor.textPrimary)
                .frame(width: 56, alignment: .leading)
            Text("@")
                .font(TBTypography.body)
                .foregroundStyle(TBColor.textTertiary)
            TextField(placeholder, text: text)
                .font(TBTypography.body)
                .foregroundStyle(TBColor.textPrimary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: text.wrappedValue) { _, new in
                    let stripped = new.hasPrefix("@") ? String(new.dropFirst()) : new
                    if stripped != new { text.wrappedValue = stripped }
                }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private func toggleRow(
        title: String,
        icon: String,
        isOn: Binding<Bool>
    ) -> some View {
        HStack(spacing: 12) {
            HeroIcon(name: icon, size: 16)
                .foregroundStyle(TBColor.textSecondary)
            Text(title)
                .font(TBTypography.body)
                .foregroundStyle(TBColor.textPrimary)
            Spacer()
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(TBColor.accent)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func dateRow(
        title: String,
        isOn: Binding<Bool>,
        date: Binding<Date>
    ) -> some View {
        HStack(spacing: 12) {
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(TBColor.accent)
            Text(title)
                .font(TBTypography.body)
                .foregroundStyle(TBColor.textPrimary)
            Spacer()
            if isOn.wrappedValue {
                DatePicker(
                    "",
                    selection: date,
                    displayedComponents: .date
                )
                .labelsHidden()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func numberRow(
        title: String,
        icon: String,
        text: Binding<String>
    ) -> some View {
        HStack(spacing: 12) {
            HeroIcon(name: icon, size: 16)
                .foregroundStyle(TBColor.textSecondary)
            Text(title)
                .font(TBTypography.body)
                .foregroundStyle(TBColor.textPrimary)
            Spacer()
            TextField("Any", text: text)
                .font(TBTypography.body)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 100)
                .foregroundStyle(TBColor.textPrimary)
                .onChange(of: text.wrappedValue) { _, new in
                    let filtered = new.filter(\.isNumber)
                    if filtered != new { text.wrappedValue = filtered }
                }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var hasAnyValue: Bool {
        !fromHandle.isEmpty ||
            !toHandle.isEmpty ||
            hasMedia || hasLink || hasPoll ||
            !lang.isEmpty ||
            sinceEnabled || untilEnabled ||
            !minLikesText.isEmpty || !minRepliesText.isEmpty
    }

    private func loadFromInitial() {
        fromHandle = initial.fromHandle ?? ""
        toHandle = initial.toHandle ?? ""
        hasMedia = initial.hasMedia
        hasLink = initial.hasLink
        hasPoll = initial.hasPoll
        lang = initial.lang ?? ""
        if let s = initial.since {
            sinceEnabled = true
            since = s
        }
        if let u = initial.until {
            untilEnabled = true
            until = u
        }
        minLikesText = initial.minLikes.map(String.init) ?? ""
        minRepliesText = initial.minReplies.map(String.init) ?? ""
    }

    private func currentFilters() -> SearchFilters {
        var f = initial
        f.fromHandle = fromHandle.isEmpty ? nil : fromHandle.lowercased()
        f.toHandle = toHandle.isEmpty ? nil : toHandle.lowercased()
        f.hasMedia = hasMedia
        f.hasLink = hasLink
        f.hasPoll = hasPoll
        f.lang = lang.isEmpty ? nil : lang.lowercased()
        f.since = sinceEnabled ? since : nil
        f.until = untilEnabled ? until : nil
        f.minLikes = Int(minLikesText)
        f.minReplies = Int(minRepliesText)
        return f
    }

    private func resetAll() {
        fromHandle = ""
        toHandle = ""
        hasMedia = false
        hasLink = false
        hasPoll = false
        lang = ""
        sinceEnabled = false
        untilEnabled = false
        minLikesText = ""
        minRepliesText = ""
    }
}

#if DEBUG
#Preview("Light") {
    SearchFiltersSheet(initial: SearchFilters(), onApply: { _ in })
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    SearchFiltersSheet(
        initial: SearchFilters(
            text: "swift",
            fromHandle: "eve",
            hasMedia: true,
            minLikes: 100
        ),
        onApply: { _ in }
    )
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
