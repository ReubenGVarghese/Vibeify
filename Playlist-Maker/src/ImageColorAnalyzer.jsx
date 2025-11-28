// src/ImageColorAnalyzer.jsx
// Frontend for Vibe Analyzer - Analyzes image colors and creates Spotify playlists

import React, { useState, useRef, useEffect } from 'react';
import ColorThief from 'colorthief';
import axios from 'axios';
import './ImageColorAnalyzer.css';
import { rgbToHsl } from './utils/colorUtils';

// ==============================
// CONFIGURATION
// ==============================
const CLIENT_ID = "63bd0e7b611444869ac6b21783049842";
const REDIRECT_URI = window.location.hostname === 'localhost' 
  ? "http://localhost:3000/" 
  : `${window.location.origin}/`;
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const SCOPES = ["user-read-private", "playlist-modify-public", "playlist-modify-private"];
const BACKEND_BASE_URL = window.location.hostname === 'localhost'
  ? "http://localhost:3000/api"
  : `${window.location.origin}/api`;;

// ==============================
// VIBE TO SEARCH QUERIES MAPPING
// Maps detected vibes to Spotify search queries
// ==============================
const VIBE_SEARCH_QUERIES = {
  Energetic: [
    "track:Levitating artist:Dua Lipa",
    "track:Blinding Lights artist:The Weeknd",
    "track:Dance The Night artist:Dua Lipa",
    "track:Don't Start Now artist:Dua Lipa"
  ],
  Cozy: [
    "track:Perfect artist:Ed Sheeran",
    "track:Photograph artist:Ed Sheeran",
    "track:Lover artist:Taylor Swift",
    "track:Thinking Out Loud artist:Ed Sheeran"
  ],
  Moody: [
    "track:Die For You artist:The Weeknd",
    "track:Lovely artist:Billie Eilish",
    "track:The Night We Met artist:Lord Huron",
    "track:Skinny Love artist:Bon Iver"
  ],
  Dreamy: [
    "track:Reflections artist:The Neighbourhood",
    "track:Electric Feel artist:MGMT",
    "track:Space Song artist:Beach House",
    "track:Midnight City artist:M83"
  ],
  Intense: [
    "track:Radioactive artist:Imagine Dragons",
    "track:Believer artist:Imagine Dragons",
    "track:Stressed Out artist:Twenty One Pilots",
    "track:Heathens artist:Twenty One Pilots"
  ],
  Chill: [
    "track:Sunflower artist:Post Malone",
    "track:Location artist:Khalid",
    "track:Electric artist:Alina Baraz",
    "track:Young Dumb & Broke artist:Khalid"
  ],
  Uplifting: [
    "track:As It Was artist:Harry Styles",
    "track:Flowers artist:Miley Cyrus",
    "track:Good 4 U artist:Olivia Rodrigo",
    "track:Shake It Off artist:Taylor Swift"
  ],
  Melancholic: [
    "track:Someone Like You artist:Adele",
    "track:drivers license artist:Olivia Rodrigo",
    "track:Someone You Loved artist:Lewis Capaldi",
    "track:When I Was Your Man artist:Bruno Mars"
  ],
  Christmas: [
    "track:All I Want for Christmas artist:Mariah Carey",
    "track:Last Christmas artist:Wham!",
    "track:Jingle Bell Rock artist:Bobby Helms",
    "track:Rockin' Around The Christmas Tree artist:Brenda Lee"
  ],
  Halloween: [
    "track:Thriller artist:Michael Jackson",
    "track:Monster Mash artist:Bobby Pickett",
    "track:Somebody's Watching Me artist:Rockwell",
    "track:Disturbia artist:Rihanna"
  ],
  Neutral: [
    "track:Shape of You artist:Ed Sheeran",
    "track:Anti-Hero artist:Taylor Swift",
    "track:Blinding Lights artist:The Weeknd",
    "track:As It Was artist:Harry Styles"
  ]
};

