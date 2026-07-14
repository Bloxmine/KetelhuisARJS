# Industrial Console & 3D Valve Interaction System

## Technical Handover & Developer Transfer Document

This document provides a comprehensive overview of the **KetelhuisARJS** web-based simulator framework. The system is built as a split-client architecture containing a 3D physical interaction client (`interaction.html`), an industrial visualization dashboard (`cabinet.html`), and an operational backend (`valve-sync-server.js`).

---

## 1. System Architecture & Data Flow

The system operates on an asymmetric, state-synchronized runtime loop. Rather than employing real-time WebSockets, state coordination relies on low-overhead, high-frequency HTTP polling to maximize compatibility across sandboxed installation devices and mobile browsers.

```
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│     3D Interaction Client       │                 │    Console Dashboard Client     │
│      (interaction.html)         │                 │         (cabinet.html)          │
├─────────────────────────────────┤                 ├─────────────────────────────────┤
│ • Three.js WebGL Engine         │                 │ • 2D SVG Dynamically Lit Gauge  │
│ • Local Pointer Drag Listener   │                 │ • Stateful Env FX & Audio       │
│ • WebRTC Camera Pass-Through    │                 │ • Logging Session Orchestrator  │
└────────────────┬────────────────┘                 └────────────────▲────────────────┘
                 │                                                   │
                 │ POST /valve-state                                 │ GET /valve-state
                 │ (Updates state & jitter)                          │ (Polls every 100ms)
                 │                                                   │
                 │         ┌───────────────────────────────┐         │
                 └────────►│       Node.js Backend         ├─────────┘
                           │   (valve-sync-server.js)      │
                           ├───────────────────────────────┤
                           │ • In-Memory Core State Buffer │
                           │ • JSONL Stream File Writer    │
                           │ • HTTPS Static Asset Server   │
                           └───────────────────────────────┘

```

### Core Components

1. **The Backend (`valve-sync-server.js`)**: An HTTPS server that holds the global state buffer in memory (`valveState`). It manages static file serving and aggregates incoming JSON telemetry.


2. **The 3D Interaction Client (`interaction.html`)**: A Three.js application displaying a mechanical setup with two functional valve wheels (`valve1`, `valve2`). Users drag these wheels to update their rotation state, streaming real-time positional updates and local micro-jitter analytics back to the server.


3. **The Console Simulator (`cabinet.html`)**: An industrial terminal tracking the system's average pressure. It calculates the average value of both valves (`(valve1 + valve2) / 2`), maps it to a responsive SVG gauge needle, manages environment effects (such as light overlays and audio loops), and logs runtime sessions.



---

## 2. Local Installation & Deployment

Due to strict browser security policies governing advanced features (like device camera access and audio playback), the platform must run within a **Secure Context (HTTPS)**.

### Step-by-Step Setup

1. **Install Runtime Dependencies:**
Ensure Node.js (v14 or higher) is available on the target environment. No external third-party `npm` modules are required; the backend runs entirely on native Node.js libraries (`http`, `https`, `fs`, `path`, `url`).


2. **Generate Self-Signed TLS Certificates:**
The server expects a valid TLS private key and certificate file matching the names `server.key` and `server.cert` within its root folder. Generate these locally via OpenSSL:


```bash
openssl req -x509 -newkey rsa:4096 -nodes -keyout server.key -out server.cert -days 365 -subj "/CN=localhost"

```



```

3. **Initialize the Server:**
   Launch the service via terminal[cite: 4]:
   ```bash
node valve-sync-server.js

```

The application will mount a secure server at `https://localhost:3000`.

4. **Accessing Client Portals:**
Open the target interfaces within a modern web browser:
* **Interaction Screen:** `https://localhost:3000/interaction.html`

* **Console Dashboard:** `https://localhost:3000/cabinet.html`



> ⚠️ **Development Note:** When loading self-signed local certificates for the first time, browsers will display a security alert. Click *Advanced* and select *Proceed to localhost (unsafe)* to permit communication.
> 
> 



---

## 3. Comprehensive Troubleshooting Playbook

### Backend & Storage Layer (`valve-sync-server.js`)

| Symptom / Error | Root Cause Analysis | Remediation Steps |
| --- | --- | --- |
| `Error: ENOENT: no such file or directory... server.key` | The server cannot locate the necessary TLS credentials to bind the secure `https` interface.

 | Verify that `server.key` and `server.cert` are correctly placed inside the project root. Regenerate them using the OpenSSL step outlined above if missing.

 |
| Files fail to update or telemetry is not saved. | The system lacks write access to create or append data to the telemetry output paths.

 | Ensure the operating user has full read/write permissions for the project directory. The server executes a fallback step `fs.mkdirSync(LOG_DIR)` automatically, but root directory limitations can override it.

 |

### 3D Interaction Layer (`interaction.html`)

| Symptom / Error | Root Cause Analysis | Remediation Steps |
| --- | --- | --- |
| `Camera-toegang mislukt.` / Missing background stream. | The browser blocked camera permissions, or the app is loaded outside of an HTTPS connection.

 | Verify that the address bar displays `https://` rather than `http://`. Reset permissions in the browser settings for this origin and allow access to the webcam.

 |
| 3D asset loader crashes or meshes fail to render. | The required 3D model resources are missing from the static folder path.

 | Ensure that `models/base.glb`, `models/wheelleft.glb`, and `models/wheelright.glb` are correctly placed in the project structure. Check that network asset requests return a `200 OK` status with the correct `model/gltf-binary` MIME type.

 |
