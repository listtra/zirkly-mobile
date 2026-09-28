import { appleSignInService } from "@/services/appleSignInService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { clientHeaders } from "../services/httpHeaders";
import { googleSignInService } from "../services/googleSignInService";

// Configure Google WebBrowser auth (keeping for web fallback)
//WebBrowser.maybeCompleteAuthSession();

// API endpoint configuration
const API_URL = Constants.expoConfig?.extra?.apiUrl;

// Define app scheme for deep linking
const APP_SCHEME = "zirkly";

// Did the server actually reject these credentials, or did we simply fail to
// reach it? Axios throws identically for both, and only the first is grounds
// for destroying a stored session: the refresh token is good for 30 days
// (REFRESH_TOKEN_LIFETIME, no rotation, no blacklist), so clearing it on a
// dead spot or a backend blip signs the user out for nothing and leaves
// nothing to recover from once connectivity returns.
//
// No `response` at all means the request never got an answer — offline, DNS
// failure, timeout. A 5xx means the server answered but couldn't speak for
// the token's validity. Everything else (401/403 above all) is a real verdict.
const isAuthRejection = (error: any): boolean => {
  const status = error?.response?.status;
  if (typeof status !== "number") return false;
  return status < 500;
};

// Tell the backend a login just succeeded, so it can record it against this
// request's IP (the app talks to Django directly, so that IP is correct).
// The audit endpoint is best-effort server-side and this call is fire-and-
// forget here too — a dropped ping must never block or fail a real login.
const recordLogin = (
  accessToken: string,
  method: "EMAIL" | "GOOGLE" | "APPLE",
) => {
  axios
    .post(
      `${API_URL}/api/auth/record-login/`,
      { method },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...clientHeaders(),
        },
      },
    )
    .catch((error) => {
      console.warn("Failed to record login attempt:", error?.message || error);
    });
};

// Native sign-in and registration deliberately live in the web app: this
// shell has no auth screens of its own, and the WebView hands finished
// sessions to `setTokensDirectly` over the AUTH_LOGIN_SUCCESS bridge message.
// A native login()/register() pair used to sit here, unreferenced, navigating
// to /auth/verify-email and /auth/signup-success — routes that do not exist
// in app/, so they resolved to +not-found.

// Define types for our context
type User = {
  id: string;
  email: string;
  nickname: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isInitializing: boolean;
  isAuthenticated: boolean;
  error: string | null;
  logout: () => Promise<void>;
  clearError: () => void;
  tokens: {
    accessToken: string | null;
    refreshToken: string | null;
  };
  storeTokens: (
    accessToken: string,
    refreshToken: string,
    userData?: any,
  ) => Promise<void>;
  setTokensDirectly: (
    accessToken: string,
    refreshToken: string,
    userData?: any,
  ) => Promise<void>;
  handleGoogleSignIn: (
    referralCode?: string,
    turnstileTicket?: string,
  ) => Promise<{ success: boolean; tokens?: any; user?: any; error?: string }>;
  handleAppleSignIn: (
    referralCode?: string,
    turnstileTicket?: string,
  ) => Promise<{ success: boolean; tokens?: any; user?: any; error?: string }>;
};

// Create the context with default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: false,
  isInitializing: true,
  isAuthenticated: false,
  error: null,
  logout: async () => {},
  clearError: () => {},
  tokens: {
    accessToken: null,
    refreshToken: null,
  },
  setTokensDirectly: async () => {},
  storeTokens: async () => {},
  handleGoogleSignIn: async () => ({ success: false }),
  handleAppleSignIn: async () => ({ success: false }),
});

// Hook to use the auth context
export const useAuth = () => useContext(AuthContext);

const APP_VERSION_KEY = "@app_version";
const INSTALLATION_ID_KEY = "@installation_id";
const ACCESS_TOKEN_KEY = "@access_token";
const REFRESH_TOKEN_KEY = "@refresh_token";

