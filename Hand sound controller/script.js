// Hand Tracking and Instrument Player
let camera = null;
let hands = null;
let currentOscillator = null;
let currentGain = null;
let currentInstrumentType = null;
let lastFrequency = 0;

// Audio context for Web Audio API
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Instrument sounds using Web Audio API
const instruments = {
    piano: { 
        freq: [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25], 
        icon: '🎹', 
        name: 'Piano',
        type: 'sine'
    },
    guitar: { 
        freq: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63, 392.00], 
        icon: '🎸', 
        name: 'Guitar',
        type: 'triangle'
    },
    drums: { 
        freq: [100, 150, 200, 250, 300, 350, 400], 
        icon: '🥁', 
        name: 'Drums', 
        isDrum: true,
        type: 'sawtooth'
    },
    violin: { 
        freq: [196.00, 246.94, 293.66, 349.23, 440.00, 523.25, 659.25, 783.99], 
        icon: '🎻', 
        name: 'Violin',
        type: 'sine'
    },
    trumpet: { 
        freq: [233.08, 293.66, 349.23, 415.30, 466.16, 554.37, 659.25, 739.99], 
        icon: '🎺', 
        name: 'Trumpet',
        type: 'square'
    }
};

function startContinuousSound(instrument, x, y) {
    const instrumentData = instruments[instrument];
    
    // Calculate frequency based on X position (horizontal movement)
    const freqIndex = Math.floor(x * instrumentData.freq.length);
    const frequency = instrumentData.freq[Math.min(freqIndex, instrumentData.freq.length - 1)];
    
    // Calculate volume based on Y position (vertical movement)
    const volume = Math.max(0.1, Math.min(0.5, 1 - y));
    
    // If instrument changed or no sound playing, start new sound
    if (currentInstrumentType !== instrument || !currentOscillator) {
        stopContinuousSound();
        
        currentOscillator = audioContext.createOscillator();
        currentGain = audioContext.createGain();
        
        currentOscillator.connect(currentGain);
        currentGain.connect(audioContext.destination);
        
        currentOscillator.type = instrumentData.type;
        currentOscillator.frequency.value = frequency;
        currentGain.gain.value = volume;
        
        currentOscillator.start();
        currentInstrumentType = instrument;
        lastFrequency = frequency;
    } else {
        // Smoothly transition frequency and volume
        const now = audioContext.currentTime;
        currentOscillator.frequency.linearRampToValueAtTime(frequency, now + 0.05);
        currentGain.gain.linearRampToValueAtTime(volume, now + 0.05);
        lastFrequency = frequency;
    }
    
    // Visual feedback
    updateCurrentInstrument(instrument);
}

function stopContinuousSound() {
    if (currentOscillator) {
        try {
            const now = audioContext.currentTime;
            currentGain.gain.linearRampToValueAtTime(0, now + 0.1);
            currentOscillator.stop(now + 0.1);
        } catch (e) {
            // Oscillator already stopped
        }
        currentOscillator = null;
        currentGain = null;
        currentInstrumentType = null;
    }
}

function updateCurrentInstrument(instrument) {
    const currentInstrument = document.getElementById('currentInstrument');
    const instrumentData = instruments[instrument];
    currentInstrument.innerHTML = `
        <span class="instrument-icon">${instrumentData.icon}</span>
        <span class="instrument-text">${instrumentData.name}</span>
    `;
    
    // Highlight active zone
    document.querySelectorAll('.zone-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.instrument === instrument) {
            item.classList.add('active');
        }
    });
}

function getInstrumentFromPosition(x, y) {
    // Divide screen into zones
    if (x < 0.33 && y < 0.5) return 'piano';
    if (x >= 0.33 && x < 0.66 && y < 0.5) return 'trumpet';
    if (x >= 0.66 && y < 0.5) return 'guitar';
    if (x < 0.5 && y >= 0.5) return 'drums';
    if (x >= 0.5 && y >= 0.5) return 'violin';
    return 'trumpet';
}

