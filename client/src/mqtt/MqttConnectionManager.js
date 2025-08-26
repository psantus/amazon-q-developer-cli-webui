/**
 * Handles MQTT connection to AWS IoT Core
 */
class MqttConnectionManager {
    constructor() {
        this.mqttClient = null;
        this.isConnected = false;
        this.clientId = null;
        this.credentials = null;
        this.eventHandlers = new Map();
        this.subscriptions = new Set();
    }

    /**
     * Connect to AWS IoT Core via WebSocket
     * @param {Object} credentials - AWS credentials
     * @param {string} identityId - Cognito identity ID
     */
    async connect(credentials, identityId) {
        if (this.isConnected || this.mqttClient) {
            console.log('MQTT connection already exists, skipping...');
            return;
        }

        try {
            this.credentials = credentials;
            this.clientId = identityId.replace(/:/g, '-');
            
            console.log('🔗 Connecting to AWS IoT via WebSocket with SigV4...');
            console.log('Client ID:', this.clientId);
            console.log('IoT Endpoint:', window.AWS_CONFIG.iotEndpoint);
            console.log('Available AWSIoTv2 modules:', Object.keys(window.AWSIoTv2));

            await this.setupWebSocketConnection();
            
        } catch (error) {
            console.error('Error setting up MQTT connection:', error);
            throw error;
        }
    }

    /**
     * Setup WebSocket MQTT connection
     */
    async setupWebSocketConnection() {
        try {
            const endpoint = window.AWS_CONFIG.iotEndpoint;
            const region = window.AWS_CONFIG.region;
            
            // Check if we have the required modules
            if (!window.AWSIoTv2.iot || !window.AWSIoTv2.mqtt5) {
                throw new Error('Required AWS IoT SDK v2 modules not available. Available: ' + Object.keys(window.AWSIoTv2).join(', '));
            }

            // Create credentials provider - use a simpler approach
            const credentialsProvider = this.createCredentialsProvider(region);
            
            // Create WebSocket SigV4 config
            const wsConfig = {
                credentialsProvider: credentialsProvider,
                region: region
            };

            // Create MQTT5 client configuration
            const builder = window.AWSIoTv2.iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
                endpoint,
                wsConfig
            );

            // Set client ID
            const clientId = `q-cli-webui-client-${Date.now()}`;
            builder.withConnectProperties({
                clientId: clientId
            });

            // Build the final configuration
            const clientConfig = builder.build();

            // Create MQTT5 client
            this.mqttClient = new window.AWSIoTv2.mqtt5.Mqtt5Client(clientConfig);

            // Set up event handlers
            this.setupEventHandlers();

            // Start the connection
            console.log('Starting MQTT5 client...');
            this.mqttClient.start();

        } catch (error) {
            console.error('Error setting up WebSocket connection:', error);
            throw error;
        }
    }

    /**
     * Create credentials provider - simplified approach
     */
    createCredentialsProvider(region) {
        const credentials = this.credentials;
        
        // Check if auth module is available
        if (window.AWSIoTv2.auth && window.AWSIoTv2.auth.CredentialsProvider) {
            // Use the proper auth module if available
            class CustomCognitoCredentialsProvider extends window.AWSIoTv2.auth.CredentialsProvider {
                constructor() {
                    super();
                }

                getCredentials() {
                    return {
                        aws_access_id: credentials.accessKeyId,
                        aws_secret_key: credentials.secretAccessKey,
                        aws_sts_token: credentials.sessionToken,
                        aws_region: region
                    };
                }

                async refreshCredentials() {
                    console.log('refreshCredentials called (no-op for now)');
                }
            }
            return new CustomCognitoCredentialsProvider();
        } else {
            // Fallback: create a simple object that matches the expected interface
            console.warn('AWSIoTv2.auth not available, using fallback credentials provider');
            return {
                getCredentials: () => ({
                    aws_access_id: credentials.accessKeyId,
                    aws_secret_key: credentials.secretAccessKey,
                    aws_sts_token: credentials.sessionToken,
                    aws_region: region
                }),
                refreshCredentials: async () => {
                    console.log('refreshCredentials called (fallback no-op)');
                }
            };
        }
    }

    /**
     * Setup MQTT event handlers
     */
    setupEventHandlers() {
        this.mqttClient.on('error', (error) => {
            console.error('MQTT5 error:', error);
            this.emit('error', error);
        });

        this.mqttClient.on('attemptingConnect', (eventData) => {
            console.log('Attempting Connect event');
            this.emit('connecting');
        });

        this.mqttClient.on('connectionSuccess', (eventData) => {
            console.log('✅ Connected to AWS IoT via WebSocket with SigV4');
            this.isConnected = true;
            this.emit('connected', eventData);
        });

        this.mqttClient.on('connectionFailure', (eventData) => {
            console.error('MQTT5 connection failed:', eventData);
            this.emit('connectionFailed', eventData);
        });

        this.mqttClient.on('disconnection', (eventData) => {
            console.log('📴 MQTT5 disconnected:', eventData.error.toString());
            this.isConnected = false;
            this.emit('disconnected', eventData);
        });

        this.mqttClient.on('messageReceived', (eventData) => {
            const topic = eventData.message.topicName;
            const payload = new TextDecoder('utf8').decode(eventData.message.payload);
            console.log(`📨 Received message on topic: ${topic}`);
            this.emit('messageReceived', { topic, payload });
        });
    }

    /**
     * Subscribe to MQTT topics
     * @param {Array} topics - Array of topic objects with topicFilter and qos
     */
    async subscribe(topics) {
        if (!this.isConnected || !this.mqttClient) {
            throw new Error('MQTT client not connected');
        }

        const subscribePacket = {
            subscriptions: topics
        };

        try {
            await this.mqttClient.subscribe(subscribePacket);
            topics.forEach(topic => this.subscriptions.add(topic.topicFilter));
            console.log('✅ Subscribed to topics successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to subscribe to topics:', error);
            throw error;
        }
    }

    /**
     * Publish message to MQTT topic
     * @param {string} topic - MQTT topic
     * @param {Object} payload - Message payload
     * @param {number} qos - Quality of Service (default: 1)
     */
    async publish(topic, payload, qos = 1) {
        if (!this.isConnected || !this.mqttClient) {
            throw new Error('MQTT client not connected');
        }

        const publishPacket = {
            topicName: topic,
            qos: qos,
            payload: JSON.stringify(payload)
        };

        try {
            await this.mqttClient.publish(publishPacket);
            console.log(`📤 Published to ${topic}:`, payload);
            return true;
        } catch (error) {
            console.error(`❌ Failed to publish to ${topic}:`, error);
            throw error;
        }
    }

    /**
     * Disconnect from MQTT
     */
    async disconnect() {
        if (this.mqttClient && this.isConnected) {
            try {
                await this.mqttClient.stop();
                this.isConnected = false;
                this.subscriptions.clear();
                console.log('📴 MQTT client disconnected');
            } catch (error) {
                console.error('Error disconnecting MQTT client:', error);
            }
        }
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            clientId: this.clientId,
            subscriptions: Array.from(this.subscriptions)
        };
    }
}

export default MqttConnectionManager;
