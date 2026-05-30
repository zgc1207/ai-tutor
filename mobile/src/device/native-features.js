import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

function normalizePickedImage(result) {
  const asset = result.assets?.[0];
  if (!asset?.base64) throw new Error('没有读取到图片数据');
  return {
    imageData: asset.base64,
    contentType: asset.mimeType || 'image/jpeg',
    uri: asset.uri,
  };
}

async function pickImageFromSource(source) {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('未获得图片权限');

  const launch = source === 'camera'
    ? ImagePicker.launchCameraAsync
    : ImagePicker.launchImageLibraryAsync;
  const result = await launch({
    allowsEditing: false,
    base64: true,
    quality: 0.85,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
  });
  if (result.canceled) return null;
  return normalizePickedImage(result);
}

export function takeQuestionPhoto() {
  return pickImageFromSource('camera');
}

export function chooseQuestionImage() {
  return pickImageFromSource('library');
}

export async function registerReviewPushToken({ api }) {
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('未获得通知权限');

  const tokenResult = await Notifications.getExpoPushTokenAsync();
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown';
  return api.registerDeviceToken({
    platform,
    provider: 'expo',
    token: tokenResult.data,
  });
}
