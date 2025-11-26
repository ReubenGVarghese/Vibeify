import React from 'react';
import ImageColorAnalyzer from './ImageColorAnalyzer';

// IMPORT your component here so App knows it exists.
// The './' means "look in the same folder".

function App() {
  return (
    // You can add global site headers or footers here
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Vibeify</h1>
      
      {/* RENDER your component here */}
      <ImageColorAnalyzer />
      
    </div>
  );
}

export default App;