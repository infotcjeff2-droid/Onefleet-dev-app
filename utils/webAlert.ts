/**
 * 跨平台 Alert / Confirm 工具
 * - Web：使用原生 window.alert / window.confirm（Alert.alert 在 Expo Web 不可靠）
 * - Native：使用 React Native 的 Alert.alert
 */
import { Alert, Platform } from 'react-native';

export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export type ConfirmResult = 'confirm' | 'cancel';

export function showConfirm(
  title: string,
  message: string,
  confirmText: string = 'OK',
  cancelText: string = 'Cancel',
): Promise<ConfirmResult> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-restricted-globals
      const result = window.confirm(`${title}\n\n${message}`);
      resolve(result ? 'confirm' : 'cancel');
    } else {
      Alert.alert(
        title,
        message,
        [
          { text: cancelText, style: 'cancel', onPress: () => resolve('cancel') },
          { text: confirmText, style: 'destructive', onPress: () => resolve('confirm') },
        ],
        { cancelable: true },
      );
    }
  });
}
