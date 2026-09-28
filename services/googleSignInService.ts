import { clientHeaders } from './httpHeaders';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

interface GoogleSignInResult {
  success: boolean;
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  user?: any;
  error?: string;
}

export class GoogleSignInService {
  private isConfigured = false;

  constructor() {
    this.configure();
  }

  private configure() {
    if (this.isConfigured) return;

    try {
      const config = {
        webClientId: Constants.expoConfig?.extra?.googleWebClientId,
        offlineAccess: true, // Enable to get refresh token
        hostedDomain: '', // Optional
        loginHint: '', // Optional
        forceCodeForRefreshToken: true, // Force to get refresh token
        accountName: '', // Optional
        iosClientId: Constants.expoConfig?.extra?.googleIosClientId, // Optional, only for iOS
        googleServicePlistPath: '', // Optional, only for iOS
        openIdConnect: true, // Optional, for getting idToken
      };

      console.log('Configuring Google Sign-In with config:', {
        hasWebClientId: !!config.webClientId,
        hasIosClientId: !!config.iosClientId,
        offlineAccess: config.offlineAccess,
      });

      GoogleSignin.configure(config);
      this.isConfigured = true;
    } catch (error) {
      console.error('Error configuring Google Sign-In:', error);
    }
  }

  async isSignedIn(): Promise<boolean> {
    try {
      const isSignedIn = await GoogleSignin.getCurrentUser();
      return !!isSignedIn;
    } catch (error) {
      console.error('Error checking if signed in:', error);
      return false;
    }
  }

  async signIn(referralCode?: string, turnstileTicket?: string): Promise<GoogleSignInResult> {
    try {
      console.log('⭐ GoogleSignInService: Starting Google Sign-In...');
      if (referralCode) {
        console.log('⭐ GoogleSignInService: With referral code:', referralCode);
      }
      // Check if device supports Google Play Services (Android)
      console.log('⭐ GoogleSignInService: Checking Play Services...');
      await GoogleSignin.hasPlayServices();
      console.log('⭐ GoogleSignInService: Play Services available');

      // Sign in
      console.log('⭐ GoogleSignInService: Calling GoogleSignin.signIn()...');
      const userInfo = await GoogleSignin.signIn();
      console.log('⭐ GoogleSignInService: Google Sign-In response:', userInfo);
      console.log('⭐ GoogleSignInService: Google Sign-In successful:', {
        hasUser: !!userInfo.data?.user,
        hasIdToken: !!userInfo.data?.idToken,
        hasServerAuthCode: !!userInfo.data?.serverAuthCode,
      });

      if (!userInfo.data?.idToken) {
        throw new Error('No ID token received from Google Sign-In');
      }

      console.log('⭐ GoogleSignInService: Exchanging token with backend...');
      // Exchange the Google ID token with your backend
      const backendResponse = await this.exchangeTokenWithBackend(userInfo.data.idToken, referralCode, turnstileTicket);
      console.log('⭐ GoogleSignInService: Backend response:', backendResponse);

      if (backendResponse.success) {
        console.log('⭐ GoogleSignInService: Authentication successful!');
        return {
          success: true,
          tokens: backendResponse.tokens,
          user: backendResponse.user,
        };
      } else {
        throw new Error(backendResponse.error || 'Failed to authenticate with backend');
      }

    } catch (error: any) {
      console.error('⭐ GoogleSignInService: Google Sign-In error:', error);

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return { success: false, error: 'Sign-in cancelled by user' };
      } else if (error.code === statusCodes.IN_PROGRESS) {
        return { success: false, error: 'Sign-in already in progress' };
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { success: false, error: 'Google Play Services not available' };
      } else {
        return { success: false, error: error.message || 'Google Sign-In failed' };
      }
    }
  }

  async signOut(): Promise<void> {
    try {
      await GoogleSignin.signOut();
      console.log('Google Sign-Out successful');
    } catch (error) {
      console.error('Error signing out from Google:', error);
    }
  }

  async revokeAccess(): Promise<void> {
    try {
      await GoogleSignin.revokeAccess();
      console.log('Google access revoked');
    } catch (error) {
      console.error('Error revoking Google access:', error);
    }
  }

  private async exchangeTokenWithBackend(
    idToken: string,
    referralCode?: string,
    turnstileTicket?: string,
  ) {
    try {
      const API_URL = Constants.expoConfig?.extra?.apiUrl;

      const requestBody: any = {
        id_token: idToken,
      };

      // Add referral code if provided
      if (referralCode) {
        requestBody.referral_code = referralCode;
        console.log('⭐ GoogleSignInService: Including referral code:', referralCode);
      }

      const response = await fetch(`${API_URL}/api/auth/google/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // This endpoint writes the SIGNUP row for a brand-new account, so
          // the language it records comes from here or not at all.
          ...clientHeaders(),
          // Cloudflare Turnstile was solved in the WebView before it handed
          // sign-in over to the native SDK; this is that proof, exchanged for
          // a ticket so it survives the trip.
          ...(turnstileTicket ? { 'CF-Turnstile-Ticket': turnstileTicket } : {}),
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 409) {
          // Account already exists with this email - use the specific error message from backend
          throw new Error(data.details || data.detail || 'Looks like you signed up with your email address. Please sign in with email to continue.');
        }
        throw new Error(data.details || data.detail || data.error || 'Backend authentication failed');
      }

      if (!data.access || !data.refresh) {
        throw new Error('Invalid response from backend - missing tokens');
      }

      return {
        success: true,
        tokens: {
          accessToken: data.access,
          refreshToken: data.refresh,
        },
        user: {
          id: data.user_id,
          email: data.email,
          nickname: data.nickname,
          user_created: data.user_created,
        },
      };
    } catch (error: any) {
      console.error('Error exchanging token with backend:', error);
      return {
        success: false,
        error: error.message || 'Failed to authenticate with backend',
      };
    }
  }
}

// Export singleton instance
export const googleSignInService = new GoogleSignInService();
