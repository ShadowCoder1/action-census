/**
 * ActionCensus - Webcam-based Motor Assessment Library
 * @version 1.0.0
 * @license MIT
 * @author ActionCensus Research Project
 * 
 * A professional library for conducting finger tapping motor assessments
 * using standard webcams and computer vision.
 */

(function(global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.ActionCensus = factory());
}(this, (function() {
    'use strict';

    // Constants
    const DEFAULTS = {
        trialDuration: 10000,           // 10 seconds per trial
        minRequiredTaps: 15,            // Minimum taps for valid trial
        smoothingWindow: 3,             // Moving average window size
        minPeakDistance: 30,            // Minimum ms between taps
        closedThreshold: 30,            // Distance threshold for "closed" fingers
        openThreshold: 35,              // Distance threshold for "open" fingers
        maxHandLossTime: 3000,          // Max ms without hand detection
        maxInactivityTime: 5000,        // Max ms without tapping
        videoWidth: 1280,               // Default video width
        videoHeight: 720,               // Default video height
        modelComplexity: 1,             // MediaPipe model complexity (0-1)
        minDetectionConfidence: 0.7,    // MediaPipe detection threshold
        minTrackingConfidence: 0.7      // MediaPipe tracking threshold
    };

    // Landmark indices
    const LANDMARKS = {
        WRIST: 0,
        THUMB_TIP: 4,
        INDEX_TIP: 8,
        MIDDLE_MCP: 9
    };

    class ActionCensus {
        constructor(options = {}) {
            // Merge user options with defaults
            this.config = { ...DEFAULTS, ...options };
            
            // State
            this.initialized = false;
            this.recording = false;
            this.hands = null;
            this.camera = null;
            this.videoElement = null;
            this.canvasElement = null;
            this.canvasCtx = null;
            
            // Data collection
            this.distanceSignal = [];
            this.timeSignal = [];
            this.smoothedSignal = [];
            this.velocitySignal = [];
            this.tapEvents = [];
            this.frameData = [];
            this.startTime = null;
            
            // Callbacks
            this.onInit = options.onInit || (() => {});
            this.onStart = options.onStart || (() => {});
            this.onTapDetected = options.onTapDetected || (() => {});
            this.onComplete = options.onComplete || (() => {});
            this.onError = options.onError || ((err) => console.error(err));
            this.onHandLost = options.onHandLost || (() => {});
            this.onHandFound = options.onHandFound || (() => {});
        }

        /**
         * Initialize the assessment system
         * Sets up MediaPipe and camera access
         */
        async init() {
            try {
                // Check for required dependencies
                if (typeof Hands === 'undefined') {
                    throw new Error('MediaPipe Hands library not loaded. Please include: https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
                }

                // Create video element if not provided
                if (!this.videoElement) {
                    this.videoElement = document.createElement('video');
                    this.videoElement.setAttribute('playsinline', '');
                }

                // Create canvas if not provided
                if (!this.canvasElement) {
                    this.canvasElement = document.createElement('canvas');
                }
                this.canvasCtx = this.canvasElement.getContext('2d');

                // Initialize MediaPipe Hands
                this.hands = new Hands({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                });

                this.hands.setOptions({
                    maxNumHands: 1,
                    modelComplexity: this.config.modelComplexity,
                    minDetectionConfidence: this.config.minDetectionConfidence,
                    minTrackingConfidence: this.config.minTrackingConfidence
                });

                this.hands.onResults(this._onHandsResults.bind(this));

                // Initialize camera
                await this._initCamera();

                this.initialized = true;
                this.onInit();
                
                return { success: true };
            } catch (error) {
                this.onError(error);
                return { success: false, error: error.message };
            }
        }

        /**
         * Start a motor assessment trial
         */
        async startTrial(hand = 'right') {
            if (!this.initialized) {
                throw new Error('ActionCensus not initialized. Call init() first.');
            }

            if (this.recording) {
                throw new Error('Trial already in progress.');
            }

            // Reset data
            this._resetTrialData();
            
            this.recording = true;
            this.startTime = Date.now();
            this.currentHand = hand.toLowerCase();
            
            this.onStart({ hand });

            // Auto-stop after trial duration
            setTimeout(() => {
                if (this.recording) {
                    this.stopTrial();
                }
            }, this.config.trialDuration);

            return { success: true };
        }

        /**
         * Stop the current trial and return results
         */
        stopTrial() {
            if (!this.recording) {
                return { success: false, error: 'No trial in progress' };
            }

            this.recording = false;
            const results = this._calculateResults();
            
            this.onComplete(results);
            
            return results;
        }

        /**
         * Get the video and canvas elements for rendering
         */
        getElements() {
            return {
                video: this.videoElement,
                canvas: this.canvasElement
            };
        }

        /**
         * Cleanup and release resources
         */
        async destroy() {
            if (this.camera) {
                this.camera.stop();
            }
            if (this.hands) {
                this.hands.close();
            }
            if (this.videoElement && this.videoElement.srcObject) {
                this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            }
            this.initialized = false;
        }

        // Private methods

        async _initCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: this.config.videoWidth },
                        height: { ideal: this.config.videoHeight },
                        facingMode: 'user'
                    }
                });

                this.videoElement.srcObject = stream;
                
                return new Promise((resolve) => {
                    this.videoElement.onloadedmetadata = () => {
                        this.canvasElement.width = this.videoElement.videoWidth;
                        this.canvasElement.height = this.videoElement.videoHeight;
                        this._startProcessing();
                        resolve();
                    };
                });
            } catch (error) {
                throw new Error(`Camera access denied: ${error.message}`);
            }
        }

        _startProcessing() {
            const processFrame = async () => {
                if (this.videoElement.readyState >= 2) {
                    await this.hands.send({ image: this.videoElement });
                }
                requestAnimationFrame(processFrame);
            };
            requestAnimationFrame(processFrame);
        }

        _onHandsResults(results) {
            // Clear canvas
            this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);

            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const landmarks = results.multiHandLandmarks[0];
                
                this.onHandFound();

                if (this.recording) {
                    this._processFrame(landmarks, results.image.width, results.image.height);
                }

                this._drawHandVisualization(landmarks);
            } else {
                this.onHandLost();
            }
        }

        _processFrame(landmarks, imageWidth, imageHeight) {
            const currentTime = Date.now() - this.startTime;

            // Calculate hand size for normalization
            const wrist = landmarks[LANDMARKS.WRIST];
            const middleMcp = landmarks[LANDMARKS.MIDDLE_MCP];
            const handSize = Math.sqrt(
                Math.pow((wrist.x - middleMcp.x) * imageWidth, 2) +
                Math.pow((wrist.y - middleMcp.y) * imageHeight, 2)
            );

            // Calculate finger distance
            const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
            const indexTip = landmarks[LANDMARKS.INDEX_TIP];
            const distance = Math.sqrt(
                Math.pow((thumbTip.x - indexTip.x) * imageWidth, 2) +
                Math.pow((thumbTip.y - indexTip.y) * imageHeight, 2) +
                Math.pow((thumbTip.z - indexTip.z) * imageWidth * 0.5, 2)
            );

            const normalizedDistance = (distance / handSize) * 100;

            // Store signals
            this.distanceSignal.push(normalizedDistance);
            this.timeSignal.push(currentTime);

            // Apply smoothing
            if (this.distanceSignal.length >= this.config.smoothingWindow) {
                this.smoothedSignal = this._movingAverage(this.distanceSignal, this.config.smoothingWindow);
                
                // Calculate velocity
                if (this.smoothedSignal.length > 1) {
                    this.velocitySignal = this._calculateDerivative(this.smoothedSignal, this.timeSignal);
                    
                    // Detect taps
                    this._detectTaps();
                }
            }

            // Store frame data
            this.frameData.push({
                timestamp: currentTime,
                normalizedDistance,
                handSize,
                thumbTip: { x: thumbTip.x, y: thumbTip.y, z: thumbTip.z },
                indexTip: { x: indexTip.x, y: indexTip.y, z: indexTip.z }
            });
        }

        _detectTaps() {
            const rawEvents = [];
            const added = new Set();

            // Method 1: State change detection
            for (let i = 1; i < this.distanceSignal.length; i++) {
                const delta = this.distanceSignal[i] - this.distanceSignal[i - 1];
                if (delta < -3 && !added.has(i)) {
                    const time = this.timeSignal[i];
                    const lastEventTime = rawEvents.length > 0 ? rawEvents[rawEvents.length - 1].time : -1000;
                    if (time - lastEventTime > this.config.minPeakDistance) {
                        rawEvents.push({ index: i, time, amplitude: this.distanceSignal[i] });
                        added.add(i);
                    }
                }
            }

            // Method 2: Local minima
            for (let i = 2; i < this.distanceSignal.length - 2; i++) {
                const current = this.distanceSignal[i];
                const isLocalMin = current < this.distanceSignal[i - 1] &&
                                   current < this.distanceSignal[i - 2] &&
                                   current <= this.distanceSignal[i + 1] &&
                                   current <= this.distanceSignal[i + 2];

                if (isLocalMin && current < this.config.closedThreshold && !added.has(i)) {
                    const time = this.timeSignal[i];
                    const lastEventTime = rawEvents.length > 0 ? rawEvents[rawEvents.length - 1].time : -1000;
                    if (time - lastEventTime > this.config.minPeakDistance) {
                        rawEvents.push({ index: i, time, amplitude: current });
                        added.add(i);
                    }
                }
            }

            // Sort and filter
            rawEvents.sort((a, b) => a.time - b.time);
            this.tapEvents = [];
            for (const ev of rawEvents) {
                if (this.tapEvents.length === 0 || ev.time - this.tapEvents[this.tapEvents.length - 1].time >= this.config.minPeakDistance) {
                    this.tapEvents.push(ev);
                    this.onTapDetected(ev);
                }
            }
        }

        _movingAverage(data, windowSize) {
            const result = [];
            for (let i = 0; i < data.length; i++) {
                const start = Math.max(0, i - Math.floor(windowSize / 2));
                const end = Math.min(data.length, i + Math.floor(windowSize / 2) + 1);
                let sum = 0;
                for (let j = start; j < end; j++) {
                    sum += data[j];
                }
                result.push(sum / (end - start));
            }
            return result;
        }

        _calculateDerivative(data, timeData) {
            const derivative = [];
            for (let i = 1; i < data.length; i++) {
                const dt = (timeData[i] - timeData[i - 1]) / 1000;
                const dy = data[i] - data[i - 1];
                derivative.push(dy / dt);
            }
            return derivative;
        }

        _calculateResults() {
            const intervals = [];
            const amplitudes = [];

            // Calculate inter-tap intervals
            for (let i = 1; i < this.tapEvents.length; i++) {
                intervals.push(this.tapEvents[i].time - this.tapEvents[i - 1].time);
            }

            // Calculate amplitudes
            for (let i = 0; i < this.tapEvents.length - 1; i++) {
                const startIdx = this.tapEvents[i].index;
                const endIdx = this.tapEvents[i + 1].index;
                let maxAmp = 0;
                for (let j = startIdx; j < endIdx && j < this.smoothedSignal.length; j++) {
                    maxAmp = Math.max(maxAmp, this.smoothedSignal[j]);
                }
                amplitudes.push(maxAmp);
            }

            // Calculate metrics
            const avgFrequency = intervals.length > 0 ? 1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
            const avgAmplitude = amplitudes.length > 0 ? amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length : 0;

            // Rhythm variability (CV)
            let rhythmCV = 0;
            if (intervals.length > 0) {
                const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
                rhythmCV = (Math.sqrt(variance) / mean) * 100;
            }

            // Amplitude decrement
            let amplitudeDecrement = 0;
            if (amplitudes.length >= 3) {
                const firstThird = amplitudes.slice(0, Math.floor(amplitudes.length / 3));
                const lastThird = amplitudes.slice(-Math.floor(amplitudes.length / 3));
                const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
                const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
                amplitudeDecrement = ((firstAvg - lastAvg) / firstAvg) * 100;
            }

            return {
                success: this.tapEvents.length >= this.config.minRequiredTaps,
                hand: this.currentHand,
                tapCount: this.tapEvents.length,
                frequency: avgFrequency,
                amplitude: avgAmplitude,
                rhythmVariability: rhythmCV,
                amplitudeDecrement: amplitudeDecrement,
                duration: this.timeSignal[this.timeSignal.length - 1] || 0,
                tapEvents: this.tapEvents,
                rawData: {
                    distanceSignal: this.distanceSignal,
                    timeSignal: this.timeSignal,
                    frameData: this.frameData
                }
            };
        }

        _drawHandVisualization(landmarks) {
            const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
            const indexTip = landmarks[LANDMARKS.INDEX_TIP];

            // Draw line between fingers
            this.canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.beginPath();
            this.canvasCtx.moveTo(thumbTip.x * this.canvasElement.width, thumbTip.y * this.canvasElement.height);
            this.canvasCtx.lineTo(indexTip.x * this.canvasElement.width, indexTip.y * this.canvasElement.height);
            this.canvasCtx.stroke();

            // Draw fingertip dots
            [thumbTip, indexTip].forEach(tip => {
                this.canvasCtx.fillStyle = '#ffffff';
                this.canvasCtx.beginPath();
                this.canvasCtx.arc(tip.x * this.canvasElement.width, tip.y * this.canvasElement.height, 10, 0, 2 * Math.PI);
                this.canvasCtx.fill();
            });
        }

        _resetTrialData() {
            this.distanceSignal = [];
            this.timeSignal = [];
            this.smoothedSignal = [];
            this.velocitySignal = [];
            this.tapEvents = [];
            this.frameData = [];
            this.startTime = null;
        }
    }

    return ActionCensus;
})));
