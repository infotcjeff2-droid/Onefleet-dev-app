const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// expo-router 的 web 入口:expo/AppEntry.js 寫死 import '../../App'，
// 在 expo-router 專案中沒 App.tsx，會讓 web bundle 失敗。
// 把它別名到 expo-router/entry，讓 web 也走檔案式路由。
config.resolver = config.resolver || {};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo/AppEntry' || moduleName === 'expo/AppEntry.js') {
    return context.resolveRequest(context, 'expo-router/entry', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
