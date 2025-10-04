# ActionCensus

Webcam-based motor assessment for research. Measures finger tapping performance using computer vision.

**Live Demo:** https://actioncensus.org

## Installation
### Via npm:
npm install actioncensus

### Or via CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
<script src="https://cdn.jsdelivr.net/npm/actioncensus/dist/actioncensus.min.js"></script>
```

## Usage
```html
const assessment = new ActionCensus({
    trialDuration: 10000,
    onComplete: (results) => {
        console.log('Taps:', results.tapCount);
        console.log('Frequency:', results.frequency, 'Hz');
    }
});

await assessment.init();
await assessment.startTrial('right');
```

## API
### Methods:

- init() - Initialize camera and hand tracking
- startTrial(hand) - Start assessment ('right' or 'left')
- stopTrial() - Stop and get results
- getElements() - Get video/canvas elements

## Results:

- tapCount - Number of taps
- frequency - Taps per second (Hz)
- rhythmVariability - Timing consistency (%)
- amplitudeDecrement - Movement reduction (%)
- Features
- Real-time hand tracking (MediaPipe)
- Multi-method tap detection
- Clinical metrics calculation
- 100% local processing
- Cross-platform compatible


## License
- MIT - see LICENSE

## Links
GitHub: https://github.com/ShadowCoder1/actioncensus
Issues: https://github.com/ShadowCoder1/actioncensus/issues
