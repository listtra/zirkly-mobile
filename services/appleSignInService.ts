import { clientHeaders } from './httpHeaders';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface AppleSignInResult {
    success: boolean;
    tokens?: {
        accessToken: string;
        refreshToken: string;
    };
    user?: any;
    error?: string;
}

export class AppleSignInService {
    async isAvailable(): Promise<boolean> {
        if (Platform.OS !== 'ios') {
            return false;
        }
        try {
            return await AppleAuthentication.isAvailableAsync();
        } catch (error) {
            console.error('Error checking Apple Sign-In availability:', error);
            return false;
        }
    }

    async signIn(referralCode?: string, turnstileTicket?: string): Promise<AppleSignInResult> {
        try {
            console.log('⭐ AppleSignInService: Starting Apple Sign-In...');
            if (referralCode) {
                console.log('⭐ AppleSignInService: With referral code:', referralCode);
            }
            // Check if Apple Sign-In is available
            const isAvailable = await this.isAvailable();
            if (!isAvailable) {
                throw new Error('Apple Sign-In is not available on this device');
            }

            // Perform the sign-in request
            console.log('⭐ AppleSignInService: Calling appleAuth.requestAsync()...');
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            console.log('⭐ AppleSignInService: Apple Sign-In response:', {
                hasIdentityToken: !!credential.identityToken,
                hasAuthorizationCode: !!credential.authorizationCode,
                hasUser: !!credential.user,
                hasEmail: !!credential.email,
                hasFullName: !!credential.fullName,
            });

            if (!credential.identityToken) {
                throw new Error('No identity token received from Apple Sign-In');
            }

            console.log('⭐ AppleSignInService: Exchanging token with backend...');
            // Exchange the Apple identity token with your backend
            const backendResponse = await this.exchangeTokenWithBackend(
                credential.identityToken,
                credential.authorizationCode,
                credential.user,
                credential.email,
                credential.fullName,
                referralCode,
                turnstileTicket
            );

            console.log('⭐ AppleSignInService: Backend response:', backendResponse);

            if (backendResponse.success) {
                console.log('⭐ AppleSignInService: Authentication successful!');
                return {
                    success: true,
                    tokens: backendResponse.tokens,
                    user: backendResponse.user,
                };
            } else {
                throw new Error(backendResponse.error || 'Failed to authenticate with backend');
            }

        } catch (error: any) {
            console.error('⭐ AppleSignInService: Apple sign in error:', error);
            console.error('⭐ AppleSignInService: Error details:', {
                code: error.code,
                message: error.message,
                localizedDescription: error.localizedDescription,
                stack: error.stack
            });

            // Handle specific Apple Sign-In errors
            if (error.code === 'ERR_CANCELED') {
                return { success: false, error: 'Apple Sign-In was canceled' };
            } else if (error.code === 'ERR_FAILED') {
                return { success: false, error: 'Apple Sign-In failed' };
            } else if (error.code === 'ERR_INVALID_RESPONSE') {
                return { success: false, error: 'Invalid response from Apple' };
            } else if (error.code === 'ERR_NOT_HANDLED') {
                return { success: false, error: 'Apple Sign-In not handled' };
            } else if (error.code === 'ERR_UNKNOWN') {
                return { success: false, error: 'Unknown Apple Sign-In error' };
            }

            return { success: false, error: error.message || 'Apple Sign-In failed' };
        }
    }

    async signOut(): Promise<void> {
        try {
            // Apple doesn't provide a sign-out method like Google
            // The sign-out is handled by clearing local tokens
            console.log('⭐ AppleSignInService: Apple Sign-In signed out (local only)');
        } catch (error) {
            console.error('⭐ AppleSignInService: Error during sign out:', error);
        }
    }

    private async exchangeTokenWithBackend(
        identityToken: string,
        authorizationCode?: string | null,
        user?: string | null,
        email?: string | null,
        fullName?: AppleAuthentication.AppleAuthenticationFullName | null,
        referralCode?: string,
        turnstileTicket?: string
    ) {
        try {
            const API_URL = Constants.expoConfig?.extra?.apiUrl;

            const requestBody: any = {
                identity_token: identityToken,
                authorization_code: authorizationCode,
                user: user,
                email: email,
                full_name: fullName,
            };

            // Add referral code if provided
            if (referralCode) {
                requestBody.referral_code = referralCode;
                console.log('⭐ AppleSignInService: Including referral code:', referralCode);
            }

            const response = await fetch(`${API_URL}/api/auth/apple/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // This endpoint writes the SIGNUP row for a brand-new
                    // account, so the language it records comes from here.
                    ...clientHeaders(),
                    // Turnstile was solved in the WebView before it handed
                    // sign-in over to the native SDK; this is that proof.
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
export const appleSignInService = new AppleSignInService();