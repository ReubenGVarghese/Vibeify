// server.js
import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// Spotify endpoints
const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// =========================================
// ENDPOINT 1: TOKEN EXCHANGE (Existing)
// =========================================
app.post("/exchange-token", async (req, res) => {
    console.log("📥 Received token exchange request");
    const { code, code_verifier, redirect_uri, client_id } = req.body;

    if (!code || !code_verifier || !redirect_uri || !client_id) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const params = new URLSearchParams();
    params.append("client_id", client_id);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirect_uri);
    params.append("code_verifier", code_verifier);

    try {
        const spotifyResponse = await axios.post(SPOTIFY_TOKEN_ENDPOINT, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        console.log("✅ Spotify token exchange successful.");
        return res.json(spotifyResponse.data);
    } catch (err) {
        console.error("❌ BACKEND ERROR DURING TOKEN EXCHANGE", err.message);
        return res.status(500).json({ error: "Token exchange failed", details: err.message });
    }
});


// =========================================
// ENDPOINT 2: CREATE PLAYLIST (NEW!)
// =========================================
app.post("/create-playlist", async (req, res) => {
    console.log("📥 Received create playlist request");
    const { access_token, playlist_name, track_uris } = req.body;
    console.log("🧪 TRACK URIS RECEIVED:", track_uris);


    if (!access_token || !track_uris || track_uris.length === 0) {
        return res.status(400).json({ error: "Missing token or tracks" });
    }

    const headers = { Authorization: `Bearer ${access_token}` };

    try {
        // Step 1: Get current user's ID
        console.log("Step 1: Getting User ID...");
        const userResponse = await axios.get(`${SPOTIFY_API_BASE}/me`, { headers });
        const userId = userResponse.data.id;

        // Step 2: Create an empty playlist for that user
        console.log(`Step 2: Creating playlist '${playlist_name}' for user ${userId}...`);
        const playlistResponse = await axios.post(
            `${SPOTIFY_API_BASE}/users/${userId}/playlists`,
            {
                name: playlist_name,
                description: "Created by Vibe Analyzer App",
                public: false // Make it private by default
            },
            { headers }
        );
        const playlistId = playlistResponse.data.id;
        const playlistUrl = playlistResponse.data.external_urls.spotify;

        // Step 3: Add the selected tracks to the new playlist
        console.log(`Step 3: Adding ${track_uris.length} tracks to playlist ${playlistId}...`);
        await axios.post(
            `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`,
            { uris: track_uris }, // Spotify expects an array of URIs like ["spotify:track:123...", ...]
            { headers }
        );

        console.log("✅ Playlist created successfully!");
        // Return the URL of the new playlist so the frontend can link to it
        return res.json({ success: true, playlistUrl: playlistUrl });

    } catch (err) {
        console.error("❌ BACKEND ERROR DURING PLAYLIST CREATION");
        if (err.response) {
            console.error("Spotify Error Data:", err.response.data);
            return res.status(err.response.status).json({ error: err.response.data });
        }
        return res.status(500).json({ error: "Playlist creation failed", details: err.message });
    }
});

// Start server
const PORT = 8889;
app.listen(PORT, () => {
    console.log(`🚀 Backend running at http://localhost:${PORT}`);
});