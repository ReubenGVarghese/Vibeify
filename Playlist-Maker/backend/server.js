// server.js - Backend API for Vibe Analyzer
// Handles all Spotify API calls securely on the server side

import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
const PORT = 8889;

// Middleware
app.use(cors());
app.use(express.json());

// Spotify API Endpoints
const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// =========================================
// ENDPOINT 1: TOKEN EXCHANGE
// Exchanges authorization code for access token
// =========================================
app.post("/exchange-token", async (req, res) => {
    console.log("🔥 Token exchange request received");
    const { code, code_verifier, redirect_uri, client_id } = req.body;

    // Validate required fields
    if (!code || !code_verifier || !redirect_uri || !client_id) {
        return res.status(400).json({ 
            error: "Missing required fields",
            required: ["code", "code_verifier", "redirect_uri", "client_id"]
        });
    }

    // Build token request parameters
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
        
        console.log("✅ Token exchange successful");
        return res.json(spotifyResponse.data);
    } catch (err) {
        console.error("❌ Token exchange failed:", err.response?.data || err.message);
        return res.status(err.response?.status || 500).json({ 
            error: "Token exchange failed", 
            details: err.response?.data || err.message 
        });
    }
});

// =========================================
// ENDPOINT 2: SEARCH TRACKS
// Searches Spotify for tracks matching query
// =========================================
app.post("/search-tracks", async (req, res) => {
    console.log("🔍 Search tracks request received");
    const { access_token, queries } = req.body;

    if (!access_token || !queries || !Array.isArray(queries)) {
        return res.status(400).json({ 
            error: "Missing access_token or queries array" 
        });
    }

    const headers = { Authorization: `Bearer ${access_token}` };
    const allTracks = [];
    const seenTrackIds = new Set();

    try {
        // Execute each search query
        for (let i = 0; i < queries.length; i++) {
            const query = queries[i];
            console.log(`🔍 Searching (${i + 1}/${queries.length}): "${query}"`);

            try {
                const response = await axios.get(`${SPOTIFY_API_BASE}/search`, {
                    headers,
                    params: {
                        q: query,
                        type: 'track',
                        limit: 5,
                        market: 'US'
                    }
                });

                // Add unique tracks
                if (response.data.tracks?.items) {
                    response.data.tracks.items.forEach(track => {
                        if (track?.id && !seenTrackIds.has(track.id)) {
                            seenTrackIds.add(track.id);
                            allTracks.push(track);
                        }
                    });
                }

                // Rate limiting delay
                if (i < queries.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (searchError) {
                console.warn(`⚠️ Search failed for "${query}":`, searchError.message);
                continue;
            }
        }

        console.log(`✅ Found ${allTracks.length} unique tracks`);
        return res.json({ 
            success: true, 
            tracks: allTracks.slice(0, 12) // Limit to 12 tracks
        });

    } catch (error) {
        console.error("❌ Search tracks error:", error.message);
        return res.status(error.response?.status || 500).json({ 
            error: "Search failed", 
            details: error.message 
        });
    }
});

// =========================================
// ENDPOINT 3: CREATE PLAYLIST
// Creates a new playlist and adds tracks
// =========================================
app.post("/create-playlist", async (req, res) => {
    console.log("🎵 Create playlist request received");
    const { access_token, playlist_name, track_uris } = req.body;

    // Validate inputs
    if (!access_token || !playlist_name || !track_uris || track_uris.length === 0) {
        return res.status(400).json({ 
            error: "Missing required fields",
            required: ["access_token", "playlist_name", "track_uris (non-empty array)"]
        });
    }

    const headers = { Authorization: `Bearer ${access_token}` };

    try {
        // Step 1: Get current user's ID
        console.log("Step 1: Getting user ID...");
        const userResponse = await axios.get(`${SPOTIFY_API_BASE}/me`, { headers });
        const userId = userResponse.data.id;
        console.log(`✅ User ID: ${userId}`);

        // Step 2: Create empty playlist
        console.log(`Step 2: Creating playlist "${playlist_name}"...`);
        const playlistResponse = await axios.post(
            `${SPOTIFY_API_BASE}/users/${userId}/playlists`,
            {
                name: playlist_name,
                description: "Created by Vibe Analyzer App",
                public: false
            },
            { headers }
        );
        const playlistId = playlistResponse.data.id;
        const playlistUrl = playlistResponse.data.external_urls.spotify;
        console.log(`✅ Playlist created: ${playlistId}`);

        // Step 3: Add tracks to playlist
        console.log(`Step 3: Adding ${track_uris.length} tracks...`);
        await axios.post(
            `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`,
            { uris: track_uris },
            { headers }
        );

        console.log("✅ Playlist creation complete!");
        return res.json({ 
            success: true, 
            playlistUrl: playlistUrl,
            playlistId: playlistId
        });

    } catch (err) {
        console.error("❌ Playlist creation failed:", err.response?.data || err.message);
        return res.status(err.response?.status || 500).json({ 
            error: "Playlist creation failed", 
            details: err.response?.data || err.message 
        });
    }
});

// =========================================
// HEALTH CHECK ENDPOINT
// =========================================
app.get("/health", (req, res) => {
    res.json({ 
        status: "healthy", 
        timestamp: new Date().toISOString(),
        endpoints: [
            "POST /exchange-token",
            "POST /search-tracks", 
            "POST /create-playlist",
            "GET /health"
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Vibe Analyzer Backend running on http://localhost:${PORT}`);
    console.log(`📡 Available endpoints:`);
    console.log(`   - POST /exchange-token`);
    console.log(`   - POST /search-tracks`);
    console.log(`   - POST /create-playlist`);
    console.log(`   - GET /health`);
});