const CURRENT_APP_VERSION = Constants.expoConfig?.version || "1.0.0";
const CURRENT_BUILD_NUMBER = String(
  Constants.expoConfig?.ios?.buildNumber ||
    Constants.expoConfig?.android?.versionCode ||
    "1",
);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState({
    accessToken: null as string | null,
    refreshToken: null as string | null,
  });

  // The expiry interval below is set up once with an empty dep array, so it
  // can't see `user` through its closure — this ref is how it reads the
  // current value.
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const isExpoGo = Constants.executionEnvironment === "storeClient";

  // Function to store tokens in AsyncStorage
  const storeTokens = async (
    accessToken: string,
    refreshToken: string,
    userData?: any,
  ) => {
    try {
      console.log(
        "Storing tokens, token lengths:",
        accessToken.length,
        refreshToken.length,
      );
      console.log("User data to store:", userData);

      // Store tokens in AsyncStorage
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

      // Verify tokens were stored
      const storedAccessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
      const storedRefreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);

      console.log("Tokens stored verification:", {
        accessTokenStored: !!storedAccessToken,
        refreshTokenStored: !!storedRefreshToken,
        accessTokenLength: storedAccessToken?.length,
        refreshTokenLength: storedRefreshToken?.length,
      });

      if (!storedAccessToken || !storedRefreshToken) {
        console.error("Failed to store tokens in AsyncStorage");
      }

      // Update state
      setTokens({ accessToken, refreshToken });

      // Set user data if provided
      if (userData) {
        console.log("Setting user data from storeTokens:", userData);
        setUser(userData);
      }

      console.log("Token state updated");
    } catch (error) {
      console.error("Error storing tokens:", error);
    }
  };

  // Function to load tokens from AsyncStorage
  const loadTokens = async () => {
    try {
      const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);

      if (accessToken && refreshToken) {
        setTokens({ accessToken, refreshToken });
        return { accessToken, refreshToken };
      }
      return null;
    } catch (error) {
      console.error("Error loading tokens:", error);
      return null;
    }
  };

  // Function to clear tokens from AsyncStorage
  const clearTokens = async () => {
    try {
      console.log("Clearing tokens from AsyncStorage...");
      await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
      await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
      setTokens({ accessToken: null, refreshToken: null });
      console.log("Tokens cleared successfully");
    } catch (error) {
      console.error("Error clearing tokens:", error);
    }
  };

  // Function to check if this is a fresh install or app version changed
  const checkInstallationState = async (): Promise<boolean> => {
    try {
      console.log("Checking installation state...");

      const storedVersion = await AsyncStorage.getItem(APP_VERSION_KEY);
      const storedInstallationId =
        await AsyncStorage.getItem(INSTALLATION_ID_KEY);

      console.log("Stored version:", storedVersion);
      console.log("Current version:", CURRENT_APP_VERSION);
      console.log("Stored installation ID:", storedInstallationId);

      // ✅ Fresh install only (AsyncStorage is empty after uninstall)
      if (!storedVersion || !storedInstallationId) {
        console.log(
          "Fresh install detected — clearing tokens and setting new state",
        );

        await clearTokens();

        await AsyncStorage.setItem(APP_VERSION_KEY, CURRENT_APP_VERSION);
        await AsyncStorage.setItem(INSTALLATION_ID_KEY, Date.now().toString());

        return true; // Fresh install
      }

      console.log("Existing installation detected — keeping tokens");
      return false; // Not a reinstall
    } catch (error) {
      console.error("Error checking installation state:", error);
      return false;
    }
  };

  // Enhanced token validation
  const validateAndLoadTokens = async (): Promise<{
    accessToken: string;
    refreshToken: string;
  } | null> => {
    try {
      const storedTokens = await loadTokens();

      if (!storedTokens?.accessToken || !storedTokens?.refreshToken) {
        console.log("No tokens found in storage");
        return null;
      }

      // Validate token by checking expiration
      try {
        const base64Url = storedTokens.accessToken.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map((c) => {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join(""),
        );

        const { exp } = JSON.parse(jsonPayload);
        const isExpired = exp * 1000 < Date.now();

        console.log("Token validation - Expired:", isExpired);

        if (isExpired) {
          console.log("Access token expired, will attempt refresh");
          // Token is expired, but we'll try to refresh it
          return storedTokens;
        }

        return storedTokens;
      } catch (parseError) {
        console.error("Error parsing token:", parseError);
        // If we can't parse the token, it's invalid
        await clearTokens();
        return null;
      }
    } catch (error) {
      console.error("Error validating tokens:", error);
      return null;
    }
  };

  // Initialize auth state on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log("=== AUTH INITIALIZATION STARTED ===");

        // Check if this is a fresh install
        const isFreshInstall = await checkInstallationState();

        if (isFreshInstall) {
          console.log("Fresh install detected - starting with clean state");
          setIsInitializing(false);
          return;
        }

        // Validate and load tokens
        const storedTokens = await validateAndLoadTokens();

        if (storedTokens?.accessToken) {
          // Try to get user profile
          try {
            const response = await axios.get(`${API_URL}/api/profile/`, {
              headers: {
                Authorization: `Bearer ${storedTokens.accessToken}`,
                "X-Expo-Go": isExpoGo ? "true" : "false",
                ...clientHeaders(),
              },
            });

            console.log("Profile loaded successfully:", response.data);
            setUser(response.data);
          } catch (profileError: any) {
            // Couldn't reach the server (offline launch, backend down). The
            // stored session is untouched and still valid — keep it, start
            // unauthenticated for now, and let the expiry interval below pick
            // things up once the network is back.
            if (!isAuthRejection(profileError)) {
              console.log(
                "Profile fetch failed without a server verdict - keeping stored session",
              );
            } else if (storedTokens.refreshToken) {
              console.log("Profile fetch rejected, attempting token refresh");
              // refreshAccessToken owns the clearing decision — it makes the
              // same reachable-vs-rejected distinction on its own call.
              await refreshAccessToken(storedTokens.refreshToken);
            } else {
              console.log("No refresh token available - clearing auth state");
              await clearTokens();
              setUser(null);
            }
          }
        } else {
          console.log("No valid tokens found");
        }

        console.log("=== AUTH INITIALIZATION COMPLETED ===");
      } catch (error) {
        console.error("Auth initialization error:", error);
        // Clear only if the server actually rejected us; an unreachable
        // backend must not cost the user their session.
        if (isAuthRejection(error)) {
          await clearTokens();
        }
        setUser(null);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeAuth();
  }, []);

  // Set up token refresh mechanism
  useEffect(() => {
    const checkTokenExpiration = async () => {
      const storedTokens = await loadTokens();
      if (!storedTokens?.accessToken) return;

      try {
        // Decode JWT to check expiration
        const base64Url = storedTokens.accessToken.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map((c) => {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join(""),
        );

        const { exp } = JSON.parse(jsonPayload);
        const expiresIn = exp * 1000 - Date.now();
        const minutes = Math.floor(expiresIn / 60000);
        const seconds = Math.floor((expiresIn % 60000) / 1000);
        console.log(
          `Token expires in: ${minutes} minutes and ${seconds} seconds`,
        );

        // If token expires in less than 5 minutes, refresh it
        if (expiresIn < 5 * 60 * 1000) {
          console.log("Token expiring soon, refreshing...");
          await refreshAccessToken(storedTokens.refreshToken);
          return;
        }

        // Tokens on disk but nobody signed in: the launch-time profile fetch
        // couldn't reach the server, so the session was kept and this tick is
        // the retry. Without it the app would sit unauthenticated — no push
        // registration — until the access token neared expiry, up to an hour.
        if (!userRef.current) {
          try {
            const response = await axios.get(`${API_URL}/api/profile/`, {
              headers: {
                Authorization: `Bearer ${storedTokens.accessToken}`,
                "X-Expo-Go": isExpoGo ? "true" : "false",
                ...clientHeaders(),
              },
            });
            console.log("Recovered session after earlier profile failure");
            setUser(response.data);
          } catch (recoveryError) {
            if (isAuthRejection(recoveryError)) {
              // The stored access token is genuinely no good — this is the
              // verdict the offline launch never got. Let the refresh token
              // have its turn.
              await refreshAccessToken(storedTokens.refreshToken);
            }
            // Still unreachable: nothing to do, the next tick retries.
          }
        }
      } catch (error) {
        console.error("Error checking token expiration:", error);
      }
    };

    // Check token expiration every minute
    const interval = setInterval(checkTokenExpiration, 60000);

    // Check immediately on mount
    checkTokenExpiration();

    return () => clearInterval(interval);
  }, []);

  // Function to handle refresh token
  const refreshAccessToken = async (refreshToken: string | null) => {
    console.log("=== TOKEN REFRESH STARTED ===");
    console.log("Refresh token available:", !!refreshToken);

    if (!refreshToken) {
      console.log("No refresh token, clearing auth state");
      await clearTokens();
      setUser(null);
      return false;
    }

    try {
      console.log("Making token refresh request...");
      const response = await axios.post(`${API_URL}/api/token/refresh/`, {
        refresh: refreshToken,
      });

      if (response.data.access) {
        console.log("Token refresh successful, storing new tokens");
        await storeTokens(response.data.access, refreshToken);

        // Fetch user profile after token refresh to maintain authentication state
        console.log("Fetching user profile after token refresh...");
        try {
          const profileResponse = await axios.get(`${API_URL}/api/profile/`, {
            headers: {
              Authorization: `Bearer ${response.data.access}`,
              "X-Expo-Go": isExpoGo ? "true" : "false",
              ...clientHeaders(),
            },
          });

          console.log("Profile refreshed successfully:", profileResponse.data);
          console.log("User state before update:", user);
          setUser(profileResponse.data);
          console.log("User state updated after token refresh");
          console.log(
            "isAuthenticated should now be:",
            !!(profileResponse.data && response.data.access),
          );
        } catch (profileError) {
          console.error(
            "Error fetching profile after token refresh:",
            profileError,
          );
          // The refresh itself succeeded, so the new access token is stored
          // and good. Only a rejection of that fresh token means the session
          // is genuinely dead; anything else is the network, and the tokens
          // stay put.
          if (isAuthRejection(profileError)) {
            console.log("Clearing auth state due to profile rejection");
            await clearTokens();
            setUser(null);
          }
          return false;
        }

        console.log("=== TOKEN REFRESH COMPLETED SUCCESSFULLY ===");
        return true;
      }

      console.log("Token refresh response missing access token");
      return false;
    } catch (error) {
      console.error("Token refresh failed:", error);
      // A rejected refresh token is the one unambiguous "this session is
      // over" signal there is. An unreachable server is not: keep the tokens
      // so the next interval tick (or the next launch with signal) can retry.
      if (isAuthRejection(error)) {
        console.log("Clearing auth state - refresh token rejected by server");
        await clearTokens();
        setUser(null);
      } else {
        console.log(
          "Token refresh could not reach the server - keeping stored session",
        );
      }
      return false;
    }
  };

  // Logout user
  const logout = async () => {
    console.log("Logging out user from mobile app");

    // Sign out from Google and Apple as well
    try {
      await googleSignInService.signOut();
      await appleSignInService.signOut();
    } catch (error) {
      console.error("Error signing out from social providers:", error);
    }

    // Clear user state first
    setUser(null);

    // Clear tokens from secure storage
    await clearTokens();

    console.log("Mobile app logout completed - tokens and user cleared");

    // Note: WebView auth clearing is handled in PersistentWebView component
    // when isAuthenticated becomes false
  };

  // Clear error messages
  const clearError = () => {
    setError(null);
  };

  // Function to directly set tokens (useful for WebView integration)
  // In setTokensDirectly function, make sure you're setting the user:
  const setTokensDirectly = async (
    accessToken: string,
    refreshToken: string,
    userData?: any,
  ) => {
    try {
      await storeTokens(accessToken, refreshToken, userData);

      if (userData) {
        console.log("🔧 Setting user in setTokensDirectly:", userData);
        setUser(userData);
      } else {
        // If no userData provided, fetch it using the access token
        try {
          const response = await axios.get(`${API_URL}/api/profile/`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              ...clientHeaders(),
            },
          });
          console.log("🔧 Fetched user profile:", response.data);
          setUser(response.data);
        } catch (error) {
          console.error(
            "Error fetching user profile with provided token:",
            error,
          );
        }
      }
      return true;
    } catch (error) {
      console.error("Error setting tokens directly:", error);
      return false;
    }
  };

  // Updated handleGoogleSignIn to use native Google Sign-In
  const handleGoogleSignIn = async (
    referralCode?: string,
    turnstileTicket?: string,
  ): Promise<{
    success: boolean;
    tokens?: any;
    user?: any;
    error?: string;
  }> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log("🚀 AuthContext: Starting native Google Sign-In...");
      if (referralCode) {
        console.log("🚀 AuthContext: With referral code:", referralCode);
      }

      const result = await googleSignInService.signIn(
        referralCode,
        turnstileTicket,
      );
      console.log("🚀 AuthContext: GoogleSignInService result:", result);

      if (result.success && result.tokens && result.user) {
        console.log("🚀 AuthContext: Native Google Sign-In successful");
        console.log("🚀 AuthContext: Tokens:", result.tokens);
        console.log("🚀 AuthContext: User:", result.user);

        recordLogin(result.tokens.accessToken, "GOOGLE");

        console.log(
          "🚀 AuthContext: Google sign-in successful - returning tokens and user",
        );
        setIsLoading(false);

        return {
          success: true,
          tokens: result.tokens,
          user: result.user,
        };
      } else {
        console.error(
          "🚀 AuthContext: Native Google Sign-In failed:",
          result.error,
        );
        setError(result.error || "Google Sign-In failed");
        setIsLoading(false);
        return {
          success: false,
          error: result.error || "Google Sign-In failed",
        };
      }
    } catch (error: any) {
      console.error("🚀 AuthContext: Google sign in error:", error);
      setError("Authentication failed. Please try again.");
      setIsLoading(false);
      return { success: false, error: "Authentication failed" };
    }
  };

  const handleAppleSignIn = async (
    referralCode?: string,
    turnstileTicket?: string,
  ): Promise<{
    success: boolean;
    tokens?: any;
    user?: any;
    error?: string;
  }> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log("🍎 AuthContext: Starting native Apple Sign-In...");
      if (referralCode) {
        console.log("🚀 AuthContext: With referral code:", referralCode);
      }

      const result = await appleSignInService.signIn(
        referralCode,
        turnstileTicket,
      );
      console.log("🍎 AuthContext: AppleSignInService result:", result);

      if (result.success && result.tokens && result.user) {
        console.log("🍎 AuthContext: Native Apple Sign-In successful");
        console.log("🍎 AuthContext: Tokens:", result.tokens);
        console.log("🍎 AuthContext: User:", result.user);

        recordLogin(result.tokens.accessToken, "APPLE");

        console.log(
          "🍎 AuthContext: Apple sign-in successful - returning tokens and user",
        );
        setIsLoading(false);

        return {
          success: true,
          tokens: result.tokens,
          user: result.user,
        };
      } else {
        console.error(
          "🍎 AuthContext: Native Apple Sign-In failed:",
          result.error,
        );
        setError(result.error || "Apple Sign-In failed");
        setIsLoading(false);
        return {
          success: false,
          error: result.error || "Apple Sign-In failed",
        };
      }
    } catch (error: any) {
      console.error("🍎 AuthContext: Apple sign in error:", error);
      setError("Authentication failed. Please try again.");
      setIsLoading(false);
      return { success: false, error: "Authentication failed" };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isInitializing,
        isAuthenticated: !!user && !!tokens.accessToken,
        error,
        logout,
        clearError,
        tokens,
        setTokensDirectly: async (
          accessToken: string,
          refreshToken: string,
          userData?: any,
        ): Promise<void> => {
          await setTokensDirectly(accessToken, refreshToken, userData);
        },
        handleGoogleSignIn,
        handleAppleSignIn,
        storeTokens: async (
          accessToken: string,
          refreshToken: string,
          userData?: any,
        ): Promise<void> => {
          await storeTokens(accessToken, refreshToken);
          if (userData) {
            setUser(userData);
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
