import SwiftUI

struct LoadMoreFooter: View {
    var hasMore: Bool
    var isLoading: Bool
    var onAppear: () async -> Void

    var body: some View {
        Group {
            if hasMore {
                HStack {
                    Spacer()
                    if isLoading {
                        ProgressView()
                    } else {
                        Color.clear.frame(height: 1)
                    }
                    Spacer()
                }
                .frame(height: 44)
                .task { await onAppear() }
            } else {
                Color.clear.frame(height: 1).hidden()
            }
        }
        .listRowSeparator(.hidden)
    }
}