function countFingersUp(landmarks) {
    const fingerTips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky
    const fingerPips = [6, 10, 14, 18];
    let count = 0;

    for (let i = 0; i < fingerTips.length; i++) {
        if (landmarks[fingerTips[i]].y < landmarks[fingerPips[i]].y) {
            count++;
        }
    }

    // Thumb (different logic)
    if (landmarks[4].x < landmarks[3].x) {
        count++;
    }

    return count;
}

function onResults(results) {
    const video = document.getElementById('instrumentWebcam');
    const canvas = document.getElementById('instrumentCanvas');
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw zone boundaries
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(canvas.width / 3, 0);
    ctx.lineTo(canvas.width / 3, canvas.height);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(2 * canvas.width / 3, 0);
    ctx.lineTo(2 * canvas.width / 3, canvas.height);
    ctx.stroke();
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            // Draw hand landmarks
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
            drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });

            // Get index finger tip position
            const indexTip = landmarks[8];
            const x = indexTip.x;
            const y = indexTip.y;

            // Determine instrument based on position
            const instrument = getInstrumentFromPosition(x, y);

            // Draw position indicator
            ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(x * canvas.width, y * canvas.height, 20, 0, 2 * Math.PI);
            ctx.fill();

            // Play continuous sound based on hand position
            startContinuousSound(instrument, x, y);
            
            // Visual feedback - larger glow
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(x * canvas.width, y * canvas.height, 50, 0, 2 * Math.PI);
            ctx.fill();
            
            // Draw frequency indicator
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '16px Arial';
            ctx.fillText(`X: ${Math.floor(x * 100)}% | Y: ${Math.floor(y * 100)}%`, 10, canvas.height - 10);
        }
        
        document.getElementById('status').textContent = '🎵 Playing! Move your hand to change notes';
    } else {
        // Stop sound when hand is not detected
        stopContinuousSound();
        document.getElementById('status').textContent = 'Show your hand to the camera';
    }

    ctx.restore();
}

async function startCamera() {
    const video = document.getElementById('instrumentWebcam');
    const startBtn = document.getElementById('startCamera');
    const stopBtn = document.getElementById('stopCamera');
    
    try {
        // Initialize MediaPipe Hands
        hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        hands.onResults(onResults);

        // Start camera
        camera = new Camera(video, {
            onFrame: async () => {
                await hands.send({ image: video });
            },
            width: 640,
            height: 480
        });

        await camera.start();
        
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        document.getElementById('status').textContent = 'Camera started! Show your hand';
        
    } catch (error) {
        console.error('Error starting camera:', error);
        document.getElementById('status').textContent = 'Error: ' + error.message;
    }
}

function stopCamera() {
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    const video = document.getElementById('instrumentWebcam');
    if (video) {
        const stream = video.srcObject;
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
    }
    
    const canvas = document.getElementById('instrumentCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    document.getElementById('startCamera').style.display = 'inline-block';
    document.getElementById('stopCamera').style.display = 'none';
    document.getElementById('status').textContent = 'Camera stopped';
}

// Drum Kit Functionality
let drumCamera = null;
let drumHands = null;
let lastDrumHit = {};

const drumSounds = {
    kick: { freq: 60, decay: 0.5 },
    snare: { freq: 200, decay: 0.2 },
    hihat: { freq: 8000, decay: 0.05 },
    tom: { freq: 150, decay: 0.3 },
    crash: { freq: 3000, decay: 0.8 },
    ride: { freq: 2000, decay: 0.6 }
};

function playDrum(drumType) {
    const now = Date.now();
    if (lastDrumHit[drumType] && now - lastDrumHit[drumType] < 200) return;
    lastDrumHit[drumType] = now;

    const drum = drumSounds[drumType];
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (drumType === 'kick') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(drum.freq, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(0.01, audioContext.currentTime + drum.decay);
        gainNode.gain.setValueAtTime(1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + drum.decay);
    } else if (drumType === 'snare' || drumType === 'tom') {
        oscillator.type = 'triangle';
        oscillator.frequency.value = drum.freq;
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + drum.decay);
    } else {
        oscillator.type = 'square';
        filter.type = 'highpass';
        filter.frequency.value = drum.freq;
        oscillator.frequency.value = drum.freq;
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + drum.decay);
    }

    oscillator.start();
    oscillator.stop(audioContext.currentTime + drum.decay);

    // Visual feedback
    const pad = document.querySelector(`.drum-pad[data-sound="${drumType}"]`);
    if (pad) {
        pad.classList.add('active');
        setTimeout(() => pad.classList.remove('active'), 200);
    }
}

