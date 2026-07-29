import { AuthenticateWithRedirectCallback } from '@clerk/expo';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '@/constants/theme';

export default function SSOCallback() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <AuthenticateWithRedirectCallback
        continueSignUpUrl="/(tabs)"
        signInForceRedirectUrl="/(tabs)"
        signUpForceRedirectUrl="/(tabs)"
      />
    </View>
  );
}
