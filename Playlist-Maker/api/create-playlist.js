// api/create-playlist.js
// Vercel Serverless Function - Creates Spotify playlist

import axios from "axios";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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
        return res.status(200).json({ 
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
}
module.exports = handler;
