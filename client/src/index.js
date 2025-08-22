// Import AWS SDK and make it globally available
import AWS from 'aws-sdk';
window.AWS = AWS;

// Import Cognito Identity SDK and make it globally available
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
window.AmazonCognitoIdentity = {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails
};

// Import AWS IoT Device SDK v2 for WebSocket MQTT with SigV4
import * as AWSIoTv2 from 'aws-iot-device-sdk-v2';
window.AWSIoTv2 = AWSIoTv2;

console.log('🚀 AWS SDK, Cognito, and AWS IoT Device SDK v2 loaded successfully!');
console.log('Available AWSIoTv2 modules:', Object.keys(AWSIoTv2));

// Import the main application
import './app.js';
