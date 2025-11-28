// api/exchange-token.js
// Vercel Serverless Function - Exchanges Spotify auth code for access token

import axios from "axios";

const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

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
        return res.status(200).json(spotifyResponse.data);
    } catch (err) {
        console.error("❌ Token exchange failed:", err.response?.data || err.message);
        return res.status(err.response?.status || 500).json({ 
            error: "Token exchange failed", 
            details: err.response?.data || err.message 
        });
    }
}

module.exports = handler;
