import SwiftUI
import UIKit

struct TBTextField: View {
    let title: String
    @Binding var text: String
    var placeholder: String = ""
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var autocap: TextInputAutocapitalization = .sentences

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(TBTypography.label)
                .foregroundStyle(TBColor.textPrimary)
            ZStack(alignment: .leading) {
                TextField(placeholder, text: $text)
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textPrimary)
                    .textInputAutocapitalization(autocap)
                    .keyboardType(keyboard)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .textContentType(contentType)
            }
            .frame(minHeight: 40)
            .background(
                TBColor.subtleFill,
                in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous)
            )
        }
    }
}

struct TBSecureField: View {
    let title: String
    @Binding var text: String
    var placeholder: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(TBTypography.label)
                .foregroundStyle(TBColor.textPrimary)
            ZStack(alignment: .leading) {
                SecureField(placeholder, text: $text)
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textPrimary)
                    .textContentType(.password)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
            }
            .frame(minHeight: 40)
            .background(
                TBColor.subtleFill,
                in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous)
            )
        }
    }
}
