import SwiftUI
import UIKit

struct TBTextField: View {
    let title: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var autocap: TextInputAutocapitalization = .sentences

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(TBTypography.label)
                .foregroundStyle(TBColor.textPrimary)
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                    .fill(TBColor.base2)
                RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                    .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
                TextField("", text: $text)
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textPrimary)
                    .textInputAutocapitalization(autocap)
                    .keyboardType(keyboard)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .textContentType(contentType)
            }
            .frame(minHeight: 40)
        }
    }
}

struct TBSecureField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(TBTypography.label)
                .foregroundStyle(TBColor.textPrimary)
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                    .fill(TBColor.base2)
                RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                    .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
                SecureField("", text: $text)
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textPrimary)
                    .textContentType(.password)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
            }
            .frame(minHeight: 40)
        }
    }
}