| Sounds fail to play during interaction. | Mobile browsers (especially Safari/iOS) block programmatic audio playback until an explicit user interaction occurs.

 | The app includes a user gesture listener loop (`tryUnlockAudio`). If sound is blocked, click the splash screen or interaction canvas to trigger the initialization loop.

 |

### Console Dashboard Layer (`cabinet.html`)

| Symptom / Error | Root Cause Analysis | Remediation Steps |
| --- | --- | --- |
| Needle lags behind interaction or does not move. | Polling network requests are failing or the server is unreachable.

 | Open your browser's Developer Tools network tab to verify that calls to `/valve-state` are active and returning data. Check for any Cross-Origin Resource Sharing (CORS) blocks if using different ports.

 |
| The display remains permanently dark (`LAMP KAPOT`). | The simulation's internal bulb burnout event was triggered after keeping pressure in the critical zone for too long.

 | This is a built-in game mechanic. To reset the hardware display state and replace the bulb, adjust the interaction valves back down into the safe green zone.

 |

---

## 4. How to Expand the Platform

The code base is decoupled to allow for straightforward extensions of the simulation mechanics.

### Scenario A: Adding a Third Telemetry Metric (e.g., Temperature)

To add a new data metric like system temperature, you need to update the data flow across three main files:

#### 1. Server Schema Update (`valve-sync-server.js`)

Extend the global state object and its incoming payload validation parser to process a third variable:

```javascript
// Locate the global valveState object and expand it:
let valveState = {
  valve1: 0,
  valve2: 0,
  temperature: 20 // New metric with default base value
};

// Locate inside the POST '/valve-state' endpoint handler:
if (data.valve1 !== undefined) valveState.valve1 = Math.max(0, Math.min(100, data.valve1));
if (data.valve2 !== undefined) valveState.valve2 = Math.max(0, Math.min(100, data.valve2));
if (data.temperature !== undefined) valveState.temperature = Math.max(0, Math.min(200, data.temperature)); // Temperature parse logic

```

#### 2. Interaction Client Hook (`interaction.html`)

Calculate temperature changes on the client side based on valve positions, and send the data to the server:

```javascript
function updateWheelRotation(wheelKey, percentage, shouldSync = true) {
    valveStates[wheelKey] = Math.max(0, Math.min(100, percentage));
    
    // Calculate a simulated temperature value based on valve settings
    const currentTemperature = 20 + ((valveStates.valve1 + valveStates.valve2) * 1.5);

    if (shouldSync) {
        fetch(`${serverBaseUrl}/valve-state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                [wheelKey]: valveStates[wheelKey],
                temperature: currentTemperature // Synchronize temperature data to server
            })
        }).catch((error) => console.error('Sync failed', error));
    }
}

```

#### 3. Dashboard Display Hook (`cabinet.html`)

Read the updated telemetry payload and connect it to a new UI component:

```javascript
setInterval(() => {
    fetch(`${serverBaseUrl}/valve-state`)
    .then(res => res.json())
    .then(data => {
        const avgPressure = (data.valve1 + data.valve2) / 2;
        throttle.value = avgPressure;
        
        // Extract the new metric from the payload
        const systemTemp = data.temperature || 20;
        
        // Update a DOM element with the value (e.g., an overlay element id="temp-display")
        const tempEl = document.getElementById('temp-display');
        if (tempEl) tempEl.innerText = `${systemTemp.toFixed(1)}°C`;
        
        updateGauge();
    });
}, 100);

```

---

### Scenario B: Developing Complex Failure States & Game Mechanics

The simulation includes internal timers and randomized probability checks that handle custom interactive challenges, such as valve resistance or component wear.

#### Modifying Mechanical Valve Resistance (`interaction.html`)

The system features a **stuck-valve mechanic** triggered on pointer events. You can adjust how often this occurs or change its behavior by modifying the variables inside `maybeTriggerResistance`:

```javascript
function maybeTriggerResistance(wheelKey) {
    const r = valveResistance[wheelKey];
    if (!r || r.active) return;
    
    // Default config: 28% chance to trigger resistance on interaction[cite: 1]
    if (Math.random() < 0.28) { 
        const duration = 1200 + Math.random() * 2800; // Total active duration (1.2s - 4.0s)[cite: 1]
        r.multiplier = 1.8 + Math.random() * 1.6;     // Stiff multiplier (requires larger drag delta)[cite: 1]
        r.endTime = Date.now() + duration;
        r.active = true;
        
        showStatus('Klep zit vast — meer kracht nodig!', false); // UI alert message[cite: 1]
        setTimeout(hideStatus, 1600);
    }
}

```

* **To increase difficulty:** Raise the probability check (e.g., from `< 0.28` to `< 0.50`) or increase the value of `r.multiplier` to make the virtual wheels feel heavier and harder to move.



#### Modifying the Automated Value Slippage (`interaction.html`)

After 30 seconds of play (`SLIP_START_MS`), an interval loop randomly causes the valves to slowly untighten over time:

```javascript
const SLIP_START_MS = 30000; // Time delay before valves begin to slip back[cite: 1]

function maybeSlipValves(elapsed) {
    // Controls the base probability of a valve slipping per tick interval[cite: 1]
    const baseChance = 0.12; 
    
    ['valve1', 'valve2'].forEach((key) => {
        if (Math.random() < baseChance) {
            const slipAmount = 3 + Math.random() * 8; // Random slip percentage loss (3% - 11%)[cite: 1]
            const next = Math.max(0, valveStates[key] - slipAmount);
            updateWheelRotation(key, next, true);
        }
    });
}

```

* Change the value of `slipAmount` to alter how quickly pressure drops when the user stops interacting with the valves. You can also tie these modifiers directly to the active difficulty setting selected on the dashboard.