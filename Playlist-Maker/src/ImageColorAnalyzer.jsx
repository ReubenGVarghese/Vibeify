// src/ImageColorAnalyzer.jsx
// Complete working version - Ready to paste!

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
const SCOPES = ["user-read-private", "playlist-modify-public", "playlist-modify-private", "user-top-read"];
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
  // STATE
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

  // VIBE TO SEARCH QUERIES
  const vibeToSearchQueries = {
    Energetic: ["track:Levitating artist:Dua Lipa", "track:Dance The Night artist:Dua Lipa", "track:Paint The Town Red artist:Doja Cat", "track:On My Mind artist:Diplo"],
    Cozy: ["track:Perfect artist:Ed Sheeran", "track:Photograph artist:Ed Sheeran", "track:Cardigan artist:Taylor Swift", "track:Let It Go artist:James Bay"],
    Moody: ["track:Die For You artist:The Weeknd", "track:Lovely artist:Billie Eilish", "track:The Night We Met artist:Lord Huron", "track:Skinny Love artist:Bon Iver"],
    Dreamy: ["track:Reflections artist:The Neighbourhood", "track:Electric Feel artist:MGMT", "track:Space Song artist:Beach House", "track:Midnight City artist:M83"],
    Intense: ["track:Radioactive artist:Imagine Dragons", "track:Believer artist:Imagine Dragons", "track:Stressed Out artist:Twenty One Pilots", "track:Numb artist:Linkin Park"],
    Chill: ["track:Sunflower artist:Post Malone", "track:Location artist:Khalid", "track:Electric artist:Alina Baraz", "track:Redbone artist:Childish Gambino"],
    Uplifting: ["track:As It Was artist:Harry Styles", "track:Flowers artist:Miley Cyrus", "track:Levitating artist:Dua Lipa", "track:Good 4 U artist:Olivia Rodrigo"],
    Melancholic: ["track:Someone Like You artist:Adele", "track:drivers license artist:Olivia Rodrigo", "track:Someone You Loved artist:Lewis Capaldi", "track:Skinny Love artist:Bon Iver"],
    Warm: ["track:Best Part artist:Daniel Caesar", "track:Sunday Best artist:Surfaces", "track:Banana Pancakes artist:Jack Johnson", "track:Ho Hey artist:The Lumineers"],
    Cool: ["track:Blue Monday artist:New Order", "track:Ocean Eyes artist:Billie Eilish", "track:Breathe Me artist:Sia", "track:Mad World artist:Gary Jules"],
    Vibrant: ["track:Dynamite artist:BTS", "track:Uptown Funk artist:Bruno Mars", "track:Can't Stop The Feeling artist:Justin Timberlake", "track:Happy artist:Pharrell Williams"],
    Dark: ["track:Wicked Games artist:The Weeknd", "track:bury a friend artist:Billie Eilish", "track:Hurt artist:Johnny Cash", "track:Black artist:Pearl Jam"],
    Pastel: ["track:Lavender Haze artist:Taylor Swift", "track:Butterflies artist:Kacey Musgraves", "track:Pink + White artist:Frank Ocean", "track:Sunflower Vol. 6 artist:Harry Styles"],
    Neon: ["track:Blinding Lights artist:The Weeknd", "track:Physical artist:Dua Lipa", "track:Electricity artist:Silk City", "track:Midnight City artist:M83"],
    Performative: ["track:Sofia artist:Clairo", "track:Bags artist:Clairo", "track:Pretty Girl artist:Clairo", "track:Bubble Gum artist:Clairo"],
    Christmas: ["track:All I Want for Christmas artist:Mariah Carey", "track:Last Christmas artist:Wham!", "track:Jingle Bell Rock artist:Bobby Helms", "track:It's Beginning to Look artist:Michael Buble"],
    Halloween: ["track:Thriller artist:Michael Jackson", "track:Monster Mash artist:Bobby Pickett", "track:Somebody's Watching Me artist:Rockwell", "track:Disturbia artist:Rihanna"],
    Neutral: ["track:Shape of You artist:Ed Sheeran", "track:Anti-Hero artist:Taylor Swift", "track:Blinding Lights artist:The Weeknd", "track:Circles artist:Post Malone"]
  };

  // AUTHENTICATION
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
        code, code_verifier: verifier, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID
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
  };

  // VIBE DETECTION
  useEffect(() => {
    if (colorPalette.length === 0) return;
    let scores = { energetic: 0, cozy: 0, moody: 0, dreamy: 0, intense: 0, chill: 0, uplifting: 0, melancholic: 0, warm: 0, cool: 0, vibrant: 0, dark: 0, pastel: 0, neon: 0, performative: 0, christmas: 0, halloween: 0 };
    let totalSaturation = 0, totalLightness = 0, warmCount = 0, coolCount = 0, brightCount = 0, darkCount = 0, veryBrightCount = 0, veryDarkCount = 0;

    const colorData = colorPalette.map(rgb => {
      const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      totalSaturation += s;
      totalLightness += l;
      if ((h >= 0 && h <= 60) || (h >= 300 && h <= 360)) warmCount++;
      if (h >= 180 && h <= 260) coolCount++;
      if (l >= 0.6) brightCount++;
      if (l >= 0.75) veryBrightCount++;
      if (l < 0.4) darkCount++;
      if (l < 0.25) veryDarkCount++;
      return { h, s, l };
    });

    const avgSaturation = totalSaturation / colorPalette.length;
    const isVeryBright = veryBrightCount >= 3;
    const isVeryDark = veryDarkCount >= 3;
    const isOverallWarm = warmCount > coolCount;
    const isOverallCool = coolCount > warmCount;

    const hasRed = colorData.some(c => ((c.h >= 0 && c.h <= 20) || (c.h >= 340 && c.h <= 360)) && c.s > 0.4 && c.l > 0.3 && c.l < 0.7);
    const hasGreen = colorData.some(c => (c.h >= 90 && c.h <= 150) && c.s > 0.3 && c.l > 0.25);
    const hasOrange = colorData.some(c => (c.h >= 20 && c.h <= 45) && c.s > 0.5 && c.l > 0.3);
    const hasPurple = colorData.some(c => (c.h >= 260 && c.h <= 310) && c.s > 0.3);
    const hasDeepDark = colorData.some(c => c.l < 0.2);

    if (hasRed && hasGreen && !hasOrange && !hasPurple) {
      const redCount = colorData.filter(c => ((c.h >= 0 && c.h <= 20) || (c.h >= 340 && c.h <= 360)) && c.s > 0.5 && c.l > 0.3 && c.l < 0.7).length;
      const greenCount = colorData.filter(c => (c.h >= 90 && c.h <= 150) && c.s > 0.4 && c.l > 0.25).length;
      if (redCount >= 2 && greenCount >= 2) scores.christmas += 35;
    }

    if (hasOrange && (hasDeepDark || isVeryDark)) {
      const orangeCount = colorData.filter(c => (c.h >= 20 && c.h <= 45) && c.s > 0.5).length;
      const darkColorCount = colorData.filter(c => c.l < 0.25).length;
      if (orangeCount >= 1 && darkColorCount >= 2) {
        scores.halloween += 50;
        if (hasPurple) scores.halloween += 15;
      }
    }

    colorData.forEach(({ h, s, l }) => {
      const isRed = (h >= 0 && h <= 30) || (h >= 330 && h <= 360);
      const isOrange = h >= 30 && h <= 60;
      const isYellow = h >= 60 && h <= 90;
      const isGreen = h >= 90 && h <= 180;
      const isCyan = h >= 180 && h <= 200;
      const isBlue = h >= 200 && h <= 260;
      const isPurple = h >= 260 && h <= 330;
      const isWarmHue = isRed || isOrange || (h >= 300 && h <= 360);
      const isCoolHue = isBlue || isCyan;
      const isVeryHighSat = s >= 0.7, isHighSat = s >= 0.5 && s < 0.7, isMidSat = s >= 0.25 && s < 0.5, isLowSat = s < 0.25;
      const isVeryBright = l >= 0.75, isBright = l >= 0.55 && l < 0.75, isMidLight = l >= 0.35 && l < 0.55, isDark = l >= 0.2 && l < 0.35, isVeryDark = l < 0.2;

      if (isVeryHighSat && (isVeryBright || isBright) && isWarmHue) scores.energetic += 8;
      if ((isRed || isOrange || isYellow) && isVeryHighSat && isBright) scores.energetic += 6;
      if (isWarmHue && isMidSat && (isMidLight || isBright) && !isVeryBright) scores.cozy += 7;
      if (isOrange && isMidSat && isMidLight) scores.cozy += 5;
      if (isCoolHue && (isDark || isMidLight) && isLowSat) scores.moody += 8;
      if (isBlue && isDark) scores.moody += 6;
      if ((isBright || isVeryBright) && isMidSat) scores.dreamy += 7;
      if (isPurple && isBright) scores.dreamy += 6;
      if (isVeryHighSat && isDark) scores.intense += 8;
      if ((isRed || isBlue) && isVeryHighSat && (isDark || isMidLight)) scores.intense += 6;
      if (isLowSat && (isBright || isMidLight) && !isDark) scores.chill += 7;
      if (isGreen && isLowSat && isBright) scores.chill += 5;
      if (isDark || isVeryDark) scores.chill -= 10;
      if (isVeryBright && isHighSat) scores.uplifting += 8;
      if ((isYellow || isOrange) && isVeryBright) scores.uplifting += 6;
      if (isLowSat && isMidLight && isCoolHue) scores.melancholic += 7;
      if (isBlue && isLowSat) scores.melancholic += 5;
      if (isWarmHue && (isMidLight || isBright) && (isMidSat || isHighSat)) scores.warm += 8;
      if ((isRed || isOrange || isYellow) && !isVeryDark) scores.warm += 5;
      if (isCoolHue && (isMidLight || isBright)) scores.cool += 8;
      if ((isBlue || isCyan) && !isVeryDark) scores.cool += 6;
      if (isVeryHighSat && (isBright || isMidLight)) scores.vibrant += 8;
      if (isHighSat && isBright) scores.vibrant += 6;
      if (isDark || isVeryDark) scores.dark += 10;
      if (isVeryDark && (isMidSat || isHighSat)) scores.dark += 5;
      if (isVeryBright && (isLowSat || isMidSat)) scores.pastel += 10;
      if (isBright && isLowSat) scores.pastel += 6;
      if (isVeryHighSat && isBright) scores.neon += 10;
      if (isHighSat && isVeryBright) scores.neon += 7;
      if ((isGreen || isOrange || (h >= 30 && h <= 60)) && (isLowSat || isMidSat) && (isMidLight || isBright)) scores.performative += 9;
      if (isWarmHue && isLowSat && isMidLight) scores.performative += 7;
      if ((h >= 20 && h <= 80) && isMidSat && (isMidLight || isBright)) scores.performative += 6;
      if (isGreen && isLowSat) scores.performative += 5;
    });

    if (isVeryBright && avgSaturation > 0.6) { scores.vibrant += 10; scores.neon += 8; scores.energetic += 5; }
    if (isVeryBright && avgSaturation < 0.4) scores.pastel += 15;
    if (isVeryDark) { scores.dark += 15; scores.chill -= 15; }
    if (isOverallWarm && !isVeryDark && !isVeryBright) { scores.warm += 10; scores.cozy += 5; }
    if (isOverallCool && !isVeryDark) scores.cool += 10;

    if (hasRed && hasGreen) {
      const redCount = colorData.filter(c => ((c.h >= 0 && c.h <= 20) || (c.h >= 340 && c.h <= 360)) && c.s > 0.5).length;
      const greenCount = colorData.filter(c => (c.h >= 90 && c.h <= 150) && c.s > 0.4).length;
      if (redCount >= 2 && greenCount >= 2) scores.christmas += 10;
    }

    console.log("🎨 Vibe scores:", scores);
    let winningVibe = null, highestScore = -1;
    for (const [vibeKey, scoreValue] of Object.entries(scores)) {
      if (scoreValue > highestScore) { highestScore = scoreValue; winningVibe = vibeKey; }
    }
    setDetectedVibe(highestScore <= 15 || !winningVibe ? "Neutral" : winningVibe.charAt(0).toUpperCase() + winningVibe.slice(1));
  }, [colorPalette]);

  // TRACK FETCHING
  const getRecommendations = async () => {
    if (!spotifyToken || !detectedVibe) return;
    setIsLoadingTracks(true);
    setTracks([]);
    setSelectedTrackUris([]);
    setCreatedPlaylistUrl(null);

    const queries = vibeToSearchQueries[detectedVibe];
    if (!queries) { alert(`No songs for ${detectedVibe}`); setIsLoadingTracks(false); return; }

    try {
      const allTracks = [], seenTrackIds = new Set();
      for (let i = 0; i < queries.length; i++) {
        try {
          const response = await axios.get("https://api.spotify.com/v1/search", {
            headers: { 'Authorization': `Bearer ${spotifyToken}` },
            params: { q: queries[i], type: 'track', limit: 5, market: 'US' }
          });
          if (response.data.tracks?.items) {
            response.data.tracks.items.forEach(track => {
              if (track?.id && !seenTrackIds.has(track.id)) { seenTrackIds.add(track.id); allTracks.push(track); }
            });
          }
          if (i < queries.length - 1) await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) { continue; }
      }
      if (allTracks.length > 0) {
        const selectedTracks = allTracks.slice(0, 12);
        setTracks(selectedTracks);
        setSelectedTrackUris(selectedTracks.map(t => t.uri));
      } else alert(`No songs found for ${detectedVibe}`);
    } catch (error) {
      if (error.response?.status === 401) handleLogout();
      else alert("Failed to search songs");
    } finally {
      setIsLoadingTracks(false);
    }
  };

  // PLAYLIST CREATION
  const handleTrackToggle = (uri) => setSelectedTrackUris(selectedTrackUris.includes(uri) ? selectedTrackUris.filter(u => u !== uri) : [...selectedTrackUris, uri]);

  const handleCreatePlaylist = async () => {
    if (selectedTrackUris.length === 0) return alert("Select at least one song");
    setIsCreatingPlaylist(true);
    try {
      const result = await axios.post(`${BACKEND_BASE_URL}/create-playlist`, {
        access_token: spotifyToken, playlist_name: `My ${detectedVibe} Vibe`, track_uris: selectedTrackUris
      });
      if (result.data.success) { setCreatedPlaylistUrl(result.data.playlistUrl); alert("Playlist created!"); }
    } catch (error) {
      alert("Failed to create playlist");
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  // IMAGE HANDLING
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
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
    const img = imgRef.current;
    if (img.complete) extractColors(colorThief, img);
    else img.addEventListener('load', () => extractColors(colorThief, img));
  };

  const extractColors = (colorThief, img) => {
    try { setColorPalette(colorThief.getPalette(img, 5)); }
    catch (error) { console.error("Error extracting colors", error); }
    finally { setIsProcessing(false); }
  };

  // RENDER
  return (
    <div className="analyzer-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Photo Vibe to Spotify</h2>
        {!spotifyToken ? (
          <button onClick={handleSpotifyLogin} className="analyze-button" style={{ backgroundColor: 'black', fontSize: '0.9rem' }}>Login to Spotify</button>
        ) : (
          <button onClick={handleLogout} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#666', textDecoration: 'underline' }}>Logout</button>
        )}
      </div>

      {!spotifyToken && <p style={{ backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px' }}>Please login to Spotify to create playlists.</p>}

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
          <div className="vibe-result" style={{ textAlign: 'center', padding: '20px', backgroundColor: '#e8f5e9', borderRadius: '8px', border: '2px solid #1DB954', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#555' }}>Detected Vibe:</h3>
            <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1DB954', margin: '10px 0' }}>{detectedVibe}</p>
            {spotifyToken ? (
              <button onClick={getRecommendations} disabled={isLoadingTracks} className="analyze-button" style={{ marginTop: '10px' }}>
                {isLoadingTracks ? 'Fetching Songs...' : `2. Get ${detectedVibe} Songs`}
              </button>
            ) : (
              <p>Login to Spotify above to unlock song suggestions.</p>
            )}
          </div>

          {tracks.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Select Songs: ({selectedTrackUris.length} selected)</h3>
                <button onClick={handleCreatePlaylist} disabled={isCreatingPlaylist || selectedTrackUris.length === 0} className="analyze-button"
                  style={{ backgroundColor: selectedTrackUris.length === 0 ? '#ccc' : '#1DB954' }}>
                  {isCreatingPlaylist ? 'Creating...' : '3. Create Spotify Playlist'}
                </button>
              </div>

              {createdPlaylistUrl && (
                <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '15px', borderRadius: '4px', margin: '10px 0', textAlign: 'center' }}>
                  Generation Successful! <a href={createdPlaylistUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 'bold', color: '#155724' }}>Click here to open your new playlist on Spotify.</a>
                </div>
              )}

              <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                {tracks.map(track => {
                  const isSelected = selectedTrackUris.includes(track.uri);
                  return (
                    <div key={track.id} onClick={() => handleTrackToggle(track.uri)} style={{
                      display: 'flex', alignItems: 'center', padding: '10px', backgroundColor: isSelected ? '#f0fcf4' : 'white',
                      border: isSelected ? '1px solid #1DB954' : '1px solid transparent', borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'pointer'
                    }}>
                      <input type="checkbox" checked={isSelected} onChange={() => { }} style={{ marginRight: '15px', transform: 'scale(1.5)', cursor: 'pointer' }} />
                      {track.album.images[2] && <img src={track.album.images[2].url} alt={track.name} style={{ width: '50px', height: '50px', borderRadius: '4px', marginRight: '15px' }} />}
                      <div style={{ textAlign: 'left', overflow: 'hidden', flexGrow: 1 }}>
                        <p style={{ fontWeight: 'bold', margin: '0 0 5px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</p>
                        <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>{track.artists.map(a => a.name).join(', ')}</p>
                      </div>
                      <a href={track.external_urls.spotify} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: 'auto', color: '#1DB954', textDecoration: 'none', fontSize: '0.9rem' }}>Open ↗</a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <h4 style={{ marginTop: '40px', color: '#999' }}>Source Palette:</h4>
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