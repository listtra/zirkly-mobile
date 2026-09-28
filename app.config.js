import "dotenv/config";

export default {
  expo: {
    name: "Zirkly",
    slug: "zirkly-mobile-app",
    version: "1.0.10",
    orientation: "portrait",
    icon: "./assets/images/icon3.png",
    scheme: "zirkly",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    ios: {
      bundleIdentifier: "com.zirkly.app",
      appleTeamId: "7DWNYSF658",
      associatedDomains: [
        "applinks:www.zirkly.com.au",
        "applinks:zirkly.com.au",
      ],
      entitlements: {
        "com.apple.developer.applesignin": ["Default"],
      },
      buildNumber: "40",
      supportsTablet: true,
      statusBarStyle: "dark-content",
      statusBarBackgroundColor: "#F9FAFB",
      googleServicesFile: "./GoogleService-Info.plist",
      infoPlist: {
        UIStatusBarStyle: "UIStatusBarStyleDarkContent",
        UIViewControllerBasedStatusBarAppearance: false,
        UIBackgroundModes: ["remote-notification"],
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSExceptionDomains: {
            "res.cloudinary.com": {
              NSExceptionAllowsInsecureHTTPLoads: false,
              NSIncludesSubdomains: true,
              NSExceptionMinimumTLSVersion: "TLSv1.2",
              NSExceptionRequiresForwardSecrecy: true,
            },
            "cloudinary.com": {
              NSIncludesSubdomains: true,
              NSExceptionMinimumTLSVersion: "TLSv1.2",
              NSExceptionRequiresForwardSecrecy: true,
            },
            "zirkly.com": {
              NSIncludesSubdomains: true,
              NSExceptionMinimumTLSVersion: "TLSv1.2",
              NSExceptionRequiresForwardSecrecy: true,
            },
            "backend.listtra.com": {
              NSIncludesSubdomains: true,
              NSExceptionMinimumTLSVersion: "TLSv1.2",
              NSExceptionRequiresForwardSecrecy: true,
            },
            "dev.zirkly.com": {
              NSIncludesSubdomains: true,
              NSExceptionMinimumTLSVersion: "TLSv1.2",
              NSExceptionRequiresForwardSecrecy: true,
            },
          },
        },
      },
    },

    android: {
      package: "com.zirkly.app",
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "www.zirkly.com.au" },
            { scheme: "https", host: "zirkly.com.au" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
      versionCode: 40,
      edgeToEdgeEnabled: false,
      statusBarStyle: "dark-content",
      softInputMode: "adjustResize",
      statusBarBackgroundColor: "#F9FAFB",
      statusBarTranslucent: false,
      googleServicesFile: "./google-services.json",
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "CAMERA"],
    },

    web: {
      bundler: "metro",
      output: "server",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "@bacons/apple-targets",
      "expo-secure-store",
      "expo-router",
      "expo-apple-authentication",
      "expo-localization",
      "expo-notifications",
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
            extraPods: [
              {
                name: "GoogleUtilities",
                modular_headers: true,
              },
            ],
          },
        },
      ],
      // [
      //   "expo-splash-screen",
      //   {
      //     image: "./assets/images/splash-icon.png",
      //     imageWidth: 200,
      //     resizeMode: "contain",
      //     backgroundColor: "#ffffff",
      //   },
      // ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to use your location to help you find nearby items and automatically set your pickup location.",
          locationAlwaysPermission:
            "Allow $(PRODUCT_NAME) to use your location to help you find nearby items and automatically set your pickup location.",
          locationWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to use your location to help you find nearby items and automatically set your pickup location.",
        },
      ],
      // Add Google Sign-In plugin
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme:
            "com.googleusercontent.apps.827930578004-9t2a9k7cmjevruiee4s0iq5k9h5p3eqg",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow $(PRODUCT_NAME) to access your photos to upload listing images.",
          cameraPermission:
            "Allow $(PRODUCT_NAME) to access your camera to take photos for listings.",
          microphonePermission: false, // Set to true if you need audio recording
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      apiUrl: "https://dev.zirkly.com",
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
      googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
      googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
      eas: {
        projectId: "4b354982-5b2c-4a00-8860-d4701f089a23",
      },
    },
    owner: "jibinb",
  },
};
