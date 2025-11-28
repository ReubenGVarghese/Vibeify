// api/search-tracks.js
// Vercel Serverless Function - Searches Spotify for tracks

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

                // Rate limiting delay (reduced for serverless)
                if (i < queries.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } catch (searchError) {
                console.warn(`⚠️ Search failed for "${query}":`, searchError.message);
                continue;
            }
        }

        console.log(`✅ Found ${allTracks.length} unique tracks`);
        return res.status(200).json({ 
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
}
module.exports = handler;