// ==============================
// PKCE HELPER FUNCTIONS
// Required for Spotify OAuth 2.0 PKCE flow
// ==============================
const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ==============================
// MAIN COMPONENT
// ==============================
const ImageColorAnalyzer = () => {
  // State management
  const [uploadedImgSrc, setUploadedImgSrc] = useState(null);
  const [colorPalette, setColorPalette] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedVibe, setDetectedVibe] = useState(null);
  const [spotifyToken, setSpotifyToken] = useState("");
  const [tracks, setTracks] = useState([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [selectedTrackUris, setSelectedTrackUris] = useState([]);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [createdPlaylistUrl, setCreatedPlaylistUrl] = useState(null);

  const imgRef = useRef(null);
  const dataFetchCalled = useRef(false);

  // ==============================
  // AUTHENTICATION
  // ==============================
  useEffect(() => {
    if (dataFetchCalled.current) return;

    // Check for stored token
    const storedToken = window.localStorage.getItem("spotify_token");
    const tokenExpiry = window.localStorage.getItem("spotify_token_expiry");

    if (storedToken && tokenExpiry && new Date().getTime() < tokenExpiry) {
      setSpotifyToken(storedToken);
      dataFetchCalled.current = true;
      return;
    }

    // Check for OAuth callback code
    const args = new URLSearchParams(window.location.search);
    const code = args.get('code');
    const verifier = window.localStorage.getItem("spotify_code_verifier");

    if (code && verifier) {
      console.log("Authorization code found, exchanging for token...");
      dataFetchCalled.current = true;
      getTokenFromCode(code, verifier);
    }
  }, []);

  const handleSpotifyLogin = async () => {
    const codeVerifier = generateRandomString(128);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64urlencode(hashed);
    window.localStorage.setItem("spotify_code_verifier", codeVerifier);

    const authUrl = `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES.join("%20")}&code_challenge_method=S256&code_challenge=${codeChallenge}&show_dialog=true`;
    window.location.href = authUrl;
  };

  const getTokenFromCode = async (code, verifier) => {
    try {
      const result = await axios.post(`${BACKEND_BASE_URL}/exchange-token`, {
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID
      });

      const { access_token, expires_in } = result.data;
      const expiryTime = new Date().getTime() + (expires_in * 1000);
      
      window.localStorage.setItem("spotify_token", access_token);
      window.localStorage.setItem("spotify_token_expiry", expiryTime);
      setSpotifyToken(access_token);
      
      window.localStorage.removeItem("spotify_code_verifier");
      window.history.replaceState({}, document.title, "/");
      
      console.log("✅ Spotify authentication successful");
    } catch (error) {
      console.error("❌ Token exchange failed:", error);
      alert("Login failed. Please try again.");
    }
  };

  const handleLogout = () => {
    setSpotifyToken("");
    window.localStorage.clear();
    setTracks([]);
    setDetectedVibe(null);
    setSelectedTrackUris([]);
    setCreatedPlaylistUrl(null);
    dataFetchCalled.current = false;
    console.log("👋 Logged out");
  };

  // ==============================
  // IMPROVED VIBE DETECTION ALGORITHM
  // Better detection for Christmas, Halloween, and all vibes
  // ==============================
  useEffect(() => {
    if (colorPalette.length === 0) return;

    const scores = {
      energetic: 0,
      cozy: 0,
      moody: 0,
      dreamy: 0,
      intense: 0,
      chill: 0,
      uplifting: 0,
      melancholic: 0,
      christmas: 0,
      halloween: 0
    };

    let totalSaturation = 0;
    let totalLightness = 0;
    let warmCount = 0;
    let coolCount = 0;
    let brightCount = 0;
    let darkCount = 0;
    let veryDarkCount = 0;

    // Analyze each color
    const colorData = colorPalette.map(rgb => {
      const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      totalSaturation += s;
      totalLightness += l;

      if ((h >= 0 && h <= 60) || (h >= 300 && h <= 360)) warmCount++;
      if (h >= 180 && h <= 260) coolCount++;
      if (l >= 0.5) brightCount++;
      if (l < 0.4) darkCount++;
      if (l < 0.25) veryDarkCount++;

      return { h, s, l };
    });

    const avgSaturation = totalSaturation / colorPalette.length;
    const avgLightness = totalLightness / colorPalette.length;
    const isOverallWarm = warmCount > coolCount;
    const isOverallDark = darkCount >= 3;
    const isOverallBright = brightCount >= 3;

    // ============================================
    // CHRISTMAS DETECTION - Much more accurate
    // ============================================
    const redColors = colorData.filter(c => 
      ((c.h >= 345 && c.h <= 360) || (c.h >= 0 && c.h <= 20)) && 
      c.s > 0.4 && c.l > 0.25 && c.l < 0.75
    );
    const greenColors = colorData.filter(c => 
      (c.h >= 90 && c.h <= 150) && c.s > 0.3 && c.l > 0.2 && c.l < 0.7
    );
    
    // Must have BOTH red AND green present
    if (redColors.length > 0 && greenColors.length > 0) {
      // Base score for having both colors
      scores.christmas += 40;
      
      // Bonus if multiple reds and greens
      if (redColors.length >= 2) scores.christmas += 10;
      if (greenColors.length >= 2) scores.christmas += 10;
      
      // Extra bonus if they're both saturated
      const avgRedSat = redColors.reduce((sum, c) => sum + c.s, 0) / redColors.length;
      const avgGreenSat = greenColors.reduce((sum, c) => sum + c.s, 0) / greenColors.length;
      if (avgRedSat > 0.5 && avgGreenSat > 0.5) scores.christmas += 15;
      
      console.log(`🎄 Christmas detected! Red colors: ${redColors.length}, Green colors: ${greenColors.length}`);
    }

    // ============================================
    // HALLOWEEN DETECTION - Much more accurate
    // ============================================
    const orangeColors = colorData.filter(c => 
      (c.h >= 20 && c.h <= 45) && c.s > 0.5 && c.l > 0.3 && c.l < 0.8
    );
    const darkColors = colorData.filter(c => c.l < 0.3);
    const purpleColors = colorData.filter(c => 
      (c.h >= 260 && c.h <= 310) && c.s > 0.3
    );
    
    // Must have orange AND dark colors
    if (orangeColors.length > 0 && darkColors.length >= 2) {
      // Base score
      scores.halloween += 45;
      
      // Bonus for very dark colors (black)
      if (veryDarkCount >= 2) scores.halloween += 15;
      
      // Bonus for purple (adds spooky vibe)
      if (purpleColors.length > 0) scores.halloween += 10;
      
      // Extra bonus if orange is very saturated
      const avgOrangeSat = orangeColors.reduce((sum, c) => sum + c.s, 0) / orangeColors.length;
      if (avgOrangeSat > 0.7) scores.halloween += 10;
      
      console.log(`🎃 Halloween detected! Orange: ${orangeColors.length}, Dark: ${darkColors.length}, Purple: ${purpleColors.length}`);
    }

    // ============================================
    // SCORE EACH COLOR FOR GENERAL VIBES
    // ============================================
    colorData.forEach(({ h, s, l }) => {
      const isRed = (h >= 0 && h <= 30) || (h >= 330 && h <= 360);
      const isOrange = h >= 30 && h <= 60;
      const isYellow = h >= 60 && h <= 90;
      const isGreen = h >= 90 && h <= 180;
      const isBlue = h >= 180 && h <= 260;
      const isPurple = h >= 260 && h <= 330;

      const isWarmHue = isRed || isOrange || (h >= 300 && h <= 360);
      const isCoolHue = isBlue;

      const isVeryHighSat = s >= 0.7;
      const isHighSat = s >= 0.5;
      const isMidSat = s >= 0.25 && s < 0.5;
      const isLowSat = s < 0.25;

      const isVeryBright = l >= 0.75;
      const isBright = l >= 0.55;
      const isMidLight = l >= 0.35 && l < 0.55;
      const isDark = l >= 0.2 && l < 0.35;
      const isVeryDark = l < 0.2;

      // ENERGETIC: Bright + saturated + warm
      if (isVeryHighSat && (isVeryBright || isBright)) {
        scores.energetic += 10;
        if (isWarmHue) scores.energetic += 5;
      }
      
      // COZY: Warm + medium sat + not too bright
      if (isWarmHue && (isMidSat || isHighSat) && (isMidLight || isBright) && !isVeryBright) {
        scores.cozy += 10;
      }
      if (isOrange && isMidSat) scores.cozy += 7;
      
      // MOODY: Cool/blue + dark + desaturated
      if ((isCoolHue || isBlue) && (isDark || isVeryDark)) scores.moody += 12;
      if (isLowSat && (isDark || isVeryDark)) scores.moody += 8;
      if (isPurple && isDark) scores.moody += 6;
      
      // DREAMY: Bright + medium sat (pastels)
      if ((isBright || isVeryBright) && isMidSat) scores.dreamy += 10;
      if (isPurple && (isBright || isVeryBright)) scores.dreamy += 8;
      
      // INTENSE: Very saturated + dark
      if (isVeryHighSat && (isDark || isVeryDark)) scores.intense += 12;
      if ((isRed || isBlue) && isVeryHighSat && isDark) scores.intense += 7;
      
      // CHILL: Desaturated + bright + NOT dark
      if (isLowSat && isBright && !isDark && !isVeryDark) scores.chill += 8;
      if (isGreen && (isLowSat || isMidSat) && (isBright || isVeryBright)) scores.chill += 10;
      if (isDark || isVeryDark) scores.chill -= 15;
      
      // UPLIFTING: Very bright + saturated
      if ((isVeryBright || isBright) && (isHighSat || isVeryHighSat)) scores.uplifting += 12;
      if ((isYellow || isGreen) && isVeryBright && isHighSat) scores.uplifting += 8;
      
      // MELANCHOLIC: Desaturated + mid-light + cool
      if (isLowSat && isMidLight) scores.melancholic += 9;
      if (isCoolHue && (isLowSat || isMidSat) && isMidLight) scores.melancholic += 7;
    });

    // ============================================
    // OVERALL PALETTE MODIFIERS
    // ============================================
    if (isOverallBright && avgSaturation > 0.5) {
      scores.energetic += 10;
      scores.uplifting += 10;
    }
    if (isOverallDark && avgSaturation < 0.4) {
      scores.moody += 18;
      scores.melancholic += 10;
      scores.chill -= 20;
    }
    if (isOverallDark && avgSaturation >= 0.4) {
      scores.intense += 15;
      scores.moody += 10;
    }
    if (isOverallWarm && avgLightness > 0.5 && avgLightness < 0.75) {
      scores.cozy += 12;
    }

    console.log("🎨 Final vibe scores:", scores);

    // ============================================
    // DETERMINE WINNING VIBE
    // ============================================
    let winningVibe = null;
    let highestScore = -1;
    for (const [vibeKey, scoreValue] of Object.entries(scores)) {
      if (scoreValue > highestScore) {
        highestScore = scoreValue;
        winningVibe = vibeKey;
      }
    }

    const finalVibe = highestScore <= 15 || !winningVibe 
      ? "Neutral" 
      : winningVibe.charAt(0).toUpperCase() + winningVibe.slice(1);
    
    setDetectedVibe(finalVibe);
    console.log(`🎯 Detected vibe: ${finalVibe} (score: ${highestScore})`);
  }, [colorPalette]);

  // ==============================
  // TRACK FETCHING
  // ==============================
  const getRecommendations = async () => {
    console.log(`🔍 Fetching songs for ${detectedVibe} vibe`);
    
    if (!spotifyToken || !detectedVibe) {
      alert("Please log in and analyze an image first.");
      return;
    }

    setIsLoadingTracks(true);
    setTracks([]);
    setSelectedTrackUris([]);
    setCreatedPlaylistUrl(null);

    const queries = VIBE_SEARCH_QUERIES[detectedVibe];
    if (!queries) {
      alert(`No songs configured for ${detectedVibe} vibe`);
      setIsLoadingTracks(false);
      return;
    }

    try {
      // Call backend to search tracks
      const result = await axios.post(`${BACKEND_BASE_URL}/search-tracks`, {
        access_token: spotifyToken,
        queries: queries
      });

      if (result.data.success && result.data.tracks.length > 0) {
        setTracks(result.data.tracks);
        setSelectedTrackUris(result.data.tracks.map(t => t.uri));
        console.log(`✅ Loaded ${result.data.tracks.length} tracks`);
      } else {
        alert(`No songs found for ${detectedVibe}. Try a different image!`);
      }
    } catch (error) {
      console.error("❌ Search failed:", error);
      if (error.response?.status === 401) {
        alert("Session expired. Please log in again.");
        handleLogout();
      } else {
        alert("Failed to fetch songs. Check console for details.");
      }
    } finally {
      setIsLoadingTracks(false);
    }
  };

  // ==============================
  // PLAYLIST CREATION
  // ==============================
  const handleTrackToggle = (uri) => {
    setSelectedTrackUris(prev =>
      prev.includes(uri) ? prev.filter(u => u !== uri) : [...prev, uri]
    );
  };

  const handleCreatePlaylist = async () => {
    if (selectedTrackUris.length === 0) {
      alert("Please select at least one song");
      return;
    }

    setIsCreatingPlaylist(true);
    const playlistName = `My ${detectedVibe} Vibe`;

    try {
      const result = await axios.post(`${BACKEND_BASE_URL}/create-playlist`, {
        access_token: spotifyToken,
        playlist_name: playlistName,
        track_uris: selectedTrackUris
      });

      if (result.data.success) {
        setCreatedPlaylistUrl(result.data.playlistUrl);
        alert("Playlist created successfully!");
        console.log(`✅ Playlist created: ${result.data.playlistUrl}`);
      }
    } catch (error) {
      console.error("❌ Playlist creation failed:", error);
      alert("Failed to create playlist. Check console for details.");
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  // ==============================
  // IMAGE HANDLING
  // ==============================
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedImgSrc(URL.createObjectURL(file));
      setColorPalette([]);
      setDetectedVibe(null);
      setTracks([]);
      setSelectedTrackUris([]);
      setCreatedPlaylistUrl(null);
      console.log("📸 Image uploaded");
    }
  };

  const triggerAnalysis = () => {
    if (!imgRef.current || !uploadedImgSrc) return;
    
    setIsProcessing(true);
    setDetectedVibe(null);
    setTracks([]);
    setSelectedTrackUris([]);
    
    const colorThief = new ColorThief();
    const img = imgRef.current;
    
    if (img.complete) {
      extractColors(colorThief, img);
    } else {
      img.addEventListener('load', () => extractColors(colorThief, img));
    }
  };

  const extractColors = (colorThief, img) => {
    try {
      const palette = colorThief.getPalette(img, 5);
      setColorPalette(palette);
      console.log("🎨 Colors extracted:", palette);
    } catch (error) {
      console.error("❌ Color extraction failed:", error);
      alert("Failed to analyze image. Please try a different one.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ==============================
  // RENDER
  // ==============================
  return (
    <div className="analyzer-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Photo Vibe to Spotify</h2>
        {!spotifyToken ? (
          <button onClick={handleSpotifyLogin} className="analyze-button" 
            style={{ backgroundColor: 'black', fontSize: '0.9rem' }}>
            Login to Spotify
          </button>
        ) : (
          <button onClick={handleLogout} 
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#666', textDecoration: 'underline' }}>
            Logout
          </button>
        )}
      </div>

      {/* Login Prompt */}
      {!spotifyToken && (
        <p style={{ backgroundColor: '#1DB954', padding: '10px', borderRadius: '4px' }}>
          Please login to Spotify to create playlists.
        </p>
      )}

      {/* File Upload */}
      <input type="file" accept="image/*" onChange={handleImageUpload} className="file-input" />

      {/* Image Preview */}
      {uploadedImgSrc && (
        <div className="preview-container">
          <img ref={imgRef} src={uploadedImgSrc} alt="Preview" className="image-preview" crossOrigin="anonymous" />
          <div className="button-container">
            <button onClick={triggerAnalysis} disabled={isProcessing} className="analyze-button">
              {isProcessing ? 'Analyzing...' : '1. Analyze Vibe'}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {detectedVibe && (
        <div className="results-container">
          {/* Vibe Result */}
          <div className="vibe-result" 
            style={{ textAlign: 'center', padding: '20px', backgroundColor: '#e8f5e9', 
              borderRadius: '8px', border: '2px solid #1DB954', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#555' }}>Detected Vibe:</h3>
            <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1DB954', margin: '10px 0' }}>
              {detectedVibe}
            </p>

            {spotifyToken ? (
              <button onClick={getRecommendations} disabled={isLoadingTracks} 
                className="analyze-button" style={{ marginTop: '10px' }}>
                {isLoadingTracks ? 'Fetching Songs...' : `2. Get ${detectedVibe} Songs`}
              </button>
            ) : (
              <p>Login to Spotify above to unlock song suggestions.</p>
            )}
          </div>

          {/* Track List */}
          {tracks.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Select Songs: ({selectedTrackUris.length} selected)</h3>
                <button onClick={handleCreatePlaylist} 
                  disabled={isCreatingPlaylist || selectedTrackUris.length === 0}
                  className="analyze-button"
                  style={{ backgroundColor: selectedTrackUris.length === 0 ? '#ccc' : '#1DB954' }}>
                  {isCreatingPlaylist ? 'Creating...' : '3. Create Spotify Playlist'}
                </button>
              </div>

              {/* Success Message */}
              {createdPlaylistUrl && (
                <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '15px', 
                  borderRadius: '4px', margin: '10px 0', textAlign: 'center' }}>
                  Success! <a href={createdPlaylistUrl} target="_blank" rel="noopener noreferrer" 
                    style={{ fontWeight: 'bold', color: '#155724' }}>
                    Open playlist on Spotify →
                  </a>
                </div>
              )}

              {/* Track Grid */}
              <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                {tracks.map(track => {
                  const isSelected = selectedTrackUris.includes(track.uri);
                  return (
                    <div key={track.id} onClick={() => handleTrackToggle(track.uri)}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '10px',
                        backgroundColor: isSelected ? '#f0fcf4' : 'white',
                        border: isSelected ? '1px solid #1DB954' : '1px solid transparent',
                        borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'pointer'
                      }}>
                      <input type="checkbox" checked={isSelected} onChange={() => {}}
                        style={{ marginRight: '15px', transform: 'scale(1.5)', cursor: 'pointer' }} />
                      
                      {track.album?.images?.[2] && (
                        <img src={track.album.images[2].url} alt={track.name}
                          style={{ width: '50px', height: '50px', borderRadius: '4px', marginRight: '15px' }} />
                      )}
                      
                      <div style={{ textAlign: 'left', overflow: 'hidden', flexGrow: 1 }}>
                        <p style={{ fontWeight: 'bold', margin: '0 0 5px 0', whiteSpace: 'nowrap', 
                          overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {track.name}
                        </p>
                        <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                          {track.artists?.map(a => a.name).join(', ')}
                        </p>
                      </div>
                      
                      <a href={track.external_urls?.spotify} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: 'auto', color: '#1DB954', textDecoration: 'none', fontSize: '0.9rem' }}>
                        Open ↗
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Color Palette */}
          <h4 style={{ marginTop: '40px', color: '#999' }}>Source Palette:</h4>
          <div className="palette-grid">
            {colorPalette.map((rgb, index) => (
              <div key={index} className="color-swatch-container">
                <div className="color-swatch" 
                  style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageColorAnalyzer;