// src/ImageColorAnalyzer.js

import React, { useState, useRef, useEffect } from 'react';
import ColorThief from 'colorthief';
import axios from 'axios';
import './ImageColorAnalyzer.css';
import { rgbToHsl } from './utils/colorUtils';

// ==============================
// CONFIGURATION
// ==============================
const CLIENT_ID = "63bd0e7b611444869ac6b21783049842";
const REDIRECT_URI = "http://127.0.0.1:8888/"; 

const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const SCOPES = [
  "user-read-private", 
  "playlist-modify-public", 
  "playlist-modify-private",
  "user-top-read"
];
const BACKEND_BASE_URL = "http://localhost:8889";

// ==============================
// PKCE HELPER FUNCTIONS
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


const ImageColorAnalyzer = () => {
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
  // AUTHENTICATION & INITIALIZATION
  // ==============================

  useEffect(() => {
      if (dataFetchCalled.current) return;

      const storedToken = window.localStorage.getItem("spotify_token");
      const tokenExpiry = window.localStorage.getItem("spotify_token_expiry");

      if (storedToken && tokenExpiry && new Date().getTime() < tokenExpiry) {
          setSpotifyToken(storedToken);
          dataFetchCalled.current = true;
          return;
      }

      const args = new URLSearchParams(window.location.search);
      const code = args.get('code');
      const verifier = window.localStorage.getItem("spotify_code_verifier");

      if (code && verifier) {
          console.log("Code found. Attempting exchange...");
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

    } catch (error) {
      console.error("Token exchange failed", error);
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
  }

  // ==============================
  // IMPROVED VIBE DETECTION
  // ==============================

  useEffect(() => {
      if (colorPalette.length === 0) return;

      let scores = { 
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

      // Calculate overall palette characteristics
      let totalSaturation = 0;
      let totalLightness = 0;
      let warmCount = 0;
      let coolCount = 0;
      let brightCount = 0;
      let darkCount = 0;

      const colorData = colorPalette.map(rgb => {
          const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
          totalSaturation += s;
          totalLightness += l;
          
          if ((h >= 0 && h <= 60) || (h >= 300 && h <= 360)) warmCount++;
          if (h >= 180 && h <= 260) coolCount++;
          if (l >= 0.5) brightCount++;
          if (l < 0.4) darkCount++;
          
          return { h, s, l };
      });

      const avgSaturation = totalSaturation / colorPalette.length;
      const avgLightness = totalLightness / colorPalette.length;
      const isOverallWarm = warmCount > coolCount;
      const isOverallCool = coolCount > warmCount;
      const isOverallBright = brightCount >= 3;
      const isOverallDark = darkCount >= 3;

      console.log("📊 Palette Stats:", {
          avgSaturation: avgSaturation.toFixed(2),
          avgLightness: avgLightness.toFixed(2),
          warmCount,
          coolCount,
          brightCount,
          darkCount
      });

      // CHRISTMAS DETECTION - More strict (must have actual red AND green)
      const hasRed = colorData.some(c => ((c.h >= 345 && c.h <= 360) || (c.h >= 0 && c.h <= 15)) && c.s > 0.5 && c.l > 0.3 && c.l < 0.7);
      const hasGreen = colorData.some(c => (c.h >= 100 && c.h <= 140) && c.s > 0.35 && c.l > 0.2 && c.l < 0.6);
      
      if (hasRed && hasGreen) {
          scores.christmas += 20; // Reduced from 35
          console.log("🎄 Christmas bonus applied!");
      }

      // HALLOWEEN DETECTION
      const hasOrange = colorData.some(c => (c.h >= 25 && c.h <= 40) && c.s > 0.6 && c.l > 0.35);
      const hasDeepDark = colorData.some(c => c.l < 0.2);
      
      if (hasOrange && hasDeepDark) {
          scores.halloween += 30;
          console.log("🎃 Halloween bonus applied!");
      }

      // Score each color
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
          const isHighSat = s >= 0.5 && s < 0.7;
          const isMidSat = s >= 0.25 && s < 0.5;
          const isLowSat = s < 0.25;
          
          const isVeryBright = l >= 0.75;
          const isBright = l >= 0.55 && l < 0.75;
          const isMidLight = l >= 0.35 && l < 0.55;
          const isDark = l >= 0.2 && l < 0.35;
          const isVeryDark = l < 0.2;

          // ENERGETIC
          if (isVeryHighSat && (isVeryBright || isBright)) {
              scores.energetic += 10;
              if (isWarmHue) scores.energetic += 4;
          }
          
          // COZY
          if (isWarmHue && (isMidSat || isHighSat) && (isMidLight || isBright) && !isVeryBright) {
              scores.cozy += 9;
          }
          if (isOrange && isMidSat) scores.cozy += 6;
          
          // MOODY
          if ((isCoolHue || isBlue) && (isDark || isVeryDark)) {
              scores.moody += 10;
          }
          if (isLowSat && (isDark || isVeryDark)) scores.moody += 7;
          if (isPurple && isDark) scores.moody += 5;
          
          // DREAMY
          if ((isBright || isVeryBright) && isMidSat) {
              scores.dreamy += 9;
          }
          if (isPurple && (isBright || isVeryBright)) scores.dreamy += 7;
          if ((h >= 300 && h <= 330) && isVeryBright && isMidSat) scores.dreamy += 6;
          
          // INTENSE
          if (isVeryHighSat && (isDark || isVeryDark)) {
              scores.intense += 10;
          }
          if ((isRed || isBlue) && isVeryHighSat && isDark) scores.intense += 6;
          
          // CHILL
          if (isLowSat && isBright && !isDark && !isVeryDark) {
              scores.chill += 7;
          }
          if (isGreen && (isLowSat || isMidSat) && (isBright || isVeryBright)) scores.chill += 8;
          if (isDark || isVeryDark) scores.chill -= 12;
          
          // UPLIFTING
          if ((isVeryBright || isBright) && (isHighSat || isVeryHighSat)) {
              scores.uplifting += 10;
          }
          if ((isYellow || isGreen) && isVeryBright && isHighSat) scores.uplifting += 7;
          
          // MELANCHOLIC
          if (isLowSat && isMidLight) {
              scores.melancholic += 8;
          }
          if (isCoolHue && (isLowSat || isMidSat) && isMidLight) scores.melancholic += 6;
      });

      // Overall modifiers
      if (isOverallBright && avgSaturation > 0.5) {
          scores.energetic += 8;
          scores.uplifting += 8;
      }
      if (isOverallDark && avgSaturation < 0.4) {
          scores.moody += 15;
          scores.melancholic += 7;
          scores.chill -= 15;
      }
      if (isOverallDark && avgSaturation >= 0.4) {
          scores.intense += 12;
          scores.moody += 7;
      }
      if (isOverallWarm && avgLightness > 0.5 && avgLightness < 0.75) {
          scores.cozy += 10;
      }
      if (isOverallCool && isOverallDark) {
          scores.moody += 10;
      }

      console.log("🎨 Vibe scores:", scores);

      // Determine winner
      let winningVibe = null;
      let highestScore = -1;
      for (const [vibeKey, scoreValue] of Object.entries(scores)) {
          if (scoreValue > highestScore) {
              highestScore = scoreValue;
              winningVibe = vibeKey;
          }
      }

      if (highestScore <= 10 || winningVibe === null) {
          setDetectedVibe("Neutral");
      } else {
          setDetectedVibe(winningVibe.charAt(0).toUpperCase() + winningVibe.slice(1));
      }
  }, [colorPalette]);



// ==============================
// SEARCH CONFIGURATION (UPDATED)
// ==============================

// We use 'year:2024-2025' to ensure songs are trending/recent.
// We use broad terms so Spotify returns the most popular hits for that term.
const vibeToSearchQueries = {
    Energetic: [
        "year:2024-2025 genre:pop",
        "year:2024-2025 genre:dance",
        "workout hits 2025",
        "club trends 2025"
    ],
    Cozy: [
        "year:2020-2025 genre:acoustic",
        "year:2023-2025 genre:folk",
        "coffee shop hits",
        "chill hits 2025"
    ],
    Moody: [
        "year:2023-2025 genre:indie",
        "sad songs 2025",
        "late night vibes",
        "moody pop hits"
    ],
    Dreamy: [
        "year:2023-2025 genre:dream-pop",
        "ethereal hits",
        "psychedelic pop 2025",
        "bedroom pop 2025"
    ],
    Intense: [
        "year:2023-2025 genre:rock",
        "year:2023-2025 genre:alternative",
        "gym phonk 2025",
        "high energy rock"
    ],
    Chill: [
        "year:2024-2025 genre:r-n-b",
        "lofi hits 2025",
        "chill pop 2025",
        "relaxing hits"
    ],
    Uplifting: [
        "year:2024-2025 genre:pop happy",
        "feel good hits 2025",
        "summer hits 2025",
        "morning motivation"
    ],
    Melancholic: [
        "year:2020-2025 genre:piano",
        "heartbreak hits 2025",
        "ballads 2025",
        "stripped back"
    ],
    Christmas: [
        "Christmas Hits", // Trends less relevant here, classics rule
        "Holiday Pop",
        "Christmas Classics",
        "Jazz Christmas"
    ],
    Halloween: [
        "Halloween Party",
        "Spooky Hits",
        "Horror Soundtracks"
    ],
    Neutral: [
        "Top 50 Global",
        "Viral Hits 2025",
        "year:2025 genre:pop"
    ]
};

  // ==============================
  // SONG FETCHING
  // ==============================

  const getRecommendations = async () => {
      console.log("🔍 Getting song recommendations...");

      if (!spotifyToken) {
          alert("Error: Please log in to Spotify.");
          return;
      }
      if (!detectedVibe) {
          console.error("❌ No vibe detected yet.");
          return;
      }
      
      setIsLoadingTracks(true);
      setTracks([]); 
      setSelectedTrackUris([]);
      setCreatedPlaylistUrl(null);

      const queries = vibeToSearchQueries[detectedVibe];
      
      if (!queries) {
          console.error(`❌ No queries found for vibe: ${detectedVibe}`);
          alert(`No song queries configured for ${detectedVibe} vibe.`);
          setIsLoadingTracks(false);
          return;
      }
      
      console.log(`🔎 Searching ${queries.length} songs for ${detectedVibe} vibe`);
      
      try {
          const allTracks = [];
          const seenTrackIds = new Set();
          
          for (let i = 0; i < queries.length; i++) {
              const query = queries[i];
              console.log(`🔍 Search ${i + 1}/${queries.length}: "${query}"`);
              
              try {
                  const response = await axios.get("https://api.spotify.com/v1/search", {
                      headers: {
                          'Authorization': `Bearer ${spotifyToken}`,
                          'Content-Type': 'application/json'
                      },
                      params: {
                          q: query,
                          type: 'track',
                          limit: 3,
                          market: 'US'
                      }
                  });

                  if (response?.data?.tracks?.items) {
                      response.data.tracks.items.forEach(track => {
                          if (track?.id && track?.uri && !seenTrackIds.has(track.id)) {
                              seenTrackIds.add(track.id);
                              allTracks.push(track);
                          }
                      });
                      console.log(`✅ Total tracks: ${allTracks.length}`);
                  }
                  
                  if (i < queries.length - 1) {
                      await new Promise(resolve => setTimeout(resolve, 150));
                  }
                  
              } catch (searchError) {
                  console.error(`❌ Search failed: ${searchError.message}`);
                  continue;
              }
          }

          console.log(`📊 Found ${allTracks.length} unique tracks`);

          if (allTracks.length > 0) {
              const selectedTracks = allTracks.slice(0, 12);
              setTracks(selectedTracks);
              setSelectedTrackUris(selectedTracks.map(t => t.uri));
          } else {
              alert(`No songs found for ${detectedVibe}. Try again!`);
          }

      } catch (error) {
          console.error("🔥 Error:", error);
          
          if (error.response?.status === 401) {
              alert("Session expired. Logging out...");
              handleLogout();
          } else if (error.response?.status === 429) {
              alert("Rate limited. Wait a moment and try again.");
          } else {
              alert("Failed to fetch songs. Check console.");
          }
      } finally {
          setIsLoadingTracks(false);
      }
  };

  const handleTrackToggle = (uriStr) => {
      if (selectedTrackUris.includes(uriStr)) {
          setSelectedTrackUris(selectedTrackUris.filter(uri => uri !== uriStr));
      } else {
          setSelectedTrackUris([...selectedTrackUris, uriStr]);
      }
  };

  // ==============================
  // PLAYLIST CREATION
  // ==============================

  const handleCreatePlaylist = async () => {
      if (selectedTrackUris.length === 0) {
          alert("Please select at least one song.");
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
             alert(`${playlistName} created successfully!`);
          }
      } catch (error) {
          console.error("Playlist creation error:", error);
          alert("Failed to create playlist.");
      } finally {
          setIsCreatingPlaylist(false);
      }
  };

  // ==============================
  // IMAGE HANDLING
  // ==============================

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedImgSrc(URL.createObjectURL(file));
      setColorPalette([]);
      setDetectedVibe(null);
      setTracks([]);
      setSelectedTrackUris([]);
      setCreatedPlaylistUrl(null);
    }
  };

  const triggerAnalysis = () => {
    if (!imgRef.current || !uploadedImgSrc) return;
    setIsProcessing(true);
    setDetectedVibe(null);
    setTracks([]); 
    setSelectedTrackUris([]);

    const colorThief = new ColorThief();
    const imgElement = imgRef.current;
    if (imgElement.complete) {
      extractColors(colorThief, imgElement);
    } else {
        imgElement.addEventListener('load', () => extractColors(colorThief, imgElement));
    }
  };

  const extractColors = (colorThief, imgElement) => {
    try {
        setColorPalette(colorThief.getPalette(imgElement, 5));
    } catch (error) {
        console.error("Error extracting colors.", error);
    } finally {
        setIsProcessing(false);
    }
  };

  // ==============================
  // RENDER
  // ==============================

  return (
    <div className="analyzer-container">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
          <h2 style={{margin: 0}}>Photo Vibe to Spotify</h2>
          {!spotifyToken ? (
              <button onClick={handleSpotifyLogin} className="analyze-button" style={{backgroundColor: 'black', fontSize: '0.9rem'}}>Login to Spotify</button>
          ) : (
              <button onClick={handleLogout} style={{border: 'none', background: 'none', cursor: 'pointer', color: '#666', textDecoration: 'underline'}}>Logout</button>
          )}
      </div>

      {!spotifyToken && <p style={{backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px'}}>Please login to Spotify to create playlists.</p>}
      
      <input type="file" accept="image/*" onChange={handleImageUpload} className="file-input" />

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

      {detectedVibe && (
        <div className="results-container">
          <div className="vibe-result" style={{textAlign: 'center', padding: '20px', backgroundColor: '#e8f5e9', borderRadius: '8px', border: '2px solid #1DB954', marginBottom: '20px'}}>
              <h3 style={{margin: 0, color: '#555'}}>Detected Vibe:</h3>
              <p style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#1DB954', margin: '10px 0'}}>{detectedVibe}</p>
              
              {spotifyToken ? (
                  <button onClick={getRecommendations} disabled={isLoadingTracks} className="analyze-button" style={{marginTop: '10px'}}>
                      {isLoadingTracks ? 'Fetching Songs...' : `2. Get ${detectedVibe} Songs`}
                  </button>
              ) : (
                 <p>Login to Spotify above to unlock song suggestions.</p>
              )}
          </div>

          {tracks.length > 0 && (
            <div style={{marginTop: '30px'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <h3>Select Songs: ({selectedTrackUris.length} selected)</h3>
                  
                  <button 
                      onClick={handleCreatePlaylist} 
                      disabled={isCreatingPlaylist || selectedTrackUris.length === 0}
                      className="analyze-button"
                      style={{backgroundColor: selectedTrackUris.length === 0 ? '#ccc' : '#1DB954'}}
                  >
                      {isCreatingPlaylist ? 'Creating...' : '3. Create Spotify Playlist'}
                  </button>
                </div>
                
                {createdPlaylistUrl && (
                    <div style={{backgroundColor:'#d4edda', color:'#155724', padding:'15px', borderRadius:'4px', margin:'10px 0', textAlign:'center'}}>
                        Success! <a href={createdPlaylistUrl} target="_blank" rel="noopener noreferrer" style={{fontWeight:'bold', color:'#155724'}}>Open playlist on Spotify →</a>
                    </div>
                )}

                <div style={{display: 'grid', gap: '10px', marginTop:'10px'}}>
                    {tracks.map(track => {
                        const isSelected = selectedTrackUris.includes(track.uri);
                        return (
                        <div key={track.id} 
                             style={{
                                 display: 'flex', 
                                 alignItems: 'center', 
                                 padding: '10px', 
                                 backgroundColor: isSelected ? '#f0fcf4' : 'white',
                                 border: isSelected ? '1px solid #1DB954' : '1px solid transparent',
                                 borderRadius: '8px', 
                                 boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                 cursor: 'pointer'
                             }}
                             onClick={() => handleTrackToggle(track.uri)}
                        >
                            <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => {}}
                                style={{marginRight: '15px', transform: 'scale(1.5)', cursor: 'pointer'}}
                            />
                            
                            {track.album?.images?.[2] && <img src={track.album.images[2].url} alt={track.name} style={{width: '50px', height: '50px', borderRadius: '4px', marginRight: '15px'}} />}
                            <div style={{textAlign: 'left', overflow: 'hidden', flexGrow: 1}}>
                                <p style={{fontWeight: 'bold', margin: '0 0 5px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{track.name}</p>
                                <p style={{margin: 0, color: '#666', fontSize: '0.9rem'}}>{track.artists?.map(a => a.name).join(', ')}</p>
                            </div>
                             <a href={track.external_urls?.spotify} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{marginLeft: 'auto', color: '#1DB954', textDecoration: 'none', fontSize: '0.9rem'}}>Open ↗</a>
                        </div>
                    )})}
                </div>
            </div>
          )}

           <h4 style={{marginTop: '40px', color: '#999'}}>Source Palette:</h4>
           <div className="palette-grid">
            {colorPalette.map((rgb, index) => (
                <div key={index} className="color-swatch-container">
                  <div className="color-swatch" style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }} />
                </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageColorAnalyzer;