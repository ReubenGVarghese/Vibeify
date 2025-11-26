/**
 * Converts an RGB color value to HSL.
 * Conversion formula adapted from http://en.wikipedia.org/wiki/HSL_and_HSV.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns H, S, and L in the set [0, 1].
 *
 * @param   {number}  r       The red color value (0-255)
 * @param   {number}  g       The green color value (0-255)
 * @param   {number}  b       The blue color value (0-255)
 * @return  {Array}           The HSL representation [H(0-360), S(0-1), L(0-1)]
 */
export const rgbToHsl = (r, g, b) => {
    // 1. Normalize RGB values to the range 0-1
    r /= 255;
    g /= 255;
    b /= 255;

    // 2. Find the maximum and minimum color channel values
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s;
    // Lightness is the average of the largest and smallest channel values
    let l = (max + min) / 2;

    if (max === min) {
        // If max equals min, it's a shade of gray (achromatic)
        h = s = 0;
    } else {
        // Calculate saturation based on lightness level
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        // Calculate Hue based on which channel is the dominant one (max)
        switch (max) {
            case r:
                // If Red is max, hue is between Yellow and Magenta
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                 // If Green is max, hue is between Cyan and Yellow
                h = (b - r) / d + 2;
                break;
            case b:
                 // If Blue is max, hue is between Magenta and Cyan
                h = (r - g) / d + 4;
                break;
            default:
                break;
        }
        // Normalize hue to 0-1 range
        h /= 6;
    }

    // 3. Final formatting
    // Return Hue as degrees (0-360), and Saturation/Lightness as decimals (0.0 - 1.0)
    // We use Math.round for hue to make future comparisons easier.
    return [Math.round(h * 360), Number(s.toFixed(2)), Number(l.toFixed(2))];
};