function getDrumZone(x, y) {
    const col = Math.floor(x * 3);
    const row = Math.floor(y * 2);
    const zone = row * 3 + col;
    
    const zones = ['kick', 'snare', 'hihat', 'tom', 'crash', 'ride'];
    return zones[Math.min(zone, 5)];
}

function onDrumResults(results) {
    const video = document.getElementById('drumWebcam');
    const canvas = document.getElementById('drumCanvas');
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
            drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 5 });

            const indexTip = landmarks[8];
            const x = indexTip.x;
            const y = indexTip.y;

            const fingersUp = countFingersUp(landmarks);

            if (fingersUp === 1) {
                const drumType = getDrumZone(x, y);
                playDrum(drumType);

                ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                ctx.beginPath();
                ctx.arc(x * canvas.width, y * canvas.height, 30, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        
        document.getElementById('drumStatus').textContent = '🎵 Playing! Move your finger over the pads';
    } else {
        document.getElementById('drumStatus').textContent = '✋ Show your hand to play drums';
    }

    ctx.restore();
}

async function startDrumCamera() {
    const video = document.getElementById('drumWebcam');
    const startBtn = document.getElementById('startDrum');
    const stopBtn = document.getElementById('stopDrum');
    
    try {
        drumHands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        drumHands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        drumHands.onResults(onDrumResults);

        drumCamera = new Camera(video, {
            onFrame: async () => {
                await drumHands.send({ image: video });
            },
            width: 640,
            height: 480
        });

        await drumCamera.start();
        
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        document.getElementById('drumStatus').textContent = '✋ Show your hand to play drums';
        
    } catch (error) {
        console.error('Error starting drum camera:', error);
        document.getElementById('drumStatus').textContent = 'Error: ' + error.message;
    }
}

function stopDrumCamera() {
    if (drumCamera) {
        drumCamera.stop();
        drumCamera = null;
    }
    
    const video = document.getElementById('drumWebcam');
    if (video) {
        const stream = video.srcObject;
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
    }
    
    const canvas = document.getElementById('drumCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    document.getElementById('startDrum').style.display = 'inline-block';
    document.getElementById('stopDrum').style.display = 'none';
    document.getElementById('drumStatus').textContent = 'Camera stopped';
}

// Event listeners for camera controls
document.addEventListener('DOMContentLoaded', () => {
    const startCameraBtn = document.getElementById('startCamera');
    const stopCameraBtn = document.getElementById('stopCamera');
    const startDrumBtn = document.getElementById('startDrum');
    const stopDrumBtn = document.getElementById('stopDrum');
    
    if (startCameraBtn) startCameraBtn.addEventListener('click', startCamera);
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera);
    if (startDrumBtn) startDrumBtn.addEventListener('click', startDrumCamera);
    if (stopDrumBtn) stopDrumBtn.addEventListener('click', stopDrumCamera);
});

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar scroll effect
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    } else {
        navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    }
    
    lastScroll = currentScroll;
});

// Animate elements on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards and other elements
document.querySelectorAll('.feature-card, .step, .faq-item, .usage-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// Copy code to clipboard functionality
document.querySelectorAll('.command-block code').forEach(codeBlock => {
    codeBlock.style.cursor = 'pointer';
    codeBlock.title = 'Click to copy';
    
    codeBlock.addEventListener('click', () => {
        const text = codeBlock.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = codeBlock.textContent;
            codeBlock.textContent = '✓ Copied!';
            setTimeout(() => {
                codeBlock.textContent = originalText;
            }, 2000);
        });
    });
});
