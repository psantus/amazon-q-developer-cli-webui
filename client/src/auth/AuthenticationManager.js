/**
 * Handles AWS Cognito authentication
 */
class AuthenticationManager {
    constructor() {
        this.cognitoUser = null;
        this.identityId = null;
        this.isAuthenticated = false;
        this.credentials = null;
    }

    /**
     * Authenticate user with Cognito
     * @param {string} username 
     * @param {string} password 
     * @returns {Promise<Object>} AWS credentials
     */
    async authenticate(username, password) {
        if (!username || !password) {
            throw new Error('Username and password are required');
        }

        try {
            // Configure AWS Cognito
            AWS.config.region = window.AWS_CONFIG.region;
            
            const poolData = {
                UserPoolId: window.AWS_CONFIG.userPoolId,
                ClientId: window.AWS_CONFIG.userPoolWebClientId
            };
            
            const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
            
            const userData = {
                Username: username,
                Pool: userPool
            };
            
            this.cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
            
            const authenticationData = {
                Username: username,
                Password: password
            };
            
            const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);
            
            // Authenticate user
            const authResult = await new Promise((resolve, reject) => {
                this.cognitoUser.authenticateUser(authenticationDetails, {
                    onSuccess: (result) => {
                        console.log('Authentication successful');
                        resolve(result);
                    },
                    onFailure: (err) => {
                        console.error('Authentication failed:', err);
                        reject(err);
                    }
                });
            });

            // Get AWS credentials
            this.credentials = await this.getAwsCredentials(authResult);
            this.isAuthenticated = true;
            
            return this.credentials;

        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    }

    /**
     * Get AWS credentials from Cognito
     * @param {Object} authResult 
     * @returns {Promise<Object>} AWS credentials
     */
    async getAwsCredentials(authResult) {
        try {
            // Get the ID token from the auth result
            const idToken = authResult.getIdToken().getJwtToken();
            console.log('ID Token obtained from auth result');
            
            // Configure AWS Cognito Identity credentials
            AWS.config.region = window.AWS_CONFIG.region;
            const credentials = new AWS.CognitoIdentityCredentials({
                IdentityPoolId: window.AWS_CONFIG.identityPoolId,
                Logins: {
                    [`cognito-idp.${window.AWS_CONFIG.region}.amazonaws.com/${window.AWS_CONFIG.userPoolId}`]: idToken
                }
            });
            
            // Get AWS credentials
            console.log('Getting AWS credentials...');
            await new Promise((resolve, reject) => {
                credentials.get((err) => {
                    if (err) {
                        console.error('Error getting credentials:', err);
                        reject(err);
                    } else {
                        console.log('AWS credentials obtained successfully');
                        console.log('Access Key ID:', credentials.accessKeyId);
                        console.log('Identity ID:', credentials.identityId);
                        resolve();
                    }
                });
            });
            
            // Store identity ID
            this.identityId = credentials.identityId;
            
            // Return credentials object for MQTT
            return {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken,
                identityId: credentials.identityId
            };

        } catch (error) {
            console.error('Error getting AWS credentials:', error);
            throw error;
        }
    }

    /**
     * Sign out user
     */
    signOut() {
        if (this.cognitoUser) {
            this.cognitoUser.signOut();
        }
        
        this.cognitoUser = null;
        this.identityId = null;
        this.isAuthenticated = false;
        this.credentials = null;
    }

    /**
     * Get current authentication status
     */
    getAuthStatus() {
        return {
            isAuthenticated: this.isAuthenticated,
            identityId: this.identityId,
            credentials: this.credentials
        };
    }
}

export default AuthenticationManager;
